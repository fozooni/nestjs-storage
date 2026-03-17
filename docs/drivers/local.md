# Local Filesystem Driver

The Local driver stores files on the server's filesystem using Node.js `fs` module operations. It is the simplest driver to set up and is ideal for development, self-hosted deployments, and edge use cases where cloud object stores are unnecessary.

## Configuration

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `driver` | `'local'` | Yes | — | Must be `'local'` |
| `root` | `string` | Yes | — | Absolute or relative path to the storage root directory |
| `url` | `string` | No | `''` | Base URL for generating public URLs (e.g., `https://example.com/files`) |
| `signSecret` | `string` | No | — | HMAC secret for signed URLs (minimum 32 characters) |
| `visibility` | `'public' \| 'private'` | No | `'private'` | Default visibility for new files |
| `throw` | `boolean` | No | `true` | Whether to throw on missing files or return `null` |

## Basic Setup

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
          root: './storage/app',
          url: 'http://localhost:3000/files',
          visibility: 'public',
        },
      },
    }),
  ],
})
export class AppModule {}
```

### Async Configuration with ConfigService

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    ConfigModule.forRoot(),
    StorageModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        default: 'local',
        disks: {
          local: {
            driver: 'local',
            root: config.get('STORAGE_ROOT', './storage'),
            url: config.get('STORAGE_URL', 'http://localhost:3000/files'),
            signSecret: config.get('STORAGE_SIGN_SECRET'),
            visibility: 'public',
          },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

## File Operations

All standard `FilesystemContract` operations are supported:

```typescript
@Injectable()
export class DocumentService {
  constructor(private readonly storage: StorageService) {}

  async createDocument(name: string, content: Buffer) {
    const disk = this.storage.disk('local');

    // Write a file
    await disk.put(`documents/${name}`, content);

    // Read it back
    const data = await disk.get(`documents/${name}`);

    // Check existence
    const exists = await disk.exists(`documents/${name}`);

    // Get metadata (size, lastModified, etc.)
    const meta = await disk.getMetadata(`documents/${name}`);

    // Generate a public URL
    const url = await disk.url(`documents/${name}`);

    // Copy and move
    await disk.copy(`documents/${name}`, `archive/${name}`);
    await disk.move(`archive/${name}`, `backup/${name}`);

    // Delete
    await disk.delete(`documents/${name}`);
  }

  async listFiles() {
    const disk = this.storage.disk('local');

    // List all files in a directory
    const files = await disk.listContents('documents');

    // Flat listing
    const allFiles = await disk.listContents('documents', { deep: true });

    return files;
  }
}
```

::: tip Development with Local Disk
The Local driver is the best choice for local development. Set `root` to a project-relative path like `./storage` and add it to `.gitignore`. You get instant feedback without network latency or cloud credentials.
:::

## Path Traversal Protection

The Local driver sanitizes all file paths to prevent directory traversal attacks. Paths containing `..` segments or absolute paths that escape the configured `root` are rejected:

```typescript
// These are safe
await disk.put('uploads/avatar.png', buffer);        // OK
await disk.put('users/123/profile.jpg', buffer);      // OK

// These will throw an error
await disk.put('../../../etc/passwd', buffer);         // REJECTED
await disk.put('/absolute/path/outside/root', buffer); // REJECTED
```

::: danger
Never construct file paths from raw user input without additional validation. While the driver protects against traversal, always sanitize filenames to prevent other issues (null bytes, reserved names, excessively long paths).
:::

## Visibility via File Permissions

The Local driver maps visibility to POSIX file permissions:

| Visibility | File Permission | Octal |
|---|---|---|
| `public` | `-rw-r--r--` | `0o644` |
| `private` | `-rw-------` | `0o600` |

```typescript
// Set visibility on write
await disk.put('public-file.txt', content, { visibility: 'public' });
await disk.put('private-file.txt', content, { visibility: 'private' });

// Change visibility after write
await disk.setVisibility('public-file.txt', 'private');

// Check current visibility
const visibility = await disk.getVisibility('private-file.txt');
// => 'private'
```

::: warning
File permission-based visibility only works on Unix-like systems (Linux, macOS). On Windows, visibility settings are stored as metadata but do not enforce OS-level access control.
:::

## HMAC Signed URLs

The Local driver supports signed temporary URLs using HMAC-SHA256. This allows you to generate expiring URLs for private files without a cloud provider.

### Configuration

```typescript
StorageModule.forRoot({
  default: 'local',
  disks: {
    local: {
      driver: 'local',
      root: './storage',
      url: 'https://example.com/files',
      signSecret: process.env.STORAGE_SIGN_SECRET, // min 32 characters
    },
  },
})
```

::: warning
The `signSecret` must be at least 32 characters long. Use a cryptographically random string. Rotating the secret invalidates all previously issued signed URLs.
:::

### Generating Signed URLs

```typescript
@Injectable()
export class DownloadService {
  constructor(private readonly storage: StorageService) {}

  async getDownloadUrl(path: string): Promise<string> {
    const disk = this.storage.disk('local');

    // URL valid for 30 minutes (1800 seconds)
    const url = await disk.temporaryUrl(path, 1800);
    // => https://example.com/files/documents/report.pdf?expires=1710700000&signature=abc123...

    return url;
  }
}
```

### Validating Signed URLs

Use the `LocalSignedUrlMiddleware` to validate incoming signed URL requests automatically. See the [Middleware guide](/advanced/middleware) for setup instructions.

```typescript
// The middleware validates ?expires= and ?signature= query parameters
// and returns 403 for expired or tampered URLs.
```

## Range Requests

The Local driver supports `getRange()` for partial file reads — useful for resumable downloads and media streaming:

```typescript
@Injectable()
export class MediaService {
  constructor(private readonly storage: StorageService) {}

