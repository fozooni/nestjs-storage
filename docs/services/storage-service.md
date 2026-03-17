# StorageService

`StorageService` is the primary entry point for all storage operations. It manages disk instances, proxies common file operations to the default disk, and provides factory methods for creating decorated disk wrappers.

```ts
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(private readonly storage: StorageService) {}
}
```

## Disk Management

These methods let you retrieve, construct, and extend disk instances.

| Method | Signature | Description |
|---|---|---|
| `disk` | `disk(name?: string): FilesystemContract` | Get a named disk instance (or the default disk if no name is given). Auto-wraps with `CdnDisk` if CDN config is present for that disk. |
| `diskByBucket` | `diskByBucket(bucketName: string): FilesystemContract` | Find a configured disk by its bucket name. Useful when you receive a bucket name from an external source. |
| `cloud` | `cloud(): FilesystemContract` | Alias for `disk('main')`. Convenience method for the primary cloud disk. |
| `build` | `build(config: DiskConfig): FilesystemContract` | Create a one-off disk instance from a config object. Not cached — a new instance is created every time. |
| `extend` | `extend(driver: string, callback: DriverFactory): void` | Register a custom driver. The callback receives the disk config and returns a `FilesystemContract`. |
| `setDisk` | `setDisk(name: string, disk: FilesystemContract): void` | Override a disk instance at runtime. Useful for testing or dynamic reconfiguration. |

### Getting Disks

```ts
// Get the default disk (configured via `default` in StorageConfig)
const defaultDisk = this.storage.disk();

// Get a named disk
const s3 = this.storage.disk('s3');
const gcs = this.storage.disk('gcs');

// Get by bucket name
const disk = this.storage.diskByBucket('my-uploads-bucket');

// Shorthand for main cloud disk
const cloud = this.storage.cloud();
```

::: tip
The `disk()` method caches instances. Calling `disk('s3')` multiple times returns the same instance. Use `build()` when you need an uncached, disposable instance.
:::

### Building One-Off Disks

```ts
const tempDisk = this.storage.build({
  driver: 'local',
  root: '/tmp/scratch',
});

await tempDisk.put('temp.txt', 'temporary data');
```

### Registering Custom Drivers

```ts
// In your module's onModuleInit
onModuleInit() {
  this.storage.extend('ftp', (config) => {
    return new FtpDisk(config.host, config.port, config.credentials);
  });
}

// Later, use it in config:
// disks: { backup: { driver: 'ftp', host: '...', port: 21, credentials: {...} } }
const ftp = this.storage.disk('backup');
```

### Overriding Disks at Runtime

```ts
// Replace the 's3' disk with a fake for testing
import { FakeDisk } from '@fozooni/nestjs-storage';

this.storage.setDisk('s3', new FakeDisk());
```

## Proxy Methods

`StorageService` proxies all common file operations to the **default disk**. This means you can call `this.storage.put(...)` instead of `this.storage.disk().put(...)`.

### File Operations

| Method | Signature | Description |
|---|---|---|
| `exists` | `exists(path: string): Promise<boolean>` | Check if a file exists |
| `missing` | `missing(path: string): Promise<boolean>` | Check if a file does NOT exist |
| `get` | `get(path: string): Promise<string>` | Read file contents as a string |
| `json` | `json<T>(path: string): Promise<T>` | Read and parse JSON file |
| `put` | `put(path: string, contents: string \| Buffer, opts?): Promise<void>` | Write contents to a file |
| `putFile` | `putFile(path: string, file: File, opts?): Promise<string>` | Store an uploaded file, returns generated path |
| `putFileAs` | `putFileAs(path: string, file: File, name: string, opts?): Promise<string>` | Store an uploaded file with a specific name |
| `prepend` | `prepend(path: string, data: string): Promise<void>` | Prepend data to a file |
| `append` | `append(path: string, data: string): Promise<void>` | Append data to a file |
| `delete` | `delete(path: string): Promise<boolean>` | Delete a file |
| `deleteMany` | `deleteMany(paths: string[]): Promise<Record<string, boolean>>` | Delete multiple files |
| `copy` | `copy(from: string, to: string): Promise<void>` | Copy a file |
| `move` | `move(from: string, to: string): Promise<void>` | Move/rename a file |

### File Metadata

| Method | Signature | Description |
|---|---|---|
| `size` | `size(path: string): Promise<number>` | Get file size in bytes |
| `lastModified` | `lastModified(path: string): Promise<Date>` | Get last modified date |
| `mimeType` | `mimeType(path: string): Promise<string>` | Get MIME type of a file |
| `checksum` | `checksum(path: string, algo?): Promise<string>` | Compute file checksum (default: md5) |
| `getMetadata` | `getMetadata(path: string): Promise<Record<string, string>>` | Get custom metadata |
| `getVisibility` | `getVisibility(path: string): Promise<string>` | Get visibility (public/private) |
| `setVisibility` | `setVisibility(path: string, visibility: string): Promise<void>` | Set visibility |

### URLs

