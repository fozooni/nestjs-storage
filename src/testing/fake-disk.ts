import { createHash, randomUUID } from 'crypto';
import { Readable } from 'stream';

import { ScopedDisk } from '../disk/scoped-disk';
import type {
  ChecksumAlgorithm,
  ConditionalWriteResult,
  CopyOptions,
  DeleteManyResult,
  FileMetadata,
  FilesystemContract,
  GetOptions,
  MoveOptions,
  MultipartUploadInit,
  MultipartUploadOptions,
  MultipartUploadPart,
  PutOptions,
  RangeOptions,
  RangeResult,
  TemporaryUrlOptions,
} from '../interfaces/storage.interface';
import {
  generateUniqueFilename,
  getContentType,
  getFileExtension,
  getFilename,
  isStream,
  joinPaths,
  normalizePath,
} from '../utils/storage.utils';

export interface FakeFile {
  path: string;
  content: Buffer;
  visibility: 'private' | 'public';
  metadata: Record<string, any>;
  mimetype?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class FakeDisk implements FilesystemContract {
  private store: Map<string, FakeFile> = new Map();
  private directoryStore: Set<string> = new Set();
  private multipartUploads: Map<
    string,
    { key: string; parts: Map<number, Buffer>; options?: PutOptions }
  > = new Map();
  /** MD5 etags tracked for conditional write support. */
  private etags: Map<string, string> = new Map();

  // --- Core FilesystemContract implementation ---

  async exists(path: string): Promise<boolean> {
    return this.store.has(normalizePath(path));
  }

  async get(path: string, options?: GetOptions): Promise<Buffer | NodeJS.ReadableStream | string> {
    const key = normalizePath(path);
    const file = this.store.get(key);
    if (!file) throw new Error(`File not found: ${path}`);

    if (options?.responseType === 'string') return file.content.toString('utf-8');
    if (options?.responseType === 'stream') return Readable.from(file.content);
    return Buffer.from(file.content);
  }

  async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    const key = normalizePath(path);
    let buffer: Buffer;

    if (typeof contents === 'string') {
      buffer = Buffer.from(contents);
    } else if (Buffer.isBuffer(contents)) {
      buffer = contents;
    } else if (isStream(contents)) {
      const chunks: Buffer[] = [];
      for await (const chunk of contents as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      buffer = Buffer.concat(chunks);
    } else {
      buffer = Buffer.from(contents as any);
    }

    const existing = this.store.get(key);
    this.store.set(key, {
      path: key,
      content: buffer,
      visibility: options?.visibility || existing?.visibility || 'private',
      metadata: options?.metadata || existing?.metadata || {},
      mimetype: options?.mimetype,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    });

    // Track etag for conditional write support
    this.etags.set(key, createHash('md5').update(buffer).digest('hex'));

    this.ensureParentDirectories(key);
    return true;
  }

  async putFile(path: string, file: any, options?: PutOptions): Promise<string | false> {
    const filename = file.originalname || file.filename || generateUniqueFilename('upload');
    return this.putFileAs(path, file, filename, options);
  }

  async putFileAs(
    path: string,
    file: any,
    name: string,
    options?: PutOptions,
  ): Promise<string | false> {
    const fullPath = joinPaths(path, name);
    let contents: Buffer;

    if (file.buffer) {
      contents = file.buffer;
    } else if (Buffer.isBuffer(file)) {
      contents = file;
    } else if (typeof file === 'string') {
      contents = Buffer.from(file);
    } else {
      contents = Buffer.from(file);
    }

    const success = await this.put(fullPath, contents, options);
    return success ? fullPath : false;
  }

  async delete(path: string): Promise<boolean> {
    const key = normalizePath(path);
    this.store.delete(key);
    return true;
  }

  async copy(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    const source = this.store.get(normalizePath(from));
    if (!source) throw new Error(`File not found: ${from}`);

    await this.put(to, Buffer.from(source.content), {
      visibility: options?.visibility || source.visibility,
      metadata: { ...source.metadata },
    });
    return true;
  }

  async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    await this.copy(from, to, options);
    await this.delete(from);
    return true;
  }

  async size(path: string): Promise<number> {
    const file = this.store.get(normalizePath(path));
    if (!file) throw new Error(`File not found: ${path}`);
    return file.content.length;
  }

  async lastModified(path: string): Promise<number> {
    const file = this.store.get(normalizePath(path));
    if (!file) throw new Error(`File not found: ${path}`);
    return file.updatedAt.getTime();
  }

  // --- Directory operations ---

  async files(directory?: string, recursive?: boolean): Promise<string[]> {
    const prefix = directory ? normalizePath(directory) + '/' : '';
    const result: string[] = [];

    for (const key of this.store.keys()) {
      if (prefix && !key.startsWith(prefix)) continue;
      const relativePath = prefix ? key.slice(prefix.length) : key;
      if (!recursive && relativePath.includes('/')) continue;
      result.push(key);
    }

    return result.sort();
  }

  async allFiles(directory?: string): Promise<string[]> {
    return this.files(directory, true);
  }

