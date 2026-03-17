# Core Operations

Every disk in `@fozooni/nestjs-storage` implements the `FilesystemContract` interface, giving you a consistent API across all 9 drivers and 10 decorator disks. This page covers every core operation with examples.

## Selecting a Disk

Before performing operations, select which disk to use:

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(private readonly storage: StorageService) {}

  async example() {
    // Use the default disk
    const disk = this.storage.disk();

    // Use a named disk
    const s3 = this.storage.disk('s3');

    // Use the first cloud disk
    const cloud = this.storage.cloud();

    // Find a disk by bucket name
    const byBucket = this.storage.diskByBucket('my-bucket');

    // Build a disk from config on the fly
    const custom = this.storage.build({
      driver: 's3',
      bucket: 'one-off-bucket',
      region: 'eu-west-1',
    });
  }
}
```

## Reading Files

### `exists(path)` and `missing(path)`

Check whether a file exists on disk:

```typescript
const exists: boolean = await disk.exists('reports/q1-2026.pdf');
const missing: boolean = await disk.missing('reports/q1-2026.pdf');

if (await disk.missing('config.json')) {
  await disk.put('config.json', JSON.stringify({ version: 1 }));
}
```

### `get(path, options?)`

Read file contents. The `responseType` option controls the return type:

```typescript
// Default: returns a string (UTF-8)
const text: string = await disk.get('readme.txt');

// Explicitly request a string
const str: string = await disk.get('readme.txt', { responseType: 'string' });

// Get raw bytes
const buffer: Buffer = await disk.get('image.png', { responseType: 'buffer' });

// Get a readable stream
const stream: Readable = await disk.get('video.mp4', { responseType: 'stream' });
```

::: warning
When reading binary files (images, PDFs, videos), always use `responseType: 'buffer'` or `responseType: 'stream'`. The default `'string'` mode interprets bytes as UTF-8, which will corrupt binary data.
:::

### `json(path, schema?)`

Read and parse a JSON file. Optionally validate with a Zod schema:

```typescript
// Parse without validation
const data = await disk.json<{ name: string }>('config.json');
console.log(data.name);

// Parse with Zod validation
import { z } from 'zod';

const AppConfig = z.object({
  name: z.string(),
  version: z.number(),
  features: z.array(z.string()),
});

const config = await disk.json('config.json', AppConfig);
// config is fully typed as { name: string; version: number; features: string[] }
```

::: tip
When using Zod validation, invalid JSON will throw a `ZodError` with detailed information about which fields failed validation. This is excellent for configuration files and API responses.
:::

## Writing Files

### `put(path, content, options?)`

Write content to a file. Creates the file if it does not exist; overwrites if it does:

```typescript
// Write a string
await disk.put('notes.txt', 'Hello, world!');

// Write a buffer
await disk.put('image.png', imageBuffer);

// Write with options
await disk.put('avatar.jpg', imageBuffer, {
  visibility: 'public',
  mimetype: 'image/jpeg',
  metadata: {
    uploadedBy: 'user-123',
    originalName: 'profile.jpg',
  },
  CacheControl: 'public, max-age=31536000',
});
```

### `PutOptions` Interface

| Option | Type | Description |
|--------|------|-------------|
| `visibility` | `'public' \| 'private'` | Override the disk default visibility for this file. |
| `mimetype` | `string` | Set the Content-Type. Auto-detected from extension if omitted. |
| `metadata` | `Record<string, string>` | Custom key-value metadata stored alongside the file. |
| `CacheControl` | `string` | HTTP Cache-Control header value. |

### `putFile(directory, file, options?)`

Store a file using the configured naming strategy:

```typescript
import { UuidNamingStrategy } from '@fozooni/nestjs-storage';

// Uses the disk's default naming strategy, or OriginalNamingStrategy if none set
const path = await disk.putFile('uploads', multerFile);
// => 'uploads/550e8400-e29b-41d4-a716-446655440000.jpg'

// Override the naming strategy per call
const path = await disk.putFile('uploads', multerFile, {
  namingStrategy: new UuidNamingStrategy(),
});
```

### `putFileAs(directory, file, name, options?)`

Store a file with an explicit name:

```typescript
const path = await disk.putFileAs('avatars', multerFile, 'user-123.jpg');
// => 'avatars/user-123.jpg'

