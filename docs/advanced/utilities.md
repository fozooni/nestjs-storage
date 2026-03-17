---
title: Utility Functions
description: Path, file, stream, S3, and visibility helper functions exported by @fozooni/nestjs-storage
---

# Utility Functions

`@fozooni/nestjs-storage` exports a comprehensive set of utility functions for working with paths, files, streams, S3 URLs, and visibility. All utilities are importable from the main package:

```ts
import {
  normalizePath,
  joinPaths,
  getContentType,
  streamToBuffer,
  parseS3Url,
  // ...
} from '@fozooni/nestjs-storage';
```

## Path Utilities

### `normalizePath(path)`

Normalizes a file path by removing leading/trailing slashes, collapsing double slashes, and resolving `.`/`..` segments.

```ts
import { normalizePath } from '@fozooni/nestjs-storage';

normalizePath('/uploads//photos/../images/cat.jpg');
// → 'uploads/images/cat.jpg'

normalizePath('///foo///bar///');
// → 'foo/bar'

normalizePath('./relative/path');
// → 'relative/path'

normalizePath('');
// → ''
```

**Signature:**
```ts
function normalizePath(path: string): string;
```

### `joinPaths(...segments)`

Joins multiple path segments and normalizes the result. Similar to `path.join()` but designed for storage paths (always uses `/`).

```ts
import { joinPaths } from '@fozooni/nestjs-storage';

joinPaths('uploads', 'images', 'photo.jpg');
// → 'uploads/images/photo.jpg'

joinPaths('tenants/', '/tenant-123/', '/files/doc.pdf');
// → 'tenants/tenant-123/files/doc.pdf'

joinPaths('', 'foo', '', 'bar');
// → 'foo/bar'
```

**Signature:**
```ts
function joinPaths(...segments: string[]): string;
```

### `getDirectory(path)`

Returns the directory portion of a file path.

```ts
import { getDirectory } from '@fozooni/nestjs-storage';

getDirectory('uploads/images/photo.jpg');
// → 'uploads/images'

getDirectory('photo.jpg');
// → ''

getDirectory('a/b/c/d/file.txt');
// → 'a/b/c/d'
```

**Signature:**
```ts
function getDirectory(path: string): string;
```

### `getFilename(path)`

Returns the filename (with extension) from a file path.

```ts
import { getFilename } from '@fozooni/nestjs-storage';

getFilename('uploads/images/photo.jpg');
// → 'photo.jpg'

getFilename('just-a-file.txt');
// → 'just-a-file.txt'

getFilename('path/to/directory/');
// → ''
```

**Signature:**
```ts
function getFilename(path: string): string;
```

### `sanitizePath(path)`

Sanitizes a path by removing dangerous characters and traversal attempts. Useful for processing user-supplied file paths.

```ts
import { sanitizePath } from '@fozooni/nestjs-storage';

sanitizePath('../../../etc/passwd');
// → 'etc/passwd'

sanitizePath('uploads/../../secrets/key.pem');
// → 'uploads/secrets/key.pem'

sanitizePath('normal/path/file.txt');
// → 'normal/path/file.txt'

sanitizePath('file name with spaces & (special).txt');
// → 'file name with spaces & (special).txt'
```

**Signature:**
```ts
function sanitizePath(path: string): string;
```

### `isDirectory(path)`

Checks whether a path string looks like a directory (ends with `/`).

```ts
import { isDirectory } from '@fozooni/nestjs-storage';

isDirectory('uploads/images/');
// → true

isDirectory('uploads/images/photo.jpg');
// → false

isDirectory('');
// → false
```

**Signature:**
```ts
function isDirectory(path: string): boolean;
```

## File Utilities

### `generateUniqueFilename(originalName)`

Generates a unique filename using UUID v4 while preserving the original extension.

```ts
import { generateUniqueFilename } from '@fozooni/nestjs-storage';

generateUniqueFilename('photo.jpg');
// → 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg'

generateUniqueFilename('document.pdf');
// → '98765432-abcd-ef01-2345-678901234567.pdf'

generateUniqueFilename('no-extension');
// → 'f0e1d2c3-b4a5-6789-0123-456789abcdef'
```

**Signature:**
```ts
function generateUniqueFilename(originalName: string): string;
```

### `getContentType(path)`

