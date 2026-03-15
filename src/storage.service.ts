import { Inject, Injectable, StreamableFile } from '@nestjs/common';
import { Readable } from 'stream';

import { STORAGE_MODULE_OPTIONS } from './constants';
import { LocalDisk } from './disk/local-disk';
import { S3Disk } from './disk/s3-disk';
import { R2Disk } from './disk/r2-disk';
import { GcsDisk } from './disk/gcs-disk';
import type {
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
  StorageConfig,
  StorageManager,
  StreamableFileOptions,
  TemporaryUrlOptions,
} from './interfaces/storage.interface';
import { getFilename } from './utils/storage.utils';

@Injectable()
export class StorageService implements StorageManager {
  private disks: Map<string, FilesystemContract> = new Map();
  private drivers: Map<string, (config: DiskConfig) => FilesystemContract> = new Map();
  private defaultDisk: string;
  private config: StorageConfig;

  constructor(@Inject(STORAGE_MODULE_OPTIONS) config: StorageConfig) {
    this.config = config;
    this.defaultDisk = config.default;

    // Register built-in drivers
    this.registerDriver('local', (c) => new LocalDisk(c));
    this.registerDriver('s3', (c) => new S3Disk(c));
    this.registerDriver('r2', (c) => new R2Disk(c));
    this.registerDriver('gcs', (c) => new GcsDisk(c));
  }

  private registerDriver(name: string, factory: (config: DiskConfig) => FilesystemContract): void {
    this.drivers.set(name, factory);
  }

  disk(name?: string): FilesystemContract {
    const diskName = name || this.defaultDisk;

    if (this.disks.has(diskName)) {
      return this.disks.get(diskName)!;
    }

    const diskConfig = this.config.disks[diskName];
    if (!diskConfig) {
      throw new Error(`Disk [${diskName}] not configured.`);
    }

    const driver = this.drivers.get(diskConfig.driver);
    if (!driver) {
      throw new Error(`Driver [${diskConfig.driver}] not supported.`);
    }

    const disk = driver(diskConfig);
    this.disks.set(diskName, disk);

    return disk;
  }

  diskByBucket(bucketName: string): FilesystemContract {
    // Check cached disks first
    for (const [, fs] of this.disks) {
      const getBucket = fs.getBucket;
      if (typeof getBucket === 'function' && getBucket.call(fs) === bucketName) {
        return fs;
      }
    }

    // Check configured disks
    const bucketDrivers = ['s3', 'gcs', 'r2'];
    for (const [diskName, diskConfig] of Object.entries(this.config.disks)) {
      if (bucketDrivers.includes(diskConfig.driver) && diskConfig.bucket === bucketName) {
        return this.disk(diskName);
      }
    }

    throw new Error(
      `No configured disk found for bucket [${bucketName}]. ` +
        `Add a disk with this bucket in storage config.`,
    );
  }

  cloud(): FilesystemContract {
    return this.disk('main');
  }

  build(config: DiskConfig): FilesystemContract {
    const driver = this.drivers.get(config.driver);
    if (!driver) {
      throw new Error(`Driver [${config.driver}] not supported.`);
    }

    return driver(config);
  }

  extend(driver: string, callback: (config: DiskConfig) => FilesystemContract): void {
    this.registerDriver(driver, callback);
  }

  setDisk(name: string, disk: FilesystemContract): void {
    this.disks.set(name, disk);
  }

  // Proxy methods to default disk
  async exists(path: string): Promise<boolean> {
    return this.disk().exists(path);
  }

  async get(path: string, options?: GetOptions): Promise<Buffer | NodeJS.ReadableStream | string> {
    return this.disk().get(path, options);
  }

