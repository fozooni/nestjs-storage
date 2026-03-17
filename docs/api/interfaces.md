---
title: Interfaces
description: All configuration, option, result, and event interfaces for @fozooni/nestjs-storage
---

# Interfaces

Complete reference for every interface exported by `@fozooni/nestjs-storage`.

## Configuration Interfaces

### `StorageConfig`

Top-level configuration for the storage module.

```ts
interface StorageConfig {
  /** Name of the default disk */
  default: string;

  /** Map of disk name → disk configuration */
  disks: Record<string, DiskConfig>;

  /** Optional audit logging sink */
  auditLog?: AuditSink;
}
```

**Example:**
```ts
const config: StorageConfig = {
  default: 's3',
  disks: {
    s3: { driver: 's3', bucket: 'my-bucket', region: 'us-east-1' },
    local: { driver: 'local', root: '/data/storage' },
  },
};
```

---

### `DiskConfig`

Configuration for a single storage disk. Fields vary by driver.

```ts
interface DiskConfig {
  /** Storage driver type */
  driver: StorageDriver;

  /** Base directory for LocalDisk */
  root?: string;

  /** S3/cloud bucket name */
  bucket?: string;

  /** AWS/cloud region */
  region?: string;

  /** Custom endpoint URL (MinIO, B2, DO, Wasabi, R2) */
  endpoint?: string;

  /** Cloud credentials */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };

  /** R2: Cloudflare account ID */
  accountId?: string;

  /** GCS: Google Cloud project ID */
  projectId?: string;

  /** GCS: Path to service account JSON key file */
  keyFilename?: string;

  /** Azure: Container name */
  containerName?: string;

  /** Azure: Account key for authentication */
  accountKey?: string;

  /** Azure: SAS token for authentication */
  sasToken?: string;

  /** Azure: Storage account name */
  accountName?: string;

  /** MinIO: Port number */
  port?: number;

  /** MinIO: Use SSL */
  useSSL?: boolean;

  /** S3: Use path-style addressing */
  forcePathStyle?: boolean;

  /** CDN configuration */
  cdn?: CdnConfig;

  /** HMAC signing secret for LocalDisk temporaryUrl (min 32 chars) */
  signSecret?: string;

  /** Public URL base for the disk */
  url?: string;

  /** Default file visibility */
  visibility?: Visibility;
}
```

---

### `CdnConfig`

CDN overlay configuration for a disk.

```ts
interface CdnConfig {
  /** Base URL for CDN-served files (required) */
  baseUrl: string;

  /** CDN provider name (e.g. 'cloudfront') */
  provider?: string;

  /** CloudFront key pair ID for URL signing */
  signingKeyId?: string;

  /** CloudFront private key (PEM format) for URL signing */
  signingKey?: string;
}
```

**Example:**
```ts
const cdn: CdnConfig = {
  baseUrl: 'https://d1234.cloudfront.net',
  provider: 'cloudfront',
  signingKeyId: 'K1234567890ABC',
  signingKey: '-----BEGIN RSA PRIVATE KEY-----\n...',
};
```

## Operation Options

### `PutOptions`

Options for file write operations.

```ts
interface PutOptions {
  /** File visibility: 'public' or 'private' */
  visibility?: Visibility;

  /** MIME type of the file */
  mimetype?: string;

  /** Custom metadata key-value pairs */
  metadata?: Record<string, string>;

  /** Filename hint for Content-Disposition */
  filename?: string;

  /** HTTP Cache-Control header value */
  CacheControl?: string;

  /** HTTP Content-Disposition header value */
  ContentDisposition?: string;

  /** HTTP Content-Encoding header value */
  ContentEncoding?: string;

  /** HTTP Content-Language header value */
  ContentLanguage?: string;

  /** HTTP Expires header value */
  Expires?: Date;

  /** Naming strategy for auto-generated filenames */
  namingStrategy?: NamingStrategy;
}
```

**Example:**
```ts
await disk.put('file.pdf', data, {
  visibility: 'private',
  mimetype: 'application/pdf',
  metadata: { uploadedBy: 'user-123' },
  CacheControl: 'max-age=31536000',
  ContentDisposition: 'attachment; filename="report.pdf"',
});
```

---

### `GetOptions`

Options for file read operations.

```ts
interface GetOptions {
  /** How to return the file content */
  responseType?: 'buffer' | 'stream' | 'string';
}
```

---

### `RangeOptions`

Options for range read operations.

```ts
interface RangeOptions {
  /** Start byte offset (inclusive, 0-based) */
  start: number;

  /** End byte offset (inclusive). Defaults to EOF */
  end?: number;
}
```

---

