# @fozooni/nestjs-storage — Complete LLM Reference

> Full API surface for AI coding tools (Cursor, Copilot, Claude Code, etc.).
> For a compact overview see [llm.md](llm.md). For usage examples see the [README](README.md).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Installation](#2-installation)
3. [Module Setup](#3-module-setup)
4. [All 9 Drivers](#4-all-9-drivers)
5. [FilesystemContract — Full API](#5-filesystemcontract--full-api)
6. [StorageService — Full API](#6-storageservice--full-api)
7. [Decorator Disks](#7-decorator-disks)
8. [RouterDisk Factory Functions](#8-routerdisk-factory-functions)
9. [Range Requests](#9-range-requests)
10. [Conditional Writes](#10-conditional-writes)
11. [File Versioning](#11-file-versioning)
12. [StorageMigrator](#12-storagemigrator)
13. [StorageUploadProgressService](#13-storageuploadprogressservice)
14. [StorageArchiver](#14-storagearchiver)
15. [StorageEventsService](#15-storageeventsservice)
16. [StorageAuditService](#16-storageauditservice)
17. [StorageHealthIndicator](#17-storagehealthindicator)
18. [StorageTempCleanupService](#18-storagetempcleanuservice)
19. [Interceptors](#19-interceptors)
20. [File Validation Pipes](#20-file-validation-pipes)
21. [Middleware](#21-middleware)
22. [Naming Strategies](#22-naming-strategies)
23. [Error Hierarchy](#23-error-hierarchy)
24. [All Interfaces](#24-all-interfaces)
25. [Testing Utilities](#25-testing-utilities)
26. [Utility Functions](#26-utility-functions)
27. [Custom Drivers](#27-custom-drivers)
28. [Migration Guides](#28-migration-guides)

---

## 1. Overview

`@fozooni/nestjs-storage` is a driver-based storage module for NestJS. It exposes a single `FilesystemContract` interface that works identically across all storage backends.

**Key design principles:**
- **Unified contract** — `FilesystemContract` is the same regardless of backend. Switch drivers by changing config.
- **Optional interface pattern** — advanced capabilities (multipart, versioning, range requests, etc.) are optional methods on `FilesystemContract` (`method?(): ...`). Existing code is never broken by new additions.
- **Decorator pattern** — `DiskDecorator` is the abstract base for all behaviours (caching, retries, encryption, etc.). Extend it to add your own. Override only the methods you need.
- **Injectable services** — all services (`StorageMigrator`, `StorageArchiver`, etc.) are `@Injectable()` and auto-registered by `StorageModule`.
- **Optional peer deps** — install only the SDK(s) you use; graceful errors (`StorageConfigurationError`) if a peer is missing.

---

## 2. Installation

```bash
npm install @fozooni/nestjs-storage
# or pnpm add / yarn add
```

### Optional peer dependencies

| Package | When to install |
|---------|----------------|
| `@aws-sdk/client-s3 @aws-sdk/s3-request-presigner` | S3, R2, MinIO, B2, DigitalOcean, Wasabi driver |
| `@aws-sdk/s3-presigned-post` | Presigned POST on S3 / R2 |
| `@aws-sdk/cloudfront-signer` | CloudFront signed URLs in `CdnDisk` |
| `@google-cloud/storage` | GCS driver + GCS presigned POST |
| `@azure/storage-blob` | Azure Blob Storage driver |
| `@opentelemetry/api` | `OtelDisk` tracing spans |
| `multer` | `StorageFileInterceptor` / `StorageFilesInterceptor` |
| `rxjs` | `StorageUploadProgressService` |
| `archiver` | `StorageArchiver` (ZIP/TAR) |
| `zod` | Schema validation in `json<T>(path, schema)` |
| `@nestjs/terminus` | `StorageHealthIndicator` |

---

## 3. Module Setup

### `StorageModule.forRoot(options)`

```typescript
import { StorageModule } from '@fozooni/nestjs-storage';

StorageModule.forRoot({
  default: 'local',     // name of the default disk
  disks: {
    local: { driver: 'local', root: './storage', url: 'http://localhost:3000/storage' },
    s3:    { driver: 's3', bucket: '...', region: 'us-east-1', key: '...', secret: '...' },
  },
  auditLog: false,      // optional: enable StorageAuditService
  isGlobal: true,       // default: true — module available globally
})
```

### `StorageModule.forRootAsync(options)`

```typescript
// useFactory
StorageModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    default: config.get('STORAGE_DRIVER'),
    disks: { ... },
  }),
  inject: [ConfigService],
  imports: [ConfigModule],
  injectDisks: ['local', 's3'],  // required when using forRootAsync to register @InjectDisk tokens
})

// useClass
StorageModule.forRootAsync({ useClass: StorageConfigService })

// useExisting
StorageModule.forRootAsync({ useExisting: StorageConfigService })
```

### `StorageConfig` interface

```typescript
interface StorageConfig {
  default: string;
  disks: Record<string, DiskConfig>;
  auditLog?: boolean;
  isGlobal?: boolean;
}
```

### `DiskConfig` interface

```typescript
interface DiskConfig {
  driver: 'local' | 's3' | 'r2' | 'gcs' | 'azure' | 'minio' | 'b2' | 'digitalocean' | 'wasabi' | string;

  // All drivers
  url?: string;           // public base URL for url()
  throw?: boolean;        // throw on errors (default true)
  report?: boolean;       // log errors to console
  visibility?: 'private' | 'public';
  namingStrategy?: NamingStrategy;
  cdn?: CdnConfig;        // auto-wraps in CdnDisk when set

  // Local
  root?: string;
  signSecret?: string;    // HMAC signing secret (32+ chars)

  // S3 / R2 / MinIO / B2 / DigitalOcean / Wasabi
  key?: string;
  secret?: string;
  region?: string;
  bucket?: string;
  endpoint?: string;
  use_path_style_endpoint?: boolean;

  // R2
  accountId?: string;

  // GCS
  projectId?: string;
  keyFilename?: string;
  credentials?: Record<string, any>;

  // Azure
  accountName?: string;
  accountKey?: string;
  sasToken?: string;
  containerName?: string;

  [key: string]: any;  // custom driver fields
}
```

### `CdnConfig` interface

```typescript
interface CdnConfig {
  baseUrl: string;               // required: CDN base URL
  provider?: 'cloudfront' | 'generic';
  signingKeyId?: string;         // required for CloudFront
  signingKey?: string;           // required for CloudFront (PEM private key)
}
```

---

## 4. All 9 Drivers

### Local

```typescript
{
  driver: 'local',
  root: './storage',          // required: absolute or relative path
  url: 'http://localhost:3000/storage',  // optional: base URL for url()
  signSecret: 'my-secret',   // optional: enables HMAC signed URLs via temporaryUrl()
  visibility: 'private',
  namingStrategy: new UuidNamingStrategy(),
}
```

### S3 (and S3-compatible)

```typescript
{
  driver: 's3',
  bucket: 'my-bucket',        // required
  region: 'us-east-1',        // required
  key: 'AKIAIOSFODNN7',       // required
  secret: 'wJalrXUtnFEMI',    // required
  endpoint: undefined,        // optional: custom S3 endpoint
  use_path_style_endpoint: false,
  visibility: 'private',
  cdn: { baseUrl: 'https://cdn.example.com' },
}
```

### R2 (Cloudflare)

```typescript
{
  driver: 'r2',
  bucket: 'my-bucket',        // required
  accountId: 'abc123',        // required: Cloudflare account ID
  key: 'key',
  secret: 'secret',
  // endpoint auto-configured from accountId
}
```

### GCS (Google Cloud)

```typescript
{
  driver: 'gcs',
  bucket: 'my-bucket',        // required
  projectId: 'my-project',
  keyFilename: '/path/to/service-account.json',
  credentials: { client_email: '...', private_key: '...' },  // alternative to keyFilename
}
```

### Azure Blob Storage

```typescript
{
  driver: 'azure',
  containerName: 'my-container',   // required
  accountName: 'myaccount',        // required
  accountKey: 'base64-key',        // required unless using sasToken
  sasToken: '?sv=...',             // alternative auth
  url: 'https://myaccount.blob.core.windows.net/my-container',
}
```

### MinIO

```typescript
{
  driver: 'minio',
  bucket: 'my-bucket',        // required
  endpoint: 'http://localhost:9000',  // required
  key: 'minioadmin',
  secret: 'minioadmin',
  region: 'us-east-1',
  use_path_style_endpoint: true,  // auto-set by MinioDisk
}
```

### Backblaze B2

```typescript
{
  driver: 'b2',
  bucket: 'my-bucket',
  endpoint: 'https://s3.us-west-004.backblazeb2.com',  // required
  key: 'keyId',
  secret: 'applicationKey',
  region: 'us-west-004',
}
```

### DigitalOcean Spaces

```typescript
{
  driver: 'digitalocean',
  bucket: 'my-space',
  region: 'nyc3',             // required
  endpoint: 'https://nyc3.digitaloceanspaces.com',  // required
  key: 'key',
  secret: 'secret',
}
```

### Wasabi

```typescript
{
  driver: 'wasabi',
  bucket: 'my-bucket',
  region: 'us-east-1',
  endpoint: 'https://s3.wasabisys.com',  // required
  key: 'key',
  secret: 'secret',
}
```

---

## 5. FilesystemContract — Full API

All disk implementations (drivers + decorators) implement this interface.

### Core operations

```typescript
exists(path: string): Promise<boolean>

get(path: string, options?: GetOptions): Promise<Buffer | NodeJS.ReadableStream | string>
// GetOptions.responseType: 'buffer' (default) | 'stream' | 'string'

put(path: string, contents: string | Buffer | NodeJS.ReadableStream, options?: PutOptions): Promise<boolean>

putFile(directory: string, file: Express.Multer.File, options?: PutOptions): Promise<string | false>
// Returns generated filename (relative to directory) or false on failure

putFileAs(directory: string, file: Express.Multer.File, name: string, options?: PutOptions): Promise<string | false>

delete(path: string): Promise<boolean>

copy(from: string, to: string, options?: CopyOptions): Promise<boolean>

move(from: string, to: string, options?: MoveOptions): Promise<boolean>

size(path: string): Promise<number>

lastModified(path: string): Promise<number>  // milliseconds since epoch

prepend(path: string, data: string): Promise<boolean>

append(path: string, data: string): Promise<boolean>
```

### Directory operations

```typescript
files(directory?: string, recursive?: boolean): Promise<string[]>
allFiles(directory?: string): Promise<string[]>           // recursive shorthand
directories(directory?: string, recursive?: boolean): Promise<string[]>
allDirectories(directory?: string): Promise<string[]>     // recursive shorthand
makeDirectory(path: string): Promise<boolean>
deleteDirectory(directory: string): Promise<boolean>
directorySize(directory?: string): Promise<number>
```

### Visibility & URLs

```typescript
getVisibility(path: string): Promise<'private' | 'public'>
setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean>
url(path: string): string
temporaryUrl(path: string, expiration: Date | number, options?: TemporaryUrlOptions): Promise<string>
// expiration: Date object or number of **seconds**
```

### Metadata

```typescript
getMetadata<T extends FileMetadata = FileMetadata>(path: string): Promise<T>
mimeType(path: string): Promise<string>
```

### Multipart uploads (optional)

```typescript
initMultipartUpload?(path: string, options?: PutOptions): Promise<MultipartUploadInit>
// Returns: { uploadId: string }

uploadPart?(uploadId: string, partNumber: number, data: Buffer, path: string): Promise<MultipartUploadPart>
// Returns: { partNumber: number; etag: string }

completeMultipartUpload?(uploadId: string, path: string, parts: MultipartUploadPart[]): Promise<boolean>

abortMultipartUpload?(uploadId: string, path: string): Promise<boolean>

putFileMultipart?(path: string, file: Express.Multer.File, options?: MultipartUploadOptions): Promise<string | false>
```

### Convenience methods (optional)

```typescript
missing?(path: string): Promise<boolean>
// inverse of exists()

json?<T = any>(path: string, schema?: { parse(v: unknown): T }): Promise<T>
// Optional Zod-compatible schema for validation

checksum?(path: string, algorithm?: 'md5' | 'sha1' | 'sha256'): Promise<string>
// Default algorithm: 'md5'

deleteMany?(paths: string[]): Promise<DeleteManyResult>
// Returns: { succeeded: string[]; failed: string[] }
```

### Scoping (optional)

```typescript
scope?(prefix: string): FilesystemContract
// Create a path-scoped view of this disk
```

### Temporary files with TTL (optional)

```typescript
putTemp?(path: string, content: string | Buffer, ttlSeconds: number, options?: PutOptions): Promise<string>
// LocalDisk: creates a .ttl sidecar file alongside the content
// S3Disk: sets Expires object metadata header
// Returns the path of the written file
```

### CDN (optional)

```typescript
invalidateCdn?(paths: string[]): Promise<void>
// Override in CdnDisk subclasses for actual CDN invalidation
```

### File versioning — v0.1.0 (optional)

```typescript
listVersions?(path: string): Promise<FileVersion[]>
getVersion?(path: string, versionId: string): Promise<Buffer>
restoreVersion?(path: string, versionId: string): Promise<boolean>
deleteVersion?(path: string, versionId: string): Promise<boolean>
```

### Range requests — v0.1.0 (optional)

```typescript
getRange?(path: string, options: RangeOptions): Promise<RangeResult>
```

### Conditional writes — v0.1.0 (optional)

```typescript
putIfMatch?(path: string, content: string | Buffer, etag: string, options?: PutOptions): Promise<ConditionalWriteResult>
putIfNoneMatch?(path: string, content: string | Buffer, options?: PutOptions): Promise<ConditionalWriteResult>
```

### Direct browser upload (optional)

```typescript
presignedPost?(path: string, options?: PresignedPostOptions): Promise<PresignedPostData>
// Supported by: S3Disk, R2Disk, GcsDisk, AzureDisk
```

### Misc (optional)

```typescript
getBucket?(): string | undefined
// Returns the configured bucket name for cloud drivers
```

---

## 6. StorageService — Full API

`StorageService` implements `StorageManager`. All `FilesystemContract` methods are proxied to the default disk.

### Disk access

```typescript
disk(name?: string): FilesystemContract
// name defaults to StorageConfig.default

diskByBucket(bucketName: string): FilesystemContract
// Finds the first disk whose getBucket() matches

cloud(): FilesystemContract
// Alias for disk('main')

build(config: DiskConfig): FilesystemContract
// Instantiate a disk from config without caching or registering it

extend(driver: string, factory: (config: DiskConfig) => FilesystemContract): void
// Register a custom driver factory

setDisk(name: string, disk: FilesystemContract): void
// Replace a cached disk instance at runtime

scope(prefix: string, diskName?: string): FilesystemContract
// Create a ScopedDisk from named (or default) disk
```

### Decorator factories

```typescript
encrypted(diskName: string, options: { key: string | Buffer }): FilesystemContract
// key: 32-byte AES-256-GCM key (hex string or Buffer)

cached(diskName: string, options?: CacheOptions): FilesystemContract
// CacheOptions: { ttl?, ttlByMethod?: { exists?, size?, lastModified?, mimeType?, getMetadata?, getVisibility? } } — all in ms

withRetry(diskName: string, options?: RetryOptions): FilesystemContract
// RetryOptions: { maxRetries=3, baseDelay=100, maxDelay=10000, factor=2, jitter=true, retryOn? }

replicated(diskName: string, replicas: FilesystemContract[], options?: ReplicationOptions): FilesystemContract
// ReplicationOptions: { strategy: 'all' | 'quorum' | 'async' }  default: 'all'

withTracing(diskName: string): FilesystemContract
// Zero-overhead no-op if @opentelemetry/api is not installed

withQuota(diskName: string, store: QuotaStore, options: QuotaOptions): FilesystemContract
// QuotaOptions: { maxBytes: number; prefix?: string }

withVersioning(diskName: string): FilesystemContract
// v0.1.0: wraps in VersionedDisk

withRouting(routes: StorageRoute[], defaultDisk: FilesystemContract): FilesystemContract
// v0.1.0: wraps in RouterDisk
```

### Streaming & range

```typescript
getStreamableFile(path: string, options?: StreamableFileOptions): Promise<StreamableFile>
// StreamableFileOptions: { filename?: string; disposition?: 'attachment' | 'inline' }
// Sets Content-Type, Content-Length, Content-Disposition automatically

serveRange(path: string, req: Request, res: Response, diskName?: string): Promise<void>
// v0.1.0: parses Range header, returns HTTP 206 or 200
// Supports: bytes=start-end, bytes=start-, bytes=-suffix
```

### Events

```typescript
get events(): StorageEventsService
// Access the event emitter: storageService.events.on('storage.put', ...)
```

---

## 7. Decorator Disks

All decorator disks extend `DiskDecorator` (abstract base class) which auto-delegates all `FilesystemContract` methods to the wrapped inner disk.

### DiskDecorator (base class)

```typescript
abstract class DiskDecorator implements FilesystemContract {
  constructor(protected readonly disk: FilesystemContract) {}
  // All FilesystemContract methods delegated to this.disk
  // Optional methods throw "Disk does not support X" if inner disk lacks them
}
```

### EncryptedDisk

```typescript
import { EncryptedDisk } from '@fozooni/nestjs-storage';

const encrypted = new EncryptedDisk(innerDisk, { key: '64-hex-chars-or-32-byte-buffer' });
// OR via factory:
const encrypted = storage.encrypted('local', { key: process.env.ENCRYPTION_KEY });
```

- Transparent AES-256-GCM encryption/decryption
- Each blob gets a random 12-byte IV prepended to ciphertext
- `size()` returns plaintext byte count (strips ciphertext overhead)
- `copy()` decrypts then re-encrypts at destination
- `presignedPost()` throws `StoragePermissionError` (direct uploads bypass encryption)

### ScopedDisk

```typescript
import { ScopedDisk } from '@fozooni/nestjs-storage';

const scoped = new ScopedDisk(innerDisk, 'users/123');
// OR:
const scoped = storage.scope('users/123', 'local');
// OR from any disk:
const scoped = disk.scope('users/123');
```

- Transparently prepends prefix to all paths
- Strips prefix from returned paths
- Nested scopes chain correctly: `scoped.scope('photos')` → `users/123/photos/...`

### CachedDisk

```typescript
import { CachedDisk, MemoryCacheBackend } from '@fozooni/nestjs-storage';

const cached = new CachedDisk(innerDisk, new MemoryCacheBackend(), {
  ttl: 60_000,                    // global TTL in ms
  ttlByMethod: {
    exists: 30_000,
    size: 60_000,
    lastModified: 60_000,
    mimeType: 300_000,
    getMetadata: 60_000,
    getVisibility: 300_000,
  },
});
// OR via factory:
const cached = storage.cached('s3', { ttl: 60_000 });

// Additional methods
cached.clearCache(): void
cached.cacheBackend: CacheBackend  // exposes the backend

// CacheBackend interface
interface CacheBackend {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
  del(key: string): void;
  clear(): void;
}
```

Cached operations: `exists`, `size`, `lastModified`, `mimeType`, `getMetadata`, `getVisibility`
Cache invalidated on: `put`, `putFile`, `delete`, `copy`, `move`, `setVisibility`, `deleteMany`, `deleteDirectory`

### RetryDisk

```typescript
import { RetryDisk } from '@fozooni/nestjs-storage';

const retry = new RetryDisk(innerDisk, {
  maxRetries: 3,        // default: 3
  baseDelay: 100,       // default: 100 ms
  maxDelay: 10_000,     // default: 10_000 ms
  factor: 2,            // default: 2 (exponential)
  jitter: true,         // default: true (full-jitter algorithm)
  retryOn: (err) => err instanceof StorageNetworkError,  // custom predicate
});
// OR via factory:
const retry = storage.withRetry('s3', { maxRetries: 5 });
```

- Default retry predicate: retry on `StorageNetworkError` only
- Never retries: `StorageFileNotFoundError`, `StoragePermissionError`, `StorageConfigurationError`
- Emits `'storage.retry'` event via `StorageEventsService` on each retry attempt

### ReplicatedDisk

```typescript
import { ReplicatedDisk } from '@fozooni/nestjs-storage';

const replicated = new ReplicatedDisk(primaryDisk, [replica1, replica2], {
  strategy: 'all',   // 'all' | 'quorum' | 'async'
});
// OR via factory:
const replicated = storage.replicated('primary', [storage.disk('replica1'), storage.disk('replica2')]);

replicated.replicaDisks: FilesystemContract[]  // exposes replica list
```

Strategies:
- `'all'` (default): `Promise.all` — all replicas must succeed
- `'quorum'`: majority must succeed; individual failures tolerated
- `'async'`: fire-and-forget; write returns as soon as primary succeeds

Reads always served from the primary disk.

### CdnDisk

```typescript
import { CdnDisk } from '@fozooni/nestjs-storage';

const cdn = new CdnDisk(innerDisk, {
  baseUrl: 'https://cdn.example.com',
  provider: 'cloudfront',       // 'cloudfront' | 'generic'
  signingKeyId: 'KXXXXXXXXXXXXX',
  signingKey: '-----BEGIN RSA PRIVATE KEY-----\n...',
});
// OR: set cdn field in DiskConfig — StorageService.disk() auto-wraps

cdn.url('path/to/file.jpg')          // → https://cdn.example.com/path/to/file.jpg
await cdn.temporaryUrl('file.pdf', expiresDate)  // CloudFront signed URL

cdn.invalidateCdn(paths: string[]): Promise<void>  // override for actual invalidation
cdn.cdnConfiguration: CdnConfig     // exposes CDN config
```

### OtelDisk

```typescript
import { OtelDisk } from '@fozooni/nestjs-storage';

const otel = new OtelDisk(innerDisk, 'my-disk-name');
// OR via factory:
const otel = storage.withTracing('s3');

otel.isTracingActive: boolean  // true if @opentelemetry/api is installed
```

- Wraps every async method in an OpenTelemetry span
- Span attributes: `storage.disk`, `storage.operation`, `storage.path`
- Zero-overhead no-op when `@opentelemetry/api` is not installed

### QuotaDisk

```typescript
import { QuotaDisk, MemoryQuotaStore } from '@fozooni/nestjs-storage';

const quota = new QuotaDisk(innerDisk, new MemoryQuotaStore(), {
  maxBytes: 1_073_741_824,   // 1 GB
  prefix: 'users/123',       // optional: scope usage tracking
});
// OR via factory:
const quota = storage.withQuota('local', new MemoryQuotaStore(), { maxBytes: 5 * 1024 * 1024 * 1024 });

const { used, limit, percent } = await quota.getUsage();

// QuotaStore interface
interface QuotaStore {
  getUsage(prefix?: string): Promise<number>;
  addUsage(prefix: string | undefined, bytes: number): Promise<void>;
  removeUsage(prefix: string | undefined, bytes: number): Promise<void>;
}
```

- Throws `StorageQuotaExceededError` on `put()` when quota is exceeded

### VersionedDisk — v0.1.0

```typescript
import { VersionedDisk } from '@fozooni/nestjs-storage';

const versioned = new VersionedDisk(innerDisk);
// OR via factory:
const versioned = storage.withVersioning('local');

// Every put() transparently snapshots previous content first
await versioned.put('config.json', newContent);

const versions = await versioned.listVersions('config.json');
// Returns FileVersion[] sorted oldest-first; most recent has isLatest: true

const buffer = await versioned.getVersion('config.json', versions[0].versionId);

await versioned.restoreVersion('config.json', versions[0].versionId);
// Copies snapshot back to live path (triggers another snapshot)

await versioned.deleteVersion('config.json', versions[0].versionId);
```

Version snapshots stored at: `.versions/{path}/{timestamp}_{uuid}`
Versioning failures never block the actual write (silently swallowed).

### RouterDisk — v0.1.0

```typescript
import { RouterDisk, byExtension, byPrefix, byMimeType, bySize, custom } from '@fozooni/nestjs-storage';

const router = new RouterDisk([
  byExtension(['.jpg', '.png'], imageDisk),
  byMimeType(['video/mp4'], videoDisk),
  bySize(5 * 1024 * 1024, smallDisk),    // ≤ 5 MB
  byPrefix('docs/', docDisk),
  custom((path, mime, size) => path.startsWith('temp/'), tempDisk),
], defaultDisk);

// OR via factory:
const router = storage.withRouting([...routes], storage.disk('default'));
```

- First-match wins on write
- Size/MIME rules only apply at write time (unknown at read time → fall back to default)
- Extension/prefix rules apply at both read and write time
- Cross-disk `copy()` and `move()` handled transparently

---

## 8. RouterDisk Factory Functions

```typescript
import { byExtension, byPrefix, byMimeType, bySize, custom, StorageRoute } from '@fozooni/nestjs-storage';

byExtension(extensions: string[], disk: FilesystemContract): StorageRoute
// extensions: ['.jpg', '.png', '.webp'] — case-insensitive

byPrefix(prefix: string, disk: FilesystemContract): StorageRoute
// prefix: 'uploads/images/'

byMimeType(mimetypes: string[], disk: FilesystemContract): StorageRoute
// mimetypes: ['image/jpeg', 'image/png'] — write-time only

bySize(maxBytes: number, disk: FilesystemContract): StorageRoute
// match when content size <= maxBytes — write-time only

custom(fn: (path: string, mimetype?: string, size?: number) => boolean, disk: FilesystemContract): StorageRoute

// StorageRoute interface
interface StorageRoute {
  match(path: string, mimetype?: string, size?: number): boolean;
  disk: FilesystemContract;
}
```

---

## 9. Range Requests

```typescript
// RangeOptions
interface RangeOptions {
  start: number;   // zero-based, inclusive byte offset
  end?: number;    // zero-based, inclusive byte offset (omit for end of file)
}

// RangeResult
interface RangeResult {
  stream: NodeJS.ReadableStream;
  size: number;          // bytes in this range (end - start + 1)
  contentRange: string;  // e.g. "bytes 0-999/5000"
  totalSize: number;     // total file size in bytes
}

// Low-level
const result = await disk.getRange('video.mp4', { start: 0, end: 1023 });
result.stream.pipe(res);

// High-level — NestJS controller
@Get('files/:path')
async download(@Param('path') path: string, @Req() req: Request, @Res() res: Response) {
  await this.storage.serveRange(path, req, res, 's3');
  // Sets: Content-Range, Content-Length, Accept-Ranges: bytes
  // Returns 206 with range, or 200 for full content (no Range header / disk lacks getRange)
}

// @RangeServe decorator — attaches disk name metadata
@Get(':key')
@RangeServe('s3')
async stream(@Param('key') key: string) {
  // Used with custom interceptors that read RANGE_SERVE_DISK_KEY metadata
}
```

Supported by: `LocalDisk`, `S3Disk` (and subclasses), `GcsDisk`, `AzureDisk`, `FakeDisk`

---

## 10. Conditional Writes

```typescript
// ConditionalWriteResult
interface ConditionalWriteResult {
  success: boolean;
  etag?: string;    // new ETag when success=true
}

// Write only if current ETag matches (optimistic locking)
const result = await disk.putIfMatch('config.json', newContent, 'known-etag');
if (!result.success) {
  // ETag mismatch — someone else wrote to the file concurrently
}

// Write only if file does not exist (create-once)
const result = await disk.putIfNoneMatch('config.json', initialContent);
if (!result.success) {
  // File already exists
}
```

| Disk | putIfMatch | putIfNoneMatch |
|------|-----------|----------------|
| `LocalDisk` | MD5 comparison | Existence check |
| `S3Disk` (and subclasses) | `IfMatch` header on PutObject | `IfNoneMatch: *` on PutObject |
| `FakeDisk` | MD5 comparison | Existence check |

---

## 11. File Versioning

See [VersionedDisk](#versioneddisk----v010) above.

```typescript
// FileVersion interface
interface FileVersion {
  versionId: string;       // format: "{timestamp}_{uuid}"
  size: number;
  lastModified: Date;
  isLatest: boolean;
  checksum?: string;
}

// Version storage path: .versions/{path}/{timestamp}_{uuid}
```

---

## 12. StorageMigrator

Auto-injected by `StorageModule`. Copies files from one disk to another using an async generator (never loads all files into memory).

```typescript
// MigrationOptions
interface MigrationOptions {
  prefix?: string;          // only migrate files matching this prefix
  concurrency?: number;     // default: 5
  verify?: boolean;         // default: false — checksum verification after each copy
  deleteSource?: boolean;   // default: false — delete source file after successful copy
  dryRun?: boolean;         // default: false — simulate without writing
  onError?: 'skip' | 'abort';  // default: 'skip'
}

// MigrationProgress
interface MigrationProgress {
  path: string;
  status: 'pending' | 'copied' | 'verified' | 'failed';
  error?: Error;
  bytesTransferred?: number;
}

@Injectable()
export class MigrateService {
  constructor(
    private readonly storage: StorageService,
    private readonly migrator: StorageMigrator,
  ) {}

  async run() {
    const source = this.storage.disk('old-s3');
    const target = this.storage.disk('new-s3');

    for await (const progress of this.migrator.migrate(source, target, {
      prefix: 'uploads/',
      concurrency: 10,
      verify: true,
      deleteSource: false,
      onError: 'skip',
    })) {
      if (progress.status === 'failed') {
        console.error('Failed:', progress.path, progress.error?.message);
      } else {
        console.log(progress.status, progress.path);
      }
    }
  }
}
```

---

## 13. StorageUploadProgressService

Auto-injected by `StorageModule`. Tracks multipart upload progress using RxJS `Subject` per upload ID.

```typescript
import { StorageUploadProgressService, MultipartUploadStatus } from '@fozooni/nestjs-storage';

@Injectable()
export class UploadService {
  constructor(private progress: StorageUploadProgressService) {}

  async upload(uploadId: string, disk: FilesystemContract) {
    // Push progress events
    this.progress.track(uploadId, { loaded: 1024, total: 10240 });
    this.progress.track(uploadId, { loaded: 5120, total: 10240 });

    // Complete or error the observable
    this.progress.complete(uploadId);
    // or
    this.progress.error(uploadId, new Error('Upload failed'));
  }

  // Subscribe to progress (e.g. for SSE)
  getProgressStream(uploadId: string): Observable<MultipartUploadStatus> {
    return this.progress.getProgress$(uploadId);
  }
}
```

Subjects are automatically cleaned up on `complete()` or `error()`. Multiple concurrent uploads are tracked independently.

---

## 14. StorageArchiver

Auto-injected by `StorageModule`. Requires optional peer `archiver`.

```bash
npm install archiver
```

```typescript
// ArchiverOptions
interface ArchiverOptions {
  format?: 'zip' | 'tar';    // overrides the method (createZip / createTar)
  zlib?: { level?: number }; // ZIP compression level (0-9)
}

@Injectable()
export class DownloadService {
  constructor(private archiver: StorageArchiver) {}

  async downloadAsZip(res: Response) {
    const stream = await this.archiver.createZip([
      { path: 'reports/q1.pdf', name: 'Q1 Report.pdf' },
      { path: 'reports/q2.pdf', name: 'Q2 Report.pdf' },
      { path: 'images/logo.png' },  // name defaults to basename
    ], this.storage.disk('s3'), { zlib: { level: 6 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="reports.zip"');
    stream.pipe(res);
  }

  async downloadAsTar(res: Response) {
    const stream = await this.archiver.createTar([...], this.storage.disk('local'));
    stream.pipe(res);
  }
}
```

Files appended as streams — archive is never buffered in memory. Throws `StorageConfigurationError` if `archiver` package is not installed.

---

## 15. StorageEventsService

Auto-injected by `StorageModule`. Wraps Node.js `EventEmitter`.

```typescript
import { StorageEventsService, StorageEvents } from '@fozooni/nestjs-storage';

@Injectable()
export class AuditListener {
  constructor(private events: StorageEventsService) {
    this.events.on(StorageEvents.PUT, (event) => { ... });
    this.events.on(StorageEvents.DELETE, (event) => { ... });
  }
}

// Or via StorageService
this.storage.events.on('storage.retry', (event) => console.log('Retrying:', event.path));
```

### Event constants

| Constant | Value | Fired after |
|----------|-------|------------|
| `StorageEvents.PUT` | `'storage.put'` | `put()` |
| `StorageEvents.PUT_FILE` | `'storage.put_file'` | `putFile()` / `putFileAs()` |
| `StorageEvents.DELETE` | `'storage.delete'` | `delete()` |
| `StorageEvents.DELETE_MANY` | `'storage.delete_many'` | `deleteMany()` |
| `StorageEvents.COPY` | `'storage.copy'` | `copy()` |
| `StorageEvents.MOVE` | `'storage.move'` | `move()` |
| `StorageEvents.RETRY` | `'storage.retry'` | Each retry attempt in `RetryDisk` |

### StorageEventsService API

```typescript
on(event: string, listener: (...args: any[]) => void): this
off(event: string, listener: (...args: any[]) => void): this
once(event: string, listener: (...args: any[]) => void): this
emit(event: string, ...args: any[]): boolean
```

---

## 16. StorageAuditService

Auto-injected by `StorageModule` when `auditLog: true` in config.

```typescript
StorageModule.forRoot({ ..., auditLog: true })

// AuditEntry type
interface AuditEntry {
  operation: string;    // 'put' | 'putFile' | 'delete' | 'copy' | 'move' | 'deleteMany'
  disk: string;
  path?: string;
  userId?: string;
  ip?: string;
  timestamp: Date;
  success: boolean;
  error?: Error;
}

// AuditSink interface
interface AuditSink {
  log(entry: AuditEntry): void;
}

@Injectable()
export class AppService {
  constructor(private audit: StorageAuditService) {
    // Add custom sinks (errors in sinks are swallowed)
    this.audit.addSink({
      log(entry) {
        myLogger.info({ ...entry });
      }
    });
  }
}
```

Default sink: NestJS Logger. Operations audited: `put`, `putFile`, `delete`, `copy`, `move`, `deleteMany` (on `StorageService` proxy methods only).

---

## 17. StorageHealthIndicator

Requires optional peer `@nestjs/terminus`.

```typescript
// StorageHealthCheckOptions
interface StorageHealthCheckOptions {
  healthCheckFile?: string;  // default: '.storage-health-check'
  timeout?: number;          // default: 5000 ms
}

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private storageHealth: StorageHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Check a single disk (write/read/delete cycle)
      () => this.storageHealth.check('storage', 'local'),
      // Check multiple disks
      () => this.storageHealth.checkDisks('all-disks', ['local', 's3'], { timeout: 3000 }),
    ]);
  }
}
```

---

## 18. StorageTempCleanupService

Auto-injected by `StorageModule`. Scans `LocalDisk` for expired `.ttl` sidecar files and removes them.

```typescript
// Write a temp file with TTL (LocalDisk or S3Disk)
await disk.putTemp('tmp/session-data.json', content, 3600);  // expires in 1 hour

// Run cleanup manually (or schedule with @nestjs/schedule)
const { deleted, errors } = await tempCleanup.runOnce('local');

// With @nestjs/schedule
@Injectable()
export class ScheduledCleanup {
  constructor(private cleanup: StorageTempCleanupService) {}

  @Cron('0 * * * *')  // every hour
  async cleanupTempFiles() {
    await this.cleanup.runOnce();
  }
}
```

---

## 19. Interceptors

### `StorageFileInterceptor(fieldName, options?)`

Single file upload → stores to disk → replaces `req.file` with `StoredFile`.

```typescript
// StorageFileInterceptorOptions
interface StorageFileInterceptorOptions {
  disk?: string;                      // disk name (uses default disk if omitted)
  path?: string;                      // directory path for storage
  namingStrategy?: NamingStrategy;    // overrides disk-level strategy
  fileFilter?: (file: Express.Multer.File) => boolean;
  limits?: multer.Options['limits'];
}

// StoredFile interface
interface StoredFile {
  path: string;        // stored path (relative to disk root / key)
  url: string;         // public URL
  size: number;        // bytes
  mimetype: string;
  originalname: string;
  disk: string;        // disk name
}

// Usage
@Post('upload')
@UseInterceptors(StorageFileInterceptor('avatar', {
  disk: 's3',
  path: 'avatars/',
  namingStrategy: new UuidNamingStrategy(),
}))
async upload(@UploadedFile() file: StoredFile) {
  return { url: file.url };
}
```

### `StorageFilesInterceptor(fieldName, maxCount, options?)`

Multi-file variant. Replaces `req.files` with `StoredFile[]`.

```typescript
@Post('photos')
@UseInterceptors(StorageFilesInterceptor('photos', 10, { disk: 's3', path: 'photos/' }))
async uploadMany(@UploadedFiles() files: StoredFile[]) {
  return files.map(f => f.url);
}
```

---

## 20. File Validation Pipes

Both extend `FileValidator` from `@nestjs/common`.

```typescript
// FileExtensionValidator
new FileExtensionValidator({ allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'] })
// Validates file.originalname — leading dot optional, case-insensitive

// MagicBytesValidator
new MagicBytesValidator()
// Reads first bytes of file.buffer and matches against built-in magic signatures
// Prevents extension spoofing without external dependencies

// Usage with ParseFilePipe
@UploadedFile(
  new ParseFilePipe({
    validators: [
      new FileExtensionValidator({ allowedExtensions: ['.jpg', '.png'] }),
      new MagicBytesValidator(),
    ],
    fileIsRequired: true,
  }),
)
file: Express.Multer.File
```

---

## 21. Middleware

### `LocalSignedUrlMiddleware`

Validates HMAC-SHA256 signed URLs generated by `LocalDisk.temporaryUrl()` when `signSecret` is configured.

```typescript
// In DiskConfig:
{ driver: 'local', root: './storage', signSecret: 'at-least-32-chars-secret' }

// Generate signed URL (expires in 1 hour)
const url = await storage.disk('local').temporaryUrl('private/file.pdf', new Date(Date.now() + 3600_000));
// → http://localhost:3000/files/private/file.pdf?expires=1700000000&signature=abc123...

// Register middleware for protected routes
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LocalSignedUrlMiddleware).forRoutes('/files/*');
  }
}
// Returns 403 on expired or invalid signature using crypto.timingSafeEqual
```

---

## 22. Naming Strategies

```typescript
// NamingStrategy interface
interface NamingStrategy {
  generate(file: Express.Multer.File, originalName: string): string | Promise<string>;
}

import {
  UuidNamingStrategy,         // crypto.randomUUID() + extension (e.g. "a4f3b2c1-....jpg")
  HashNamingStrategy,         // md5(content) + extension (deterministic for identical files)
  DatePathNamingStrategy,     // YYYY/MM/DD/uuid + extension (e.g. "2024/01/15/a4f3....jpg")
  OriginalNamingStrategy,     // no-op: keeps original filename unchanged
} from '@fozooni/nestjs-storage';

// Per-call override
await storage.putFile('uploads', file, { namingStrategy: new DatePathNamingStrategy() });

// Disk-level default in DiskConfig
{
  driver: 'local',
  root: './storage',
  namingStrategy: new UuidNamingStrategy(),
}
```

---

## 23. Error Hierarchy

```typescript
import {
  StorageError,
  StorageFileNotFoundError,
  StoragePermissionError,
  StorageNetworkError,
  StorageConfigurationError,
  StorageQuotaExceededError,
} from '@fozooni/nestjs-storage';

// StorageError (base)
// Fields: message, disk?: string, path?: string, cause?: unknown
class StorageError extends Error { disk?: string; path?: string; cause?: unknown }

// Specific errors
StorageFileNotFoundError  // file/directory doesn't exist (HTTP 404 equivalent)
StoragePermissionError    // access denied, unsupported operation (HTTP 403)
StorageNetworkError       // transient failure, 5xx errors — safe to retry
StorageConfigurationError // missing required config, missing optional peer dep
StorageQuotaExceededError // storage quota exceeded (thrown by QuotaDisk)

// Catching
try {
  await storage.get('missing.txt');
} catch (e) {
  if (e instanceof StorageFileNotFoundError) { /* handle 404 */ }
  else if (e instanceof StorageNetworkError) { /* safe to retry */ }
  else if (e instanceof StorageError)        { /* all storage errors */ }
}
```

`RetryDisk` only retries `StorageNetworkError` by default.

---

## 24. All Interfaces

```typescript
// Core
interface FilesystemContract { ... }        // disk API (see §5)
interface StorageManager { ... }            // StorageService API

// Config
interface StorageConfig { default: string; disks: Record<string, DiskConfig>; auditLog?: boolean }
interface DiskConfig { driver: string; ... }  // see §3
interface CdnConfig { baseUrl: string; provider?; signingKeyId?; signingKey? }

// Options
interface PutOptions {
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
interface GetOptions { responseType?: 'buffer' | 'stream' | 'string' }
interface CopyOptions { visibility?: 'private' | 'public' }
interface MoveOptions { visibility?: 'private' | 'public' }
interface TemporaryUrlOptions { expires?: number; method?: 'GET' | 'PUT' | 'DELETE'; responseDisposition?: string; responseType?: string }
interface MultipartUploadOptions extends PutOptions { chunkSize?: number; partNumberStart?: number; onProgress?: (loaded: number, total: number) => void }
interface StreamableFileOptions { filename?: string; disposition?: 'attachment' | 'inline' }
interface PresignedPostOptions { expires?: number; maxSize?: number; allowedMimeTypes?: string[] }
interface PresignedPostData { url: string; fields: Record<string, string> }
interface StorageHealthCheckOptions { healthCheckFile?: string; timeout?: number }

// Multipart
interface MultipartUploadInit { uploadId: string }
interface MultipartUploadPart { partNumber: number; etag: string }

// Results
interface DeleteManyResult { succeeded: string[]; failed: string[] }
interface ConditionalWriteResult { success: boolean; etag?: string }  // v0.1.0

// Metadata
interface FileMetadata { path: string; size: number; lastModified: Date; type?: string; mimetype?: string; extension?: string; visibility?: 'private' | 'public'; [key: string]: any }
interface S3FileMetadata extends FileMetadata { etag?: string; storageClass?: string; versionId?: string; serverSideEncryption?: string; s3Metadata?: Record<string, string> }
interface GcsFileMetadata extends FileMetadata { generation?: string; metageneration?: string; crc32c?: string; md5Hash?: string }

// Versioning (v0.1.0)
interface FileVersion { versionId: string; size: number; lastModified: Date; isLatest: boolean; checksum?: string }

// Range requests (v0.1.0)
interface RangeOptions { start: number; end?: number }
interface RangeResult { stream: NodeJS.ReadableStream; size: number; contentRange: string; totalSize: number }

// Routing (v0.1.0)
interface StorageRoute { match(path: string, mimetype?: string, size?: number): boolean; disk: FilesystemContract }

// Migration (v0.1.0)
interface MigrationOptions { prefix?: string; concurrency?: number; verify?: boolean; deleteSource?: boolean; dryRun?: boolean; onError?: 'skip' | 'abort' }
interface MigrationProgress { path: string; status: 'pending' | 'copied' | 'verified' | 'failed'; error?: Error; bytesTransferred?: number }

// Archiver (v0.1.0)
interface ArchiverOptions { format?: 'zip' | 'tar'; zlib?: { level?: number } }

// Caching
interface CacheBackend { get<T>(key: string): T | undefined; set<T>(key: string, value: T, ttlMs?: number): void; del(key: string): void; clear(): void }
interface CacheOptions { ttl?: number; ttlByMethod?: { exists?: number; size?: number; lastModified?: number; mimeType?: number; getMetadata?: number; getVisibility?: number } } // all TTL values in milliseconds

// Retry
interface RetryOptions { maxRetries?: number; baseDelay?: number; maxDelay?: number; factor?: number; jitter?: boolean; retryOn?: (err: unknown) => boolean }

// Replication
interface ReplicationOptions { strategy?: 'all' | 'quorum' | 'async' }

// Quota
interface QuotaStore { getUsage(prefix?: string): Promise<number>; addUsage(prefix: string | undefined, bytes: number): Promise<void>; removeUsage(prefix: string | undefined, bytes: number): Promise<void> }
interface QuotaOptions { maxBytes: number; prefix?: string }

// Audit
interface AuditEntry { operation: string; disk: string; path?: string; userId?: string; ip?: string; timestamp: Date; success: boolean; error?: Error }
interface AuditSink { log(entry: AuditEntry): void }

// Interceptors
interface StoredFile { path: string; url: string; size: number; mimetype: string; originalname: string; disk: string }
interface StorageFileInterceptorOptions { disk?: string; path?: string; namingStrategy?: NamingStrategy; fileFilter?: Function; limits?: object }

// Naming
interface NamingStrategy { generate(file: any, originalName: string): string | Promise<string> }
```

---

## 25. Testing Utilities

```typescript
import { FakeDisk, StorageTestUtils } from '@fozooni/nestjs-storage';

// FakeDisk — full in-memory FilesystemContract
const disk = new FakeDisk();

// FakeDisk assertion methods
disk.assertExists(path: string): void
disk.assertMissing(path: string): void
disk.assertCount(n: number, directory?: string): void
disk.assertDirectoryEmpty(directory: string): void
disk.assertContentEquals(path: string, expected: string | Buffer): void
disk.getStoredFiles(): string[]
disk.getStoredFile(path: string): { content, metadata, visibility } | undefined
disk.reset(): void

// FakeDisk also supports
disk.getRange()           // ✓
disk.putIfMatch()         // ✓ MD5-based
disk.putIfNoneMatch()     // ✓ existence check
disk.initMultipartUpload()  // ✓
disk.presignedPost()      // throws StoragePermissionError

// StorageTestUtils
const fakeDisk = StorageTestUtils.fake(storageService: StorageService, diskName?: string): FakeDisk
// Replaces the named disk (or default disk) with a FakeDisk; returns the FakeDisk

const file = StorageTestUtils.fakeFile(options?: {
  name?: string;
  originalname?: string;
  content?: string | Buffer;
  mimetype?: string;
  size?: number;
  fieldname?: string;
}): Express.Multer.File

const file = StorageTestUtils.fakeFileWithSize(bytes: number, name?: string): Express.Multer.File
// Creates a zero-filled Buffer of the specified size
```

---

## 26. Utility Functions

Exported from `@fozooni/nestjs-storage`:

```typescript
generateUniqueFilename(originalName: string): string
// {timestamp}-{uuid}{ext} — not the same as naming strategies

sanitizePath(filePath: string): string
// Remove leading slashes, normalize separators

getContentType(filename: string): string
// MIME type from filename extension (uses mime-types)

getFileExtension(filename: string): string
// Extension without dot: 'jpg', 'png', ''

normalizePath(filePath: string): string
// Normalize path separators to '/'

joinPaths(...paths: string[]): string
// Join path segments (handles leading/trailing slashes)

getDirectory(filePath: string): string
// Directory portion: 'uploads/images/photo.jpg' → 'uploads/images'

getFilename(filePath: string): string
// Filename portion: 'uploads/images/photo.jpg' → 'photo.jpg'

isDirectory(path: string): boolean
// Returns true if path ends with '/'

parseS3Url(url: string): { bucket: string; key: string } | null
// Parses both path-style and virtual-hosted-style S3 URLs

encodeS3Key(key: string): string
// URL-encode S3 key while preserving '/' separators

buildS3Url(bucket: string, key: string, region?: string): string
// Build a public S3 URL

streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer>
streamToString(stream: NodeJS.ReadableStream): Promise<string>
isStream(value: any): boolean

formatFileSize(bytes: number): string
// Human-readable: '1.5 MB', '256 KB', '42 B'

visibilityToAcl(visibility?: 'private' | 'public'): string
// 'private' | 'public-read'

aclToVisibility(acl?: string): 'private' | 'public'
```

---

## 27. Custom Drivers

```typescript
import { FilesystemContract, DiskConfig, StorageService } from '@fozooni/nestjs-storage';

// 1. Implement FilesystemContract
class MyCustomDisk implements FilesystemContract {
  constructor(private readonly config: DiskConfig) {}

  async exists(path: string): Promise<boolean> { ... }
  async get(path: string, options?: GetOptions): Promise<Buffer> { ... }
  async put(path: string, contents: any, options?: PutOptions): Promise<boolean> { ... }
  // ... implement all required methods

  // Optional: implement advanced methods
  async getRange(path: string, options: RangeOptions): Promise<RangeResult> { ... }
  async putIfMatch(path: string, content: any, etag: string): Promise<ConditionalWriteResult> { ... }
}

// 2. Register the driver factory
storage.extend('my-driver', (config: DiskConfig) => new MyCustomDisk(config));

// 3. Use in config
StorageModule.forRoot({
  default: 'custom',
  disks: {
    custom: { driver: 'my-driver', /* your config fields */ },
  },
})

// Custom decorator disk — extend DiskDecorator
import { DiskDecorator } from '@fozooni/nestjs-storage';

class MyDecorator extends DiskDecorator {
  async put(path: string, contents: any, options?: PutOptions): Promise<boolean> {
    // pre-processing
    const result = await super.put(path, contents, options);
    // post-processing
    return result;
  }
  // All other methods automatically delegated to this.disk
}
const decorated = new MyDecorator(storage.disk('s3'));
```

---

## 28. Migration Guides

### Upgrading from 0.0.1 → 0.0.2

Non-breaking. Install: `npm install @fozooni/nestjs-storage@0.0.2`

New features:
- `@InjectDisk('name')` — inject specific disks (use `injectDisks` with `forRootAsync`)
- `FakeDisk` + `StorageTestUtils` — in-memory disk for testing
- `StorageHealthIndicator` — health checks via `@nestjs/terminus`
- `missing()`, `json()`, `checksum()`, `deleteMany()` — convenience methods
- `getStreamableFile()` — stream files from NestJS controllers

Custom driver authors: new convenience methods are optional on `FilesystemContract`.

---

### Upgrading from 0.0.2 → 0.0.3

Non-breaking. Install: `npm install @fozooni/nestjs-storage@0.0.3`

New features:
- Naming strategies: `UuidNamingStrategy`, `HashNamingStrategy`, `DatePathNamingStrategy`, `OriginalNamingStrategy`
- `StorageFileInterceptor` / `StorageFilesInterceptor` (requires `multer`)
- `FileExtensionValidator` + `MagicBytesValidator`
- `StorageEventsService` — subscribe to typed storage events
- Scoped disks — `storage.scope('prefix')` / `disk.scope('prefix')`

Custom driver authors: `scope?()` is optional — add it to your driver for scoping support.

---

### Upgrading from 0.0.3 → 0.0.4

Mostly non-breaking with one important behavioral change (error handling).

Install: `npm install @fozooni/nestjs-storage@0.0.4`

New features:
- 5 new drivers: Azure, MinIO, Backblaze B2, DigitalOcean Spaces, Wasabi
- **Typed error hierarchy** — `StorageError` subclasses replace bare `Error`
- `EncryptedDisk` — `storage.encrypted('disk', { key })`
- Presigned POST — `disk.presignedPost(path, options?)`
- HMAC signed URLs — `LocalDisk` with `signSecret` + `LocalSignedUrlMiddleware`
- Audit logging — `auditLog: true` + pluggable `AuditSink`

**Breaking change — typed errors:**

```typescript
// Before (v0.0.3)
try {
  await storage.get('file.txt');
} catch (e) {
  if (e instanceof Error && e.message.includes('not found')) { ... }
}

// After (v0.0.4+)
import { StorageFileNotFoundError } from '@fozooni/nestjs-storage';
try {
  await storage.get('file.txt');
} catch (e) {
  if (e instanceof StorageFileNotFoundError) { ... }
}
```

**LocalDisk warning message changed:**

```typescript
// Before: 'Local disk does not support temporary URLs'
// After:  contains 'signSecret'
expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('signSecret'));
```

---

### Upgrading from 0.0.4 → 0.0.5

Fully backwards compatible. No breaking changes.

New features:
- `DiskDecorator` abstract base class
- `CachedDisk`, `RetryDisk`, `ReplicatedDisk`, `CdnDisk`, `OtelDisk`, `QuotaDisk`
- Config validation — `DiskConfigValidator` (errors now thrown earlier at `disk()` call time)
- Temporary files with TTL — `putTemp()` + `StorageTempCleanupService`
- TypeScript generics — `getMetadata<T>()`, `json<T>(path, schema?)`
- `StorageTempCleanupService` now auto-exported from `StorageModule`

New optional peers:

```bash
npm install @aws-sdk/cloudfront-signer  # CdnDisk + CloudFront
npm install @opentelemetry/api          # OtelDisk
npm install zod                         # json<T>() schema validation
```

**`getMetadata` now generic:**

```typescript
// Before (v0.0.4)
const meta = (await disk.getMetadata('file.txt')) as S3FileMetadata;
// After (v0.0.5)
const meta = await disk.getMetadata<S3FileMetadata>('file.txt');
```

---

### Upgrading from 0.0.5 → 0.1.0

Fully backwards compatible. All changes are additive. No breaking changes.

New features:
- `VersionedDisk` — `storage.withVersioning('disk')`
- `RouterDisk` + factory fns (`byExtension`, `byPrefix`, `byMimeType`, `bySize`, `custom`)
- Range requests — `getRange()`, `serveRange()`, `@RangeServe()`
- Conditional writes — `putIfMatch()`, `putIfNoneMatch()`
- `StorageMigrator` — async generator migration (auto-registered)
- `StorageUploadProgressService` — RxJS-based upload tracking (auto-registered)
- `StorageArchiver` — streaming ZIP/TAR archives (auto-registered)

New optional peer:

```bash
npm install archiver   # StorageArchiver
```

New auto-registered services (no manual setup needed):

```typescript
constructor(
  private migrator: StorageMigrator,
  private progress: StorageUploadProgressService,
  private archiver: StorageArchiver,
) {}
```

New `FilesystemContract` optional methods:
`listVersions`, `getVersion`, `restoreVersion`, `deleteVersion`, `getRange`, `putIfMatch`, `putIfNoneMatch`

---

> For concise usage examples see [llm.md](llm.md). For narrative documentation see the [README](README.md).
