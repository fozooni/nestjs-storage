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
import { DiskDecorator } from './disk-decorator';

export class ScopedDisk extends DiskDecorator {
  constructor(
    disk: FilesystemContract,
    private readonly prefix: string,
  ) {
    super(disk);
  }

  private resolve(path: string): string {
    return joinPaths(this.prefix, path);
  }

  private stripPrefix(path: string): string {
    const scopePrefix = this.prefix.endsWith('/') ? this.prefix : this.prefix + '/';
    return path.startsWith(scopePrefix) ? path.slice(scopePrefix.length) : path;
  }

  override async exists(path: string): Promise<boolean> {
    return this.disk.exists(this.resolve(path));
  }

  override async get(
    path: string,
    options?: GetOptions,
  ): Promise<Buffer | NodeJS.ReadableStream | string> {
    return this.disk.get(this.resolve(path), options);
  }

  override async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    return this.disk.put(this.resolve(path), contents, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async putFile(path: string, file: any, options?: PutOptions): Promise<string | false> {
    const result = await this.disk.putFile(this.resolve(path), file, options);
    if (result === false) return false;
    return this.stripPrefix(result);
  }

  override async putFileAs(
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

  override async delete(path: string): Promise<boolean> {
    return this.disk.delete(this.resolve(path));
  }

  override async copy(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    return this.disk.copy(this.resolve(from), this.resolve(to), options);
  }

  override async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    return this.disk.move(this.resolve(from), this.resolve(to), options);
  }

  override async size(path: string): Promise<number> {
    return this.disk.size(this.resolve(path));
  }

  override async lastModified(path: string): Promise<number> {
    return this.disk.lastModified(this.resolve(path));
  }

  override async files(directory?: string, recursive?: boolean): Promise<string[]> {
    const resolvedDir = directory ? this.resolve(directory) : this.prefix;
    const results = await this.disk.files(resolvedDir, recursive);
    return results.map((p) => this.stripPrefix(p));
  }

  override async allFiles(directory?: string): Promise<string[]> {
    const resolvedDir = directory ? this.resolve(directory) : this.prefix;
    const results = await this.disk.allFiles(resolvedDir);
    return results.map((p) => this.stripPrefix(p));
  }

  override async directories(directory?: string, recursive?: boolean): Promise<string[]> {
    const resolvedDir = directory ? this.resolve(directory) : this.prefix;
    const results = await this.disk.directories(resolvedDir, recursive);
    return results.map((p) => this.stripPrefix(p));
  }

  override async allDirectories(directory?: string): Promise<string[]> {
    const resolvedDir = directory ? this.resolve(directory) : this.prefix;
    const results = await this.disk.allDirectories(resolvedDir);
    return results.map((p) => this.stripPrefix(p));
  }

  override async makeDirectory(path: string): Promise<boolean> {
    return this.disk.makeDirectory(this.resolve(path));
  }

  override async deleteDirectory(directory: string): Promise<boolean> {
    return this.disk.deleteDirectory(this.resolve(directory));
  }

  override async getVisibility(path: string): Promise<'private' | 'public'> {
    return this.disk.getVisibility(this.resolve(path));
  }

  override async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    return this.disk.setVisibility(this.resolve(path), visibility);
  }

  override url(path: string): string {
    return this.disk.url(this.resolve(path));
  }

  override async temporaryUrl(
    path: string,
    expiration: Date | number,
    options?: TemporaryUrlOptions,
  ): Promise<string> {
    return this.disk.temporaryUrl(this.resolve(path), expiration, options);
  }

  override async prepend(path: string, data: string): Promise<boolean> {
    return this.disk.prepend(this.resolve(path), data);
  }

  override async append(path: string, data: string): Promise<boolean> {
    return this.disk.append(this.resolve(path), data);
  }

  override async getMetadata<T extends FileMetadata = FileMetadata>(path: string): Promise<T> {
    const metadata = await this.disk.getMetadata<T>(this.resolve(path));
    return { ...metadata, path: this.stripPrefix(metadata.path) };
  }

  override async mimeType(path: string): Promise<string> {
    return this.disk.mimeType(this.resolve(path));
  }

  override async directorySize(directory?: string): Promise<number> {
    const resolvedDir = directory ? this.resolve(directory) : this.prefix;
    return this.disk.directorySize(resolvedDir);
  }

  override async initMultipartUpload(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    if (!this.disk.initMultipartUpload) throw new Error('Disk does not support multipart upload');
    const result = await this.disk.initMultipartUpload(this.resolve(path), options);
    return { ...result, key: this.stripPrefix(result.key) };
  }

  override async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    path: string,
  ): Promise<MultipartUploadPart> {
    if (!this.disk.uploadPart) throw new Error('Disk does not support multipart upload');
    return this.disk.uploadPart(uploadId, partNumber, data, this.resolve(path));
  }

  override async completeMultipartUpload(
    uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean> {
    if (!this.disk.completeMultipartUpload)
      throw new Error('Disk does not support multipart upload');
    return this.disk.completeMultipartUpload(uploadId, this.resolve(path), parts);
  }

  override async abortMultipartUpload(uploadId: string, path: string): Promise<boolean> {
    if (!this.disk.abortMultipartUpload) throw new Error('Disk does not support multipart upload');
    return this.disk.abortMultipartUpload(uploadId, this.resolve(path));
  }

  override async putFileMultipart(
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

  override async missing(path: string): Promise<boolean> {
    if (this.disk.missing) return this.disk.missing(this.resolve(path));
    return !(await this.exists(path));
  }

  override async json<T = unknown>(path: string, schema?: { parse(v: unknown): T }): Promise<T> {
    if (this.disk.json) return this.disk.json<T>(this.resolve(path), schema);
    const content = await this.get(path, { responseType: 'string' });
    const parsed = JSON.parse(content as string) as unknown;
    return schema ? schema.parse(parsed) : (parsed as T);
  }

  override async checksum(path: string, algorithm?: ChecksumAlgorithm): Promise<string> {
    if (!this.disk.checksum) throw new Error('Disk does not support checksum()');
    return this.disk.checksum(this.resolve(path), algorithm);
  }

  override async deleteMany(paths: string[]): Promise<DeleteManyResult> {
    if (!this.disk.deleteMany) throw new Error('Disk does not support deleteMany()');
    const resolvedPaths = paths.map((p) => this.resolve(p));
    const result = await this.disk.deleteMany(resolvedPaths);
    return {
      succeeded: result.succeeded.map((p) => this.stripPrefix(p)),
      failed: result.failed.map((p) => this.stripPrefix(p)),
    };
  }

  override scope(prefix: string): FilesystemContract {
    return new ScopedDisk(this.disk, joinPaths(this.prefix, prefix));
  }
}
