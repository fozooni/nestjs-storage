export interface NamingStrategy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generate(file: any, originalName: string): string | Promise<string>;
}

export interface CdnConfig {
  /** CDN base URL (e.g. `https://cdn.example.com`). */
  baseUrl: string;
  /** CloudFront key-pair ID (required when provider = 'cloudfront'). */
  signingKeyId?: string;
  /** CloudFront private key as a PEM string (required when provider = 'cloudfront'). */
  signingKey?: string;
  /** CDN provider. Use `'cloudfront'` for AWS CloudFront signed URLs. */
  provider?: 'cloudfront' | 'generic';
}

export interface DiskConfig {
  driver:
    | 'local'
    | 's3'
    | 'gcs'
    | 'r2'
    | 'minio'
    | 'b2'
    | 'digitalocean'
    | 'wasabi'
    | 'azure'
    | (string & {});
  root?: string;
  url?: string;
  throw?: boolean;
  report?: boolean;
  visibility?: 'private' | 'public';

  /** CDN integration — when set, `url()` returns CDN URLs automatically. */
  cdn?: CdnConfig;

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

  // Azure Blob Storage
  accountName?: string;
  accountKey?: string;
  sasToken?: string;
  containerName?: string;

  // LocalDisk HMAC signed URLs
  signSecret?: string;

  // Naming strategy for file uploads
  namingStrategy?: NamingStrategy;

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

/** Typed S3 metadata returned by `S3Disk.getMetadata()`. */
export interface S3FileMetadata extends FileMetadata {
  etag?: string;
  storageClass?: string;
  versionId?: string;
  serverSideEncryption?: string;
  s3Metadata?: Record<string, string>;
}

/** Typed GCS metadata returned by `GcsDisk.getMetadata()`. */
export interface GcsFileMetadata extends FileMetadata {
  generation?: string;
  metageneration?: string;
  crc32c?: string;
  md5Hash?: string;
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
  namingStrategy?: NamingStrategy;
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

export interface PresignedPostOptions {
  /** URL expiry in seconds (default: 3600). */
  expires?: number;
  /** Maximum allowed file size in bytes. */
  maxSize?: number;
  /** Allowed MIME types (e.g. `['image/jpeg', 'image/png']`). */
  allowedMimeTypes?: string[];
}

export interface PresignedPostData {
  /** The form action URL the browser should POST to. */
  url: string;
  /** Hidden form fields that must be included in the multipart POST. */
  fields: Record<string, string>;
}

export interface DeleteManyResult {
  succeeded: string[];
  failed: string[];
}

export interface StreamableFileOptions {
  disposition?: 'inline' | 'attachment';
  filename?: string;
}

// ─── v0.0.5 Interfaces ────────────────────────────────────────────────────────

/**
 * Pluggable cache backend for `CachedDisk`.
 *
 * The default implementation is `MemoryCacheBackend` (Map-based).
 * You can provide a Redis-backed backend for distributed caching.
 */
export interface CacheBackend {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
  del(key: string): void;
  clear(): void;
}

/** Options for `CachedDisk`. */
export interface CacheOptions {
  /** Global TTL in milliseconds. `undefined` = no expiry. */
  ttl?: number;
  /** Per-method TTL overrides (ms). */
  ttlByMethod?: Partial<
    Record<
      'exists' | 'size' | 'lastModified' | 'mimeType' | 'getMetadata' | 'getVisibility',
      number
    >
  >;
}

/** Options for `RetryDisk`. */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 100). */
  baseDelay?: number;
  /** Maximum delay cap in ms (default: 10_000). */
  maxDelay?: number;
  /** Exponential factor (default: 2). */
  factor?: number;
  /** Apply full-jitter to backoff delays (default: true). */
  jitter?: boolean;
  /**
   * Custom predicate to decide if an error is retryable.
   * When provided, overrides the default retry logic.
   */
  retryOn?: (err: unknown) => boolean;
}

/** Options for `ReplicatedDisk`. */
export interface ReplicationOptions {
  /**
   * Replication strategy (default: `'all'`):
   * - `'all'`    — all replicas must succeed.
   * - `'quorum'` — majority (>50%) of replicas must succeed.
   * - `'async'`  — fire-and-forget replication; primary result returned immediately.
   */
  strategy?: 'all' | 'quorum' | 'async';
}

/**
 * Pluggable quota store for `QuotaDisk`.
 *
 * The default implementation is `MemoryQuotaStore` (in-memory Map).
 * Implement this interface for Redis-backed distributed quota tracking.
 */
export interface QuotaStore {
  getUsage(prefix?: string): Promise<number>;
  addUsage(prefix: string | undefined, bytes: number): Promise<void>;
  removeUsage(prefix: string | undefined, bytes: number): Promise<void>;
}

/** Options for `QuotaDisk`. */
export interface QuotaOptions {
  /** Maximum allowed storage in bytes. */
  maxBytes: number;
  /** Optional path prefix to scope quota tracking. */
  prefix?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

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

  // Metadata (generic — drivers return typed subtypes)
  getMetadata<T extends FileMetadata = FileMetadata>(path: string): Promise<T>;
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
  /** Parse JSON from a file. Pass a Zod-compatible schema for runtime validation. */
  json?<T = unknown>(path: string, schema?: { parse(v: unknown): T }): Promise<T>;
  checksum?(path: string, algorithm?: ChecksumAlgorithm): Promise<string>;
  deleteMany?(paths: string[]): Promise<DeleteManyResult>;

  // Storage configuration
  getBucket?(): string | undefined;

  // Direct browser-to-cloud upload (presigned POST)
  presignedPost?(path: string, options?: PresignedPostOptions): Promise<PresignedPostData>;

  // Scoped disk
  scope?(prefix: string): FilesystemContract;

  // Temporary files with TTL
  putTemp?(
    path: string,
    content: string | Buffer | NodeJS.ReadableStream,
    ttlSeconds: number,
    options?: PutOptions,
  ): Promise<string>;

  // CDN cache invalidation (optional — implemented by CdnDisk)
  invalidateCdn?(paths: string[]): Promise<void>;
}

export interface StorageManager {
  disk(name?: string): FilesystemContract;
  diskByBucket(bucketName: string): FilesystemContract;
  cloud(): FilesystemContract;
  build(config: DiskConfig): FilesystemContract;
  extend(driver: string, callback: (config: DiskConfig) => FilesystemContract): void;
  setDisk(name: string, disk: FilesystemContract): void;
  scope(prefix: string, diskName?: string): FilesystemContract;

  // v0.0.5 factory methods
  cached(diskName: string, opts?: CacheOptions & { backend?: CacheBackend }): FilesystemContract;
  withRetry(diskName: string, opts?: RetryOptions): FilesystemContract;
  replicated(
    diskName: string,
    replicas: FilesystemContract[],
    opts?: ReplicationOptions,
  ): FilesystemContract;
  withTracing(diskName: string): FilesystemContract;
  withQuota(diskName: string, quotaStore: QuotaStore, opts: QuotaOptions): FilesystemContract;

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
  getMetadata<T extends FileMetadata = FileMetadata>(path: string): Promise<T>;
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
  json<T = unknown>(path: string, schema?: { parse(v: unknown): T }): Promise<T>;
  checksum(path: string, algorithm?: ChecksumAlgorithm): Promise<string>;
  deleteMany(paths: string[]): Promise<DeleteManyResult>;
}

export interface StorageConfig {
  default: string;
  disks: {
    [key: string]: DiskConfig;
  };
  /** Enable audit logging for all storage operations. Default: false. */
  auditLog?: boolean;
}
