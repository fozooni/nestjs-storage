# @fozooni/nestjs-storage

[![CI](https://github.com/fozooni/nestjs-storage/actions/workflows/ci.yml/badge.svg)](https://github.com/fozooni/nestjs-storage/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@fozooni/nestjs-storage.svg)](https://www.npmjs.com/package/@fozooni/nestjs-storage)
[![npm downloads](https://img.shields.io/npm/dt/@fozooni/nestjs-storage.svg)](https://www.npmjs.com/package/@fozooni/nestjs-storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful, driver-based storage module for NestJS with a unified API across Local filesystem, Amazon S3, Cloudflare R2, Google Cloud Storage, Azure Blob Storage, MinIO, Backblaze B2, DigitalOcean Spaces, and Wasabi. Featuring a full decorator stack for caching, retries, replication, CDN URLs, OpenTelemetry tracing, storage quotas, and more.

## Support

If you find this package useful, please consider giving it a star on [GitHub](https://github.com/fozooni/nestjs-storage). It helps others discover it and motivates further development!

## Compatibility

| @fozooni/nestjs-storage | NestJS   | Node.js    |
| ----------------------- | -------- | ---------- |
| `0.x`                   | 10 \| 11 | 18, 20, 22 |

> Tested on every push via [GitHub Actions CI](https://github.com/fozooni/nestjs-storage/actions/workflows/ci.yml) against Node 18, 20, and 22.

## Features

- **Unified API** — One interface (`FilesystemContract`) for all storage backends
- **9 Built-in Drivers** — Local, S3, R2 (Cloudflare), GCS (Google Cloud), Azure Blob Storage, MinIO, Backblaze B2, DigitalOcean Spaces, Wasabi
- **NestJS Dynamic Module** — `forRoot()` and `forRootAsync()` registration
- **Global Module** — Inject `StorageService` anywhere without importing
- **`@InjectDisk()` Decorator** — Inject specific disks directly into your services
- **Multiple Disks** — Configure and switch between multiple storage disks at runtime
- **Multipart Uploads** — Chunked uploads for large files on all drivers
- **Convenience Methods** — `missing()`, `json()`, `checksum()`, `deleteMany()` built-in
- **Streamable Downloads** — `getStreamableFile()` for NestJS controller responses
- **Health Checks** — `StorageHealthIndicator` for `@nestjs/terminus` integration
- **Testing Utilities** — `FakeDisk` in-memory driver and `StorageTestUtils` for tests
- **Custom Drivers** — Extend with your own storage driver via `extend()`
- **File Naming Strategies** — Pluggable filename generation: UUID, hash, date-path, or bring your own
- **StorageFileInterceptor** — Upload and store files in one step, bridging multer to your disk
- **File Validation Pipes** — `FileExtensionValidator` and `MagicBytesValidator` for `ParseFilePipe`
- **Storage Events** — Typed event hooks after put/delete/copy/move operations
- **Scoped Disks** — Path-prefixed disk instances for multi-tenancy (`storage.scope('users/123')`)
- **EncryptedDisk** — Transparent AES-256-GCM encryption decorator wrapping any disk
- **Presigned POST** — Direct browser-to-cloud uploads without proxying through NestJS
- **HMAC Signed URLs** — Secure temporary URLs for LocalDisk via `LocalSignedUrlMiddleware`
- **Typed Error Hierarchy** — `StorageError`, `StorageFileNotFoundError`, `StoragePermissionError`, and more
- **Audit Logging** — Pluggable `AuditSink` interface to record every storage operation
- **DiskDecorator Base** — Abstract base class for all disk decorators; eliminates passthrough boilerplate
- **CachedDisk** — In-memory (or custom) caching for read-heavy operations with per-method TTL
- **RetryDisk** — Full-jitter exponential backoff for transient failures with custom `retryOn` predicate
- **ReplicatedDisk** — `'all'`, `'quorum'`, or `'async'` write replication across multiple disks
- **CdnDisk** — CDN URL generation and CloudFront signed URL support
- **OtelDisk** — OpenTelemetry tracing (zero-overhead no-op when `@opentelemetry/api` is absent)
- **QuotaDisk** — Byte-level quota enforcement with pluggable `QuotaStore`
- **Config Validation** — `DiskConfigValidator` catches missing required fields at construction time
- **Temporary Files with TTL** — `putTemp()` + `StorageTempCleanupService` for expiring files
- **TypeScript Generics** — `getMetadata<T>()`, `json<T>(path, schema?)`, `S3FileMetadata`, `GcsFileMetadata`
- **Dual CJS/ESM** — Ships both CommonJS and ES modules with TypeScript declarations
- **Optional Peer Dependencies** — Only install the SDK you need
- **VersionedDisk** — Automatic file snapshots on every write; list/get/restore/delete versions
- **RouterDisk** — Content-aware routing: route by extension, prefix, MIME type, size, or custom predicate
- **Range Requests** — HTTP 206 partial content via `getRange()`, `serveRange()`, and `@RangeServe()` decorator
- **StorageMigrator** — Async-generator migration service with checksum verification, concurrency control, and dry-run
- **SSE Upload Progress** — RxJS `Subject`-based multipart upload progress tracking via `StorageUploadProgressService`
- **StorageArchiver** — Streaming ZIP and TAR archives across disks without buffering all content
- **Concurrent Write Protection** — Optimistic locking via `putIfMatch()` and `putIfNoneMatch()`

## Table of Contents

- [@fozooni/nestjs-storage](#fozooninestjs-storage)
  - [Support](#support)
  - [Compatibility](#compatibility)
  - [Features](#features)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
    - [Driver-specific dependencies](#driver-specific-dependencies)
  - [Quick Start](#quick-start)
  - [Module Registration](#module-registration)
    - [forRoot](#forroot)
    - [forRootAsync](#forrootasync)
      - [useFactory](#usefactory)
      - [useClass](#useclass)
      - [useExisting](#useexisting)
  - [Driver Configuration](#driver-configuration)
    - [Local Driver](#local-driver)
    - [S3 Driver](#s3-driver)
    - [R2 Driver (Cloudflare)](#r2-driver-cloudflare)
    - [GCS Driver (Google Cloud)](#gcs-driver-google-cloud)
    - [Azure Blob Storage Driver](#azure-blob-storage-driver)
    - [MinIO Driver](#minio-driver)
    - [Backblaze B2 Driver](#backblaze-b2-driver)
    - [DigitalOcean Spaces Driver](#digitalocean-spaces-driver)
    - [Wasabi Driver](#wasabi-driver)
  - [Usage](#usage)
    - [Injecting the Service](#injecting-the-service)
    - [Injecting a Specific Disk](#injecting-a-specific-disk)
    - [File Operations](#file-operations)
    - [Convenience Methods](#convenience-methods)
    - [Streaming Downloads](#streaming-downloads)
    - [Directory Operations](#directory-operations)
    - [Visibility](#visibility)
    - [URLs](#urls)
    - [Metadata](#metadata)
    - [Multipart Uploads](#multipart-uploads)
    - [Multiple Disks](#multiple-disks)
    - [Disk by Bucket](#disk-by-bucket)
    - [Custom Drivers](#custom-drivers)
  - [File Naming Strategies](#file-naming-strategies)
  - [StorageFileInterceptor](#storagefileinterceptor)
  - [File Validation Pipes](#file-validation-pipes)
  - [Storage Events](#storage-events)
  - [Scoped Disks](#scoped-disks)
  - [EncryptedDisk](#encrypteddisk)
  - [Presigned POST](#presigned-post)
  - [HMAC Signed URLs for LocalDisk](#hmac-signed-urls-for-localdisk)
  - [Typed Error Hierarchy](#typed-error-hierarchy)
  - [Audit Logging](#audit-logging)
  - [Decorator Disks](#decorator-disks)
    - [DiskDecorator — Abstract Base](#diskdecorator--abstract-base)
    - [CachedDisk](#cacheddisk)
    - [RetryDisk](#retrydisk)
    - [ReplicatedDisk](#replicateddisk)
    - [CdnDisk](#cdndisk)
    - [OtelDisk (OpenTelemetry)](#oteldisk-opentelemetry)
    - [QuotaDisk](#quotadisk)
  - [Config Validation](#config-validation)
  - [Temporary Files with TTL](#temporary-files-with-ttl)
  - [TypeScript Generics](#typescript-generics)
  - [Health Checks](#health-checks)
  - [File Versioning (VersionedDisk)](#file-versioning-versioneddisk)
  - [Storage Routing (RouterDisk)](#storage-routing-routerdisk)
  - [Range Requests / Partial Content](#range-requests--partial-content)
  - [Disk Migration (StorageMigrator)](#disk-migration-storagemigrator)
  - [SSE Upload Progress](#sse-upload-progress)
  - [Streaming Archives (StorageArchiver)](#streaming-archives-storagearchiver)
  - [Concurrent Write Protection](#concurrent-write-protection)
  - [Testing](#testing)
    - [Using FakeDisk](#using-fakedisk)
    - [StorageTestUtils](#storagetestutils)
    - [FakeDisk Assertion Methods](#fakedisk-assertion-methods)
    - [Manual Mocking](#manual-mocking)
  - [API Reference](#api-reference)
    - [StorageService](#storageservice)
    - [FilesystemContract](#filesystemcontract)
      - [Core Operations](#core-operations)
      - [Convenience Operations (optional per driver)](#convenience-operations-optional-per-driver)
      - [Directory Operations](#directory-operations-1)
      - [Visibility Operations](#visibility-operations)
      - [URL Operations](#url-operations)
      - [Metadata Operations](#metadata-operations)
      - [Multipart Upload Operations (optional per driver)](#multipart-upload-operations-optional-per-driver)
    - [Configuration Types](#configuration-types)
      - [`StorageModuleOptions`](#storagemoduleoptions)
      - [`DiskConfig`](#diskconfig)
      - [`PutOptions`](#putoptions)
      - [`GetOptions`](#getoptions)
      - [`TemporaryUrlOptions`](#temporaryurloptions)
      - [`MultipartUploadOptions`](#multipartuploadoptions)
      - [`FileMetadata`](#filemetadata)
    - [Utility Functions](#utility-functions)
  - [Upgrading from 0.0.1](#upgrading-from-001)
  - [Upgrading from 0.0.2](#upgrading-from-002)
  - [Upgrading from 0.0.3](#upgrading-from-003)
  - [Upgrading from 0.0.4](#upgrading-from-004)
  - [License](#license)

## Installation

```bash
# Using npm
npm install @fozooni/nestjs-storage

# Using pnpm
pnpm add @fozooni/nestjs-storage

# Using yarn
yarn add @fozooni/nestjs-storage
```

### Driver-specific dependencies

Install only the SDKs you need:

```bash
# For S3, R2, MinIO, B2, DigitalOcean Spaces, or Wasabi driver
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# For presigned POST (direct browser-to-cloud uploads) on S3/R2
npm install @aws-sdk/s3-presigned-post

# For GCS driver (also enables presigned POST on GCS)
npm install @google-cloud/storage

# For Azure Blob Storage driver
npm install @azure/storage-blob

# For CdnDisk with CloudFront signed URLs (optional)
npm install @aws-sdk/cloudfront-signer

# For OtelDisk (OpenTelemetry tracing, optional)
npm install @opentelemetry/api

# For json<T>() with Zod schema validation (optional)
npm install zod
```

## Quick Start

```typescript
import { Module } from '@nestjs/common';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'local',
      disks: {
        local: {
          driver: 'local',
          root: './storage',
        },
      },
    }),
  ],
})
export class AppModule {}
```

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class UploadService {
  constructor(private readonly storage: StorageService) {}

  async upload(filename: string, data: Buffer) {
    await this.storage.put(`uploads/${filename}`, data);
    return this.storage.url(`uploads/${filename}`);
  }
}
```

## Module Registration

### forRoot

Use `forRoot()` when your configuration is static:

```typescript
StorageModule.forRoot({
  default: 'local',
  disks: {
    local: {
      driver: 'local',
      root: './storage',
      url: 'http://localhost:3000/storage',
    },
    s3: {
      driver: 's3',
      bucket: 'my-bucket',
      region: 'us-east-1',
      key: process.env.AWS_ACCESS_KEY_ID,
      secret: process.env.AWS_SECRET_ACCESS_KEY,
    },
  },
});
```

### forRootAsync

Use `forRootAsync()` when you need to inject dependencies (e.g., `ConfigService`):

#### useFactory

```typescript
import { ConfigModule, ConfigService } from '@nestjs/config';

StorageModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({
    default: config.get('STORAGE_DEFAULT', 'local'),
    disks: {
      local: {
        driver: 'local',
        root: config.get('STORAGE_LOCAL_ROOT', './storage'),
      },
      s3: {
        driver: 's3',
        bucket: config.get('AWS_BUCKET'),
        region: config.get('AWS_REGION'),
        key: config.get('AWS_ACCESS_KEY_ID'),
        secret: config.get('AWS_SECRET_ACCESS_KEY'),
      },
    },
  }),
  inject: [ConfigService],
});
```

#### useClass

```typescript
import { Injectable } from '@nestjs/common';
import { StorageModuleOptionsFactory, StorageModuleOptions } from '@fozooni/nestjs-storage';

@Injectable()
class StorageOptionsFactory implements StorageModuleOptionsFactory {
  createStorageOptions(): StorageModuleOptions {
    return {
      default: 'local',
      disks: {
        local: { driver: 'local', root: './storage' },
      },
    };
  }
}

StorageModule.forRootAsync({
  useClass: StorageOptionsFactory,
});
```

#### useExisting

```typescript
StorageModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: StorageOptionsFactory,
});
```

## Driver Configuration

### Local Driver

Stores files on the local filesystem.

```typescript
{
  driver: 'local',
  root: './storage',       // Root directory (required)
  url: 'http://localhost:3000/storage',  // Base URL for file URLs (optional)
  visibility: 'private',  // Default visibility: 'private' | 'public' (optional)
  throw: true,             // Throw on errors (default: true) (optional)
}
```

**Notes:**

- Path traversal protection is built-in (prevents `../` escapes)
- File permissions: `public` = `0o644`, `private` = `0o600`
- Directory permissions: `public` = `0o755`, `private` = `0o700`
- Supports multipart uploads via local temp directory concatenation

### S3 Driver

Amazon S3 and S3-compatible storage.

```typescript
{
  driver: 's3',
  bucket: 'my-bucket',       // S3 bucket name (required)
  region: 'us-east-1',       // AWS region (required)
  key: 'AKIAIOSFODNN7',      // AWS access key (required)
  secret: 'wJalrXUtnFEMI',   // AWS secret key (required)
  endpoint: undefined,       // Custom endpoint for S3-compatible services (optional)
  use_path_style_endpoint: false,  // Use path-style URLs (optional)
  visibility: 'private',     // Default visibility (optional)
  url: undefined,             // Custom base URL (optional)
  throw: true,                // Throw on errors (optional)
}
```

**Notes:**

- Visibility uses S3 ACLs (`public-read` / `private`)
- Multipart uploads use the native S3 multipart API
- Default chunk size: 5 MB (configurable)
- Signed URLs via `@aws-sdk/s3-request-presigner`

### R2 Driver (Cloudflare)

Cloudflare R2 object storage. Extends S3Disk internally.

```typescript
{
  driver: 'r2',
  bucket: 'my-bucket',       // R2 bucket name (required)
  accountId: 'abc123',       // Cloudflare account ID (required)
  key: 'access-key-id',      // R2 access key (required)
  secret: 'secret-key',      // R2 secret key (required)
  region: 'auto',            // Always 'auto' for R2 (optional, defaults to 'auto')
  url: 'https://cdn.example.com',  // Custom domain for public URLs (optional)
  throw: true,               // Throw on errors (optional)
}
```

**Notes:**

- Endpoint is auto-configured to `https://{accountId}.r2.cloudflarestorage.com`
- Visibility is always `private` — `setVisibility()` throws an error (R2 does not support per-object ACLs)
- `url()` requires `config.url` to be set (R2 has no default public URL)
- All other operations inherit from S3Disk

### GCS Driver (Google Cloud)

Google Cloud Storage.

```typescript
{
  driver: 'gcs',
  bucket: 'my-bucket',         // GCS bucket name (required)
  projectId: 'my-project',     // Google Cloud project ID (required)
  keyFilename: '/path/to/keyfile.json',  // Path to service account key (optional)
  credentials: { ... },        // Service account credentials object (optional)
  visibility: 'private',       // Default visibility (optional)
  url: undefined,               // Custom base URL (optional)
  throw: true,                  // Throw on errors (optional)
}
```

**Notes:**

- Uses `@google-cloud/storage` SDK
- Authentication via `keyFilename`, `credentials` object, or Application Default Credentials (ADC)
- Multipart uploads use the GCS compose API (batches of 32 objects max, automatically handled)
- Signed URLs via `file.getSignedUrl()`

### Azure Blob Storage Driver

Microsoft Azure Blob Storage. Requires `@azure/storage-blob`.

```typescript
{
  driver: 'azure',
  accountName: 'myaccount',     // Storage account name (required)
  accountKey: 'base64key==',    // Shared key — use this OR sasToken (not both)
  sasToken: 'sv=2021&...',      // SAS token — alternative to accountKey (optional)
  containerName: 'uploads',     // Container name (required; falls back to bucket)
  url: undefined,               // Custom base URL (optional)
  throw: true,                  // Throw on errors (optional)
}
```

**Notes:**

- Requires `@azure/storage-blob` to be installed (`npm install @azure/storage-blob`)
- Authentication: either `accountKey` (SharedKey) or `sasToken`
- `temporaryUrl()` and `presignedPost()` require `accountKey`; they are not supported with `sasToken`
- Per-blob visibility is not supported — visibility is controlled at the container level
- `setVisibility()` throws `StoragePermissionError`; `getVisibility()` always returns `'private'`
- Multipart uploads use the Azure Block Blob API (`stageBlock` / `commitBlockList`)

### MinIO Driver

MinIO object storage. Extends `S3Disk` with path-style URLs.

```typescript
{
  driver: 'minio',
  endpoint: 'http://localhost:9000',  // MinIO endpoint URL (required)
  bucket: 'my-bucket',                // Bucket name (required)
  key: 'minioadmin',                  // Access key (required)
  secret: 'minioadmin',               // Secret key (required)
  region: 'us-east-1',               // Region (optional; defaults to 'us-east-1')
  url: undefined,                     // Custom base URL for public files (optional)
  throw: true,                        // Throw on errors (optional)
}
```

**Notes:**

- Endpoint is required. All S3Disk features (presignedPost, temporaryUrl, multipart) are supported
- URLs are path-style: `http(s)://endpoint/bucket/key`

### Backblaze B2 Driver

Backblaze B2 via B2's S3-compatible endpoint. Extends `S3Disk`.

```typescript
{
  driver: 'b2',
  bucket: 'my-bucket',        // B2 bucket name (required)
  region: 'us-west-004',      // B2 region (required; e.g. 'us-west-004')
  key: '<keyId>',             // B2 application key ID (required)
  secret: '<appKey>',         // B2 application key (required)
  endpoint: undefined,        // Auto-configured; override if needed (optional)
  url: undefined,             // Custom CDN URL (optional)
  throw: true,
}
```

**Notes:**

- Endpoint auto-configured to `https://s3.{region}.backblazeb2.com`
- Public URL uses the B2 friendly pattern: `https://f002.backblazeb2.com/file/{bucket}/{key}`
- B2 does not support per-object ACLs

### DigitalOcean Spaces Driver

DigitalOcean Spaces via the Spaces S3-compatible API. Extends `S3Disk`.

```typescript
{
  driver: 'digitalocean',
  bucket: 'my-space',       // Space name (required)
  region: 'nyc3',           // Region (required; e.g. 'nyc3', 'sfo3', 'ams3')
  key: '<accessKey>',       // Spaces access key (required)
  secret: '<secretKey>',    // Spaces secret key (required)
  endpoint: undefined,      // Auto-configured; override if needed (optional)
  url: undefined,           // Custom CDN URL (optional)
  throw: true,
}
```

**Notes:**

- Endpoint auto-configured to `https://{region}.digitaloceanspaces.com`
- Virtual-hosted URL: `https://{bucket}.{region}.digitaloceanspaces.com/{key}`

### Wasabi Driver

Wasabi cloud storage via Wasabi's S3-compatible endpoint. Extends `S3Disk`.

```typescript
{
  driver: 'wasabi',
  bucket: 'my-bucket',      // Bucket name (required)
  region: 'us-east-1',      // Region (required)
  key: '<accessKey>',       // Access key (required)
  secret: '<secretKey>',    // Secret key (required)
  endpoint: undefined,      // Auto-configured; override if needed (optional)
  url: undefined,           // Custom CDN URL (optional)
  throw: true,
}
```

**Notes:**

- Endpoint auto-configured to `https://s3.{region}.wasabisys.com`
- URL pattern: `https://s3.{region}.wasabisys.com/{bucket}/{key}`

## Usage

### Injecting the Service

There are two ways to inject `StorageService`:

```typescript
// Standard constructor injection
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(private readonly storage: StorageService) {}
}

// Using the @InjectStorage() decorator
import { InjectStorage, StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(@InjectStorage() private readonly storage: StorageService) {}
}
```

### Injecting a Specific Disk

Use `@InjectDisk()` to inject a specific disk directly, without going through `StorageService`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectDisk, FilesystemContract } from '@fozooni/nestjs-storage';

@Injectable()
export class PhotoService {
  constructor(
    @InjectDisk('s3') private readonly s3: FilesystemContract,
    @InjectDisk('local') private readonly local: FilesystemContract,
  ) {}

  async upload(data: Buffer) {
    // Write directly to S3
    await this.s3.put('photos/image.jpg', data);

    // Also save a local backup
    await this.local.put('backups/image.jpg', data);
  }
}
```

**With `forRoot()`** — Disk providers are auto-registered for all configured disk names.

**With `forRootAsync()`** — Specify which disks to register via `injectDisks`:

```typescript
StorageModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({ ... }),
  inject: [ConfigService],
  injectDisks: ['s3', 'local', 'gcs'],
});
```

### File Operations

All methods below operate on the **default disk** unless you call `storage.disk('name')` first.

```typescript
// Check if a file exists
const exists: boolean = await storage.exists('photos/avatar.jpg');

// Read a file
const buffer: Buffer = await storage.get('photos/avatar.jpg');
const text: string = await storage.get('file.txt', { responseType: 'string' });
const stream: ReadableStream = await storage.get('video.mp4', { responseType: 'stream' });

// Write a file
await storage.put('photos/avatar.jpg', imageBuffer);
await storage.put('notes.txt', 'Hello world');
await storage.put('data.json', jsonString, {
  visibility: 'public',
  mimetype: 'application/json',
  CacheControl: 'max-age=31536000',
  metadata: { uploadedBy: 'user-123' },
});

// Upload a file (auto-generates a unique filename)
const path = await storage.putFile('uploads', multerFile);
// => 'uploads/photo_1678901234_a1b2c3d4e5f6.jpg'

// Upload a file with a custom name
const path = await storage.putFileAs('uploads', fileBuffer, 'avatar.jpg');
// => 'uploads/avatar.jpg'

// Delete a file
await storage.delete('photos/old-avatar.jpg');

// Copy a file
await storage.copy('photos/avatar.jpg', 'backups/avatar.jpg');

// Move / rename a file
await storage.move('temp/upload.jpg', 'photos/avatar.jpg');

// Get file size (in bytes)
const bytes: number = await storage.size('photos/avatar.jpg');

// Get last modified timestamp
const timestamp: number = await storage.lastModified('photos/avatar.jpg');

// Prepend content to a file
await storage.prepend('log.txt', 'New first line\n');

// Append content to a file
await storage.append('log.txt', 'New last line\n');
```

### Convenience Methods

```typescript
// Check if a file is missing (inverse of exists)
const isMissing: boolean = await storage.missing('file.txt');

// Read and parse a JSON file
const data = await storage.json<{ name: string }>('config.json');

// Compute a file checksum
const md5 = await storage.checksum('file.txt'); // default: md5
const sha256 = await storage.checksum('file.txt', 'sha256'); // 'md5' | 'sha1' | 'sha256'

// Delete multiple files at once
const result = await storage.deleteMany(['old1.txt', 'old2.txt', 'old3.txt']);
console.log(result.succeeded); // ['old1.txt', 'old2.txt', 'old3.txt']
console.log(result.failed);    // []
```

### Streaming Downloads

Return a `StreamableFile` ready for NestJS controller responses:

```typescript
import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get(':path')
  async download(@Param('path') path: string): Promise<StreamableFile> {
    return this.storage.getStreamableFile(path);
    // Sets Content-Type, Content-Length, Content-Disposition automatically
  }

  @Get(':path/preview')
  async preview(@Param('path') path: string): Promise<StreamableFile> {
    return this.storage.getStreamableFile(path, {
      disposition: 'inline', // Display in browser instead of downloading
    });
  }

  @Get(':path/download')
  async downloadAs(@Param('path') path: string): Promise<StreamableFile> {
    return this.storage.getStreamableFile(path, {
      filename: 'custom-name.pdf', // Override download filename
      disposition: 'attachment',
    });
  }
}
```

### Directory Operations

```typescript
// List files in a directory
const files: string[] = await storage.files('uploads');

// List files recursively
const allFiles: string[] = await storage.files('uploads', true);
// or
const allFiles: string[] = await storage.allFiles('uploads');

// List directories
const dirs: string[] = await storage.directories('uploads');

// List directories recursively
const allDirs: string[] = await storage.directories('uploads', true);
// or
const allDirs: string[] = await storage.allDirectories('uploads');

// Create a directory
await storage.makeDirectory('uploads/photos');

// Delete a directory (and all its contents)
await storage.deleteDirectory('uploads/temp');

// Get total size of a directory
const totalBytes: number = await storage.directorySize('uploads');
```

### Visibility

```typescript
// Get file visibility
const visibility: 'private' | 'public' = await storage.getVisibility('file.txt');

// Set file visibility
await storage.setVisibility('file.txt', 'public');

// Set visibility when writing
await storage.put('file.txt', data, { visibility: 'public' });
```

**Driver-specific behavior:**

| Driver | Public            | Private          | Notes                    |
| ------ | ----------------- | ---------------- | ------------------------ |
| Local  | `0o644`           | `0o600`          | Uses file permissions    |
| S3     | `public-read` ACL | `private` ACL    | Uses S3 ACLs             |
| R2     | N/A               | Always `private` | `setVisibility()` throws |
| GCS    | `makePublic()`    | `makePrivate()`  | Uses GCS IAM             |

### URLs

```typescript
// Get the public URL of a file
const url: string = storage.url('photos/avatar.jpg');
// Local:  'http://localhost:3000/storage/photos/avatar.jpg'
// S3:     'https://bucket.s3.us-east-1.amazonaws.com/photos/avatar.jpg'
// R2:     'https://cdn.example.com/photos/avatar.jpg' (requires config.url)
// GCS:    'https://storage.googleapis.com/bucket/photos/avatar.jpg'

// Get a temporary signed URL (cloud drivers)
const signedUrl: string = await storage.temporaryUrl(
  'photos/avatar.jpg',
  new Date(Date.now() + 3600 * 1000), // Expires in 1 hour
  { method: 'GET' },
);
```

### Metadata

```typescript
// Get file metadata
const metadata = await storage.getMetadata('photos/avatar.jpg');
// => { path, size, lastModified, type, mimetype, extension, visibility, ... }

// Get MIME type
const mime: string = await storage.mimeType('photos/avatar.jpg');
// => 'image/jpeg'
```

### Multipart Uploads

For large files, use multipart uploads which split the file into chunks:

```typescript
// Simple: Upload a large file with automatic chunking
const path = await storage.putFileMultipart('uploads', largeFile, {
  chunkSize: 10 * 1024 * 1024, // 10 MB chunks
  onProgress: (uploaded, total) => {
    console.log(`${Math.round((uploaded / total) * 100)}%`);
  },
});

// Advanced: Manual multipart upload control
const { uploadId, key } = await storage.initMultipartUpload('uploads/large-file.zip');

const parts = [];
for (let i = 0; i < chunks.length; i++) {
  const part = await storage.uploadPart(uploadId, i + 1, chunks[i], key);
  parts.push(part);
}

await storage.completeMultipartUpload(uploadId, key, parts);

// Or abort if needed
await storage.abortMultipartUpload(uploadId, key);
```

### Multiple Disks

Switch between configured disks at runtime:

```typescript
// Use the default disk
await storage.put('file.txt', 'data');

// Use a specific disk
await storage.disk('s3').put('file.txt', 'data');
await storage.disk('gcs').put('backup.txt', 'data');

// Use the 'main' cloud disk
await storage.cloud().put('file.txt', 'data');

// Build a disk from config on-the-fly (not cached)
const tempDisk = storage.build({
  driver: 's3',
  bucket: 'temp-bucket',
  region: 'eu-west-1',
  key: '...',
  secret: '...',
});
await tempDisk.put('file.txt', 'data');
```

### Disk by Bucket

Look up a disk by its bucket name:

```typescript
const disk = storage.diskByBucket('my-s3-bucket');
await disk.put('file.txt', 'data');
```

### Custom Drivers

Register your own storage driver:

```typescript
import { FilesystemContract, DiskConfig } from '@fozooni/nestjs-storage';

class MyCustomDisk implements FilesystemContract {
  constructor(private config: DiskConfig) {}
  // ... implement all FilesystemContract methods
}

// Register the driver
storage.extend('custom', (config: DiskConfig) => new MyCustomDisk(config));

// Use it in your config
StorageModule.forRoot({
  default: 'my-storage',
  disks: {
    'my-storage': {
      driver: 'custom',
      // ... your custom config
    },
  },
});
```

## File Naming Strategies

Control how filenames are generated when calling `putFile()`. Pass a `namingStrategy` option or set a default per disk:

```typescript
import {
  UuidNamingStrategy,
  HashNamingStrategy,
  DatePathNamingStrategy,
  OriginalNamingStrategy,
} from '@fozooni/nestjs-storage';

// UUID — randomUUID() + original extension
await storage.putFile('uploads', file, { namingStrategy: new UuidNamingStrategy() });
// => 'uploads/550e8400-e29b-41d4-a716-446655440000.jpg'

// Hash — MD5 of file content + extension
await storage.putFile('uploads', file, { namingStrategy: new HashNamingStrategy() });
// => 'uploads/d8e8fca2dc0f896fd7cb4cb0031ba249.jpg'

// Date path — YYYY/MM/DD/uuid + extension
await storage.putFile('uploads', file, { namingStrategy: new DatePathNamingStrategy() });
// => 'uploads/2026/03/16/550e8400-e29b-41d4-a716-446655440000.jpg'

// Original — keeps the original filename unchanged
await storage.putFile('uploads', file, { namingStrategy: new OriginalNamingStrategy() });
// => 'uploads/photo.jpg'
```

**Set a disk-level default** in your config:

```typescript
StorageModule.forRoot({
  default: 's3',
  disks: {
    s3: {
      driver: 's3',
      bucket: 'my-bucket',
      region: 'us-east-1',
      key: process.env.AWS_ACCESS_KEY_ID,
      secret: process.env.AWS_SECRET_ACCESS_KEY,
      namingStrategy: new UuidNamingStrategy(), // default for this disk
    },
  },
});
```

**Custom strategy** — implement the `NamingStrategy` interface:

```typescript
import { NamingStrategy } from '@fozooni/nestjs-storage';

class SlugNamingStrategy implements NamingStrategy {
  generate(file: Express.Multer.File, originalName: string): string {
    const ext = path.extname(originalName);
    const slug = originalName.replace(ext, '').toLowerCase().replace(/\s+/g, '-');
    return `${slug}-${Date.now()}${ext}`;
  }
}
```

## StorageFileInterceptor

Upload a file and store it to a disk in a single step, without manually handling multer:

```bash
npm install multer
npm install -D @types/multer
```

```typescript
import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import {
  StorageFileInterceptor,
  StorageFilesInterceptor,
  StoredFile,
} from '@fozooni/nestjs-storage';

@Controller('upload')
export class UploadController {
  // Single file upload
  @Post('avatar')
  @UseInterceptors(
    StorageFileInterceptor('avatar', {
      disk: 's3',           // Optional: disk to use (default disk if omitted)
      path: 'avatars',      // Optional: storage directory
      namingStrategy: new UuidNamingStrategy(), // Optional (default: UuidNamingStrategy)
      limits: { fileSize: 5 * 1024 * 1024 },   // Optional: 5 MB limit
    }),
  )
  uploadAvatar(@UploadedFile() file: StoredFile) {
    return { url: file.url, path: file.path };
  }

  // Multiple files upload
  @Post('gallery')
  @UseInterceptors(
    StorageFilesInterceptor('photos', 10, { // up to 10 files
      disk: 's3',
      path: 'gallery',
    }),
  )
  uploadGallery(@UploadedFile() files: StoredFile[]) {
    return files.map((f) => ({ url: f.url, path: f.path }));
  }
}
```

The `StoredFile` object returned on `req.file` / `req.files`:

```typescript
interface StoredFile {
  path: string;        // Storage path, e.g. 'avatars/uuid.jpg'
  url: string;         // Public URL from disk.url(path)
  size: number;        // File size in bytes
  mimetype: string;    // MIME type
  originalname: string; // Original filename
  disk: string;        // Disk name used ('default' if none specified)
}
```

## File Validation Pipes

Use with NestJS's `ParseFilePipe` to validate uploaded files:

```typescript
import { FileExtensionValidator, MagicBytesValidator } from '@fozooni/nestjs-storage';
import { ParseFilePipe, UploadedFile } from '@nestjs/common';

@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async upload(
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        // Allow only these extensions (case-insensitive)
        new FileExtensionValidator({ allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif'] }),

        // Verify actual file contents via magic bytes (prevents extension spoofing)
        new MagicBytesValidator({ allowedTypes: ['image/jpeg', 'image/png', 'image/gif'] }),
      ],
    }),
  )
  file: Express.Multer.File,
) { ... }
```

**`FileExtensionValidator`** — Checks the file extension from `originalname` against a whitelist. Extensions are matched case-insensitively. Leading dot is optional: `'.jpg'` and `'jpg'` both work.

**`MagicBytesValidator`** — Reads the first bytes of `file.buffer` and compares against a built-in signatures map. No external dependencies. Supported types include:

| Magic bytes | Type |
|-------------|------|
| `ffd8ff` | `image/jpeg` |
| `89504e47` | `image/png` |
| `47494638` | `image/gif` |
| `25504446` | `application/pdf` |
| `504b0304` | `application/zip` |
| `52494646` | `image/webp` |
| `424d` | `image/bmp` |
| `00000100` | `image/x-icon` |

## Storage Events

Subscribe to typed events after file operations — useful for audit logs, CDN invalidation, or triggering downstream processes:

```typescript
import { StorageEvents, StorageEventsService } from '@fozooni/nestjs-storage';

// Inject StorageEventsService
@Injectable()
export class AuditService {
  constructor(private readonly storageEvents: StorageEventsService) {
    this.storageEvents.on(StorageEvents.PUT, (event) => {
      console.log(`File stored: ${event.disk}/${event.path} at ${event.timestamp}`);
    });

    this.storageEvents.on(StorageEvents.DELETE, (event) => {
      console.log(`File deleted: ${event.disk}/${event.path}`);
    });

    // One-time listener
    this.storageEvents.once(StorageEvents.COPY, (event) => {
      console.log(`Copied: ${event.from} → ${event.to}`);
    });
  }
}
```

Or access events via `storageService.events`:

```typescript
storageService.events.on(StorageEvents.PUT, (event) => { ... });
storageService.events.off(StorageEvents.PUT, handler);
```

**Available events and payloads:**

| Event constant | Emitted after | Payload fields |
|---|---|---|
| `StorageEvents.PUT` | `put()` | `disk`, `path`, `timestamp` |
| `StorageEvents.PUT_FILE` | `putFile()` | `disk`, `path`, `originalname`, `timestamp` |
| `StorageEvents.DELETE` | `delete()` | `disk`, `path`, `timestamp` |
| `StorageEvents.COPY` | `copy()` | `disk`, `from`, `to`, `timestamp` |
| `StorageEvents.MOVE` | `move()` | `disk`, `from`, `to`, `timestamp` |
| `StorageEvents.DELETE_MANY` | `deleteMany()` | `disk`, `succeeded`, `failed`, `timestamp` |

`StorageEventsService` is exported from `StorageModule` — inject it directly in your services.

**Optional `@nestjs/event-emitter` bridge**: If you have `EventEmitter2` configured, events will also flow through it automatically (zero config).

## Scoped Disks

Create a path-prefixed disk instance for multi-tenancy or per-user isolation:

```typescript
// From StorageService
const userDisk = storageService.scope(`users/${userId}`);
const userDisk = storageService.scope(`users/${userId}`, 's3'); // specific disk

// From an injected disk
const userDisk = s3Disk.scope(`users/${userId}`);

// All operations are transparently prefixed
await userDisk.put('avatar.jpg', buffer);        // writes to: users/123/avatar.jpg
await userDisk.get('avatar.jpg');                 // reads from: users/123/avatar.jpg
await userDisk.delete('avatar.jpg');              // deletes: users/123/avatar.jpg
const files = await userDisk.files();             // lists files under users/123/ (prefix stripped)

// Nested scopes
const orgDisk = storageService.scope('org/acme');
const teamDisk = orgDisk.scope('team/eng');       // prefix: org/acme/team/eng
```

`ScopedDisk` implements the full `FilesystemContract` — every method works as expected, paths are prepended transparently, and listed paths have the prefix stripped so callers see relative paths.

## EncryptedDisk

`EncryptedDisk` is a decorator that transparently encrypts every file written to any underlying disk and decrypts every file read from it. It uses **AES-256-GCM** (authenticated encryption) with a random 12-byte IV stored alongside each blob.

### Setup

Use `StorageService.encrypted(diskName, { key })` to wrap any configured disk:

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class SecureFileService {
  constructor(private readonly storage: StorageService) {}

  private get enc() {
    return this.storage.encrypted('local', {
      key: process.env.ENCRYPTION_KEY, // 64-character hex string = 32 bytes
    });
  }

  async store(filename: string, data: Buffer) {
    await this.enc.put(`secrets/${filename}`, data);
  }

  async retrieve(filename: string): Promise<Buffer> {
    return this.enc.get(`secrets/${filename}`) as Promise<Buffer>;
  }
}
```

### Key Format

The key must be exactly **32 bytes** for AES-256-GCM. Pass it as:

- A **64-character hex string** (e.g. `process.env.ENCRYPTION_KEY`) — parsed via `Buffer.from(key, 'hex')`
- A **`Buffer`** of length 32

```bash
# Generate a 32-byte key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Notes

- Blob layout: `[IV (12 bytes)] + [AuthTag (16 bytes)] + [Ciphertext]`
- `size()` reports the **plaintext** length (ciphertext overhead stripped)
- `copy()` decrypts then re-encrypts at the destination (no cross-key copies)
- `presignedPost()` is **not supported** on `EncryptedDisk` — direct uploads would bypass encryption

## Presigned POST

Presigned POST allows clients (e.g. browsers) to upload files **directly to cloud storage** without routing through your NestJS server. Supported on S3, R2, and GCS.

### Generating a Presigned POST Policy

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class UploadService {
  constructor(private readonly storage: StorageService) {}

  async getUploadPolicy(filename: string) {
    const disk = this.storage.disk(); // or .disk('s3')
    return disk.presignedPost(`uploads/${filename}`, {
      expires: 3600,            // Policy valid for 1 hour (default: 3600)
      maxSize: 10 * 1024 * 1024, // Max 10 MB
      allowedMimeTypes: ['image/jpeg', 'image/png'],
    });
    // Returns: { url: string, fields: Record<string, string> }
  }
}
```

### Using the Policy in a Browser

```html
<form action="{{ policy.url }}" method="POST" enctype="multipart/form-data">
  <!-- Inject all fields as hidden inputs -->
  <input type="hidden" name="key" value="{{ policy.fields.key }}" />
  <!-- ...repeat for each field... -->
  <input type="file" name="file" />
  <button type="submit">Upload</button>
</form>
```

### Notes

- S3/R2: requires `@aws-sdk/s3-presigned-post` (`npm install @aws-sdk/s3-presigned-post`)
- GCS: requires `@google-cloud/storage` (already used by the GCS driver)
- Azure: uses SAS-based PUT URL (not a POST policy). The returned `fields` contain required headers (`x-ms-blob-type: BlockBlob`)
- `EncryptedDisk` does **not** support `presignedPost` — direct uploads bypass encryption

## HMAC Signed URLs for LocalDisk

By default, `LocalDisk.temporaryUrl()` emits a warning and returns an unsigned URL. Enable real HMAC-SHA256 signed URLs by setting `signSecret` in the disk config.

### Configuration

```typescript
StorageModule.forRoot({
  default: 'local',
  disks: {
    local: {
      driver: 'local',
      root: './storage',
      url: 'http://localhost:3000/files',  // Base URL prepended to signed URLs
      signSecret: process.env.LOCAL_SIGN_SECRET,  // 32+ character secret
    },
  },
});
```

### Generated URL Format

```
http://localhost:3000/files/uploads/photo.jpg?expires=1735689600&signature=<hmac-sha256-hex>
```

### Verifying Signatures with `LocalSignedUrlMiddleware`

Mount the middleware on the routes that serve local files:

```typescript
import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { LocalSignedUrlMiddleware } from '@fozooni/nestjs-storage';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(new LocalSignedUrlMiddleware(process.env.LOCAL_SIGN_SECRET))
      .forRoutes({ path: '/files/*', method: RequestMethod.GET });
  }
}
```

The middleware returns **403** for:
- Missing `expires` or `signature` query parameters
- Expired URLs (`Date.now() / 1000 > expires`)
- Invalid HMAC signature (timing-safe comparison via `crypto.timingSafeEqual`)

## Typed Error Hierarchy

All drivers throw typed errors that extend the base `StorageError` class. Catch specific subtypes for fine-grained error handling:

```typescript
import {
  StorageError,
  StorageFileNotFoundError,
  StoragePermissionError,
  StorageNetworkError,
  StorageConfigurationError,
  StorageQuotaExceededError,
} from '@fozooni/nestjs-storage';

try {
  await storage.get('missing.txt');
} catch (e) {
  if (e instanceof StorageFileNotFoundError) {
    throw new NotFoundException('File not found');
  }
  if (e instanceof StoragePermissionError) {
    throw new ForbiddenException('Access denied');
  }
  if (e instanceof StorageNetworkError) {
    // Safe to retry with back-off
    throw new ServiceUnavailableException('Storage unavailable, please retry');
  }
  if (e instanceof StorageError) {
    // Any other storage error
    throw new InternalServerErrorException('Storage error');
  }
}
```

### Error Class Reference

| Class | `instanceof StorageError` | When thrown |
|---|---|---|
| `StorageError` | ✅ (base) | Never thrown directly |
| `StorageFileNotFoundError` | ✅ | File/directory not found (HTTP 404) |
| `StoragePermissionError` | ✅ | Access denied, unsupported operation (HTTP 403) |
| `StorageNetworkError` | ✅ | Transient network or 5xx errors — safe to retry |
| `StorageConfigurationError` | ✅ | Missing required config, optional peer not installed |
| `StorageQuotaExceededError` | ✅ | Write would exceed storage quota |

Every error carries optional `disk`, `path`, and `cause` fields:

```typescript
catch (e) {
  if (e instanceof StorageError) {
    console.error(`[${e.disk}] ${e.name} on path ${e.path}: ${e.message}`);
    if (e.cause) console.error('Caused by:', e.cause);
  }
}
```

## Audit Logging

Enable audit logging by setting `auditLog: true` in the module options:

```typescript
StorageModule.forRoot({
  auditLog: true,
  default: 'local',
  disks: { ... },
});
```

This registers `StorageAuditService`, which logs every `put`, `putFile`, `delete`, `copy`, `move`, and `deleteMany` call via NestJS `Logger`.

### Custom Audit Sink

Inject `StorageAuditService` and register your own sink (e.g. a database logger):

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { StorageAuditService, AuditSink, AuditEntry } from '@fozooni/nestjs-storage';

@Injectable()
class DatabaseAuditSink implements AuditSink {
  log(entry: AuditEntry): void {
    // e.g. save to your audit_log table
    this.db.auditLog.create({ data: entry });
  }
}

@Injectable()
export class AppSetup implements OnModuleInit {
  constructor(
    private readonly audit: StorageAuditService,
    private readonly dbSink: DatabaseAuditSink,
  ) {}

  onModuleInit() {
    this.audit.addSink(this.dbSink);
  }
}
```

### `AuditEntry` Fields

| Field | Type | Description |
|---|---|---|
| `operation` | `string` | `'put'`, `'putFile'`, `'delete'`, `'copy'`, `'move'`, `'deleteMany'` |
| `disk` | `string` | Name of the disk (e.g. `'local'`, `'s3'`) |
| `path` | `string?` | File path involved (omitted for `deleteMany`) |
| `userId` | `string?` | Optional user ID (set by you if needed) |
| `ip` | `string?` | Optional client IP (set by you if needed) |
| `timestamp` | `Date` | When the operation occurred |
| `success` | `boolean` | Whether the operation succeeded |
| `error` | `string?` | Error message if `success === false` |

## Decorator Disks

v0.0.5 introduces a decorator stack — composable wrappers that add behaviour to any `FilesystemContract` without changing the underlying driver.

### DiskDecorator — Abstract Base

`DiskDecorator` is the abstract base that all built-in decorator disks extend. It auto-delegates every `FilesystemContract` method to the wrapped inner disk so subclasses only need to override the methods they transform.

```typescript
import { DiskDecorator, FilesystemContract } from '@fozooni/nestjs-storage';

export class LoggingDisk extends DiskDecorator {
  override async put(path, contents, options?) {
    console.log(`put → ${path}`);
    return super.put(path, contents, options);
  }
}

const loggingDisk = new LoggingDisk(storage.disk('s3'));
```

### CachedDisk

`CachedDisk` caches read-heavy operations — `exists`, `size`, `lastModified`, `mimeType`, `getMetadata`, and `getVisibility` — and automatically invalidates the cache on every write.

```typescript
// Via StorageService factory
const cached = storage.cached('s3', {
  ttl: 60_000, // 60 seconds default TTL
  ttlByMethod: {
    exists: 5_000,      // check freshness more often
    getMetadata: 30_000,
  },
});

await cached.exists('photo.jpg');  // → hits S3
await cached.exists('photo.jpg');  // → served from cache
await cached.put('photo.jpg', buffer); // → cache invalidated
await cached.exists('photo.jpg');  // → hits S3 again
```

**Custom cache backend** (e.g. Redis):

```typescript
import { CacheBackend, CachedDisk } from '@fozooni/nestjs-storage';

class RedisCache implements CacheBackend {
  get<T>(key: string): T | undefined { /* ... */ }
  set<T>(key: string, value: T, ttlMs?: number): void { /* ... */ }
  del(key: string): void { /* ... */ }
  clear(): void { /* ... */ }
}

const cached = storage.cached('s3', { backend: new RedisCache() });
```

### RetryDisk

`RetryDisk` wraps a disk with full-jitter exponential backoff. It retries on `StorageNetworkError` and skips non-retryable errors (`StorageFileNotFoundError`, `StoragePermissionError`, `StorageConfigurationError`).

```typescript
const retryable = storage.withRetry('s3', {
  maxRetries: 3,      // default
  baseDelay: 100,     // ms
  maxDelay: 10_000,   // ms
  factor: 2,          // backoff multiplier
  jitter: true,       // full-jitter (default)
});

// Optionally, subscribe to retry events
storageEvents.on(StorageEvents.RETRY, (event) => {
  logger.warn(`Retrying ${event.operation} (attempt ${event.attempt}/${event.maxRetries})`);
});
```

**Custom retry predicate:**

```typescript
const disk = storage.withRetry('s3', {
  retryOn: (err) => err instanceof StorageNetworkError || (err as any).code === 'ECONNRESET',
});
```

### ReplicatedDisk

`ReplicatedDisk` propagates writes to multiple replica disks. Reads are always served from the primary.

```typescript
const r2Disk = storage.disk('r2');
const backupDisk = storage.disk('b2');

const replicated = storage.replicated('s3', [r2Disk, backupDisk], {
  strategy: 'all', // 'all' | 'quorum' | 'async'
});

await replicated.put('file.txt', 'hello'); // written to s3 + r2 + b2
await replicated.get('file.txt');          // read from s3 only
```

| Strategy | Behaviour |
|---|---|
| `'all'` (default) | All replicas must succeed (`Promise.all`). Fails if any replica fails. |
| `'quorum'` | Majority must succeed. Individual replica failures tolerated. |
| `'async'` | Fire-and-forget replication. Returns as soon as primary succeeds. |

### CdnDisk

`CdnDisk` overrides `url()` and `temporaryUrl()` to return CDN-prefixed URLs.

**Automatic via config:**

```typescript
StorageModule.forRoot({
  disks: {
    s3: {
      driver: 's3',
      bucket: 'my-bucket',
      region: 'us-east-1',
      cdn: {
        baseUrl: 'https://cdn.example.com',
        provider: 'cloudfront',       // or 'generic'
        signingKeyId: 'KEYID',        // CloudFront only
        signingKey: 'PRIVATE_KEY_PEM', // CloudFront only
      },
    },
  },
});
```

When `cdn` is set on a disk config, `StorageService.disk()` automatically wraps the disk in `CdnDisk`.

**Manual wrapping:**

```typescript
import { CdnDisk } from '@fozooni/nestjs-storage';

const cdnDisk = new CdnDisk(storage.disk('s3'), {
  baseUrl: 'https://cdn.example.com',
});
cdnDisk.url('images/photo.jpg'); // → 'https://cdn.example.com/images/photo.jpg'
```

CloudFront signed URLs require `@aws-sdk/cloudfront-signer` (optional peer):

```bash
npm install @aws-sdk/cloudfront-signer
```

### OtelDisk (OpenTelemetry)

`OtelDisk` wraps every storage operation in an OpenTelemetry span. If `@opentelemetry/api` is not installed, all operations pass through with zero overhead.

```typescript
const traced = storage.withTracing('s3');

// Span attributes: storage.disk, storage.operation, storage.path
await traced.put('file.txt', data); // → span recorded
```

Install the OTel API (optional peer):

```bash
npm install @opentelemetry/api
```

### QuotaDisk

`QuotaDisk` enforces byte-level storage quotas and throws `StorageQuotaExceededError` when the limit is reached.

```typescript
import { MemoryQuotaStore, QuotaDisk } from '@fozooni/nestjs-storage';

const quotaStore = new MemoryQuotaStore();
const disk = storage.withQuota('local', quotaStore, {
  maxBytes: 100 * 1024 * 1024, // 100 MB
  prefix: 'users/123',          // optional: per-user quota
});

await disk.put('file.txt', largeBuffer); // throws StorageQuotaExceededError if over limit

const { used, limit, percent } = await disk.getUsage();
console.log(`${percent.toFixed(1)}% used (${used} / ${limit} bytes)`);
```

**Custom `QuotaStore`** (e.g. Redis-backed):

```typescript
class RedisQuotaStore implements QuotaStore {
  async getUsage(prefix?: string): Promise<number> { /* ... */ }
  async addUsage(prefix: string | undefined, bytes: number): Promise<void> { /* ... */ }
  async removeUsage(prefix: string | undefined, bytes: number): Promise<void> { /* ... */ }
}
```

---

## Config Validation

`DiskConfigValidator` validates disk configuration before constructing a disk, throwing `StorageConfigurationError` with a clear message that lists the disk name and all missing fields.

Validation runs automatically inside `StorageService.disk()`. No extra setup required.

```typescript
// Missing 'bucket' and 'region' → throws StorageConfigurationError:
// "Disk [my-s3]: driver 's3' requires: bucket, region"
StorageModule.forRoot({
  disks: {
    'my-s3': { driver: 's3' }, // ← invalid!
  },
});
```

**Required fields per driver:**

| Driver | Required fields |
|---|---|
| `local` | _(none)_ |
| `s3` | `bucket`, `region` |
| `r2` | `bucket`, `accountId` |
| `gcs` | `bucket` |
| `minio` | `bucket`, `endpoint` |
| `b2` | `bucket`, `endpoint` |
| `digitalocean` | `bucket`, `region`, `endpoint` |
| `wasabi` | `bucket`, `region`, `endpoint` |
| `azure` | `containerName`, at least one of `accountKey` \| `sasToken` |

**CDN validation:** if `cdn` is provided, `cdn.baseUrl` is always required. For `provider: 'cloudfront'`, both `signingKeyId` and `signingKey` are required.

---

## Temporary Files with TTL

Use `putTemp()` to write a file that should expire after a given number of seconds.

```typescript
// Write a file that expires in 24 hours
await storage.disk('local').putTemp('sessions/token.txt', 'abc123', 86_400);

// S3: sets the native Expires object metadata header
await storage.disk('s3').putTemp('sessions/token.txt', 'abc123', 86_400);
```

### Cleaning up expired local files

`StorageTempCleanupService` is automatically registered in the `StorageModule`. Inject it and call `runOnce()` to delete expired files (LocalDisk only — S3/GCS/Azure handle expiry natively).

```typescript
import { StorageTempCleanupService } from '@fozooni/nestjs-storage';

@Injectable()
export class CleanupTask {
  constructor(private readonly tempCleanup: StorageTempCleanupService) {}

  async cleanup() {
    const { deleted, errors } = await this.tempCleanup.runOnce('local');
    console.log(`Deleted ${deleted} expired files (${errors} errors)`);
  }
}
```

**With `@nestjs/schedule`:**

```typescript
@Cron('0 * * * *') // hourly
async cleanup() {
  await this.tempCleanup.runOnce('local');
}
```

> For LocalDisk, `putTemp()` writes a `.ttl` sidecar JSON file alongside each temp file. `runOnce()` reads these sidecars, compares `expiresAt` with `Date.now()`, and deletes both files when expired.

---

## TypeScript Generics

### Typed metadata

`getMetadata<T>()` is now generic. Use driver-specific subtypes for strongly typed responses:

```typescript
import { S3FileMetadata, GcsFileMetadata } from '@fozooni/nestjs-storage';

// S3 — includes etag, storageClass, versionId, serverSideEncryption
const meta = await storage.disk('s3').getMetadata<S3FileMetadata>('photo.jpg');
console.log(meta.etag, meta.storageClass);

// GCS — includes generation, metageneration, crc32c, md5Hash
const gcsMeta = await storage.disk('gcs').getMetadata<GcsFileMetadata>('photo.jpg');
console.log(gcsMeta.generation, gcsMeta.crc32c);
```

### `json<T>()` with schema validation

Pass any Zod-compatible schema (or any `{ parse(v: unknown): T }` object) to `json<T>()` for automatic validation:

```typescript
import { z } from 'zod';

const UserSchema = z.object({ id: z.number(), name: z.string() });

// Fetches, parses, and validates in one call:
const user = await storage.disk('s3').json('users/1.json', UserSchema);
// user is typed as { id: number; name: string }
```

---

## Health Checks

Integrate with `@nestjs/terminus` for storage health monitoring:

```bash
npm install @nestjs/terminus
```

```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { StorageHealthIndicator } from '@fozooni/nestjs-storage';

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
      // Check a single disk
      () => this.storageHealth.check('storage', 's3'),
    ]);
  }

  @Get('all-disks')
  @HealthCheck()
  checkAll() {
    return this.health.check([
      // Check multiple disks at once
      () => this.storageHealth.checkDisks('storage', ['s3', 'local', 'gcs']),
    ]);
  }
}
```

Add `StorageHealthIndicator` to your health module providers:

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { StorageHealthIndicator } from '@fozooni/nestjs-storage';

@Module({
  imports: [TerminusModule],
  providers: [StorageHealthIndicator],
  controllers: [HealthController],
})
export class HealthModule {}
```

Options: `{ healthCheckFile?: string, timeout?: number }` (defaults: `.storage-health-check`, 5000ms).

## API Reference

### StorageService

The main service that implements `StorageManager`. Registered as a global provider.

| Method                                 | Returns              | Description                                           |
| -------------------------------------- | -------------------- | ----------------------------------------------------- |
| `disk(name?)`                          | `FilesystemContract` | Get a disk instance by name (default disk if no name) |
| `diskByBucket(bucket)`                 | `FilesystemContract` | Find disk by bucket name                              |
| `cloud()`                              | `FilesystemContract` | Shortcut for `disk('main')`                           |
| `build(config)`                        | `FilesystemContract` | Build a disk from config (not cached)                 |
| `extend(driver, factory)`              | `void`               | Register a custom driver                              |
| `setDisk(name, disk)`                  | `void`               | Replace a disk instance (useful for testing)          |
| `getStreamableFile(path, options?)`    | `StreamableFile`     | Get a NestJS `StreamableFile` for controller responses |

All `FilesystemContract` methods are proxied to the default disk.

### FilesystemContract

The interface all drivers implement.

#### Core Operations

| Method         | Signature                                                                                                | Returns                   |
| -------------- | -------------------------------------------------------------------------------------------------------- | ------------------------- |
| `exists`       | `(path: string) => Promise<boolean>`                                                                     | Whether the file exists   |
| `get`          | `(path: string, options?: GetOptions) => Promise<Buffer \| ReadableStream \| string>`                    | File contents             |
| `put`          | `(path: string, contents: string \| Buffer \| ReadableStream, options?: PutOptions) => Promise<boolean>` | Success                   |
| `putFile`      | `(path: string, file: any, options?: PutOptions) => Promise<string \| false>`                            | Generated path or `false` |
| `putFileAs`    | `(path: string, file: any, name: string, options?: PutOptions) => Promise<string \| false>`              | Full path or `false`      |
| `delete`       | `(path: string) => Promise<boolean>`                                                                     | Success                   |
| `copy`         | `(from: string, to: string, options?: CopyOptions) => Promise<boolean>`                                  | Success                   |
| `move`         | `(from: string, to: string, options?: MoveOptions) => Promise<boolean>`                                  | Success                   |
| `size`         | `(path: string) => Promise<number>`                                                                      | Size in bytes             |
| `lastModified` | `(path: string) => Promise<number>`                                                                      | Timestamp (ms)            |
| `prepend`      | `(path: string, data: string) => Promise<boolean>`                                                       | Success                   |
| `append`       | `(path: string, data: string) => Promise<boolean>`                                                       | Success                   |

#### Convenience Operations (optional per driver)

| Method       | Signature                                                           | Returns                    |
| ------------ | ------------------------------------------------------------------- | -------------------------- |
| `missing`    | `(path: string) => Promise<boolean>`                                | Whether the file is absent |
| `json`       | `<T>(path: string) => Promise<T>`                                   | Parsed JSON content        |
| `checksum`   | `(path: string, algorithm?: 'md5' \| 'sha1' \| 'sha256') => Promise<string>` | Hex digest string |
| `deleteMany` | `(paths: string[]) => Promise<DeleteManyResult>`                    | `{ succeeded, failed }`   |

#### Directory Operations

| Method            | Signature                                                        | Returns                         |
| ----------------- | ---------------------------------------------------------------- | ------------------------------- |
| `files`           | `(directory?: string, recursive?: boolean) => Promise<string[]>` | File paths                      |
| `allFiles`        | `(directory?: string) => Promise<string[]>`                      | All file paths (recursive)      |
| `directories`     | `(directory?: string, recursive?: boolean) => Promise<string[]>` | Directory paths                 |
| `allDirectories`  | `(directory?: string) => Promise<string[]>`                      | All directory paths (recursive) |
| `makeDirectory`   | `(path: string) => Promise<boolean>`                             | Success                         |
| `deleteDirectory` | `(directory: string) => Promise<boolean>`                        | Success                         |
| `directorySize`   | `(directory?: string) => Promise<number>`                        | Total bytes                     |

#### Visibility Operations

| Method          | Signature                                                               | Returns            |
| --------------- | ----------------------------------------------------------------------- | ------------------ |
| `getVisibility` | `(path: string) => Promise<'private' \| 'public'>`                      | Current visibility |
| `setVisibility` | `(path: string, visibility: 'private' \| 'public') => Promise<boolean>` | Success            |

#### URL Operations

| Method         | Signature                                                                                      | Returns    |
| -------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| `url`          | `(path: string) => string`                                                                     | Public URL |
| `temporaryUrl` | `(path: string, expiration: Date \| number, options?: TemporaryUrlOptions) => Promise<string>` | Signed URL |

#### Metadata Operations

| Method        | Signature                                 | Returns              |
| ------------- | ----------------------------------------- | -------------------- |
| `getMetadata` | `(path: string) => Promise<FileMetadata>` | File metadata object |
| `mimeType`    | `(path: string) => Promise<string>`       | MIME type string     |

#### Multipart Upload Operations (optional per driver)

| Method                    | Signature                                                                                            | Returns           |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------- |
| `initMultipartUpload`     | `(path: string, options?: MultipartUploadOptions) => Promise<MultipartUploadInit>`                   | Upload ID and key |
| `uploadPart`              | `(uploadId: string, partNumber: number, data: Buffer, path: string) => Promise<MultipartUploadPart>` | Part info         |
| `completeMultipartUpload` | `(uploadId: string, path: string, parts: MultipartUploadPart[]) => Promise<boolean>`                 | Success           |
| `abortMultipartUpload`    | `(uploadId: string, path: string) => Promise<boolean>`                                               | Success           |
| `putFileMultipart`        | `(path: string, file: any, options?: MultipartUploadOptions) => Promise<string \| false>`            | Path or `false`   |

### Configuration Types

#### `StorageModuleOptions`

```typescript
interface StorageModuleOptions {
  default: string; // Name of the default disk
  disks: {
    [name: string]: DiskConfig;
  };
}
```

#### `DiskConfig`

```typescript
interface DiskConfig {
  driver: 'local' | 's3' | 'gcs' | 'r2' | (string & {});
  root?: string; // Local: root directory
  url?: string; // Base URL for public URLs
  throw?: boolean; // Throw on errors (default: true)
  visibility?: 'private' | 'public'; // Default visibility

  // S3 / R2 shared
  key?: string; // Access key
  secret?: string; // Secret key
  region?: string; // AWS region
  bucket?: string; // Bucket name
  endpoint?: string; // Custom endpoint
  use_path_style_endpoint?: boolean;

  // R2-specific
  accountId?: string; // Cloudflare account ID

  // GCS-specific
  projectId?: string; // Google Cloud project ID
  keyFilename?: string; // Path to service account key
  credentials?: Record<string, any>; // Credentials object

  [key: string]: any; // Extensibility for custom drivers
}
```

#### `PutOptions`

```typescript
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
  namingStrategy?: NamingStrategy; // File naming strategy for putFile() calls
}
```

#### `GetOptions`

```typescript
interface GetOptions {
  responseType?: 'buffer' | 'stream' | 'string';
}
```

#### `TemporaryUrlOptions`

```typescript
interface TemporaryUrlOptions {
  expires?: number;
  method?: 'GET' | 'PUT' | 'DELETE';
  responseDisposition?: string;
  responseType?: string;
}
```

#### `MultipartUploadOptions`

```typescript
interface MultipartUploadOptions extends PutOptions {
  chunkSize?: number;
  partNumberStart?: number;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}
```

#### `FileMetadata`

```typescript
interface FileMetadata {
  path: string;
  size: number;
  lastModified: Date;
  type?: string;
  mimetype?: string;
  extension?: string;
  visibility?: 'private' | 'public';
  [key: string]: any;
}
```

### Utility Functions

Exported from `@fozooni/nestjs-storage`:

| Function                 | Signature                                     | Description                          |
| ------------------------ | --------------------------------------------- | ------------------------------------ |
| `generateUniqueFilename` | `(originalName: string) => string`            | Generate timestamped unique filename |
| `sanitizePath`           | `(filePath: string) => string`                | Remove leading slashes               |
| `getContentType`         | `(filename: string) => string`                | MIME type from filename              |
| `getFileExtension`       | `(filename: string) => string`                | File extension without dot           |
| `normalizePath`          | `(filePath: string) => string`                | Normalize path separators to `/`     |
| `joinPaths`              | `(...paths: string[]) => string`              | Join path segments                   |
| `getDirectory`           | `(filePath: string) => string`                | Directory part of a path             |
| `getFilename`            | `(filePath: string) => string`                | Filename part of a path              |
| `isDirectory`            | `(path: string) => boolean`                   | Check if path ends with `/`          |
| `parseS3Url`             | `(url: string) => { bucket, key } \| null`    | Parse S3 URL formats                 |
| `encodeS3Key`            | `(key: string) => string`                     | URL-encode S3 key preserving `/`     |
| `buildS3Url`             | `(bucket, key, region?) => string`            | Build S3 public URL                  |
| `streamToBuffer`         | `(stream: ReadableStream) => Promise<Buffer>` | Convert stream to buffer             |
| `streamToString`         | `(stream: ReadableStream) => Promise<string>` | Convert stream to string             |
| `isStream`               | `(value: any) => boolean`                     | Check if value is a stream           |
| `formatFileSize`         | `(bytes: number) => string`                   | Human-readable file size             |
| `visibilityToAcl`        | `(visibility?) => string`                     | Convert visibility to S3 ACL         |
| `aclToVisibility`        | `(acl?) => 'private' \| 'public'`             | Convert S3 ACL to visibility         |

## Testing

### Using FakeDisk

`FakeDisk` is an in-memory implementation of `FilesystemContract` — perfect for testing without touching real storage:

```typescript
import { Test } from '@nestjs/testing';
import { StorageService, StorageTestUtils, FakeDisk } from '@fozooni/nestjs-storage';

describe('UploadService', () => {
  let uploadService: UploadService;
  let fakeDisk: FakeDisk;
  let storageService: StorageService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [StorageModule.forRoot({ default: 's3', disks: { s3: { driver: 's3', bucket: 'test', region: 'us-east-1', key: 'k', secret: 's' } } })],
      providers: [UploadService],
    }).compile();

    storageService = module.get(StorageService);
    uploadService = module.get(UploadService);

    // Replace the 's3' disk with an in-memory FakeDisk
    fakeDisk = StorageTestUtils.fake(storageService, 's3');
  });

  it('should upload a file', async () => {
    await uploadService.upload('photo.jpg', Buffer.from('image data'));

    // Use assertion methods
    fakeDisk.assertExists('uploads/photo.jpg');
    fakeDisk.assertContentEquals('uploads/photo.jpg', 'image data');
    fakeDisk.assertCount(1, 'uploads');
  });
});
```

### StorageTestUtils

```typescript
import { StorageTestUtils } from '@fozooni/nestjs-storage';

// Replace a disk with a FakeDisk
const fakeDisk = StorageTestUtils.fake(storageService, 's3');

// Create a mock Multer-like file for upload testing
const file = StorageTestUtils.fakeFile({
  name: 'photo.jpg',
  content: 'image data',
  mimetype: 'image/jpeg',
});

// Create a file with a specific size (zero-filled)
const largeFile = StorageTestUtils.fakeFileWithSize(5 * 1024 * 1024, 'video.mp4');
```

### FakeDisk Assertion Methods

| Method                                   | Description                               |
| ---------------------------------------- | ----------------------------------------- |
| `assertExists(path)`                     | Assert file exists (throws if missing)    |
| `assertMissing(path)`                    | Assert file does not exist                |
| `assertCount(n, directory?)`             | Assert exact number of files              |
| `assertDirectoryEmpty(directory)`        | Assert directory has no files             |
| `assertContentEquals(path, expected)`    | Assert file content matches               |
| `getStoredFiles()`                       | Get all stored file paths                 |
| `getStoredFile(path)`                    | Get file data (content, metadata, etc.)   |
| `reset()`                                | Clear all stored files and directories    |

### Manual Mocking

You can also mock `StorageService` manually if you prefer:

```typescript
import { Test } from '@nestjs/testing';
import { StorageService } from '@fozooni/nestjs-storage';

const mockStorage = {
  put: jest.fn().mockResolvedValue(true),
  get: jest.fn().mockResolvedValue(Buffer.from('data')),
  exists: jest.fn().mockResolvedValue(true),
  delete: jest.fn().mockResolvedValue(true),
  url: jest.fn().mockReturnValue('https://example.com/file.txt'),
  disk: jest.fn().mockReturnThis(),
};

const module = await Test.createTestingModule({
  providers: [YourService, { provide: StorageService, useValue: mockStorage }],
}).compile();
```

## Upgrading from 0.0.1

v0.0.2 is a **non-breaking** upgrade. All existing APIs remain unchanged.

```bash
npm install @fozooni/nestjs-storage@0.0.2
```

**What's new:**

- `@InjectDisk('name')` — Inject specific disks directly (auto-registered with `forRoot`, use `injectDisks` with `forRootAsync`)
- `FakeDisk` + `StorageTestUtils` — In-memory disk for testing
- `StorageHealthIndicator` — Health checks via `@nestjs/terminus` (optional peer dep)
- `missing()`, `json()`, `checksum()`, `deleteMany()` — Convenience methods on all disks
- `getStreamableFile()` — Stream files directly from NestJS controllers

**For custom driver authors:** New convenience methods (`missing`, `json`, `checksum`, `deleteMany`) are **optional** on `FilesystemContract`. Your existing custom drivers will continue to work without changes. To support the new methods, implement them on your driver class.

## Upgrading from 0.0.2

v0.0.3 is a **non-breaking** upgrade. All existing APIs remain unchanged.

```bash
npm install @fozooni/nestjs-storage@0.0.3
```

**What's new:**

- **File Naming Strategies** — `UuidNamingStrategy`, `HashNamingStrategy`, `DatePathNamingStrategy`, `OriginalNamingStrategy`. Pass via `putFile(path, file, { namingStrategy })` or set per-disk in config.
- **`StorageFileInterceptor` / `StorageFilesInterceptor`** — Upload and store files in one step (requires `multer` to be installed).
- **`FileExtensionValidator`** — Validates file extensions in `ParseFilePipe` validators.
- **`MagicBytesValidator`** — Validates actual file content via magic bytes in `ParseFilePipe` validators.
- **`StorageEventsService`** — Subscribe to typed events after `put`, `delete`, `copy`, `move`, and `deleteMany` operations.
- **Scoped Disks** — `storage.scope('prefix')` / `disk.scope('prefix')` for path-prefixed disk instances.

**For custom driver authors:** New `scope?(prefix: string): FilesystemContract` is an optional addition to `FilesystemContract`. Existing custom drivers are unaffected; add `scope()` if you want scoping support on your driver.

## Upgrading from 0.0.3

v0.0.4 is mostly a **non-breaking** upgrade, but includes one important behavioral change for error handling.

```bash
npm install @fozooni/nestjs-storage@0.0.4
```

### What's new

- **9 drivers** — added Azure Blob Storage, MinIO, Backblaze B2, DigitalOcean Spaces, and Wasabi
- **Typed errors** — all drivers now throw `StorageError` subclasses instead of bare `Error`
- **EncryptedDisk** — `storage.encrypted(diskName, { key })` wraps any disk with AES-256-GCM
- **Presigned POST** — `disk.presignedPost(path, options?)` for direct browser-to-cloud uploads
- **HMAC Signed URLs** — `LocalDisk` with `signSecret` + `LocalSignedUrlMiddleware`
- **Audit logging** — `auditLog: true` in module config + pluggable `AuditSink`

### Migration: typed errors

v0.0.4 replaces all bare `throw new Error(...)` in drivers with typed subclasses of `StorageError`. If you were catching storage errors by message string matching, update your `catch` blocks:

**Before (v0.0.3 and earlier):**

```typescript
try {
  await storage.get('file.txt');
} catch (e) {
  if (e instanceof Error && e.message.includes('not found')) { ... }
}
```

**After (v0.0.4+):**

```typescript
import { StorageFileNotFoundError } from '@fozooni/nestjs-storage';

try {
  await storage.get('file.txt');
} catch (e) {
  if (e instanceof StorageFileNotFoundError) { ... }
}
```

### Migration: LocalDisk warning message

If you have a test that checks for the exact warning message from `LocalDisk.temporaryUrl()`, update it — the message now mentions `signSecret`:

```typescript
// Old
expect(consoleSpy).toHaveBeenCalledWith('Local disk does not support temporary URLs');
// New
expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('signSecret'));
```

## Upgrading from 0.0.4

v0.0.5 is fully backwards compatible. No breaking changes.

### New optional peer dependencies

Install only what you need for the new features:

```bash
# CdnDisk with CloudFront signed URLs
npm install @aws-sdk/cloudfront-signer

# OtelDisk (OpenTelemetry tracing)
npm install @opentelemetry/api

# json<T>() with Zod schema validation
npm install zod
```

### `getMetadata` now generic

If you were calling `getMetadata()` and casting the result manually, you can now pass the type argument directly:

```typescript
// Before (v0.0.4)
const meta = (await disk.getMetadata('file.txt')) as S3FileMetadata;

// After (v0.0.5)
const meta = await disk.getMetadata<S3FileMetadata>('file.txt');
```

### Config validation

Invalid disk configs (e.g. missing `bucket` for S3) now throw `StorageConfigurationError` at `StorageService.disk()` call time instead of later. You may see earlier errors in places that were silently misconfigured before. No action needed for valid configs.

### `StorageTempCleanupService` is now exported

`StorageTempCleanupService` is now automatically exported from `StorageModule`. You can inject it in any service without additional registration.

---

## File Versioning (VersionedDisk)

`VersionedDisk` wraps any disk and automatically snapshots the previous content of a file before overwriting it. Snapshots are stored in a `.versions/{path}/` directory on the same disk.

```typescript
import { VersionedDisk } from '@fozooni/nestjs-storage';

const versioned = storage.withVersioning('local');
// or directly:
const versioned = new VersionedDisk(storage.disk('local'));

await versioned.put('config.json', '{"v":1}');
await versioned.put('config.json', '{"v":2}'); // v1 is now a snapshot

const versions = await versioned.listVersions('config.json');
// [{ versionId: '...', size: 9, lastModified: Date, isLatest: false }]

const buf = await versioned.getVersion('config.json', versions[0].versionId);
// Buffer of the v1 content

await versioned.restoreVersion('config.json', versions[0].versionId);
await versioned.deleteVersion('config.json', versions[0].versionId);
```

**API**

| Method | Description |
|---|---|
| `listVersions(path)` | Returns all snapshots sorted oldest-first; the most recently created has `isLatest: true` |
| `getVersion(path, versionId)` | Retrieve a snapshot as a `Buffer` |
| `restoreVersion(path, versionId)` | Copy the snapshot back to the live path |
| `deleteVersion(path, versionId)` | Delete a single snapshot |

> Versioning errors never block the actual write — failures are silently swallowed.

---

## Storage Routing (RouterDisk)

`RouterDisk` dispatches reads and writes to different underlying disks based on routing rules. First-match wins on write; the same rule is applied on read.

```typescript
import {
  RouterDisk,
  byExtension,
  byPrefix,
  byMimeType,
  bySize,
  custom,
} from '@fozooni/nestjs-storage';

const images = storage.disk('s3-images');
const docs   = storage.disk('s3-docs');
const cold   = storage.disk('s3-cold');

const router = storage.withRouting(
  [
    byExtension(['.jpg', '.png', '.gif', '.webp'], images),
    byPrefix('docs/', docs),
    byMimeType(['application/pdf'], docs),
    bySize(10 * 1024 * 1024, cold),   // ≤ 10 MB → cold storage
    custom((path) => path.endsWith('.log'), cold),
  ],
  storage.disk('s3-default'),
);

await router.put('hero.jpg', buffer);          // → images disk
await router.put('docs/report.pdf', buffer);   // → docs disk (prefix wins first)
await router.put('big-archive.zip', buffer);   // depends on size
await router.put('other.txt', buffer);         // → default disk
```

**Route factories**

| Factory | Match condition |
|---|---|
| `byExtension(exts[], disk)` | File extension matches |
| `byPrefix(prefix, disk)` | Path starts with prefix |
| `byMimeType(types[], disk)` | MIME type matches (write-time only) |
| `bySize(maxBytes, disk)` | Content size ≤ maxBytes (write-time only) |
| `custom(fn, disk)` | User-supplied predicate |

> `byMimeType` and `bySize` are only evaluated at write time (the content is available). At read time, only `byExtension` and `byPrefix` can match deterministically; unmatched reads fall through to the default disk.

---

## Range Requests / Partial Content

All built-in drivers support HTTP range requests (HTTP 206) via `getRange()`. `StorageService.serveRange()` handles the full request lifecycle including header parsing and response piping.

### `getRange(path, options)`

```typescript
const { stream, size, contentRange, totalSize } = await disk.getRange('video.mp4', {
  start: 0,
  end: 1_048_575, // first 1 MB
});
// contentRange = 'bytes 0-1048575/52428800'
```

### `StorageService.serveRange()`

```typescript
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get(':filename')
  async stream(@Param('filename') filename: string, @Req() req: Request, @Res() res: Response) {
    await this.storage.serveRange(filename, req, res, 'videos');
    // Automatically sends 206 with correct headers, or 200 when no Range header present.
  }
}
```

### `@RangeServe(diskName?)` decorator

```typescript
import { RangeServe, RANGE_SERVE_DISK_KEY } from '@fozooni/nestjs-storage';

@Controller('media')
export class MediaController {
  @Get(':file')
  @RangeServe('videos')
  serve(@Param('file') file: string) {
    // The diskName 'videos' is stored as method metadata under RANGE_SERVE_DISK_KEY
    // for your own interceptor to read and call serveRange() automatically.
  }
}
```

---

## Disk Migration (StorageMigrator)

`StorageMigrator` is an `@Injectable()` service that copies files from one disk to another using an async generator — never loading all files into memory at once.

```typescript
import { StorageMigrator } from '@fozooni/nestjs-storage';

@Injectable()
export class MigrationService {
  constructor(private readonly migrator: StorageMigrator) {}

  async run() {
    const source = this.storage.disk('old-s3');
    const target = this.storage.disk('new-s3');

    for await (const event of this.migrator.migrate(source, target, {
      prefix: 'uploads/',
      concurrency: 10,
      verify: true,
      deleteSource: false,
      dryRun: false,
      onError: 'skip',
    })) {
      if (event.status === 'copied') {
        console.log(`✓ ${event.path} (${event.bytesTransferred} bytes)`);
      } else if (event.status === 'failed') {
        console.error(`✗ ${event.path}:`, event.error?.message);
      }
    }
  }
}
```

**Options**

| Option | Default | Description |
|---|---|---|
| `prefix` | `undefined` | Only migrate files whose path starts with this prefix |
| `concurrency` | `5` | Max concurrent copy operations |
| `verify` | `false` | Checksum verify after each copy |
| `deleteSource` | `false` | Delete source file after successful copy |
| `dryRun` | `false` | Simulate migration — no writes |
| `onError` | `'skip'` | `'skip'` continues on failure; `'abort'` throws |

**Progress event statuses:** `'pending'` → `'copied'` or `'failed'`

---

## SSE Upload Progress

`StorageUploadProgressService` connects multipart upload callbacks to RxJS `Observable` streams. Inject it, push updates from your upload logic, and subscribe from a controller.

```typescript
import { StorageUploadProgressService } from '@fozooni/nestjs-storage';

// In your upload service:
@Injectable()
export class UploadService {
  constructor(private readonly progress: StorageUploadProgressService) {}

  async upload(file: Buffer, uploadId: string) {
    await disk.putFileMultipart('large.zip', file, {
      onProgress: (uploaded, total) => {
        this.progress.track(uploadId, {
          uploadId,
          key: 'large.zip',
          uploadedBytes: uploaded,
          totalBytes: total,
          completedParts: 0,
          totalParts: 1,
        });
      },
    });
    this.progress.complete(uploadId);
  }
}

// In your SSE controller:
@Get('progress/:id')
@Sse()
stream(@Param('id') id: string): Observable<MessageEvent> {
  return this.progress.getProgress$(id).pipe(
    map((status) => ({ data: status })),
  );
}
```

**API**

| Method | Description |
|---|---|
| `track(uploadId, status)` | Push a status update |
| `getProgress$(uploadId)` | Observable that emits status updates |
| `complete(uploadId)` | Complete the observable (upload done) |
| `error(uploadId, err)` | Error the observable (upload failed) |

---

## Streaming Archives (StorageArchiver)

`StorageArchiver` creates ZIP or TAR archives from files on a disk, streaming each file without buffering all content in memory.

Requires the optional peer:
```bash
npm install archiver
```

```typescript
import { StorageArchiver } from '@fozooni/nestjs-storage';

@Controller('archives')
export class ArchiveController {
  constructor(private readonly archiver: StorageArchiver) {}

  @Get('download')
  async download(@Res() res: Response) {
    const disk = this.storage.disk('uploads');
    const stream = await this.archiver.createZip(
      [
        { path: 'reports/2026-01.pdf' },
        { path: 'reports/2026-02.pdf', name: 'february.pdf' },
      ],
      disk,
      { zlib: { level: 6 } },
    );

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="reports.zip"');
    stream.pipe(res);
  }
}
```

**API**

| Method | Description |
|---|---|
| `createZip(files, disk, opts?)` | Returns a ZIP `ReadableStream` |
| `createTar(files, disk, opts?)` | Returns a TAR `ReadableStream` |

Each file entry: `{ path: string; name?: string }`. `name` overrides the entry name inside the archive.

---

## Concurrent Write Protection

`putIfMatch` and `putIfNoneMatch` enable optimistic locking for concurrent write scenarios.

### `putIfMatch(path, content, etag, opts?)`

Only writes if the current file's ETag matches the provided value. Use this to implement compare-and-swap.

```typescript
// 1. Read the current file and its etag
const meta = await disk.getMetadata('settings.json');
const currentEtag = meta.etag;

// 2. Conditional write — only succeeds if the file hasn't changed
const { success, etag: newEtag } = await disk.putIfMatch(
  'settings.json',
  JSON.stringify(newSettings),
  currentEtag,
);

if (!success) {
  throw new ConflictException('settings.json was modified by another process');
}
```

### `putIfNoneMatch(path, content, opts?)`

Only writes if the file does not yet exist. Use this to prevent accidental overwrites.

```typescript
const { success } = await disk.putIfNoneMatch('config/init.json', defaultConfig);
if (!success) {
  console.log('Init config already exists — skipping.');
}
```

**Driver support**

| Driver | `putIfMatch` | `putIfNoneMatch` |
|---|---|---|
| `LocalDisk` | MD5-based | Existence check |
| `S3Disk` (and R2, MinIO, B2, DO, Wasabi) | `IfMatch` header | `IfNoneMatch: *` |
| `FakeDisk` | MD5-based | Existence check |

## Upgrading to v0.1.0

v0.1.0 is **fully backwards compatible**. All changes are additive. No breaking changes.

### New optional peer dependencies

Install only what you use:

```bash
# Streaming ZIP/TAR archives
npm install archiver
```

### New auto-registered services

`StorageMigrator`, `StorageUploadProgressService`, and `StorageArchiver` are now automatically registered and exported by `StorageModule`. You can inject them directly:

```typescript
constructor(
  private readonly migrator: StorageMigrator,
  private readonly progress: StorageUploadProgressService,
  private readonly archiver: StorageArchiver,
) {}
```

### New FilesystemContract optional methods

The following optional methods are now defined on `FilesystemContract` and delegated by `DiskDecorator`:

```typescript
listVersions?(path): Promise<FileVersion[]>
getVersion?(path, versionId): Promise<Buffer>
restoreVersion?(path, versionId): Promise<boolean>
deleteVersion?(path, versionId): Promise<boolean>
getRange?(path, opts: RangeOptions): Promise<RangeResult>
putIfMatch?(path, content, etag, opts?): Promise<ConditionalWriteResult>
putIfNoneMatch?(path, content, opts?): Promise<ConditionalWriteResult>
```

These are implemented on `LocalDisk`, `S3Disk` (and its subclasses), `GcsDisk`, `AzureDisk`, and `FakeDisk`.

## License

[MIT](LICENSE)