const path = await disk.putFileAs('documents', pdfFile, 'invoice-2026-001.pdf', {
  visibility: 'private',
});
```

### Conditional Writes

Prevent accidental overwrites using ETags:

```typescript
// Only write if the file matches the given ETag (optimistic concurrency)
await disk.putIfMatch('config.json', newContent, currentEtag);

// Only write if the file does NOT exist (create-only)
await disk.putIfNoneMatch('config.json', initialContent, '*');
```

::: info
Conditional writes are supported on `LocalDisk`, `S3Disk`, and `FakeDisk`. They throw a `StorageError` with a `412 Precondition Failed` semantic if the condition is not met.
:::

## Deleting Files

### `delete(path)`

Delete a single file:

```typescript
await disk.delete('temp/processing.tmp');
```

### `deleteMany(paths)`

Delete multiple files in a single operation. Returns a result for each path:

```typescript
const results = await disk.deleteMany([
  'temp/file1.tmp',
  'temp/file2.tmp',
  'temp/file3.tmp',
]);

for (const result of results) {
  if (!result.deleted) {
    console.warn(`Failed to delete: ${result.path}`, result.error);
  }
}
```

## Copying and Moving Files

### `copy(source, destination, options?)`

Copy a file within the same disk:

```typescript
await disk.copy('templates/default.html', 'sites/user-123/index.html');
```

### `move(source, destination, options?)`

Move (rename) a file within the same disk:

```typescript
await disk.move('uploads/temp/abc123.jpg', 'uploads/avatars/user-123.jpg');
```

::: tip
To copy or move files **between disks**, read from one and write to the other:
```typescript
const content = await sourceDisk.get('file.pdf', { responseType: 'buffer' });
await targetDisk.put('file.pdf', content);
await sourceDisk.delete('file.pdf'); // if moving
```
Or use `StorageMigrator` for bulk cross-disk operations.
:::

## File Metadata

### `size(path)`

Get the file size in bytes:

```typescript
const bytes: number = await disk.size('video.mp4');
console.log(`File size: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
```

### `lastModified(path)`

Get the last modification date:

```typescript
const modified: Date = await disk.lastModified('report.pdf');
console.log(`Last modified: ${modified.toISOString()}`);
```

### `mimeType(path)`

Get the MIME type of a file:

```typescript
const mime: string = await disk.mimeType('document.pdf');
// => 'application/pdf'
```

### `getMetadata(path)`

Retrieve custom metadata stored with the file:

```typescript
interface FileMetadata {
  uploadedBy: string;
  originalName: string;
}

const meta = await disk.getMetadata<FileMetadata>('uploads/abc123.jpg');
console.log(meta.uploadedBy); // => 'user-123'
```

### `checksum(path, algorithm?)`

Calculate a file checksum:

```typescript
// Default: MD5
const md5: string = await disk.checksum('release.zip');

// SHA-256
const sha256: string = await disk.checksum('release.zip', 'sha256');
```

## Content Manipulation

### `prepend(path, content)`

Add content to the beginning of a file:

```typescript
await disk.prepend('log.txt', `[${new Date().toISOString()}] Server started\n`);
```

### `append(path, content)`

Add content to the end of a file:

```typescript
await disk.append('log.txt', `[${new Date().toISOString()}] Request processed\n`);
```

## Directory Operations

### `files(directory)`

List files in a directory (non-recursive):

```typescript
const fileList: string[] = await disk.files('uploads');
// => ['uploads/image1.jpg', 'uploads/image2.png']
```

### `allFiles(directory)`

List files recursively:

```typescript
const allFilesList: string[] = await disk.allFiles('uploads');
// => ['uploads/image1.jpg', 'uploads/2026/03/report.pdf', ...]
```

### `directories(directory)`

List subdirectories (non-recursive):

```typescript
const dirs: string[] = await disk.directories('uploads');
// => ['uploads/images', 'uploads/documents']
```

### `allDirectories(directory)`

List subdirectories recursively:

```typescript
const allDirs: string[] = await disk.allDirectories('uploads');
// => ['uploads/images', 'uploads/images/thumbs', 'uploads/documents', ...]
```

### `makeDirectory(path)`

Create a directory:

```typescript
await disk.makeDirectory('uploads/2026/03');
```

### `deleteDirectory(path)`

Delete a directory and all its contents:

```typescript
await disk.deleteDirectory('temp/processing');
```

### `directorySize(path)`

Calculate the total size of all files in a directory:

```typescript
const totalBytes: number = await disk.directorySize('uploads');
console.log(`Total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
```

## Streaming

### `getStreamableFile(path, options?)`

Get a NestJS `StreamableFile` for efficient HTTP responses:

```typescript
import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '@fozooni/nestjs-storage';

@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get(':path(*)')
  async download(
    @Param('path') path: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const disk = this.storage.disk();
    const mime = await disk.mimeType(path);
    const size = await disk.size(path);

    res.set({
      'Content-Type': mime,
      'Content-Length': size.toString(),
      'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
    });

    return disk.getStreamableFile(path);
  }
}
```

### Range Requests

Serve partial content for video/audio streaming:

```typescript
import { Controller, Get, Param, Headers, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '@fozooni/nestjs-storage';

@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get(':path(*)')
  async stream(
    @Param('path') path: string,
    @Headers('range') range: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.storage.serveRange(this.storage.disk(), path, range, res);
  }
}
```

You can also use the `@RangeServe()` decorator for a more declarative approach:

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { RangeServe } from '@fozooni/nestjs-storage';

@Controller('media')
export class MediaController {
  @Get(':path(*)')
  @RangeServe()
  async stream(@Param('path') path: string) {
    return { disk: 'local', path };
  }
}
```