  async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    return this.disk().put(path, contents, options);
  }

  async putFile(path: string, file: any, options?: PutOptions): Promise<string | false> {
    return this.disk().putFile(path, file, options);
  }

  async putFileAs(
    path: string,
    file: any,
    name: string,
    options?: PutOptions,
  ): Promise<string | false> {
    return this.disk().putFileAs(path, file, name, options);
  }

  async delete(path: string): Promise<boolean> {
    return this.disk().delete(path);
  }

  async copy(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    return this.disk().copy(from, to, options);
  }

  async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    return this.disk().move(from, to, options);
  }

  async size(path: string): Promise<number> {
    return this.disk().size(path);
  }

  async lastModified(path: string): Promise<number> {
    return this.disk().lastModified(path);
  }

  async files(directory?: string, recursive?: boolean): Promise<string[]> {
    return this.disk().files(directory, recursive);
  }

  async allFiles(directory?: string): Promise<string[]> {
    return this.disk().allFiles(directory);
  }

  async directories(directory?: string, recursive?: boolean): Promise<string[]> {
    return this.disk().directories(directory, recursive);
  }

  async allDirectories(directory?: string): Promise<string[]> {
    return this.disk().allDirectories(directory);
  }

  async makeDirectory(path: string): Promise<boolean> {
    return this.disk().makeDirectory(path);
  }

  async deleteDirectory(directory: string): Promise<boolean> {
    return this.disk().deleteDirectory(directory);
  }

  async getVisibility(path: string): Promise<'private' | 'public'> {
    return this.disk().getVisibility(path);
  }

  async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    return this.disk().setVisibility(path, visibility);
  }

  url(path: string): string {
    return this.disk().url(path);
  }

  async temporaryUrl(
    path: string,
    expiration: Date | number,
    options?: TemporaryUrlOptions,
  ): Promise<string> {
    return this.disk().temporaryUrl(path, expiration, options);
  }

  async prepend(path: string, data: string): Promise<boolean> {
    return this.disk().prepend(path, data);
  }

  async append(path: string, data: string): Promise<boolean> {
    return this.disk().append(path, data);
  }

  async getMetadata(path: string): Promise<FileMetadata> {
    return this.disk().getMetadata(path);
  }

  async mimeType(path: string): Promise<string> {
    return this.disk().mimeType(path);
  }

  async directorySize(directory?: string): Promise<number> {
    return this.disk().directorySize(directory);
  }

  // Multipart upload proxy methods
  async initMultipartUpload(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    const disk = this.disk();
    if (!disk.initMultipartUpload) {
      throw new Error('Disk does not support multipart upload');
    }
    return disk.initMultipartUpload(path, options);
  }

  async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    path: string,
  ): Promise<MultipartUploadPart> {
    const disk = this.disk();
    if (!disk.uploadPart) {
      throw new Error('Disk does not support multipart upload');
    }
    return disk.uploadPart(uploadId, partNumber, data, path);
  }

  async completeMultipartUpload(
    uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean> {
    const disk = this.disk();
    if (!disk.completeMultipartUpload) {
      throw new Error('Disk does not support multipart upload');
    }
    return disk.completeMultipartUpload(uploadId, path, parts);
  }

  async abortMultipartUpload(uploadId: string, path: string): Promise<boolean> {
    const disk = this.disk();
    if (!disk.abortMultipartUpload) {
      throw new Error('Disk does not support multipart upload');
    }
    return disk.abortMultipartUpload(uploadId, path);
  }

  async putFileMultipart(
    path: string,
    file: any,
    options?: MultipartUploadOptions,
  ): Promise<string | false> {
    const disk = this.disk();
    if (!disk.putFileMultipart) {
      throw new Error('Disk does not support multipart upload');
    }
    return disk.putFileMultipart(path, file, options);
  }

  // Convenience method proxies
  async missing(path: string): Promise<boolean> {
    const disk = this.disk();
    if (!disk.missing) {
      throw new Error('Disk does not support missing()');
    }
    return disk.missing(path);
  }

  async json<T = unknown>(path: string): Promise<T> {
    const disk = this.disk();
    if (!disk.json) {
      throw new Error('Disk does not support json()');
    }
    return disk.json<T>(path);
  }

  async checksum(path: string, algorithm?: ChecksumAlgorithm): Promise<string> {
    const disk = this.disk();
    if (!disk.checksum) {
      throw new Error('Disk does not support checksum()');
    }
    return disk.checksum(path, algorithm);
  }

  async deleteMany(paths: string[]): Promise<DeleteManyResult> {
    const disk = this.disk();
    if (!disk.deleteMany) {
      throw new Error('Disk does not support deleteMany()');
    }
    return disk.deleteMany(paths);
  }

  // Streamable file for NestJS controllers
  async getStreamableFile(path: string, options?: StreamableFileOptions): Promise<StreamableFile> {
    const disk = this.disk();

    const [stream, mime, fileSize] = await Promise.all([
      disk.get(path, { responseType: 'stream' }),
      disk.mimeType(path),
      disk.size(path),
    ]);

    const filename = options?.filename ?? getFilename(path);
    const disposition = options?.disposition ?? 'attachment';

    return new StreamableFile(stream as Readable, {
      type: mime,
      length: fileSize,
      disposition: `${disposition}; filename="${filename}"`,
    });
  }
}
