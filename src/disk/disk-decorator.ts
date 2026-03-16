import {
  ChecksumAlgorithm,
  ConditionalWriteResult,
  CopyOptions,
  DeleteManyResult,
  FileMetadata,
  FileVersion,
  FilesystemContract,
  GetOptions,
  MoveOptions,
  MultipartUploadInit,
  MultipartUploadOptions,
  MultipartUploadPart,
  PresignedPostData,
  PresignedPostOptions,
  PutOptions,
  RangeOptions,
  RangeResult,
  TemporaryUrlOptions,
} from '../interfaces/storage.interface';

/**
 * Abstract base class for all disk decorator implementations.
 *
 * Delegates every `FilesystemContract` method to the wrapped `disk` by default.
 * Subclasses override only the methods they need to transform, eliminating
 * the repetitive proxy boilerplate that would otherwise appear in every decorator.
 *
 * Used by: `EncryptedDisk`, `ScopedDisk`, `CachedDisk`, `RetryDisk`,
 *           `ReplicatedDisk`, `CdnDisk`, `OtelDisk`, `QuotaDisk`.
 *
 * @example
 * ```ts
 * class LoggingDisk extends DiskDecorator {
 *   async put(path, contents, options?) {
 *     console.log('put', path);
 *     return super.put(path, contents, options);
 *   }
 * }
 * ```
 */
export abstract class DiskDecorator implements FilesystemContract {
  constructor(protected readonly disk: FilesystemContract) {}

  // ─── Core operations ─────────────────────────────────────────────────────────

  async exists(path: string): Promise<boolean> {
    return this.disk.exists(path);
  }

  async get(path: string, options?: GetOptions): Promise<Buffer | NodeJS.ReadableStream | string> {
    return this.disk.get(path, options);
  }

  async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    return this.disk.put(path, contents, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async putFile(path: string, file: any, options?: PutOptions): Promise<string | false> {
    return this.disk.putFile(path, file, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async putFileAs(
    path: string,
    file: any,
    name: string,
    options?: PutOptions,
  ): Promise<string | false> {
    return this.disk.putFileAs(path, file, name, options);
  }

  async delete(path: string): Promise<boolean> {
    return this.disk.delete(path);
  }

  async copy(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    return this.disk.copy(from, to, options);
  }

  async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    return this.disk.move(from, to, options);
  }

  async size(path: string): Promise<number> {
    return this.disk.size(path);
  }

  async lastModified(path: string): Promise<number> {
    return this.disk.lastModified(path);
  }

  // ─── Directory operations ─────────────────────────────────────────────────

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

  // ─── Visibility ───────────────────────────────────────────────────────────

  async getVisibility(path: string): Promise<'private' | 'public'> {
    return this.disk.getVisibility(path);
  }

  async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    return this.disk.setVisibility(path, visibility);
  }

  // ─── URL operations ───────────────────────────────────────────────────────

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

  // ─── Content manipulation ─────────────────────────────────────────────────

  async prepend(path: string, data: string): Promise<boolean> {
    return this.disk.prepend(path, data);
  }

  async append(path: string, data: string): Promise<boolean> {
    return this.disk.append(path, data);
  }

  // ─── Metadata ─────────────────────────────────────────────────────────────

  async getMetadata<T extends FileMetadata = FileMetadata>(path: string): Promise<T> {
    return this.disk.getMetadata<T>(path);
  }

  async mimeType(path: string): Promise<string> {
    return this.disk.mimeType(path);
  }

  async directorySize(directory?: string): Promise<number> {
    return this.disk.directorySize(directory);
  }

  // ─── Multipart upload (optional) ─────────────────────────────────────────

  async initMultipartUpload(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    if (!this.disk.initMultipartUpload) throw new Error('Disk does not support multipart upload');
    return this.disk.initMultipartUpload(path, options);
  }

  async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    path: string,
  ): Promise<MultipartUploadPart> {
    if (!this.disk.uploadPart) throw new Error('Disk does not support multipart upload');
    return this.disk.uploadPart(uploadId, partNumber, data, path);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    options?: MultipartUploadOptions,
  ): Promise<string | false> {
    if (!this.disk.putFileMultipart) throw new Error('Disk does not support multipart upload');
    return this.disk.putFileMultipart(path, file, options);
  }

