export interface DiskConfig {
  driver: 'local' | 's3' | 'gcs' | 'r2' | (string & {});
  root?: string;
  url?: string;
  throw?: boolean;
  report?: boolean;
  visibility?: 'private' | 'public';

  // S3 / R2 shared fields
  key?: string;
  secret?: string;
  region?: string;
  bucket?: string;
  endpoint?: string;
  use_path_style_endpoint?: boolean;

  // R2-specific
  accountId?: string;

  // GCS-specific
  projectId?: string;
  keyFilename?: string;
  credentials?: Record<string, any>;

  // Extensibility for custom drivers
  [key: string]: any;
}

export interface FileMetadata {
  path: string;
  size: number;
  lastModified: Date;
  type?: string;
  mimetype?: string;
  extension?: string;
  visibility?: 'private' | 'public';
  [key: string]: any;
}

export interface PutOptions {
  visibility?: 'private' | 'public';
  mimetype?: string;
  metadata?: Record<string, any>;
  filename?: string;
  CacheControl?: string;
  ContentDisposition?: string;
  ContentEncoding?: string;
  ContentLanguage?: string;
  Expires?: Date;
}

export interface GetOptions {
  responseType?: 'buffer' | 'stream' | 'string';
}

export interface ExistsOptions {
  bucket?: string;
}

export interface UrlOptions {
  expires?: number;
  download?: boolean | string;
  responseType?: string;
}

export interface MoveOptions {
  visibility?: 'private' | 'public';
}

export interface CopyOptions {
  visibility?: 'private' | 'public';
}

export interface ListOptions {
  prefix?: string;
  recursive?: boolean;
  maxResults?: number;
}

export interface TemporaryUrlOptions {
  expires?: number;
  method?: 'GET' | 'PUT' | 'DELETE';
  responseDisposition?: string;
  responseType?: string;
}

export interface MultipartUploadOptions extends PutOptions {
  chunkSize?: number;
  partNumberStart?: number;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}

export interface MultipartUploadInit {
  uploadId: string;
  key: string;
  bucket?: string;
}

export interface MultipartUploadPart {
  partNumber: number;
  etag: string;
  size: number;
}

export interface MultipartUploadChunk {
  partNumber: number;
  data: Buffer | Uint8Array | NodeJS.ReadableStream;
  size: number;
}

export interface MultipartUploadStatus {
  uploadId: string;
  key: string;
  totalParts: number;
  completedParts: number;
  uploadedBytes: number;
  totalBytes: number;
}

export type ChecksumAlgorithm = 'md5' | 'sha1' | 'sha256';

export interface DeleteManyResult {
  succeeded: string[];
  failed: string[];
}

export interface StreamableFileOptions {
  disposition?: 'inline' | 'attachment';
  filename?: string;
}

export interface FilesystemContract {
  // Core operations
  exists(path: string): Promise<boolean>;
  get(path: string, options?: GetOptions): Promise<Buffer | NodeJS.ReadableStream | string>;
  put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean>;
  putFile(path: string, file: any, options?: PutOptions): Promise<string | false>;
  putFileAs(path: string, file: any, name: string, options?: PutOptions): Promise<string | false>;
  delete(path: string): Promise<boolean>;
  copy(from: string, to: string, options?: CopyOptions): Promise<boolean>;
  move(from: string, to: string, options?: MoveOptions): Promise<boolean>;
  size(path: string): Promise<number>;
  lastModified(path: string): Promise<number>;

  // Directory operations
  files(directory?: string, recursive?: boolean): Promise<string[]>;
  allFiles(directory?: string): Promise<string[]>;
  directories(directory?: string, recursive?: boolean): Promise<string[]>;
  allDirectories(directory?: string): Promise<string[]>;
  makeDirectory(path: string): Promise<boolean>;
  deleteDirectory(directory: string): Promise<boolean>;

  // Visibility operations
  getVisibility(path: string): Promise<'private' | 'public'>;
  setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean>;