### `MultipartUploadOptions`

Options for multipart upload operations. Extends `PutOptions`.

```ts
interface MultipartUploadOptions extends PutOptions {
  /** Size of each chunk in bytes (default: 5MB, min 5MB for S3) */
  chunkSize?: number;

  /** Starting part number (default: 1). Useful for resuming uploads */
  partNumberStart?: number;

  /** Progress callback invoked after each part upload */
  onProgress?: (status: MultipartUploadStatus) => void;
}
```

---

### `PresignedPostOptions`

Options for presigned POST generation.

```ts
interface PresignedPostOptions {
  /** Seconds until the presigned data expires (default: 3600) */
  expires?: number;

  /** Maximum allowed file size in bytes */
  maxSize?: number;

  /** Allowed MIME types (enforced by cloud provider policy) */
  allowedMimeTypes?: string[];
}
```

---

### `MigrationOptions`

Options for the `StorageMigrator` service.

```ts
interface MigrationOptions {
  /** Only migrate files matching this path prefix */
  prefix?: string;

  /** Number of concurrent file transfers (default: 5) */
  concurrency?: number;

  /** Verify each file after copying via checksum */
  verify?: boolean;

  /** Delete the source file after successful copy */
  deleteSource?: boolean;

  /** Log actions without actually transferring files */
  dryRun?: boolean;

  /** Custom error handler per file */
  onError?: (path: string, error: Error) => void;
}
```

---

### `CacheOptions`

Options for `CachedDisk`.

```ts
interface CacheOptions {
  /** Default TTL in milliseconds for all cached methods */
  ttl?: number;

  /** Per-method TTL overrides in milliseconds */
  ttlByMethod?: Partial<Record<string, number>>;

  /** Custom cache backend (defaults to in-memory Map) */
  backend?: CacheBackend;
}
```

---

### `RetryOptions`

Options for `RetryDisk`.

```ts
interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;

  /** Initial delay in milliseconds (default: 200) */
  baseDelay?: number;

  /** Maximum delay in milliseconds (default: 5000) */
  maxDelay?: number;

  /** Exponential backoff factor (default: 2) */
  factor?: number;

  /** Add randomized jitter to delays (default: true) */
  jitter?: boolean;

  /** Custom function to determine if an error is retryable */
  retryOn?: (error: Error) => boolean;
}
```

---

### `ReplicationOptions`

Options for `ReplicatedDisk`.

```ts
interface ReplicationOptions {
  /** Replication strategy for writes */
  strategy?: ReplicationStrategy;
}
```

---

### `QuotaOptions`

Options for `QuotaDisk`.

```ts
interface QuotaOptions {
  /** Maximum storage in bytes */
  maxBytes: number;

  /** Prefix for quota tracking (e.g. tenant ID) */
  prefix?: string;

  /** Custom quota storage backend */
  store?: QuotaStore;
}
```

---

### `StorageHealthCheckOptions`

Options for the `StorageHealthIndicator`.

```ts
interface StorageHealthCheckOptions {
  /** Name of the temporary file used for write-read-delete cycle (default: '.storage-health-check') */
  healthCheckFile?: string;

  /** Maximum time in ms before check is considered failed (default: 5000) */
  timeout?: number;
}
```

## Result Interfaces

### `FileMetadata`

Metadata returned by `getMetadata()`.

```ts
interface FileMetadata {
  /** File size in bytes */
  size: number;

  /** Last modification date */
  lastModified: Date;

  /** MIME type */
  mimetype: string;

  /** Entity tag (varies by driver) */
  etag?: string;

  /** Custom metadata key-value pairs */
  metadata?: Record<string, string>;
}
```

---

### `S3FileMetadata`

Extended metadata for S3-compatible drivers.

```ts
interface S3FileMetadata extends FileMetadata {
  /** S3 storage class (STANDARD, GLACIER, etc.) */
  storageClass?: string;

  /** S3 object version ID */
  versionId?: string;

  /** Server-side encryption algorithm */
  serverSideEncryption?: string;

  /** Raw S3 metadata headers */
  s3Metadata?: Record<string, string>;
}
```

---

### `GcsFileMetadata`

Extended metadata for Google Cloud Storage.

```ts
interface GcsFileMetadata extends FileMetadata {
  /** GCS object generation number */
  generation?: string;

  /** GCS metageneration number */
  metageneration?: string;

  /** CRC32C checksum */
  crc32c?: string;

  /** MD5 hash */
  md5Hash?: string;
}
```

---

### `MultipartUploadInit`

Returned by `initMultipartUpload()`.

```ts
interface MultipartUploadInit {
  /** Unique identifier for this upload session */
  uploadId: string;

  /** Target file path */
  path: string;
}
```