| Method | Signature | Description |
|---|---|---|
| `url` | `url(path: string): Promise<string>` | Get public URL |
| `temporaryUrl` | `temporaryUrl(path: string, expiry: Date, opts?): Promise<string>` | Get a signed temporary URL |

### Directory Operations

| Method | Signature | Description |
|---|---|---|
| `files` | `files(directory?: string): Promise<string[]>` | List files in a directory |
| `allFiles` | `allFiles(directory?: string): Promise<string[]>` | List all files recursively |
| `directories` | `directories(directory?: string): Promise<string[]>` | List directories |
| `allDirectories` | `allDirectories(directory?: string): Promise<string[]>` | List all directories recursively |
| `makeDirectory` | `makeDirectory(path: string): Promise<void>` | Create a directory |
| `deleteDirectory` | `deleteDirectory(path: string): Promise<void>` | Delete a directory and its contents |
| `directorySize` | `directorySize(path: string): Promise<number>` | Get total size of a directory in bytes |

### Examples

```ts
// Basic file operations
await this.storage.put('config/app.json', JSON.stringify({ debug: true }));

const config = await this.storage.json<AppConfig>('config/app.json');

const exists = await this.storage.exists('config/app.json');

// Copy and move
await this.storage.copy('photos/original.jpg', 'photos/backup.jpg');
await this.storage.move('temp/upload.pdf', 'documents/report.pdf');

// File metadata
const size = await this.storage.size('documents/report.pdf');
const modified = await this.storage.lastModified('documents/report.pdf');
const hash = await this.storage.checksum('documents/report.pdf', 'sha256');

// URLs
const publicUrl = await this.storage.url('images/logo.png');
const signedUrl = await this.storage.temporaryUrl(
  'private/invoice.pdf',
  new Date(Date.now() + 3600 * 1000), // 1 hour
);

// Directory operations
const files = await this.storage.allFiles('uploads/');
const totalSize = await this.storage.directorySize('uploads/');
```

## Multipart Upload Proxy

For large files, `StorageService` proxies multipart upload methods to the default disk.

| Method | Signature | Description |
|---|---|---|
| `initMultipartUpload` | `initMultipartUpload(path: string, opts?): Promise<string>` | Initialize multipart upload, returns upload ID |
| `uploadPart` | `uploadPart(path: string, uploadId: string, partNumber: number, body: Buffer): Promise<UploadPart>` | Upload a single part |
| `completeMultipartUpload` | `completeMultipartUpload(path: string, uploadId: string, parts: UploadPart[]): Promise<void>` | Complete the upload |
| `abortMultipartUpload` | `abortMultipartUpload(path: string, uploadId: string): Promise<void>` | Abort and clean up |
| `putFileMultipart` | `putFileMultipart(path: string, file: File, opts?): Promise<string>` | High-level multipart upload with automatic chunking |

### Multipart Upload Example

```ts
// High-level (recommended) — handles chunking automatically
const resultPath = await this.storage.putFileMultipart(
  'videos/',
  largeVideoFile,
  {
    partSize: 10 * 1024 * 1024, // 10 MB parts
    onProgress: (loaded, total) => {
      console.log(`${Math.round((loaded / total) * 100)}%`);
    },
  },
);

// Low-level — manual control
const uploadId = await this.storage.initMultipartUpload('videos/movie.mp4');
const parts: UploadPart[] = [];

try {
  for (let i = 0; i < chunks.length; i++) {
    const part = await this.storage.uploadPart(
      'videos/movie.mp4',
      uploadId,
      i + 1,
      chunks[i],
    );
    parts.push(part);
  }

  await this.storage.completeMultipartUpload('videos/movie.mp4', uploadId, parts);
} catch (error) {
  await this.storage.abortMultipartUpload('videos/movie.mp4', uploadId);
  throw error;
}
```

## Decorator Factories

`StorageService` provides factory methods that wrap any disk with additional behavior. These return decorated disk instances that implement the same `FilesystemContract` interface.

| Method | Returns | Description |
|---|---|---|
| `scope(prefix, disk?)` | `ScopedDisk` | Scopes all paths under a prefix. Acts as a virtual subdirectory. |
| `encrypted(disk, { key })` | `EncryptedDisk` | Encrypts/decrypts file contents transparently using AES-256-GCM. |
| `cached(disk, opts?)` | `CachedDisk` | Adds in-memory or custom cache layer for reads. |
| `withRetry(disk, opts?)` | `RetryDisk` | Retries failed operations with exponential backoff. |
| `replicated(disk, replicas, opts?)` | `ReplicatedDisk` | Writes to multiple disks simultaneously for redundancy. |
| `withQuota(disk, store, opts)` | `QuotaDisk` | Enforces storage quotas with a pluggable usage store. |
| `withVersioning(disk)` | `VersionedDisk` | Stores file version snapshots under `.versions/`. |
| `withRouting(routes, default)` | `RouterDisk` | Routes files to different disks based on rules (extension, prefix, MIME, size). |
| `withTracing(disk)` | `OtelDisk` | Adds OpenTelemetry spans to all operations. |

### Decorator Factory Examples

