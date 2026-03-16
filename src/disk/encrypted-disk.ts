import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Readable } from 'stream';

import {
  DiskConfig,
  FileMetadata,
  FilesystemContract,
  GetOptions,
  MultipartUploadPart,
  PutOptions,
} from '../interfaces/storage.interface';
import { StoragePermissionError } from '../errors/storage-errors';
import { streamToBuffer } from '../utils/storage.utils';
import { DiskDecorator } from './disk-decorator';

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
export class EncryptedDisk extends DiskDecorator {
  constructor(
    disk: FilesystemContract,
    private readonly encryptionKey: Buffer,
  ) {
    super(disk);
    if (encryptionKey.length !== 32) {
      throw new Error(
        `EncryptedDisk: key must be 32 bytes for AES-256-GCM, got ${encryptionKey.length}`,
      );
    }
  }

  // ─── Encrypted Core ──────────────────────────────────────────────────────────

  override async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    const plain = await toBuffer(contents);
    const encrypted = encrypt(plain, this.encryptionKey);
    return this.disk.put(path, encrypted, options);
  }

  override async get(
    path: string,
    options?: GetOptions,
  ): Promise<Buffer | NodeJS.ReadableStream | string> {
    const raw = (await this.disk.get(path, { responseType: 'buffer' })) as Buffer;
    const decrypted = decrypt(raw, this.encryptionKey);

    const responseType = options?.responseType ?? 'buffer';
    if (responseType === 'string') return decrypted.toString('utf-8');
    if (responseType === 'stream') return Readable.from(decrypted);
    return decrypted;
  }

  // Multipart: buffer each part so encryption covers the full part content
  override async uploadPart(
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

  override async putFile(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    options?: PutOptions,
  ): Promise<string | false> {
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

  override async putFileAs(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  override async copy(
    from: string,
    to: string,
    options?: { visibility?: 'private' | 'public' },
  ): Promise<boolean> {
    // Re-encrypt: get → decrypt → encrypt → put at destination
    const decrypted = (await this.get(from)) as Buffer;
    return this.put(to, decrypted, options ? { visibility: options.visibility } : undefined);
  }

  override async move(
    from: string,
    to: string,
    options?: { visibility?: 'private' | 'public' },
  ): Promise<boolean> {
    const copied = await this.copy(
      from,
      to,
      options ? { visibility: options.visibility } : undefined,
    );
    if (copied) return this.delete(from);
    return false;
  }

  override async size(path: string): Promise<number> {
    // Encrypted blob is slightly larger; return the plaintext size by decrypting
    const raw = (await this.disk.get(path, { responseType: 'buffer' })) as Buffer;
    return raw.length > IV_LENGTH + AUTH_TAG_LENGTH ? raw.length - IV_LENGTH - AUTH_TAG_LENGTH : 0;
  }

  override async getMetadata<T extends FileMetadata = FileMetadata>(path: string): Promise<T> {
    const meta = await this.disk.getMetadata<T>(path);
    // Adjust reported size to plaintext size
    const encSize = meta.size;
    meta.size = encSize > IV_LENGTH + AUTH_TAG_LENGTH ? encSize - IV_LENGTH - AUTH_TAG_LENGTH : 0;
    return meta;
  }

  override async prepend(path: string, data: string): Promise<boolean> {
    const existing = (await this.get(path, { responseType: 'string' })) as string;
    return this.put(path, data + existing);
  }

  override async append(path: string, data: string): Promise<boolean> {
    const existing = (await this.get(path, { responseType: 'string' })) as string;
    return this.put(path, existing + data);
  }

  override async json<T = unknown>(path: string, schema?: { parse(v: unknown): T }): Promise<T> {
    const content = await this.get(path, { responseType: 'string' });
    const parsed = JSON.parse(content as string) as unknown;
    return schema ? schema.parse(parsed) : (parsed as T);
  }

  // presignedPost is intentionally unsupported — encrypted content cannot be POSTed directly
  override async presignedPost(): Promise<never> {
    throw new StoragePermissionError(
      'presignedPost() is not supported on EncryptedDisk — ' +
        'direct uploads would bypass encryption.',
    );
  }
}
