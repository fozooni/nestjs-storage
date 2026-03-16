import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Readable } from 'stream';

import {
  ChecksumAlgorithm,
  CopyOptions,
  DeleteManyResult,
  DiskConfig,
  FileMetadata,
  FilesystemContract,
  GetOptions,
  MoveOptions,
  MultipartUploadInit,
  MultipartUploadOptions,
  MultipartUploadPart,
  PutOptions,
  TemporaryUrlOptions,
} from '../interfaces/storage.interface';
import { StoragePermissionError } from '../errors/storage-errors';
import { streamToBuffer } from '../utils/storage.utils';
import { ScopedDisk } from './scoped-disk';

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';

/** Stored layout: [iv(12)] + [authTag(16)] + [ciphertext] */
function encrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

function decrypt(data: Buffer, key: Buffer): Buffer {
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function toBuffer(contents: string | Buffer | NodeJS.ReadableStream): Promise<Buffer> {
  if (Buffer.isBuffer(contents)) return contents;
  if (typeof contents === 'string') return Buffer.from(contents, 'utf-8');
  return streamToBuffer(contents as Readable);
}

/**
 * `EncryptedDisk` is a decorator that transparently encrypts every file written
 * to the underlying disk and decrypts every file read from it.
 *
 * Encryption uses **AES-256-GCM** (authenticated encryption) with a random 12-byte
 * IV prepended to each stored blob. The key must be exactly **32 bytes**.
 *
 * Use `StorageService.encrypted(diskName, { key })` instead of constructing this directly.
 *
 * @example
 * ```ts
 * const enc = storageService.encrypted('local', { key: process.env.ENCRYPTION_KEY });
 * await enc.put('secret.txt', 'sensitive data');
 * const plain = await enc.get('secret.txt', { responseType: 'string' }); // 'sensitive data'
 * ```
 */
export class EncryptedDisk implements FilesystemContract {
  constructor(
    private readonly disk: FilesystemContract,
    private readonly encryptionKey: Buffer,
  ) {
    if (encryptionKey.length !== 32) {
      throw new Error(
        `EncryptedDisk: key must be 32 bytes for AES-256-GCM, got ${encryptionKey.length}`,
      );
    }
  }

  // ─── Encrypted Core ──────────────────────────────────────────────────────────

  async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    const plain = await toBuffer(contents);
    const encrypted = encrypt(plain, this.encryptionKey);
    return this.disk.put(path, encrypted, options);
  }

  async get(path: string, options?: GetOptions): Promise<Buffer | NodeJS.ReadableStream | string> {
    const raw = (await this.disk.get(path, { responseType: 'buffer' })) as Buffer;
    const decrypted = decrypt(raw, this.encryptionKey);

    const responseType = options?.responseType ?? 'buffer';
    if (responseType === 'string') return decrypted.toString('utf-8');
    if (responseType === 'stream') return Readable.from(decrypted);
    return decrypted;
  }

  // Multipart: buffer each part so encryption covers the full part content
  async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    path: string,
  ): Promise<MultipartUploadPart> {
    if (!this.disk.uploadPart) throw new Error('Disk does not support multipart upload');
    const buf = Buffer.isBuffer(data)
      ? data
      : data instanceof Uint8Array
        ? Buffer.from(data)
        : await streamToBuffer(data as Readable);
    const encrypted = encrypt(buf, this.encryptionKey);
    return this.disk.uploadPart(uploadId, partNumber, encrypted, path);
  }

  // ─── Passthrough Methods ─────────────────────────────────────────────────────

  async exists(path: string): Promise<boolean> {
    return this.disk.exists(path);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async putFile(path: string, file: any, options?: PutOptions): Promise<string | false> {
    // Buffer the file then encrypt before storing
    let buf: Buffer;
    if (file.buffer) {
      buf = file.buffer;
    } else if (file.path) {
      const { promises: fsPromises } = await import('fs');
      buf = await fsPromises.readFile(file.path);
    } else if (Buffer.isBuffer(file)) {
      buf = file;
    } else {
      buf = Buffer.from(file);
    }

    const strategy =
      options?.namingStrategy ?? (this.disk as { config?: DiskConfig })?.config?.namingStrategy;
    const originalName: string =
      file.originalname ?? file.filename ?? options?.filename ?? 'upload';
    const filename = strategy ? await strategy.generate(file, originalName) : originalName;

    const encrypted = encrypt(buf, this.encryptionKey);
    return this.disk.putFileAs(
      path,
      { buffer: encrypted, originalname: filename },
      filename,
      options,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async putFileAs(
    path: string,
    file: any,
    name: string,
    options?: PutOptions,
  ): Promise<string | false> {
    let buf: Buffer;
    if (Buffer.isBuffer(file)) buf = file;
    else if (file.buffer) buf = file.buffer;
    else if (file.path) {
      const { promises: fsPromises } = await import('fs');
      buf = await fsPromises.readFile(file.path);
    } else buf = Buffer.from(file);

    const encrypted = encrypt(buf, this.encryptionKey);
    return this.disk.putFileAs(path, { buffer: encrypted, originalname: name }, name, options);
  }

  async delete(path: string): Promise<boolean> {
    return this.disk.delete(path);
  }

  async copy(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    // Re-encrypt: get → decrypt → encrypt → put at destination
    const decrypted = (await this.get(from)) as Buffer;
    return this.put(to, decrypted, options ? { visibility: options.visibility } : undefined);
  }

  async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    const copied = await this.copy(
      from,
      to,
      options ? { visibility: options.visibility } : undefined,
    );
    if (copied) return this.delete(from);
    return false;
  }

  async size(path: string): Promise<number> {
    // Encrypted blob is slightly larger; return the plaintext size by decrypting
    const raw = (await this.disk.get(path, { responseType: 'buffer' })) as Buffer;
    return raw.length > IV_LENGTH + AUTH_TAG_LENGTH ? raw.length - IV_LENGTH - AUTH_TAG_LENGTH : 0;
  }

  async lastModified(path: string): Promise<number> {
    return this.disk.lastModified(path);
  }

  async files(directory?: string, recursive?: boolean): Promise<string[]> {
    return this.disk.files(directory, recursive);
  }

  async allFiles(directory?: string): Promise<string[]> {
    return this.disk.allFiles(directory);
  }

  async directories(directory?: string, recursive?: boolean): Promise<string[]> {
    return this.disk.directories(directory, recursive);
  }

  async allDirectories(directory?: string): Promise<string[]> {
    return this.disk.allDirectories(directory);
  }

  async makeDirectory(path: string): Promise<boolean> {
    return this.disk.makeDirectory(path);
  }

  async deleteDirectory(directory: string): Promise<boolean> {
    return this.disk.deleteDirectory(directory);
  }

  async getVisibility(path: string): Promise<'private' | 'public'> {
    return this.disk.getVisibility(path);
  }

  async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    return this.disk.setVisibility(path, visibility);
  }

  url(path: string): string {
    return this.disk.url(path);
  }

  async temporaryUrl(
    path: string,
    expiration: Date | number,
    options?: TemporaryUrlOptions,
  ): Promise<string> {
    return this.disk.temporaryUrl(path, expiration, options);
  }

  async prepend(path: string, data: string): Promise<boolean> {
    const existing = (await this.get(path, { responseType: 'string' })) as string;
    return this.put(path, data + existing);
  }

  async append(path: string, data: string): Promise<boolean> {
    const existing = (await this.get(path, { responseType: 'string' })) as string;
    return this.put(path, existing + data);
  }

  async getMetadata(path: string): Promise<FileMetadata> {
    const meta = await this.disk.getMetadata(path);
    // Adjust reported size to plaintext size
    const encSize = meta.size;
    meta.size = encSize > IV_LENGTH + AUTH_TAG_LENGTH ? encSize - IV_LENGTH - AUTH_TAG_LENGTH : 0;
    return meta;
  }

  async mimeType(path: string): Promise<string> {
    return this.disk.mimeType(path);
  }

  async directorySize(directory?: string): Promise<number> {
    return this.disk.directorySize(directory);
  }

  async initMultipartUpload(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    if (!this.disk.initMultipartUpload) throw new Error('Disk does not support multipart upload');
    return this.disk.initMultipartUpload(path, options);
  }

  async completeMultipartUpload(
    uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean> {
    if (!this.disk.completeMultipartUpload)
      throw new Error('Disk does not support multipart upload');
    return this.disk.completeMultipartUpload(uploadId, path, parts);
  }

  async abortMultipartUpload(uploadId: string, path: string): Promise<boolean> {
    if (!this.disk.abortMultipartUpload) throw new Error('Disk does not support multipart upload');
    return this.disk.abortMultipartUpload(uploadId, path);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async putFileMultipart(
    path: string,
    file: any,
    options?: MultipartUploadOptions,
  ): Promise<string | false> {
    if (!this.disk.putFileMultipart) throw new Error('Disk does not support multipart upload');
    return this.disk.putFileMultipart(path, file, options);
  }

  // presignedPost is intentionally unsupported — encrypted content cannot be POSTed directly
  async presignedPost(): Promise<never> {
    throw new StoragePermissionError(
      'presignedPost() is not supported on EncryptedDisk — ' +
        'direct uploads would bypass encryption.',
    );
  }

  async missing(path: string): Promise<boolean> {
    if (this.disk.missing) return this.disk.missing(path);
    return !(await this.exists(path));
  }

  async json<T = unknown>(path: string): Promise<T> {
    const content = await this.get(path, { responseType: 'string' });
    return JSON.parse(content as string);
  }

  async checksum(path: string, algorithm?: ChecksumAlgorithm): Promise<string> {
    if (!this.disk.checksum) throw new Error('Disk does not support checksum()');
    return this.disk.checksum(path, algorithm);
  }

  async deleteMany(paths: string[]): Promise<DeleteManyResult> {
    if (!this.disk.deleteMany) throw new Error('Disk does not support deleteMany()');
    return this.disk.deleteMany(paths);
  }

  getBucket(): string | undefined {
    return this.disk.getBucket?.();
  }

  scope(prefix: string): FilesystemContract {
    return new ScopedDisk(this, prefix);
  }
}