Returns the MIME type for a file based on its extension. Falls back to `'application/octet-stream'` for unknown types.

```ts
import { getContentType } from '@fozooni/nestjs-storage';

getContentType('photo.jpg');
// → 'image/jpeg'

getContentType('styles.css');
// → 'text/css'

getContentType('data.json');
// → 'application/json'

getContentType('archive.tar.gz');
// → 'application/gzip'

getContentType('unknown.xyz');
// → 'application/octet-stream'
```

**Signature:**
```ts
function getContentType(path: string): string;
```

### `getFileExtension(path)`

Returns the file extension (with leading dot) from a path.

```ts
import { getFileExtension } from '@fozooni/nestjs-storage';

getFileExtension('photo.jpg');
// → '.jpg'

getFileExtension('archive.tar.gz');
// → '.gz'

getFileExtension('no-extension');
// → ''

getFileExtension('.gitignore');
// → ''
```

**Signature:**
```ts
function getFileExtension(path: string): string;
```

### `formatFileSize(bytes)`

Formats a byte count into a human-readable string.

```ts
import { formatFileSize } from '@fozooni/nestjs-storage';

formatFileSize(0);
// → '0 B'

formatFileSize(1024);
// → '1.00 KB'

formatFileSize(1_048_576);
// → '1.00 MB'

formatFileSize(5_368_709_120);
// → '5.00 GB'

formatFileSize(1_234_567);
// → '1.18 MB'
```

**Signature:**
```ts
function formatFileSize(bytes: number): string;
```

## Stream Utilities

### `streamToBuffer(stream)`

Reads an entire readable stream into a Buffer.

```ts
import { streamToBuffer } from '@fozooni/nestjs-storage';

const stream = await disk.get('file.bin', { responseType: 'stream' });
const buffer = await streamToBuffer(stream);

console.log(buffer.length); // Total bytes
```

**Signature:**
```ts
function streamToBuffer(stream: Readable | ReadableStream): Promise<Buffer>;
```

### `streamToString(stream)`

Reads an entire readable stream into a UTF-8 string.

```ts
import { streamToString } from '@fozooni/nestjs-storage';

const stream = await disk.get('config.json', { responseType: 'stream' });
const content = await streamToString(stream);
const config = JSON.parse(content);
```

**Signature:**
```ts
function streamToString(stream: Readable | ReadableStream): Promise<string>;
```

### `isStream(value)`

Type guard that checks whether a value is a readable stream.

```ts
import { isStream } from '@fozooni/nestjs-storage';

const result = await disk.get('file.txt'); // May be string or stream

if (isStream(result)) {
  const buffer = await streamToBuffer(result);
  console.log('Got stream, size:', buffer.length);
} else {
  console.log('Got string, length:', result.length);
}
```

**Signature:**
```ts
function isStream(value: unknown): value is Readable;
```

## S3 Utilities

### `parseS3Url(url)`

Parses various S3 URL formats into their component parts: bucket, key, and region.

```ts
import { parseS3Url } from '@fozooni/nestjs-storage';

// S3 protocol
parseS3Url('s3://my-bucket/path/to/file.txt');
// → { bucket: 'my-bucket', key: 'path/to/file.txt', region: undefined }

// Virtual-hosted style
parseS3Url('https://my-bucket.s3.us-east-1.amazonaws.com/path/to/file.txt');
// → { bucket: 'my-bucket', key: 'path/to/file.txt', region: 'us-east-1' }

// Path-style
parseS3Url('https://s3.us-west-2.amazonaws.com/my-bucket/path/to/file.txt');
// → { bucket: 'my-bucket', key: 'path/to/file.txt', region: 'us-west-2' }

// Global endpoint
parseS3Url('https://my-bucket.s3.amazonaws.com/file.txt');
// → { bucket: 'my-bucket', key: 'file.txt', region: undefined }
```

**Signature:**
```ts
function parseS3Url(url: string): {
  bucket: string;
  key: string;
  region?: string;
};
```

### `encodeS3Key(key)`

URL-encodes an S3 object key, handling special characters that S3 requires encoded.