---

### `MultipartUploadPart`

Returned by `uploadPart()`.

```ts
interface MultipartUploadPart {
  /** 1-based part number */
  partNumber: number;

  /** ETag returned by the storage provider for this part */
  etag: string;
}
```

---

### `MultipartUploadStatus`

Progress information passed to the `onProgress` callback.

```ts
interface MultipartUploadStatus {
  /** Bytes uploaded so far */
  loaded: number;

  /** Total bytes to upload */
  total: number;

  /** Upload progress percentage (0-100) */
  percent?: number;
}
```

---

### `PresignedPostData`

Returned by `presignedPost()`.

```ts
interface PresignedPostData {
  /** Cloud endpoint URL to POST to */
  url: string;

  /** Key-value pairs to include as form fields in the POST */
  fields: Record<string, string>;
}
```

---

### `DeleteManyResult`

Returned by `deleteMany()`.

```ts
interface DeleteManyResult {
  /** Paths that were successfully deleted */
  succeeded: string[];

  /** Paths that failed to delete */
  failed: string[];
}
```

---

### `FileVersion`

Represents a single file version (from `VersionedDisk` or `listVersions()`).

```ts
interface FileVersion {
  /** Unique version identifier */
  versionId: string;

  /** Size of this version in bytes */
  size: number;

  /** When this version was created */
  lastModified: Date;

  /** Whether this is the current (latest) version */
  isLatest: boolean;

  /** Checksum of this version's content */
  checksum?: string;
}
```

---

### `RangeResult`

Returned by `getRange()`.

```ts
interface RangeResult {
  /** Readable stream of the requested byte range */
  stream: Readable;

  /** Number of bytes in this range chunk */
  size: number;

  /** HTTP Content-Range header value (e.g. 'bytes 0-999/5000') */
  contentRange: string;

  /** Total size of the full file in bytes */
  totalSize: number;
}
```

---

### `ConditionalWriteResult`

Returned by `putIfMatch()` and `putIfNoneMatch()`.

```ts
interface ConditionalWriteResult {
  /** Whether the conditional write succeeded */
  success: boolean;

  /** New ETag of the file (present when success is true) */
  etag?: string;
}
```

---

### `MigrationProgress`

Yielded by `StorageMigrator` for each file.

```ts
interface MigrationProgress {
  /** File path being migrated */
  path: string;

  /** Migration status for this file */
  status: MigrationStatus;

  /** Error details if status is 'failed' */
  error?: Error;

  /** Number of bytes transferred */
  bytesTransferred?: number;
}
```

## Routing & Patterns

### `StorageRoute`

A routing rule for `RouterDisk`.

```ts
interface StorageRoute {
  /** Returns true if this route should handle the given file */
  match(path: string, mimetype?: string, size?: number): boolean;

  /** The disk to delegate to when this route matches */
  disk: FilesystemContract;
}
```

**Example:**
```ts
const route: StorageRoute = {
  match: (path) => path.endsWith('.pdf'),
  disk: documentsDisk,
};
```

---

### `CacheBackend`

Interface for custom cache backends used with `CachedDisk`.

```ts
interface CacheBackend {
  /** Get a cached value by key */
  get(key: string): Promise<unknown | undefined>;

  /** Set a cached value with optional TTL in seconds */
  set(key: string, value: unknown, ttl?: number): Promise<void>;

  /** Delete a cached value */
  delete(key: string): Promise<void>;

  /** Clear all cached values */
  clear(): Promise<void>;
}
```

---

### `QuotaStore`

Interface for custom quota storage backends used with `QuotaDisk`.

```ts
interface QuotaStore {
  /** Get current usage in bytes for a prefix */
  getUsage(prefix: string): Promise<number>;

  /** Add bytes to usage for a prefix */
  addUsage(prefix: string, bytes: number): Promise<void>;

  /** Remove bytes from usage for a prefix */
  removeUsage(prefix: string, bytes: number): Promise<void>;
}
```

---

### `NamingStrategy`

Interface for custom file naming strategies.

```ts
interface NamingStrategy {
  /** Generate a filename for a file upload */
  generate(
    file: Express.Multer.File | Buffer | Readable,
    originalName: string,
  ): string | Promise<string>;
}
```

**Example:**
```ts
const hashNaming: NamingStrategy = {
  generate: (_file, originalName) => {
    const ext = originalName.split('.').pop();
    const hash = crypto.randomUUID();
    return `${hash}.${ext}`;
  },
};
```

---

### `StoredFile`

Represents a file stored via an interceptor.