  // ─── Convenience operations ───────────────────────────────────────────────

  async missing(path: string): Promise<boolean> {
    if (this.disk.missing) return this.disk.missing(path);
    return !(await this.exists(path));
  }

  async json<T = unknown>(path: string, schema?: { parse(v: unknown): T }): Promise<T> {
    if (this.disk.json) return this.disk.json<T>(path, schema);
    const content = await this.get(path, { responseType: 'string' });
    const parsed = JSON.parse(content as string) as unknown;
    return schema ? schema.parse(parsed) : (parsed as T);
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

  async presignedPost(path: string, options?: PresignedPostOptions): Promise<PresignedPostData> {
    if (!this.disk.presignedPost) throw new Error('Disk does not support presignedPost()');
    return this.disk.presignedPost(path, options);
  }

  scope(prefix: string): FilesystemContract {
    // Import lazily to avoid circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ScopedDisk } = require('./scoped-disk') as {
      ScopedDisk: new (d: FilesystemContract, p: string) => FilesystemContract;
    };
    return new ScopedDisk(this, prefix);
  }

  // ─── Temporary files (optional) ───────────────────────────────────────────

  async putTemp(
    path: string,
    content: string | Buffer | NodeJS.ReadableStream,
    ttlSeconds: number,
    options?: PutOptions,
  ): Promise<string> {
    if (this.disk.putTemp) return this.disk.putTemp(path, content, ttlSeconds, options);
    // Fallback: store with Expires header (best-effort for S3-compatible drivers)
    const expires = new Date(Date.now() + ttlSeconds * 1000);
    await this.put(path, content, { ...options, Expires: expires });
    return path;
  }

  async invalidateCdn(paths: string[]): Promise<void> {
    if (this.disk.invalidateCdn) return this.disk.invalidateCdn(paths);
    // No-op by default
  }

  // ─── v0.1.0 optional method delegations ──────────────────────────────────

  async listVersions(path: string): Promise<FileVersion[]> {
    if (!this.disk.listVersions) throw new Error('Disk does not support listVersions()');
    return this.disk.listVersions(path);
  }

  async getVersion(path: string, versionId: string): Promise<Buffer> {
    if (!this.disk.getVersion) throw new Error('Disk does not support getVersion()');
    return this.disk.getVersion(path, versionId);
  }

  async restoreVersion(path: string, versionId: string): Promise<boolean> {
    if (!this.disk.restoreVersion) throw new Error('Disk does not support restoreVersion()');
    return this.disk.restoreVersion(path, versionId);
  }

  async deleteVersion(path: string, versionId: string): Promise<boolean> {
    if (!this.disk.deleteVersion) throw new Error('Disk does not support deleteVersion()');
    return this.disk.deleteVersion(path, versionId);
  }

  async getRange(path: string, options: RangeOptions): Promise<RangeResult> {
    if (!this.disk.getRange) throw new Error('Disk does not support getRange()');
    return this.disk.getRange(path, options);
  }

  async putIfMatch(
    path: string,
    content: string | Buffer | NodeJS.ReadableStream,
    etag: string,
    opts?: PutOptions,
  ): Promise<ConditionalWriteResult> {
    if (!this.disk.putIfMatch) throw new Error('Disk does not support putIfMatch()');
    return this.disk.putIfMatch(path, content, etag, opts);
  }

  async putIfNoneMatch(
    path: string,
    content: string | Buffer | NodeJS.ReadableStream,
    opts?: PutOptions,
  ): Promise<ConditionalWriteResult> {
    if (!this.disk.putIfNoneMatch) throw new Error('Disk does not support putIfNoneMatch()');
    return this.disk.putIfNoneMatch(path, content, opts);
  }
}