```ts
import { encodeS3Key } from '@fozooni/nestjs-storage';

encodeS3Key('photos/summer 2026/img (1).jpg');
// → 'photos/summer%202026/img%20%281%29.jpg'

encodeS3Key('normal/path/file.txt');
// → 'normal/path/file.txt'

encodeS3Key('special+chars=in&key');
// → 'special%2Bchars%3Din%26key'
```

**Signature:**
```ts
function encodeS3Key(key: string): string;
```

### `buildS3Url(bucket, key, region?)`

Constructs an S3 URL from components.

```ts
import { buildS3Url } from '@fozooni/nestjs-storage';

buildS3Url('my-bucket', 'path/to/file.txt', 'us-east-1');
// → 'https://my-bucket.s3.us-east-1.amazonaws.com/path/to/file.txt'

buildS3Url('my-bucket', 'file.txt');
// → 'https://my-bucket.s3.amazonaws.com/file.txt'
```

**Signature:**
```ts
function buildS3Url(bucket: string, key: string, region?: string): string;
```

## Visibility Utilities

### `visibilityToAcl(visibility)`

Converts a `Visibility` value to an S3 ACL string.

```ts
import { visibilityToAcl } from '@fozooni/nestjs-storage';

visibilityToAcl('public');
// → 'public-read'

visibilityToAcl('private');
// → 'private'
```

**Signature:**
```ts
function visibilityToAcl(visibility: Visibility): string;
```

### `aclToVisibility(acl)`

Converts an S3 ACL string to a `Visibility` value.

```ts
import { aclToVisibility } from '@fozooni/nestjs-storage';

aclToVisibility('public-read');
// → 'public'

aclToVisibility('private');
// → 'private'

aclToVisibility('public-read-write');
// → 'public'
```

**Signature:**
```ts
function aclToVisibility(acl: string): Visibility;
```

## Client Wrappers

### `S3ClientWrapper`

A thin wrapper around the AWS S3 client that handles common patterns like retries, content type detection, and response parsing. Used internally by `S3Disk` and all S3-compatible drivers.

```ts
import { S3ClientWrapper } from '@fozooni/nestjs-storage';

// Typically you don't need this directly, but it's available
// for advanced use cases like custom S3-compatible integrations
const wrapper = new S3ClientWrapper({
  bucket: 'my-bucket',
  region: 'us-east-1',
  credentials: {
    accessKeyId: '...',
    secretAccessKey: '...',
  },
});

// Direct S3 operations outside the disk abstraction
const result = await wrapper.headObject('path/to/file.txt');
```

### `GcsClientWrapper`

A thin wrapper around the Google Cloud Storage client. Used internally by `GcsDisk`.

```ts
import { GcsClientWrapper } from '@fozooni/nestjs-storage';

const wrapper = new GcsClientWrapper({
  bucket: 'my-gcs-bucket',
  projectId: 'my-project',
});
```

::: tip When to Use Wrappers Directly
In most cases, use `FilesystemContract` methods through `StorageService` or `@InjectDisk()`. The client wrappers are useful when you need:
- Direct access to provider-specific features not exposed by `FilesystemContract`
- Custom retry logic that differs from the built-in behavior
- Low-level operations like listing object versions or managing bucket policies
:::

## Usage in Services

Combining utilities in a real service:

```ts
import { Injectable } from '@nestjs/common';
import {
  InjectDisk,
  FilesystemContract,
  normalizePath,
  sanitizePath,
  getContentType,
  generateUniqueFilename,
  formatFileSize,
  streamToBuffer,
} from '@fozooni/nestjs-storage';

@Injectable()
export class FileProcessingService {
  constructor(
    @InjectDisk('uploads')
    private readonly disk: FilesystemContract,
  ) {}

  async processUpload(
    userPath: string,
    data: Buffer,
  ): Promise<{
    path: string;
    url: string;
    size: string;
    mimetype: string;
  }> {
    // Sanitize user-provided path
    const safePath = sanitizePath(userPath);

    // Generate a unique filename
    const uniqueName = generateUniqueFilename(safePath);

    // Build the full path
    const fullPath = normalizePath(`processed/${uniqueName}`);

    // Detect content type
    const mimetype = getContentType(safePath);

    // Store the file
    await this.disk.put(fullPath, data, { mimetype });

    return {
      path: fullPath,
      url: await this.disk.url(fullPath),
      size: formatFileSize(data.length),
      mimetype,
    };
  }
}
```