## Visibility

### `setVisibility(path, visibility)`

Change the visibility of a file after it has been written:

```typescript
// Make a private file public
await disk.setVisibility('reports/public-summary.pdf', 'public');

// Make a public file private
await disk.setVisibility('uploads/sensitive.pdf', 'private');
```

### `getVisibility(path)`

Check the current visibility:

```typescript
const visibility = await disk.getVisibility('reports/public-summary.pdf');
// => 'public' or 'private'
```

## Complete Service Example

Here is a full example of a document management service using multiple core operations:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { StorageService, StorageFileNotFoundError } from '@fozooni/nestjs-storage';
import { z } from 'zod';

const DocumentMeta = z.object({
  title: z.string(),
  author: z.string(),
  createdAt: z.string().datetime(),
  tags: z.array(z.string()),
});

type DocumentMeta = z.infer<typeof DocumentMeta>;

@Injectable()
export class DocumentsService {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.disk('s3');
  }

  async upload(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ path: string; url: string }> {
    const directory = `documents/${userId}`;
    const path = await this.disk.putFile(directory, file, {
      visibility: 'private',
      metadata: {
        uploadedBy: userId,
        originalName: file.originalname,
      },
    });

    // Store metadata sidecar
    const metaPath = `${path}.meta.json`;
    const meta: DocumentMeta = {
      title: file.originalname,
      author: userId,
      createdAt: new Date().toISOString(),
      tags: [],
    };
    await this.disk.put(metaPath, JSON.stringify(meta));

    return { path, url: await this.disk.url(path) };
  }

  async getDocument(path: string): Promise<Buffer> {
    try {
      return await this.disk.get(path, { responseType: 'buffer' });
    } catch (error) {
      if (error instanceof StorageFileNotFoundError) {
        throw new NotFoundException(`Document not found: ${path}`);
      }
      throw error;
    }
  }

  async getDocumentMeta(path: string): Promise<DocumentMeta> {
    return this.disk.json(`${path}.meta.json`, DocumentMeta);
  }

  async listUserDocuments(userId: string): Promise<string[]> {
    return this.disk.allFiles(`documents/${userId}`);
  }

  async deleteDocument(path: string): Promise<void> {
    await this.disk.deleteMany([path, `${path}.meta.json`]);
  }

  async getStorageUsage(userId: string): Promise<number> {
    return this.disk.directorySize(`documents/${userId}`);
  }
}
```

## Next Steps

Now that you understand core operations, learn how to handle [File Uploads](./file-uploads) with interceptors and validation pipes.
