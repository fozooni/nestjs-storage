# Changelog

All notable changes to `@fozooni/nestjs-storage` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.2] — 2026-03-17

### Fixed

- **`@nestjs/terminus` is now truly optional** — `StorageHealthIndicator` previously imported `@nestjs/terminus` at the top level, causing a runtime crash for users who didn't install it. The import is now lazy (`require()` in a try/catch) so the package loads cleanly without terminus. Users who want health checks still get full functionality by installing `@nestjs/terminus`.
- **Audit logging now works with `StorageFileInterceptor` and `StorageFilesInterceptor`** — both interceptors previously called `disk.putFile()` directly, bypassing the audit logging in `StorageService`. They now inject `StorageAuditService` (via `@Optional()`) and emit audit entries for every upload when `auditLog: true` is enabled.
- **Documentation: `temporaryUrl()` timing units corrected** — multiple examples in `docs/guide/urls-and-downloads.md` incorrectly labelled the `expiration` parameter as "minutes" when the API expects **seconds**. All examples, variable names, and comments now correctly reflect seconds.
- **Documentation: `presignedPost()` examples fixed** — examples passed expiration as a positional argument instead of using the `PresignedPostOptions.expires` field. Corrected to use the options object with explicit `expires` in seconds.
- **Documentation: `CacheOptions` TTL unit corrected** — `docs/api/interfaces.md` documented `ttl` and `ttlByMethod` as "seconds" but the implementation uses **milliseconds**. Fixed to say "milliseconds".
- **Documentation: `temporaryUrl()` signature in `llm-full.md`** — was missing the `| number` union on the `expiration` parameter. Now shows `Date | number` with a comment clarifying seconds.
- **Documentation: `filesystem-contract.md`** — `temporaryUrl` entry now shows both `Date` and `number` overloads with the `options` parameter.

---

## [0.1.1] — 2026-03-17

### Added

- **`llm.md` and `llm-full.md` shipped inside the npm package** — these AI-ready reference files are now included in `node_modules/@fozooni/nestjs-storage/` when you install the package. AI coding agents (Cursor, Claude Code, Antigravity, GitHub Copilot, Windsurf, etc.) can directly reference them from `node_modules` for full package context without any manual setup.
  - `llm.md` — compact quick-reference covering install, config, all drivers, core operations, decorator factories, and common patterns (~460 lines).
  - `llm-full.md` — complete API surface with every interface, method signature, option, and migration guide.

### Changed