```ts
interface StoredFile {
  /** Full path on the storage disk */
  path: string;

  /** Public URL of the stored file */
  url: string;

  /** File size in bytes */
  size: number;

  /** MIME type */
  mimetype: string;

  /** Original filename from the client */
  originalname: string;

  /** Name of the disk the file was stored on */
  disk: string;
}
```

## Audit & Events

### `AuditEntry`

A single audit log entry.

```ts
interface AuditEntry {
  /** Operation type (e.g. 'put', 'delete', 'copy') */
  operation: string;

  /** Disk name where the operation occurred */
  disk: string;

  /** Primary file path (for put, delete, get) */
  path?: string;

  /** Source path (for copy, move) */
  fromPath?: string;

  /** Destination path (for copy, move) */
  toPath?: string;

  /** User identifier (if available) */
  userId?: string;

  /** Client IP address (if available) */
  ip?: string;

  /** When the operation occurred */
  timestamp: Date;

  /** Whether the operation succeeded */
  success: boolean;

  /** Error details if the operation failed */
  error?: string;
}
```

---

### `AuditSink`

Interface for audit log destinations.

```ts
interface AuditSink {
  /** Write an audit entry */
  log(entry: AuditEntry): void | Promise<void>;
}
```

**Example:**
```ts
const consoleAudit: AuditSink = {
  log: (entry) => {
    console.log(`[AUDIT] ${entry.operation} ${entry.path} on ${entry.disk}`);
  },
};
```

### Event Interfaces

#### `StorageBaseEvent`

Base interface for all storage events.

```ts
interface StorageBaseEvent {
  /** Disk name where the event occurred */
  disk: string;

  /** When the event occurred */
  timestamp: Date;
}
```

---

#### `StoragePutEvent`

Emitted when a file is written.

```ts
interface StoragePutEvent extends StorageBaseEvent {
  /** File path that was written */
  path: string;

  /** Size of the written content in bytes */
  size: number;

  /** MIME type of the content */
  mimetype?: string;
}
```

---

#### `StorageDeleteEvent`

Emitted when a file is deleted.

```ts
interface StorageDeleteEvent extends StorageBaseEvent {
  /** File path that was deleted */
  path: string;
}
```

---

#### `StorageCopyEvent`

Emitted when a file is copied.

```ts
interface StorageCopyEvent extends StorageBaseEvent {
  /** Source file path */
  source: string;

  /** Destination file path */
  destination: string;
}
```

---

#### `StorageMoveEvent`

Emitted when a file is moved.

```ts
interface StorageMoveEvent extends StorageBaseEvent {
  /** Source file path */
  source: string;

  /** Destination file path */
  destination: string;
}
```

---

#### `StorageRetryEvent`

Emitted when a retry is attempted.

```ts
interface StorageRetryEvent extends StorageBaseEvent {
  /** The operation that failed */
  operation: string;

  /** Current retry attempt number */
  attempt: number;

  /** Maximum number of retries configured */
  maxRetries: number;

  /** The error that triggered the retry */
  error: Error;

  /** Delay before the next retry in ms */
  delayMs: number;
}
```

## Module Configuration

### `StorageModuleOptions`

Alias for `StorageConfig`. Used in `StorageModule.forRoot()`.

```ts
type StorageModuleOptions = StorageConfig;
```

---

### `StorageModuleAsyncOptions`

Options for `StorageModule.forRootAsync()`.

```ts
interface StorageModuleAsyncOptions {
  /** Modules to import for dependency injection */
  imports?: any[];

  /** Factory function that returns StorageConfig */
  useFactory?: (...args: any[]) => StorageConfig | Promise<StorageConfig>;

  /** Injection tokens for factory dependencies */
  inject?: any[];

  /** Class that implements StorageModuleOptionsFactory */
  useClass?: Type<StorageModuleOptionsFactory>;

  /** Existing provider that implements StorageModuleOptionsFactory */
  useExisting?: Type<StorageModuleOptionsFactory>;

  /** Which disk names to register as injectable providers */
  injectDisks?: string[];
}
```

---

### `StorageModuleOptionsFactory`

Interface for classes used with `useClass` or `useExisting` in async configuration.

```ts
interface StorageModuleOptionsFactory {
  createStorageOptions(): StorageConfig | Promise<StorageConfig>;
}
```

**Example:**
```ts
@Injectable()
class StorageConfigService implements StorageModuleOptionsFactory {
  constructor(private config: ConfigService) {}

  createStorageOptions(): StorageConfig {
    return {
      default: 's3',
      disks: {
        s3: {
          driver: 's3',
          bucket: this.config.get('S3_BUCKET'),
          region: this.config.get('S3_REGION'),
        },
      },
    };
  }
}
```
