import {
  ChecksumAlgorithm,
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
  TemporaryUrlOptions,
} from '../interfaces/storage.interface';
import { joinPaths } from '../utils/storage.utils';

export class ScopedDisk implements FilesystemContract {
  constructor(
    private readonly disk: FilesystemContract,
    private readonly prefix: string,
  ) {}

  private resolve(path: string): string {
    return joinPaths(this.prefix, path);
  }

  private stripPrefix(path: string): string {
    const scopePrefix = this.prefix.endsWith('/') ? this.prefix : this.prefix + '/';
    return path.startsWith(scopePrefix) ? path.slice(scopePrefix.length) : path;
  }

  async exists(path: string): Promise<boolean> {
    return this.disk.exists(this.resolve(path));
  }

  async get(path: string, options?: GetOptions): Promise<Buffer | NodeJS.ReadableStream | string> {
    return this.disk.get(this.resolve(path), options);
  }

  async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    return this.disk.put(this.resolve(path), contents, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async putFile(path: string, file: any, options?: PutOptions): Promise<string | false> {
    const result = await this.disk.putFile(this.resolve(path), file, options);
    if (result === false) return false;
    return this.stripPrefix(result);
  }

  async putFileAs(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    name: string,
    options?: PutOptions,
  ): Promise<string | false> {
    const result = await this.disk.putFileAs(this.resolve(path), file, name, options);
    if (result === false) return false;
    return this.stripPrefix(result);
  }

  async delete(path: string): Promise<boolean> {
    return this.disk.delete(this.resolve(path));
  }

  async copy(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    return this.disk.copy(this.resolve(from), this.resolve(to), options);
  }

  async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    return this.disk.move(this.resolve(from), this.resolve(to), options);
  }

  async size(path: string): Promise<number> {
    return this.disk.size(this.resolve(path));
  }

  async lastModified(path: string): Promise<number> {
    return this.disk.lastModified(this.resolve(path));
  }

  async files(directory?: string, recursive?: boolean): Promise<string[]> {
    const resolvedDir = directory ? this.resolve(directory) : this.prefix;
    const results = await this.disk.files(resolvedDir, recursive);
    return results.map((p) => this.stripPrefix(p));
  }

  async allFiles(directory?: string): Promise<string[]> {
    const resolvedDir = directory ? this.resolve(directory) : this.prefix;
    const results = await this.disk.allFiles(resolvedDir);
    return results.map((p) => this.stripPrefix(p));
  }

  async directories(directory?: string, recursive?: boolean): Promise<string[]> {
    const resolvedDir = directory ? this.resolve(directory) : this.prefix;
    const results = await this.disk.directories(resolvedDir, recursive);
    return results.map((p) => this.stripPrefix(p));
  }

  async allDirectories(directory?: string): Promise<string[]> {
    const resolvedDir = directory ? this.resolve(directory) : this.prefix;
    const results = await this.disk.allDirectories(resolvedDir);
    return results.map((p) => this.stripPrefix(p));
  }

  async makeDirectory(path: string): Promise<boolean> {
    return this.disk.makeDirectory(this.resolve(path));
  }

  async deleteDirectory(directory: string): Promise<boolean> {
    return this.disk.deleteDirectory(this.resolve(directory));
  }

  async getVisibility(path: string): Promise<'private' | 'public'> {
    return this.disk.getVisibility(this.resolve(path));
  }

  async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    return this.disk.setVisibility(this.resolve(path), visibility);
  }

  url(path: string): string {
    return this.disk.url(this.resolve(path));
  }

  async temporaryUrl(
    path: string,
    expiration: Date | number,
    options?: TemporaryUrlOptions,
  ): Promise<string> {
    return this.disk.temporaryUrl(this.resolve(path), expiration, options);
  }

  async prepend(path: string, data: string): Promise<boolean> {
    return this.disk.prepend(this.resolve(path), data);
  }

  async append(path: string, data: string): Promise<boolean> {
    return this.disk.append(this.resolve(path), data);
  }

  async getMetadata(path: string): Promise<FileMetadata> {
    const metadata = await this.disk.getMetadata(this.resolve(path));
    return { ...metadata, path: this.stripPrefix(metadata.path) };
  }

  async mimeType(path: string): Promise<string> {
    return this.disk.mimeType(this.resolve(path));
  }

  async directorySize(directory?: string): Promise<number> {
    const resolvedDir = directory ? this.resolve(directory) : this.prefix;
    return this.disk.directorySize(resolvedDir);
  }

  async initMultipartUpload(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    if (!this.disk.initMultipartUpload) throw new Error('Disk does not support multipart upload');
    const result = await this.disk.initMultipartUpload(this.resolve(path), options);
    return { ...result, key: this.stripPrefix(result.key) };
  }

  async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    path: string,
  ): Promise<MultipartUploadPart> {
    if (!this.disk.uploadPart) throw new Error('Disk does not support multipart upload');
    return this.disk.uploadPart(uploadId, partNumber, data, this.resolve(path));
  }

  async completeMultipartUpload(
    uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean> {
    if (!this.disk.completeMultipartUpload)
      throw new Error('Disk does not support multipart upload');
    return this.disk.completeMultipartUpload(uploadId, this.resolve(path), parts);
  }

  async abortMultipartUpload(uploadId: string, path: string): Promise<boolean> {
    if (!this.disk.abortMultipartUpload) throw new Error('Disk does not support multipart upload');
    return this.disk.abortMultipartUpload(uploadId, this.resolve(path));
  }

  async putFileMultipart(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    options?: MultipartUploadOptions,
  ): Promise<string | false> {
    if (!this.disk.putFileMultipart) throw new Error('Disk does not support multipart upload');
    const result = await this.disk.putFileMultipart(this.resolve(path), file, options);
    if (result === false) return false;
    return this.stripPrefix(result);
  }

  async missing(path: string): Promise<boolean> {
    if (this.disk.missing) return this.disk.missing(this.resolve(path));
    return !(await this.exists(path));
  }

  async json<T = unknown>(path: string): Promise<T> {
    if (this.disk.json) return this.disk.json<T>(this.resolve(path));
    const content = await this.get(path, { responseType: 'string' });
    return JSON.parse(content as string);
  }

  async checksum(path: string, algorithm?: ChecksumAlgorithm): Promise<string> {
    if (!this.disk.checksum) throw new Error('Disk does not support checksum()');
    return this.disk.checksum(this.resolve(path), algorithm);
  }

  async deleteMany(paths: string[]): Promise<DeleteManyResult> {
    if (!this.disk.deleteMany) throw new Error('Disk does not support deleteMany()');
    const resolvedPaths = paths.map((p) => this.resolve(p));
    const result = await this.disk.deleteMany(resolvedPaths);
    return {
      succeeded: result.succeeded.map((p) => this.stripPrefix(p)),
      failed: result.failed.map((p) => this.stripPrefix(p)),
    };
  }

  getBucket(): string | undefined {
    return this.disk.getBucket?.();
  }

  scope(prefix: string): FilesystemContract {
    return new ScopedDisk(this.disk, joinPaths(this.prefix, prefix));
  }
}
