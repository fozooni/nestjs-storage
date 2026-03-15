# @fozooni/nestjs-storage

[![CI](https://github.com/fozooni/nestjs-storage/actions/workflows/ci.yml/badge.svg)](https://github.com/fozooni/nestjs-storage/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@fozooni/nestjs-storage.svg)](https://www.npmjs.com/package/@fozooni/nestjs-storage)
[![npm downloads](https://img.shields.io/npm/dt/@fozooni/nestjs-storage.svg)](https://www.npmjs.com/package/@fozooni/nestjs-storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful, driver-based storage module for NestJS with a unified API across Local filesystem, Amazon S3, Cloudflare R2, and Google Cloud Storage.

## Support

If you find this package useful, please consider giving it a star on [GitHub](https://github.com/fozooni/nestjs-storage). It helps others discover it and motivates further development!

## Compatibility

| @fozooni/nestjs-storage | NestJS   | Node.js    |
| ----------------------- | -------- | ---------- |
| `0.x`                   | 10 \| 11 | 18, 20, 22 |

> Tested on every push via [GitHub Actions CI](https://github.com/fozooni/nestjs-storage/actions/workflows/ci.yml) against Node 18, 20, and 22.

## Features

- **Unified API** — One interface (`FilesystemContract`) for all storage backends
- **4 Built-in Drivers** — Local, S3, R2 (Cloudflare), GCS (Google Cloud)
- **NestJS Dynamic Module** — `forRoot()` and `forRootAsync()` registration
- **Global Module** — Inject `StorageService` anywhere without importing
- **Multiple Disks** — Configure and switch between multiple storage disks at runtime
- **Multipart Uploads** — Chunked uploads for large files on all drivers
- **Custom Drivers** — Extend with your own storage driver via `extend()`
- **Dual CJS/ESM** — Ships both CommonJS and ES modules with TypeScript declarations
- **Optional Peer Dependencies** — Only install the SDK you need

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
  - [Usage](#usage)
    - [Injecting the Service](#injecting-the-service)
    - [File Operations](#file-operations)
    - [Directory Operations](#directory-operations)
    - [Visibility](#visibility)
    - [URLs](#urls)
    - [Metadata](#metadata)
    - [Multipart Uploads](#multipart-uploads)
    - [Multiple Disks](#multiple-disks)
    - [Disk by Bucket](#disk-by-bucket)
    - [Custom Drivers](#custom-drivers)
  - [API Reference](#api-reference)
    - [StorageService](#storageservice)
    - [FilesystemContract](#filesystemcontract)
      - [Core Operations](#core-operations)
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
  - [Testing](#testing)
    - [Testing in your application](#testing-in-your-application)
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
# For S3 or R2 driver
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# For GCS driver
npm install @google-cloud/storage
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

## API Reference

### StorageService

The main service that implements `StorageManager`. Registered as a global provider.

| Method                    | Returns              | Description                                           |
| ------------------------- | -------------------- | ----------------------------------------------------- |
| `disk(name?)`             | `FilesystemContract` | Get a disk instance by name (default disk if no name) |
| `diskByBucket(bucket)`    | `FilesystemContract` | Find disk by bucket name                              |
| `cloud()`                 | `FilesystemContract` | Shortcut for `disk('main')`                           |
| `build(config)`           | `FilesystemContract` | Build a disk from config (not cached)                 |
| `extend(driver, factory)` | `void`               | Register a custom driver                              |

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

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test -- --coverage

# Build
pnpm build

# Lint
pnpm lint
```

### Testing in your application

Mock `StorageService` in your tests:

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
  // ... add other methods as needed
};

const module = await Test.createTestingModule({
  providers: [YourService, { provide: StorageService, useValue: mockStorage }],
}).compile();
```

## License

[MIT](LICENSE)
