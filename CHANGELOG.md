# Changelog

All notable changes to `@fozooni/nestjs-storage` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.0.4]: https://github.com/fozooni/nestjs-storage/compare/v0.0.31...v0.0.4
[0.0.31]: https://github.com/fozooni/nestjs-storage/compare/v0.0.3...v0.0.31
[0.0.3]: https://github.com/fozooni/nestjs-storage/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/fozooni/nestjs-storage/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/fozooni/nestjs-storage/releases/tag/v0.0.1