  // URL operations
  url(path: string): string;
  temporaryUrl(
    path: string,
    expiration: Date | number,
    options?: TemporaryUrlOptions,
  ): Promise<string>;

  // Additional operations
  prepend(path: string, data: string): Promise<boolean>;
  append(path: string, data: string): Promise<boolean>;

  // Metadata
  getMetadata(path: string): Promise<FileMetadata>;
  mimeType(path: string): Promise<string>;
  directorySize(directory?: string): Promise<number>;

  // Multipart upload operations
  initMultipartUpload?(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit>;
  uploadPart?(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    path: string,
  ): Promise<MultipartUploadPart>;
  completeMultipartUpload?(
    uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean>;
  abortMultipartUpload?(uploadId: string, path: string): Promise<boolean>;
  putFileMultipart?(
    path: string,
    file: any,
    options?: MultipartUploadOptions,
  ): Promise<string | false>;

  // Convenience operations
  missing?(path: string): Promise<boolean>;
  json?<T = unknown>(path: string): Promise<T>;
  checksum?(path: string, algorithm?: ChecksumAlgorithm): Promise<string>;
  deleteMany?(paths: string[]): Promise<DeleteManyResult>;

  // Storage configuration
  getBucket?(): string | undefined;
}

export interface StorageManager {
  disk(name?: string): FilesystemContract;
  diskByBucket(bucketName: string): FilesystemContract;
  cloud(): FilesystemContract;
  build(config: DiskConfig): FilesystemContract;
  extend(driver: string, callback: (config: DiskConfig) => FilesystemContract): void;
  setDisk(name: string, disk: FilesystemContract): void;

  // Proxy methods to default disk
  exists(path: string): Promise<boolean>;
  get(path: string, options?: GetOptions): Promise<Buffer | NodeJS.ReadableStream | string>;
  put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean>;
  putFile(path: string, file: any, options?: PutOptions): Promise<string | false>;
  putFileAs(path: string, file: any, name: string, options?: PutOptions): Promise<string | false>;
  delete(path: string): Promise<boolean>;
  copy(from: string, to: string, options?: CopyOptions): Promise<boolean>;
  move(from: string, to: string, options?: MoveOptions): Promise<boolean>;
  size(path: string): Promise<number>;
  lastModified(path: string): Promise<number>;
  files(directory?: string, recursive?: boolean): Promise<string[]>;
  allFiles(directory?: string): Promise<string[]>;
  directories(directory?: string, recursive?: boolean): Promise<string[]>;
  allDirectories(directory?: string): Promise<string[]>;
  makeDirectory(path: string): Promise<boolean>;
  deleteDirectory(directory: string): Promise<boolean>;
  getVisibility(path: string): Promise<'private' | 'public'>;
  setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean>;
  url(path: string): string;
  temporaryUrl(
    path: string,
    expiration: Date | number,
    options?: TemporaryUrlOptions,
  ): Promise<string>;
  prepend(path: string, data: string): Promise<boolean>;
  append(path: string, data: string): Promise<boolean>;
  getMetadata(path: string): Promise<FileMetadata>;
  mimeType(path: string): Promise<string>;
  directorySize(directory?: string): Promise<number>;

  // Multipart upload operations
  initMultipartUpload(path: string, options?: MultipartUploadOptions): Promise<MultipartUploadInit>;
  uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    path: string,
  ): Promise<MultipartUploadPart>;
  completeMultipartUpload(
    uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean>;
  abortMultipartUpload(uploadId: string, path: string): Promise<boolean>;
  putFileMultipart(
    path: string,
    file: any,
    options?: MultipartUploadOptions,
  ): Promise<string | false>;

  // Convenience methods
  missing(path: string): Promise<boolean>;
  json<T = unknown>(path: string): Promise<T>;
  checksum(path: string, algorithm?: ChecksumAlgorithm): Promise<string>;
  deleteMany(paths: string[]): Promise<DeleteManyResult>;
}

export interface StorageConfig {
  default: string;
  disks: {
    [key: string]: DiskConfig;
  };
}