```ts
// Scoped disk — all paths prefixed with 'tenant-42/'
const tenantDisk = this.storage.scope('tenant-42/');
await tenantDisk.put('avatar.png', buffer);
// Actually stored at: tenant-42/avatar.png

// Encrypted disk
const secureDisk = this.storage.encrypted(this.storage.disk(), {
  key: process.env.ENCRYPTION_KEY,
});
await secureDisk.put('secrets.json', JSON.stringify(secrets));

// Cached disk — reads served from memory cache
const fast = this.storage.cached(this.storage.disk('s3'), {
  ttl: 60_000, // 60 seconds
  maxItems: 1000,
});
const data = await fast.get('config.json'); // cached after first read

// Retry disk — retries on transient failures
const reliable = this.storage.withRetry(this.storage.disk('s3'), {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10_000,
});

// Replicated disk — write to S3 and GCS simultaneously
const replicated = this.storage.replicated(
  this.storage.disk('s3'),
  [this.storage.disk('gcs')],
  { mode: 'async' },
);

// Quota disk — enforce per-user limits
const quotaDisk = this.storage.withQuota(
  this.storage.disk(),
  quotaStore,
  { maxBytes: 500 * 1024 * 1024, userId: 'user-42' },
);

// Versioned disk — automatic snapshots
const versioned = this.storage.withVersioning(this.storage.disk());
await versioned.put('document.txt', 'v2 content');
// Previous version saved at: .versions/document.txt/{timestamp}_{uuid}

// Router disk — route by file characteristics
const router = this.storage.withRouting(
  [
    { match: byExtension(['.jpg', '.png', '.webp']), disk: this.storage.disk('images-cdn') },
    { match: bySize(50 * 1024 * 1024), disk: this.storage.disk('large-files') },
  ],
  this.storage.disk('default'),
);

// Tracing disk — OpenTelemetry instrumentation
const traced = this.storage.withTracing(this.storage.disk('s3'));
```

## Range Requests (Convenience)

`StorageService` provides helpers for serving partial content (HTTP 206) responses.

| Method | Signature | Description |
|---|---|---|
| `serveRange` | `serveRange(path: string, req: Request, res: Response, disk?: string): Promise<void>` | Parses the `Range` header and serves partial content with correct status codes and headers |
| `getStreamableFile` | `getStreamableFile(path: string, opts?): Promise<StreamableFile>` | Returns a NestJS `StreamableFile` suitable for returning from controllers |

```ts
import { Controller, Get, Req, Res, Param } from '@nestjs/common';
import { Request, Response } from 'express';
import { StorageService } from '@fozooni/nestjs-storage';

@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get(':filename')
  async serveMedia(
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.storage.serveRange(`media/${filename}`, req, res);
  }
}
```

::: info
`serveRange()` automatically handles:
- Parsing the `Range` header
- Setting `Content-Range`, `Accept-Ranges`, and `Content-Length` headers
- Returning `206 Partial Content` for range requests
- Returning `200 OK` for full content requests
- Returning `416 Range Not Satisfiable` for invalid ranges
:::

## Events Property

Access the `StorageEventsService` directly from `StorageService`:

```ts
this.storage.events.on('storage.put', (event) => {
  console.log(`File written: ${event.path} on disk ${event.disk}`);
});
```

See the [StorageEventsService](./events-service) page for full details.

## Full Controller Example

```ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { StorageService } from '@fozooni/nestjs-storage';

@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    const path = await this.storage.putFileAs(
      'uploads',
      file,
      `${Date.now()}-${file.originalname}`,
    );

    return {
      path,
      url: await this.storage.url(path),
      size: await this.storage.size(path),
    };
  }

  @Get(':path(*)')
  async download(@Param('path') path: string): Promise<StreamableFile> {
    return this.storage.getStreamableFile(path);
  }

  @Get('serve/:path(*)')
  async serve(
    @Param('path') path: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Supports range requests for video/audio streaming
    await this.storage.serveRange(path, req, res);
  }

  @Delete(':path(*)')
  async remove(@Param('path') path: string) {
    const deleted = await this.storage.delete(path);
    return { deleted };
  }

  @Get('list/:directory(*)')
  async list(@Param('directory') directory: string) {
    const files = await this.storage.allFiles(directory);
    return { files, count: files.length };
  }

  @Post('signed-url')
  async signedUrl(@Body() body: { path: string; expiresIn: number }) {
    const url = await this.storage.temporaryUrl(
      body.path,
      new Date(Date.now() + body.expiresIn * 1000),
    );
    return { url };
  }

  @Post('copy')
  async copy(@Body() body: { from: string; to: string }) {
    await this.storage.copy(body.from, body.to);
    return { success: true };
  }
}
```

::: tip Default Disk
When no disk name is passed to `disk()`, the disk specified in the `default` property of your `StorageConfig` is used. All proxy methods (`put`, `get`, `delete`, etc.) operate on the default disk. To target a specific disk, call `this.storage.disk('name').put(...)` instead.
:::

::: warning
The `build()` method creates a new instance every time it is called. Avoid calling it in hot paths — prefer named disks configured in `StorageModule.forRoot()` for production workloads.
:::