  async getPartialContent(path: string, start: number, end: number) {
    const disk = this.storage.disk('local');

    // Read bytes 0–1023 (first 1KB)
    const chunk = await disk.getRange(path, { start: 0, end: 1023 });

    return chunk;
  }

  async streamRange(path: string, start: number, end: number) {
    const disk = this.storage.disk('local');

    // Get a readable stream for the range
    const stream = await disk.getRange(path, { start, end });

    return stream;
  }
}
```

### Using with `@RangeServe()` Decorator

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { RangeServe } from '@fozooni/nestjs-storage';

@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get(':filename')
  @RangeServe()
  async serve(@Param('filename') filename: string) {
    return {
      disk: 'local',
      path: `media/${filename}`,
    };
  }
}
```

The `@RangeServe()` decorator automatically parses the `Range` header and responds with `206 Partial Content` when appropriate.

## Conditional Writes

The Local driver tracks ETags for files and supports conditional write operations to prevent overwrite conflicts:

```typescript
@Injectable()
export class CollaborativeDocService {
  constructor(private readonly storage: StorageService) {}

  async updateDocument(path: string, content: Buffer, expectedEtag: string) {
    const disk = this.storage.disk('local');

    // Only write if the file's current ETag matches (optimistic concurrency)
    const result = await disk.putIfMatch(path, content, expectedEtag);
    if (!result) {
      throw new ConflictException('Document was modified by another user');
    }

    return result;
  }

  async createIfNew(path: string, content: Buffer) {
    const disk = this.storage.disk('local');

    // Only write if the file does NOT exist (prevent accidental overwrite)
    const result = await disk.putIfNoneMatch(path, content);
    if (!result) {
      throw new ConflictException('File already exists');
    }

    return result;
  }
}
```

## Temporary Files

The Local driver supports `putTemp()` to write files with an automatic TTL. A sidecar metadata file tracks the expiration time:

```typescript
// Write a temp file that expires in 1 hour (3600 seconds)
await disk.putTemp('exports/report.csv', csvBuffer, { ttl: 3600 });

// The file is automatically cleaned up after expiration
// by the TempCleanupService (see /services/temp-cleanup)
```

::: info
Temporary file cleanup requires the `TempCleanupService` to be running. See the [Temp Cleanup Service](/services/temp-cleanup) documentation for setup.
:::

## Multipart Uploads

For large files, the Local driver supports multipart uploads by writing parts to a temporary directory and concatenating them on completion:

```typescript
@Injectable()
export class LargeUploadService {
  constructor(private readonly storage: StorageService) {}

  async handleChunkedUpload(path: string, totalParts: number) {
    const disk = this.storage.disk('local');

    // Initialize the multipart upload
    const uploadId = await disk.initMultipartUpload(path);

    return { uploadId };
  }

  async uploadPart(uploadId: string, partNumber: number, data: Buffer) {
    const disk = this.storage.disk('local');

    // Upload individual parts
    const part = await disk.putPart(uploadId, partNumber, data);

    return part;
  }

  async finalizeUpload(uploadId: string, parts: any[]) {
    const disk = this.storage.disk('local');

    // Concatenate all parts into the final file
    await disk.completeMultipartUpload(uploadId, parts);
  }
}
```

## Streaming

```typescript
import { Controller, Get, Res, Param } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '@fozooni/nestjs-storage';

@Controller('downloads')
export class DownloadController {
  constructor(private readonly storage: StorageService) {}

  @Get(':path')
  async download(@Param('path') path: string, @Res() res: Response) {
    const disk = this.storage.disk('local');

    const stream = await disk.getStream(path);
    const meta = await disk.getMetadata(path);

    res.set({
      'Content-Type': meta.mimeType ?? 'application/octet-stream',
      'Content-Length': meta.size?.toString(),
      'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
    });

    stream.pipe(res);
  }
}
```

## Directory Operations

The Local driver provides native directory operations:

```typescript
const disk = this.storage.disk('local');

// Create a directory
await disk.createDirectory('uploads/2024/03');

// Delete a directory and all contents
await disk.deleteDirectory('uploads/2024/03');

// List directory contents
const items = await disk.listContents('uploads');
for (const item of items) {
  console.log(item.path, item.type); // 'file' or 'directory'
}
```

## When to Use Local

| Use Case | Recommendation |
|---|---|
| Local development | Ideal — no cloud credentials needed |
| Self-hosted deployments | Good — full control over storage |
| Single-server applications | Good — simple and fast |
| Edge / embedded deployments | Good — no network dependency |
| Multi-server / horizontal scaling | Avoid — use shared storage (S3, GCS, etc.) |
| High availability requirements | Avoid — no built-in replication |
| CDN / global distribution | Avoid — use a cloud driver with CDN integration |

::: warning Production Considerations
The Local driver stores files on a single server's filesystem. In horizontally scaled deployments (multiple app instances), each server has its own independent storage. Use a cloud driver (S3, GCS, Azure) for shared storage, or mount a network filesystem (NFS, EFS) at the configured `root` path.
:::