  async directories(directory?: string, recursive?: boolean): Promise<string[]> {
    const prefix = directory ? normalizePath(directory) + '/' : '';
    const dirs = new Set<string>();

    for (const key of this.store.keys()) {
      if (prefix && !key.startsWith(prefix)) continue;
      const relativePath = prefix ? key.slice(prefix.length) : key;
      const parts = relativePath.split('/');
      if (parts.length > 1) {
        if (recursive) {
          for (let i = 1; i < parts.length; i++) {
            dirs.add(prefix + parts.slice(0, i).join('/') + '/');
          }
        } else {
          dirs.add(prefix + parts[0] + '/');
        }
      }
    }

    // Also include explicitly created directories
    for (const dir of this.directoryStore) {
      if (prefix && !dir.startsWith(prefix)) continue;
      const relativePath = prefix ? dir.slice(prefix.length) : dir;
      const depth = relativePath.replace(/\/$/, '').split('/').length;
      if (recursive || depth === 1) {
        dirs.add(dir);
      }
    }

    return [...dirs].sort();
  }

  async allDirectories(directory?: string): Promise<string[]> {
    return this.directories(directory, true);
  }

  async makeDirectory(path: string): Promise<boolean> {
    const dir = normalizePath(path).replace(/\/?$/, '/');
    this.directoryStore.add(dir);
    this.ensureParentDirectories(dir);
    return true;
  }

  async deleteDirectory(directory: string): Promise<boolean> {
    const prefix = normalizePath(directory).replace(/\/?$/, '/');

    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }

    for (const dir of [...this.directoryStore]) {
      if (dir.startsWith(prefix) || dir === prefix) {
        this.directoryStore.delete(dir);
      }
    }