- **`package.json` `files` field** — `llm.md` and `llm-full.md` were already listed but are now documented as an intentional feature for AI agent consumption.
- **VitePress documentation site** — comprehensive documentation added at `https://fozooni.github.io/nestjs-storage/` with 57 pages covering all drivers, decorators, services, advanced topics, and API reference. Includes a dedicated [LLM Documentation guide](https://fozooni.github.io/nestjs-storage/guide/llm-docs) explaining how to use the reference files with various AI tools.
- **README.md** — streamlined to a concise overview with links to the full documentation site.
- **GitHub Actions** — added `docs.yml` workflow for automatic deployment to GitHub Pages on push to `main`.

---

## [0.1.0] — 2026-03-16

### Added

#### VersionedDisk Decorator

- **`VersionedDisk`** — extends `DiskDecorator`. Automatically snapshots the current file content to `.versions/{path}/{timestamp}_{uuid}` before every overwrite. Versioning failures are silently swallowed so they never block the actual write.
- `listVersions(path): Promise<FileVersion[]>` — returns all snapshots sorted oldest-first; `isLatest: true` on the most recently created version. `FileVersion: { versionId, size, lastModified, isLatest, checksum? }`.
- `getVersion(path, versionId): Promise<Buffer>` — retrieve any snapshot as a Buffer.
- `restoreVersion(path, versionId): Promise<boolean>` — copy a snapshot back to the live path.
- `deleteVersion(path, versionId): Promise<boolean>` — remove a single snapshot.
- `StorageService.withVersioning(diskName)` factory method.

#### RouterDisk + Route Factories

- **`RouterDisk`** — extends `DiskDecorator`. Dispatches reads and writes to different disks based on an ordered list of `StorageRoute` rules. First-match wins on write; same rule applied at read time (size/mime routes fall back to default disk at read time since content is unknown).
- **`byExtension(exts[], disk)`** — match on file extension.
- **`byPrefix(prefix, disk)`** — match on path prefix.
- **`byMimeType(mimetypes[], disk)`** — match on MIME type (write-time only).
- **`bySize(maxBytes, disk)`** — match when content size ≤ maxBytes (write-time only).
- **`custom(fn, disk)`** — user-supplied `(path, mimetype?, size?) => boolean` predicate.
- `StorageService.withRouting(routes, defaultDisk)` factory method.
- Cross-disk `copy()` and `move()` supported transparently.

#### Range Requests / Partial Content

- **`getRange(path, options: RangeOptions): Promise<RangeResult>`** — new optional method on `FilesystemContract`.
  - `RangeOptions: { start: number; end?: number }`.
  - `RangeResult: { stream: NodeJS.ReadableStream; size: number; contentRange: string; totalSize: number }`.
  - Implemented on: `LocalDisk` (`fs.createReadStream`), `S3Disk` (`Range` header on `GetObjectCommand`), `GcsDisk` (`createReadStream({ start, end })`), `AzureDisk` (`blockBlobClient.download(start, count)`), `FakeDisk` (Buffer slice).
- **`StorageService.serveRange(path, req, res, diskName?)`** — parses `Range` header, sets `Content-Range` / `Content-Length` / `Accept-Ranges: bytes`, pipes stream. Returns HTTP 206 with range or 200 for full content. Handles `bytes=start-end`, `bytes=start-`, and `bytes=-suffix` formats.
- **`@RangeServe(diskName?)`** — method decorator that attaches disk name metadata under `RANGE_SERVE_DISK_KEY` for use with custom interceptors.

#### Concurrent Write Protection

- **`putIfMatch(path, content, etag, opts?): Promise<ConditionalWriteResult>`** — new optional method. Writes only when the current file's ETag matches the supplied value. `ConditionalWriteResult: { success: boolean; etag?: string }`.
  - `LocalDisk`: MD5 comparison.
  - `S3Disk`: `IfMatch` on `PutObjectCommand`.
  - `FakeDisk`: MD5-based.
- **`putIfNoneMatch(path, content, opts?): Promise<ConditionalWriteResult>`** — writes only when the file does not exist.
  - `LocalDisk`: existence check.
  - `S3Disk`: `IfNoneMatch: '*'` on `PutObjectCommand`.
  - `FakeDisk`: existence check.

#### StorageMigrator

- **`StorageMigrator`** — `@Injectable()` service. `async *migrate(source, target, opts?): AsyncGenerator<MigrationProgress>` streams files from source to target in concurrent batches.
- Yields `'pending'` before each file and `'copied'` or `'failed'` after.
- `MigrationOptions: { prefix?, concurrency=5, verify=false, deleteSource=false, dryRun=false, onError='skip'|'abort' }`.
- `verify: true` computes checksums on both ends and fails the file on mismatch.
- Files are streamed one at a time — never loaded all into memory.
- Registered and exported by `StorageModule`.

#### StorageUploadProgressService

- **`StorageUploadProgressService`** — `@Injectable()` service using RxJS `Subject` per upload ID.
- `track(uploadId, status)` — push a `MultipartUploadStatus` event.
- `getProgress$(uploadId): Observable<MultipartUploadStatus>` — subscribe to progress updates.
- `complete(uploadId)` — complete the observable.
- `error(uploadId, err)` — error the observable.
- Supports multiple concurrent uploads independently. Subjects are cleaned up on complete/error.
- Registered and exported by `StorageModule`.

#### StorageArchiver

- **`StorageArchiver`** — `@Injectable()` service. `createZip(files, disk, opts?): Promise<NodeJS.ReadableStream>` and `createTar(files, disk, opts?)`.
- Uses optional peer `archiver`. Throws `StorageConfigurationError` when not installed.
- Files are appended as streams — archive is never buffered in memory.
- `opts.zlib.level` configures ZIP compression level.
- Each entry: `{ path: string; name?: string }`. `name` overrides the archive entry name.
- Registered and exported by `StorageModule`.

### Changed

- **`FilesystemContract`** — added 7 new optional methods: `listVersions`, `getVersion`, `restoreVersion`, `deleteVersion`, `getRange`, `putIfMatch`, `putIfNoneMatch`.
- **`DiskDecorator`** — added delegation stubs for all 7 new optional methods. `DiskDecorator` subclasses inherit correct delegation or throw `"Disk does not support X"` automatically.
- **`StorageManager` interface** — added `withVersioning`, `withRouting`, `serveRange`.
- **`StorageModule`** — `StorageMigrator`, `StorageUploadProgressService`, `StorageArchiver` are now auto-registered in both `forRoot()` and `forRootAsync()`.
- **`src/disk/index.ts`** — exports `VersionedDisk`, `RouterDisk`, and all route factory functions.
- **`src/index.ts`** — exports `migration`, `progress`, and `archiver` modules.
- **`package.json`** — version bumped to `0.1.0`; added new optional peers/devDependencies (`archiver`).

### New Interfaces

```typescript
interface FileVersion { versionId, size, lastModified, isLatest, checksum? }
interface RangeOptions { start, end? }
interface RangeResult { stream, size, contentRange, totalSize }
interface ConditionalWriteResult { success, etag? }
interface StorageRoute { match(path, mimetype?, size?): boolean; disk }
interface MigrationProgress { path, status, error?, bytesTransferred? }
interface MigrationOptions { prefix?, concurrency?, verify?, deleteSource?, dryRun?, onError? }
interface ArchiverOptions { format?, zlib? }
```

### New Optional Peer Dependencies

| Package | Used by |
|---|---|
| `archiver ^7` | `StorageArchiver` |

---

## [0.0.5] — 2026-03-16

### Added

#### DiskDecorator Abstract Base

- **`DiskDecorator`** — abstract base class that all decorator disks (`CachedDisk`, `RetryDisk`, `ReplicatedDisk`, `CdnDisk`, `OtelDisk`, `QuotaDisk`) extend. Auto-delegates every `FilesystemContract` method to the wrapped inner disk. Eliminates ~150 lines of passthrough boilerplate per decorator. Optional methods (`initMultipartUpload`, `presignedPost`, etc.) throw a clear `"Disk does not support X"` error when the inner disk does not implement them.
- `EncryptedDisk` and `ScopedDisk` refactored to extend `DiskDecorator` — only transforming methods remain, passthrough boilerplate removed.

#### CachedDisk Decorator

- **`CachedDisk`** — extends `DiskDecorator`. Caches read-heavy operations: `exists`, `size`, `lastModified`, `mimeType`, `getMetadata`, `getVisibility`. Cache is invalidated on every write (`put`, `putFile`, `delete`, `copy`, `move`, `setVisibility`, `deleteMany`, `deleteDirectory`).
- **`MemoryCacheBackend`** — built-in `Map`-based `CacheBackend` implementation. Supports per-entry TTL.
- **`CacheBackend` interface** — `{ get<T>(key): T | undefined; set<T>(key, value, ttlMs?): void; del(key): void; clear(): void }`. Plug in Redis or any other backend.
- **`CacheOptions`** — `{ ttl?, ttlByMethod? }` — configure global TTL and per-method TTL overrides.
- `StorageService.cached(diskName, opts?)` factory method.
- `CachedDisk.clearCache()` — clears the entire cache programmatically.
- `CachedDisk.cacheBackend` — exposes the underlying backend for advanced use.

#### RetryDisk Decorator

- **`RetryDisk`** — extends `DiskDecorator`. Full-jitter exponential backoff on transient failures. Default: retry on `StorageNetworkError`; skip on `StorageFileNotFoundError`, `StoragePermissionError`, `StorageConfigurationError`.
- **`RetryOptions`** — `{ maxRetries?, baseDelay?, maxDelay?, factor?, jitter?, retryOn? }`.
- Custom `retryOn?(err): boolean` predicate for fine-grained retry control.
- Emits `storage.retry` event via optional `StorageEventsService` injection.
- `StorageService.withRetry(diskName, opts?)` factory method.

#### ReplicatedDisk Decorator

- **`ReplicatedDisk`** — extends `DiskDecorator`. Propagates writes to multiple replica disks. Reads always served from primary.
- **`ReplicationOptions.strategy`** — three strategies:
  - `'all'` (default): `Promise.all` — all replicas must succeed.
  - `'quorum'`: majority must succeed (`allSettled`); individual replica failures are tolerated.
  - `'async'`: fire-and-forget replication — write returns as soon as primary succeeds.
- `StorageService.replicated(diskName, replicas, opts?)` factory method.
- `ReplicatedDisk.replicaDisks` — exposes the replica list.

#### CdnDisk Decorator

- **`CdnDisk`** — extends `DiskDecorator`. Overrides `url()` to return CDN-prefixed URLs and `temporaryUrl()` to generate CloudFront signed URLs.
- **`DiskConfig.cdn`** — new optional field: `{ baseUrl, provider?, signingKeyId?, signingKey? }`. When set, `StorageService.disk()` automatically wraps the disk in a `CdnDisk`.
- CloudFront signed URL support via dynamic `@aws-sdk/cloudfront-signer` import (optional peer — no-op if absent).
- `CdnDisk.invalidateCdn(paths)` — placeholder for CDN invalidation; override in subclasses.
- `CdnDisk.cdnConfiguration` — exposes the CDN config.

#### OtelDisk Decorator (OpenTelemetry)

- **`OtelDisk`** — extends `DiskDecorator`. Wraps every async storage operation in an OpenTelemetry span.
- Span attributes: `storage.disk`, `storage.operation`, `storage.path`.
- **Zero-overhead no-op** when `@opentelemetry/api` is not installed — graceful degradation via try/require.
- `StorageService.withTracing(diskName)` factory method.
- `OtelDisk.isTracingActive` — boolean indicating whether the OTel API is available.

#### QuotaDisk Decorator

- **`QuotaDisk`** — extends `DiskDecorator`. Enforces byte-level storage quotas. Throws `StorageQuotaExceededError` on `put()` when quota is exceeded.
- **`MemoryQuotaStore`** — built-in in-memory `QuotaStore` implementation (per-prefix usage map).
- **`QuotaStore` interface** — `{ getUsage(prefix?): Promise<number>; addUsage(prefix, bytes): Promise<void>; removeUsage(prefix, bytes): Promise<void> }`. Redis-ready.
- **`QuotaOptions`** — `{ maxBytes, prefix? }`.
- `QuotaDisk.getUsage()` — returns `{ used, limit, percent }`.
- `StorageService.withQuota(diskName, quotaStore, opts)` factory method.

#### Config Validation

- **`DiskConfigValidator`** — static class that validates disk configs before disk construction. Throws `StorageConfigurationError` with clear messages listing missing fields and the disk name.
- Required fields per driver: `s3` → `bucket + region`; `r2` → `bucket + accountId`; `gcs` → `bucket`; `minio` → `bucket + endpoint`; `b2` → `bucket + endpoint`; `digitalocean`/`wasabi` → `bucket + region + endpoint`; `azure` → `containerName + (accountKey | sasToken)`.
- CDN config validation: `cdn.baseUrl` always required; `cloudfront` provider additionally requires `signingKeyId` and `signingKey`.
- `StorageService.disk()` now runs validation before constructing any disk.

#### Temporary Files with TTL

- **`LocalDisk.putTemp(path, content, ttlSeconds, opts?)`** — writes a file and a `.ttl` sidecar JSON (`{ expiresAt }`) alongside it.
- **`S3Disk.putTemp(path, content, ttlSeconds, opts?)`** — sets the S3 `Expires` object metadata header for native object expiry.
- **`DiskDecorator.putTemp()`** — delegates to the inner disk if supported, falls back to plain `put()`.
- **`StorageTempCleanupService`** — `@Injectable()` NestJS service that scans a `LocalDisk` for expired `.ttl` sidecars and deletes both the sidecar and the original file. Works with `@nestjs/schedule` for scheduled cleanup. Registered in `StorageModule` exports.
- `StorageTempCleanupService.runOnce(diskName?)` — returns `{ deleted, errors }`.

#### Better TypeScript Generics

- **`getMetadata<T extends FileMetadata = FileMetadata>(path): Promise<T>`** — now generic across the entire `FilesystemContract` interface and all implementations. Callers can cast to driver-specific types without runtime overhead.
- **`S3FileMetadata`** — extends `FileMetadata` with `etag?`, `storageClass?`, `versionId?`, `serverSideEncryption?`, `s3Metadata?` fields. Returned by `S3Disk.getMetadata()`.
- **`GcsFileMetadata`** — extends `FileMetadata` with `generation?`, `metageneration?`, `crc32c?`, `md5Hash?` fields. Returned by `GcsDisk.getMetadata()`.
- **`json<T>(path, schema?): Promise<T>`** — optional Zod-compatible schema `{ parse(v: unknown): T }` parameter added across `LocalDisk`, `S3Disk`, `GcsDisk`, `AzureDisk`, `FakeDisk`, and `DiskDecorator`.

### Changed

- `StorageService.disk()` now runs `DiskConfigValidator.validate()` and auto-wraps with `CdnDisk` when `DiskConfig.cdn` is set.
- `StorageModule.forRoot()` and `forRootAsync()` now include `StorageTempCleanupService` in providers and exports.
- `StorageEvents.RETRY` constant added (`'storage.retry'`).
- `DiskConfig` extended with `cdn?: CdnConfig`.

### New Peer Dependencies (all optional)

| Package | Purpose |
|---|---|
| `@aws-sdk/cloudfront-signer@^3.0.0` | CloudFront signed URLs in `CdnDisk` |
| `@opentelemetry/api@^1.0.0` | Tracing spans in `OtelDisk` |
| `zod@^3.0.0` | Schema validation in `json<T>()` |
| `class-validator@^0.14.0` | Future config schema annotations |
| `class-transformer@^0.5.0` | Future config schema annotations |

---

## [0.0.4] — 2026-03-16

### Added

#### New Drivers

- **`AzureDisk`** — full `FilesystemContract` implementation for Azure Blob Storage via `@azure/storage-blob` (optional peer). Supports `accountKey` (SharedKey) and `sasToken` authentication. Multipart uploads via the Block Blob API (`stageBlock`/`commitBlockList`). Temporary URLs via `generateBlobSASQueryParameters`. Presigned POST via SAS URL. Driver key: `'azure'`.
- **`MinioDisk`** — extends `S3Disk` with forced path-style URLs and required `endpoint`. Driver key: `'minio'`.
- **`BackblazeDisk`** — extends `S3Disk` via B2's S3-compatible endpoint; URL uses B2 CDN pattern. Driver key: `'b2'`.
- **`DigitalOceanDisk`** — extends `S3Disk` with Spaces endpoint and virtual-hosted-style URL. Driver key: `'digitalocean'`.
- **`WasabiDisk`** — extends `S3Disk` with Wasabi endpoint. Driver key: `'wasabi'`.

#### Typed Error Hierarchy

- `StorageError` — base class for all storage errors; carries `disk?`, `path?`, `cause?` fields
- `StorageFileNotFoundError` — thrown for HTTP 404 / missing file
- `StoragePermissionError` — thrown for HTTP 403, unsupported operations (e.g. R2 ACLs)
- `StorageNetworkError` — thrown for transient network or 5xx errors; safe to retry
- `StorageConfigurationError` — thrown for missing required config or missing optional peer dep
- `StorageQuotaExceededError` — reserved for quota-exceeded scenarios
- All drivers updated to throw typed errors instead of bare `new Error()`

#### EncryptedDisk

- `EncryptedDisk` — decorator implementing `FilesystemContract` that transparently encrypts every write and decrypts every read using **AES-256-GCM** (key: 32 bytes, IV: 12 bytes per blob)
- `StorageService.encrypted(diskName, { key })` factory — key accepted as hex string or `Buffer`
- `size()` reports plaintext byte count (ciphertext overhead stripped)
- `copy()` decrypts then re-encrypts at the destination
- `presignedPost()` throws `StoragePermissionError` by design (direct uploads bypass encryption)

#### Presigned POST

- New optional `presignedPost?(path, options?): Promise<PresignedPostData>` on `FilesystemContract`
- New types: `PresignedPostOptions { expires?, maxSize?, allowedMimeTypes? }` and `PresignedPostData { url, fields }`
- `S3Disk.presignedPost` — uses `@aws-sdk/s3-presigned-post` (new optional peer)
- `R2Disk` inherits `presignedPost` from `S3Disk`
- `GcsDisk.presignedPost` — uses `file.generateSignedPostPolicyV4`
- `AzureDisk.presignedPost` — generates a SAS-based PUT URL with required headers

#### HMAC Signed URLs for LocalDisk

- `DiskConfig.signSecret?: string` — 32+ character signing secret for LocalDisk
- `LocalDisk.temporaryUrl()` now generates real HMAC-SHA256 signed URLs when `signSecret` is set: `{baseUrl}/{path}?expires={unix_ts}&signature={hex}`
- `LocalSignedUrlMiddleware` — NestJS `NestMiddleware` that validates signed URLs using `crypto.timingSafeEqual`; returns 403 on expired or invalid signature

#### Audit Logging

- `StorageAuditService` — `@Injectable()` service with a default NestJS Logger sink
- `AuditSink` interface — `{ log(entry: AuditEntry): void }` — implement to write to any backend
- `AuditEntry` type — `{ operation, disk, path?, userId?, ip?, timestamp, success, error? }`
- `StorageAuditService.addSink(sink)` — register additional sinks at runtime; sink errors are swallowed to avoid disrupting storage operations
- `auditLog: true` in `StorageModule.forRoot()` options — enables audit logging
- `StorageService` calls `auditService?.log(...)` after every mutating proxy method (`put`, `putFile`, `delete`, `copy`, `move`, `deleteMany`)

#### Build Optimisation

- esbuild minification enabled (`minify: true`) — JS bundles reduced by ~51% (168 KB → 82 KB CJS, 163 KB → 81 KB ESM)
- esbuild tree-shaking enabled (`treeshake: true`) — dead code eliminated at build time
- `keepNames: true` — class and function names preserved for NestJS DI compatibility
- Build target updated to `node18` — esbuild emits native class fields, async generators, and optional chaining without down-transpilation; fully compatible with Node 18, 20, and 22
- Source map files (`.map`) excluded from the published npm package via `files` field — npm install size reduced from ~1.1 MB to ~283 KB (**74% smaller**)
- Source maps are still generated locally for development and debugging

### Changed

- `DiskConfig.driver` union type extended to include `'minio' | 'b2' | 'digitalocean' | 'wasabi' | 'azure'`
- `DiskConfig` extended with: `signSecret?` (LocalDisk HMAC), `accountName?`, `accountKey?`, `sasToken?`, `containerName?` (Azure)
- `StorageConfig` extended with: `auditLog?: boolean`
- `StorageService` registers 5 new drivers in constructor; adds `encrypted()` method; optionally injects `StorageAuditService` via `@Optional()`
- `StorageModule.forRoot()` conditionally registers `StorageAuditService` when `auditLog: true`

### Migration Notes

- **Typed errors** — all drivers now throw `StorageError` subclasses. Replace any `catch (e)` blocks that match on `e.message` with `instanceof` checks. See [Upgrading from 0.0.3](README.md#upgrading-from-003).
- **`LocalDisk.temporaryUrl()` warning message** — the warning text has changed from `'Local disk does not support temporary URLs'` to a message mentioning `signSecret`. Update any tests that assert the exact warning string.
- No other breaking changes. All existing APIs, configurations, and custom drivers remain fully compatible.

---

## [0.0.31] — 2026-03-16

### Fixed

- **`StorageHealthIndicator.checkDisks()` race condition** — `Promise.all` caused concurrent health checks to interleave `put`/`get` calls on the same disk, making the content-match assertion flaky (particularly on Node 20 in CI). Health checks are now run sequentially, ensuring each disk's write completes before its read.

---

## [0.0.3] — 2026-03-16

### Added

#### File Naming Strategies

- `NamingStrategy` interface — implement `generate(file, originalName)` for custom filename logic
- `UuidNamingStrategy` — generates `{randomUUID()}{ext}` using Node.js `crypto.randomUUID()`
- `HashNamingStrategy` — generates `{md5(content)}{ext}`, consistent for identical content
- `DatePathNamingStrategy` — generates `YYYY/MM/DD/{uuid}{ext}`, automatically organising uploads by date
- `OriginalNamingStrategy` — no-op, keeps the original filename unchanged
- `namingStrategy` option on `PutOptions` — pass per-call: `putFile(path, file, { namingStrategy })`
- `namingStrategy` field on `DiskConfig` — set a disk-level default in module config

#### StorageFileInterceptor

- `StorageFileInterceptor(fieldName, options?)` — NestJS interceptor factory that parses a single-file multipart upload via `multer` and stores it to a disk in one step; replaces `req.file` with a `StoredFile` object
- `StorageFilesInterceptor(fieldName, maxCount, options?)` — multi-file variant; replaces `req.files` with `StoredFile[]`
- `StoredFile` interface — `{ path, url, size, mimetype, originalname, disk }`
- `StorageFileInterceptorOptions` — `{ disk?, path?, namingStrategy?, fileFilter?, limits? }`
- `multer` added as optional peer dependency (`^1.4.5 || ^2.0.0`)

#### File Validation Pipes

- `FileExtensionValidator` — extends `FileValidator` from `@nestjs/common`; validates `originalname` extension case-insensitively against an `allowedExtensions` whitelist (leading dot optional)
- `MagicBytesValidator` — extends `FileValidator`; reads the first bytes of `file.buffer` against a built-in magic signatures map; prevents extension spoofing without external dependencies

#### Storage Event System

- `StorageEventsService` — injectable service wrapping Node.js `EventEmitter`; provides `on()`, `off()`, `once()`, `emit()`
- `StorageEvents` constants — `PUT`, `PUT_FILE`, `DELETE`, `COPY`, `MOVE`, `DELETE_MANY`
- `StorageService` now emits typed events after every mutating operation (`put`, `putFile`, `delete`, `copy`, `move`, `deleteMany`)
- `storageService.events` getter — access `StorageEventsService` directly from `StorageService`
- Optional `@nestjs/event-emitter` bridge — if `EventEmitter2` is configured, events also flow through it (zero config)
- `StorageEventsService` exported from `StorageModule` for direct injection

#### Scoped Disks

- `ScopedDisk` — full `FilesystemContract` implementation that transparently prepends a path prefix to all operations and strips it from returned paths
- `storage.scope(prefix, diskName?)` — create a scoped disk from `StorageService`
- `disk.scope(prefix)` — create a scoped disk from any `FilesystemContract` instance (Local, S3, R2, GCS, FakeDisk)
- Nested scopes — `scope()` on a `ScopedDisk` chains prefixes correctly
- `scope?(prefix: string): FilesystemContract` added as optional to `FilesystemContract` interface

### Changed

- `StorageService` now requires `StorageEventsService` as a second constructor argument (injected automatically via NestJS DI — no manual change needed)
- `StorageModule` registers and exports `StorageEventsService`

### Notes

- **No breaking changes.** All existing APIs remain unchanged. Custom drivers implementing `FilesystemContract` continue to work without modification.
- For custom driver authors: `scope?()` is optional; add it to enable scoping support on your driver.

---

## [0.0.2] — 2026-03-15

### Added

#### `@InjectDisk()` Decorator

- `@InjectDisk(name)` — inject a specific disk directly into any provider via NestJS DI
- Disk providers auto-registered for all configured disk names when using `forRoot()`
- `injectDisks: string[]` option on `forRootAsync()` — specify which disks to register as providers when using factory/class/existing patterns

#### Testing Utilities

- `FakeDisk` — full in-memory `FilesystemContract` implementation for unit testing without touching real storage
- `StorageTestUtils.fake(storageService, diskName?)` — swap a real disk for a `FakeDisk` in tests
- `StorageTestUtils.fakeFile(options?)` — create a mock `Express.Multer.File` for upload testing
- `StorageTestUtils.fakeFileWithSize(bytes, name?)` — create a zero-filled fake file of a given size
- Assertion methods on `FakeDisk`: `assertExists()`, `assertMissing()`, `assertCount()`, `assertDirectoryEmpty()`, `assertContentEquals()`, `getStoredFiles()`, `getStoredFile()`, `reset()`

#### Health Checks

- `StorageHealthIndicator` — `@nestjs/terminus` health indicator performing a write/read/delete cycle
- `check(key, diskName?, options?)` — check a single disk
- `checkDisks(key, diskNames[], options?)` — check multiple disks in parallel, reports per-disk status
- `StorageHealthCheckOptions` — `{ healthCheckFile?, timeout? }` (defaults: `.storage-health-check`, 5000 ms)
- `@nestjs/terminus` added as optional peer dependency

#### Convenience Methods

- `missing(path)` — inverse of `exists()`; returns `true` if the file does not exist
- `json<T>(path)` — read and JSON-parse a file in one call
- `checksum(path, algorithm?)` — compute file checksum; supports `'md5'` (default), `'sha1'`, `'sha256'`
- `deleteMany(paths[])` — delete multiple files in one call; returns `{ succeeded: string[], failed: string[] }`
- All four methods implemented on `LocalDisk`, `S3Disk`, `R2Disk`, `GcsDisk`, and `FakeDisk`
- Added as optional (`?`) to `FilesystemContract` — existing custom drivers are unaffected

#### Streamable Downloads

- `getStreamableFile(path, options?)` — returns a NestJS `StreamableFile` with `Content-Type`, `Content-Length`, and `Content-Disposition` headers set automatically
- `StreamableFileOptions` — `{ filename?, disposition? }` (`'attachment'` or `'inline'`)

### Notes

- **No breaking changes.** All existing APIs remain unchanged.
- For custom driver authors: the four new convenience methods are optional on `FilesystemContract`; existing drivers continue to work without changes.

---

## [0.0.1] — 2026-03-14

### Added

#### Core Module

- `StorageModule.forRoot(config)` — static module registration
- `StorageModule.forRootAsync(options)` — async registration supporting `useFactory`, `useClass`, and `useExisting`
- `isGlobal` option — register as a NestJS global module (default: `true`)
- `StorageService` — main service implementing `StorageManager`; proxies all operations to the default disk
- `@InjectStorage()` decorator — alternative to constructor-type injection

#### Drivers

- **Local** — stores files on the local filesystem; path-traversal protection built-in
- **S3** — Amazon S3 and S3-compatible storage via `@aws-sdk/client-s3`
- **R2** — Cloudflare R2 via the S3-compatible API; endpoint auto-configured from `accountId`
- **GCS** — Google Cloud Storage via `@google-cloud/storage`
- All SDKs are optional peer dependencies — install only what you use

#### FilesystemContract API

- `exists(path)` — check file existence
- `get(path, options?)` — read a file as `Buffer`, `string`, or `ReadableStream`
- `put(path, contents, options?)` — write a file; supports `string`, `Buffer`, `ReadableStream`
- `putFile(path, file, options?)` — store a multipart/multer file with an auto-generated unique filename
- `putFileAs(path, file, name, options?)` — store a multipart/multer file with an explicit filename
- `delete(path)` — delete a file
- `copy(from, to, options?)` — copy a file
- `move(from, to, options?)` — move / rename a file
- `size(path)` — file size in bytes
- `lastModified(path)` — last-modified timestamp in milliseconds
- `prepend(path, data)` — prepend text to a file
- `append(path, data)` — append text to a file
- `files(directory?, recursive?)` / `allFiles(directory?)` — list files
- `directories(directory?, recursive?)` / `allDirectories(directory?)` — list directories
- `makeDirectory(path)` — create a directory
- `deleteDirectory(directory)` — delete a directory and all its contents
- `directorySize(directory?)` — total size of a directory in bytes
- `getVisibility(path)` / `setVisibility(path, visibility)` — per-file visibility (`'private'` | `'public'`)
- `url(path)` — public URL for a file
- `temporaryUrl(path, expiration, options?)` — signed/temporary URL (cloud drivers)
- `getMetadata(path)` — full file metadata (`path`, `size`, `lastModified`, `type`, `mimetype`, `extension`, `visibility`)
- `mimeType(path)` — MIME type string
- `initMultipartUpload` / `uploadPart` / `completeMultipartUpload` / `abortMultipartUpload` / `putFileMultipart` — chunked uploads for large files

#### Multiple Disks

- `storage.disk(name?)` — get a disk by name (default disk if omitted)
- `storage.diskByBucket(bucket)` — look up a disk by its bucket name
- `storage.cloud()` — shortcut for `storage.disk('main')`
- `storage.build(config)` — build a disk from config on-the-fly (not cached)
- `storage.extend(driver, factory)` — register a custom storage driver
- `storage.setDisk(name, disk)` — replace a disk instance at runtime

#### `PutOptions`

- `visibility`, `mimetype`, `metadata`, `filename`, `CacheControl`, `ContentDisposition`, `ContentEncoding`, `ContentLanguage`, `Expires`

#### Utilities (exported from package root)

- `generateUniqueFilename`, `sanitizePath`, `getContentType`, `getFileExtension`, `normalizePath`, `joinPaths`, `getDirectory`, `getFilename`, `isDirectory`, `parseS3Url`, `encodeS3Key`, `buildS3Url`, `streamToBuffer`, `streamToString`, `isStream`, `formatFileSize`, `visibilityToAcl`, `aclToVisibility`

#### Infrastructure

- GitHub Actions CI — runs tests on Node 18, 20, and 22 on every push
- Dual CJS + ESM + DTS build via `tsup`
- Full TypeScript declarations included
- 383 tests across all drivers and utilities

---

[0.1.1]: https://github.com/fozooni/nestjs-storage/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/fozooni/nestjs-storage/compare/v0.0.5...v0.1.0
[0.0.5]: https://github.com/fozooni/nestjs-storage/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/fozooni/nestjs-storage/compare/v0.0.31...v0.0.4
[0.0.31]: https://github.com/fozooni/nestjs-storage/compare/v0.0.3...v0.0.31
[0.0.3]: https://github.com/fozooni/nestjs-storage/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/fozooni/nestjs-storage/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/fozooni/nestjs-storage/releases/tag/v0.0.1