    return true;
  }

  // --- Visibility operations ---

  async getVisibility(path: string): Promise<'private' | 'public'> {
    const file = this.store.get(normalizePath(path));
    if (!file) throw new Error(`File not found: ${path}`);
    return file.visibility;
  }

  async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    const key = normalizePath(path);
    const file = this.store.get(key);
    if (!file) throw new Error(`File not found: ${path}`);
    file.visibility = visibility;
    return true;
  }

  // --- URL operations ---

  url(path: string): string {
    return `/fake-storage/${normalizePath(path)}`;
  }

  async temporaryUrl(
    path: string,
    _expiration: Date | number,
    _options?: TemporaryUrlOptions,
  ): Promise<string> {
    return `/fake-storage/${normalizePath(path)}?signed=true`;
  }

  // --- Additional operations ---

  async prepend(path: string, data: string): Promise<boolean> {
    const key = normalizePath(path);
    const existing = this.store.get(key);
    const currentContent = existing ? existing.content.toString('utf-8') : '';
    await this.put(path, data + currentContent);
    return true;
  }

  async append(path: string, data: string): Promise<boolean> {
    const key = normalizePath(path);
    const existing = this.store.get(key);
    const currentContent = existing ? existing.content.toString('utf-8') : '';
    await this.put(path, currentContent + data);
    return true;
  }

  // --- Metadata ---

  async getMetadata<T extends FileMetadata = FileMetadata>(path: string): Promise<T> {
    const key = normalizePath(path);
    const file = this.store.get(key);
    if (!file) throw new Error(`File not found: ${path}`);

    const meta: FileMetadata = {
      path: key,
      size: file.content.length,
      lastModified: file.updatedAt,
      mimetype: file.mimetype || getContentType(key),
      extension: getFileExtension(key),
      visibility: file.visibility,
      ...file.metadata,
    };
    return meta as unknown as T;
  }

  async mimeType(path: string): Promise<string> {
    const file = this.store.get(normalizePath(path));
    return file?.mimetype || getContentType(path);
  }

  async directorySize(directory?: string): Promise<number> {
    const prefix = directory ? normalizePath(directory) + '/' : '';
    let total = 0;

    for (const [key, file] of this.store) {
      if (!prefix || key.startsWith(prefix)) {
        total += file.content.length;
      }
    }

    return total;
  }

  // --- Convenience operations ---

  async missing(path: string): Promise<boolean> {
    return !(await this.exists(path));
  }

  async json<T = unknown>(path: string, schema?: { parse(v: unknown): T }): Promise<T> {
    const content = await this.get(path, { responseType: 'string' });
    const parsed = JSON.parse(content as string) as unknown;
    return schema ? schema.parse(parsed) : (parsed as T);
  }

  async checksum(path: string, algorithm: ChecksumAlgorithm = 'md5'): Promise<string> {
    const file = this.store.get(normalizePath(path));
    if (!file) throw new Error(`File not found: ${path}`);
    return createHash(algorithm).update(file.content).digest('hex');
  }

  async deleteMany(paths: string[]): Promise<DeleteManyResult> {
    const succeeded: string[] = [];
    for (const filePath of paths) {
      await this.delete(filePath);
      succeeded.push(filePath);
    }
    return { succeeded, failed: [] };
  }

  // --- Multipart upload operations ---

  async initMultipartUpload(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    const uploadId = randomUUID();
    this.multipartUploads.set(uploadId, {
      key: normalizePath(path),
      parts: new Map(),
      options,
    });
    return { uploadId, key: path };
  }

  async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    _path: string,
  ): Promise<MultipartUploadPart> {
    const upload = this.multipartUploads.get(uploadId);
    if (!upload) throw new Error(`Upload not found: ${uploadId}`);

    let buffer: Buffer;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (data instanceof Uint8Array) {
      buffer = Buffer.from(data);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of data as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      buffer = Buffer.concat(chunks);
    }

    upload.parts.set(partNumber, buffer);
    const etag = createHash('md5').update(buffer).digest('hex');

    return { partNumber, etag, size: buffer.length };
  }

  async completeMultipartUpload(
    uploadId: string,
    path: string,
    _parts: MultipartUploadPart[],
  ): Promise<boolean> {
    const upload = this.multipartUploads.get(uploadId);
    if (!upload) throw new Error(`Upload not found: ${uploadId}`);

    const sortedParts = [...upload.parts.entries()].sort(([a], [b]) => a - b).map(([, buf]) => buf);

    const combined = Buffer.concat(sortedParts);
    await this.put(path, combined, upload.options);

    this.multipartUploads.delete(uploadId);
    return true;
  }

  async abortMultipartUpload(uploadId: string, _path: string): Promise<boolean> {
    this.multipartUploads.delete(uploadId);
    return true;
  }

  async putFileMultipart(
    path: string,
    file: any,
    options?: MultipartUploadOptions,
  ): Promise<string | false> {
    const filename = file.originalname || file.filename || getFilename(path) || 'upload';
    return this.putFileAs(path, file, filename, options);
  }

  getBucket(): string | undefined {
    return undefined;
  }

  scope(prefix: string): FilesystemContract {
    return new ScopedDisk(this, prefix);
  }

  // --- v0.1.0: Range requests + conditional writes ---

  async getRange(path: string, options: RangeOptions): Promise<RangeResult> {
    const key = normalizePath(path);
    const file = this.store.get(key);
    if (!file) throw new Error(`File not found: ${path}`);
    const totalSize = file.content.length;
    const start = options.start;
    const end = options.end !== undefined ? options.end : totalSize - 1;
    const slice = file.content.slice(start, end + 1);
    const stream = Readable.from(slice);
    return {
      stream,
      size: slice.length,
      contentRange: `bytes ${start}-${end}/${totalSize}`,
      totalSize,
    };
  }

  async putIfMatch(
    path: string,
    content: string | Buffer | NodeJS.ReadableStream,
    etag: string,
    opts?: PutOptions,
  ): Promise<ConditionalWriteResult> {
    const key = normalizePath(path);
    const currentEtag = this.etags.get(key);
    if (!currentEtag || currentEtag !== etag) return { success: false };
    await this.put(path, content, opts);
    return { success: true, etag: this.etags.get(key) };
  }

  async putIfNoneMatch(
    path: string,
    content: string | Buffer | NodeJS.ReadableStream,
    opts?: PutOptions,
  ): Promise<ConditionalWriteResult> {
    if (this.store.has(normalizePath(path))) return { success: false };
    await this.put(path, content, opts);
    return { success: true, etag: this.etags.get(normalizePath(path)) };
  }

  // --- Assertion methods ---

  assertExists(path: string, message?: string): void {
    const key = normalizePath(path);
    if (!this.store.has(key)) {
      throw new Error(message || `Expected file [${path}] to exist, but it does not.`);
    }
  }

  assertMissing(path: string, message?: string): void {
    const key = normalizePath(path);
    if (this.store.has(key)) {
      throw new Error(message || `Expected file [${path}] to be missing, but it exists.`);
    }
  }

  assertCount(expected: number, directory?: string): void {
    const prefix = directory ? normalizePath(directory) + '/' : '';
    const count = [...this.store.keys()].filter((k) => !prefix || k.startsWith(prefix)).length;
    if (count !== expected) {
      throw new Error(
        `Expected ${expected} file(s)${directory ? ` in [${directory}]` : ''}, but found ${count}.`,
      );
    }
  }

  assertDirectoryEmpty(directory: string): void {
    this.assertCount(0, directory);
  }

  assertContentEquals(path: string, expected: string | Buffer): void {
    this.assertExists(path);
    const file = this.store.get(normalizePath(path))!;
    const expectedBuffer = typeof expected === 'string' ? Buffer.from(expected) : expected;
    if (!file.content.equals(expectedBuffer)) {
      throw new Error(`Content of [${path}] does not match expected value.`);
    }
  }

  getStoredFiles(): string[] {
    return [...this.store.keys()];
  }

  getStoredFile(path: string): FakeFile | undefined {
    return this.store.get(normalizePath(path));
  }

  reset(): void {
    this.store.clear();
    this.directoryStore.clear();
    this.multipartUploads.clear();
    this.etags.clear();
  }

  // --- Private helpers ---

  private ensureParentDirectories(path: string): void {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      this.directoryStore.add(parts.slice(0, i).join('/') + '/');
    }
  }
}
