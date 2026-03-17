---
title: FilesystemContract
description: The core interface implemented by all disks in @fozooni/nestjs-storage
---

# FilesystemContract

`FilesystemContract` is the core interface that every storage disk implements. It defines both required methods (available on all disks) and optional methods (available on some disks depending on the driver).

```ts
import { FilesystemContract } from '@fozooni/nestjs-storage';
```

## Core Methods (Required)

Every disk — including `LocalDisk`, `S3Disk`, `GcsDisk`, `AzureDisk`, `FakeDisk`, and all decorator disks — implements these methods.

### File Operations

#### `exists(path)`

Checks whether a file exists at the given path.

```ts
exists(path: string): Promise<boolean>;
```

```ts
const found = await disk.exists('documents/report.pdf');
// true | false
```

---

#### `get(path, options?)`

Reads a file's contents. Returns a string by default, or a Buffer/stream based on options.

```ts
get(path: string, options?: GetOptions): Promise<string | Buffer | Readable>;
```

```ts
// As string (default)
const text = await disk.get('config.json');

// As Buffer
const buffer = await disk.get('image.png', { responseType: 'buffer' });

// As stream
const stream = await disk.get('video.mp4', { responseType: 'stream' });
```

---

#### `put(path, contents, options?)`

Writes content to a file. Creates or overwrites.

```ts
put(path: string, contents: string | Buffer, options?: PutOptions): Promise<void>;
```

```ts
await disk.put('notes.txt', 'Hello, world!');

await disk.put('data.json', JSON.stringify(data), {
  mimetype: 'application/json',
  visibility: 'private',
  metadata: { author: 'system' },
});
```

---

#### `putFile(path, file, options?)`

Writes a file (Buffer, Readable, or multer file) to the given directory, auto-generating a filename.

```ts
putFile(path: string, file: Buffer | Readable | Express.Multer.File, options?: PutOptions): Promise<string>;
```

```ts
const storedPath = await disk.putFile('uploads', fileBuffer);
// 'uploads/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg'
```

---

#### `putFileAs(path, file, name, options?)`

Writes a file to the given directory with a specific filename.

```ts
putFileAs(path: string, file: Buffer | Readable | Express.Multer.File, name: string, options?: PutOptions): Promise<string>;
```

```ts
const storedPath = await disk.putFileAs('avatars', imageBuffer, 'user-123.jpg');
// 'avatars/user-123.jpg'
```

---

#### `delete(path)`

Deletes a file at the given path.

```ts
delete(path: string): Promise<boolean>;
```

```ts
const deleted = await disk.delete('temp/old-file.txt');
// true
```

---

#### `copy(source, destination)`

Copies a file from one path to another within the same disk.

```ts
copy(source: string, destination: string): Promise<void>;
```

```ts
await disk.copy('originals/photo.jpg', 'backups/photo.jpg');
```

---

#### `move(source, destination)`

Moves (renames) a file from one path to another within the same disk.

```ts
move(source: string, destination: string): Promise<void>;
```

```ts
await disk.move('uploads/temp.jpg', 'photos/final.jpg');
```

### File Information

#### `size(path)`

Returns the file size in bytes.

```ts
size(path: string): Promise<number>;
```

```ts
const bytes = await disk.size('video.mp4');
// 52428800
```

---

#### `lastModified(path)`

Returns the last modification date.

```ts
lastModified(path: string): Promise<Date>;
```

```ts
const date = await disk.lastModified('report.pdf');
// Date object
```

---

#### `mimeType(path)`

Returns the MIME type of a file.

```ts
mimeType(path: string): Promise<string | null>;
```

```ts
const type = await disk.mimeType('photo.jpg');
// 'image/jpeg'
```

---

#### `getMetadata(path)`

Returns detailed metadata about a file.

```ts
getMetadata(path: string): Promise<FileMetadata>;
```

```ts
const meta = await disk.getMetadata('document.pdf');
// { size: 1024, lastModified: Date, mimetype: 'application/pdf', etag: '"abc123"', metadata: {} }
```

---

#### `getVisibility(path)`

Returns the visibility (public/private) of a file.

```ts
getVisibility(path: string): Promise<Visibility>;
```

```ts
const vis = await disk.getVisibility('photos/public.jpg');
// 'public'
```

---

#### `setVisibility(path, visibility)`

Sets the visibility of a file.

```ts
setVisibility(path: string, visibility: Visibility): Promise<void>;
```

```ts
await disk.setVisibility('photos/public.jpg', 'private');
```

### URLs

#### `url(path)`

Returns the public URL for a file.

```ts
url(path: string): Promise<string>;
```

```ts
const publicUrl = await disk.url('images/logo.png');
// 'https://my-bucket.s3.amazonaws.com/images/logo.png'
```

---

#### `temporaryUrl(path, expiresInSeconds)`

Returns a signed URL that expires after the given number of seconds.

```ts
temporaryUrl(path: string, expiresInSeconds: number): Promise<string>;
```

```ts
const signedUrl = await disk.temporaryUrl('private/report.pdf', 3600);
// 'https://my-bucket.s3.amazonaws.com/private/report.pdf?X-Amz-...'
```

### Content Modification

#### `prepend(path, data)`

Prepends content to the beginning of a file.

```ts
prepend(path: string, data: string | Buffer): Promise<void>;
```

```ts
await disk.prepend('log.txt', '[2026-03-17] System start\n');
```

---

#### `append(path, data)`

Appends content to the end of a file.

```ts
append(path: string, data: string | Buffer): Promise<void>;
```

```ts
await disk.append('log.txt', '[2026-03-17] Event occurred\n');
```

### Directory Operations

#### `files(directory?)`

Lists files in a directory (non-recursive).

```ts
files(directory?: string): Promise<string[]>;
```

```ts
const fileList = await disk.files('uploads');
// ['uploads/a.jpg', 'uploads/b.png']
```

---

#### `allFiles(directory?)`

Lists files recursively in a directory and all subdirectories.

```ts
allFiles(directory?: string): Promise<string[]>;
```

```ts
const allFileList = await disk.allFiles('uploads');
// ['uploads/a.jpg', 'uploads/sub/b.png', 'uploads/sub/deep/c.gif']
```

---

#### `directories(directory?)`

Lists immediate subdirectories.

```ts
directories(directory?: string): Promise<string[]>;
```

```ts
const dirs = await disk.directories('uploads');
// ['uploads/images', 'uploads/documents']
```

---

#### `allDirectories(directory?)`

Lists all subdirectories recursively.

```ts
allDirectories(directory?: string): Promise<string[]>;
```

```ts
const allDirs = await disk.allDirectories('uploads');
// ['uploads/images', 'uploads/documents', 'uploads/documents/2026']
```

---

#### `makeDirectory(path)`

Creates a directory (and intermediate directories).

```ts
makeDirectory(path: string): Promise<void>;
```

```ts
await disk.makeDirectory('uploads/images/thumbnails');
```

---

#### `deleteDirectory(path)`

Deletes a directory and all its contents.

```ts
deleteDirectory(path: string): Promise<void>;
```

```ts
await disk.deleteDirectory('uploads/temp');
```

---

#### `directorySize(path)`

Returns the total size of all files in a directory in bytes.

```ts
directorySize(path: string): Promise<number>;
```

```ts
const totalBytes = await disk.directorySize('uploads');
// 1073741824
```

## Optional Methods

These methods are available on some disks. Check for their existence before calling, or use TypeScript optional chaining.

### Convenience Methods

#### `missing(path)`

Inverse of `exists()` — returns `true` if the file does not exist.

```ts
missing?(path: string): Promise<boolean>;
```

```ts
if (await disk.missing?.('config.json')) {
  await disk.put('config.json', '{}');
}
```

---

#### `json(path)`

Reads a file and parses its contents as JSON.

```ts
json?<T = unknown>(path: string): Promise<T>;
```

```ts
const config = await disk.json<AppConfig>('config.json');
```

---

#### `checksum(path, algorithm?)`

Computes a checksum of the file contents.

```ts
checksum?(path: string, algorithm?: ChecksumAlgorithm): Promise<string>;
```

```ts
const md5 = await disk.checksum?.('file.bin', 'md5');
const sha256 = await disk.checksum?.('file.bin', 'sha256');
```

---

#### `deleteMany(paths)`

Deletes multiple files in a single operation.

```ts
deleteMany?(paths: string[]): Promise<DeleteManyResult>;
```

```ts
const result = await disk.deleteMany?.(['a.txt', 'b.txt', 'c.txt']);
// { succeeded: ['a.txt', 'b.txt'], failed: ['c.txt'] }
```

---

#### `getBucket()`

Returns the bucket/container name for cloud disks.

```ts
getBucket?(): string;
```

```ts
const bucket = disk.getBucket?.();
// 'my-s3-bucket'
```

---

#### `scope(prefix)`

Returns a new disk instance scoped to the given path prefix.

```ts
scope?(prefix: string): FilesystemContract;
```

```ts
const userDisk = disk.scope?.('users/123');
await userDisk?.put('avatar.jpg', imageData);
// Writes to 'users/123/avatar.jpg'
```

---

#### `putTemp(contents, extension?, options?)`

Writes content to a temporary file with an auto-generated path.

```ts
putTemp?(contents: string | Buffer, extension?: string, options?: PutOptions): Promise<string>;
```

```ts
const tempPath = await disk.putTemp?.(csvData, 'csv');
// 'tmp/a1b2c3d4.csv'
```

---

#### `invalidateCdn(paths)`

Invalidates CDN cache for the given paths.

```ts
invalidateCdn?(paths: string[]): Promise<void>;
```

```ts
await disk.invalidateCdn?.(['images/hero.jpg', 'css/styles.css']);
```

### Presigned POST

#### `presignedPost(path, options?)`

Generates a presigned POST payload for direct browser-to-cloud uploads.

```ts
presignedPost?(path: string, options?: PresignedPostOptions): Promise<PresignedPostData>;
```

```ts
const post = await disk.presignedPost?.('uploads/photo.jpg', {
  expires: 300,
  maxSize: 10 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png'],
});
// { url: 'https://bucket.s3.amazonaws.com', fields: { ... } }
```

### Multipart Upload

#### `initMultipartUpload(path, options?)`

Initializes a multipart upload session.

```ts
initMultipartUpload?(path: string, options?: PutOptions): Promise<MultipartUploadInit>;
```

---

#### `uploadPart(uploadId, partNumber, data, path)`

Uploads a single part of a multipart upload.

```ts
uploadPart?(uploadId: string, partNumber: number, data: Buffer | Readable, path: string): Promise<MultipartUploadPart>;
```

---

#### `completeMultipartUpload(uploadId, path, parts)`

Completes a multipart upload by assembling all parts.

```ts
completeMultipartUpload?(uploadId: string, path: string, parts: MultipartUploadPart[]): Promise<boolean>;
```

---

#### `abortMultipartUpload(uploadId, path)`

Aborts a multipart upload and cleans up uploaded parts.

```ts
abortMultipartUpload?(uploadId: string, path: string): Promise<boolean>;
```

---

#### `putFileMultipart(path, file, options?)`

High-level convenience method for multipart uploads with automatic chunking.

```ts
putFileMultipart?(path: string, file: Buffer | Readable, options?: MultipartUploadOptions): Promise<boolean>;
```

### Versioning

#### `listVersions(path)`

Lists all versions of a file.

```ts
listVersions?(path: string): Promise<FileVersion[]>;
```

```ts
const versions = await disk.listVersions?.('document.pdf');
// [{ versionId: '...', size: 1024, lastModified: Date, isLatest: true }, ...]
```

---

#### `getVersion(path, versionId)`

Retrieves the content of a specific file version.

```ts
getVersion?(path: string, versionId: string): Promise<string | Buffer>;
```

---

#### `restoreVersion(path, versionId)`

Restores a file to a specific version (copies that version to become the current one).

```ts
restoreVersion?(path: string, versionId: string): Promise<void>;
```

---

#### `deleteVersion(path, versionId)`

Deletes a specific version of a file.

```ts
deleteVersion?(path: string, versionId: string): Promise<void>;
```

### Range Requests

#### `getRange(path, options)`

Reads a specific byte range from a file.

```ts
getRange?(path: string, options: RangeOptions): Promise<RangeResult>;
```

```ts
const result = await disk.getRange?.('video.mp4', { start: 0, end: 999999 });
// { stream: Readable, size: 1000000, contentRange: 'bytes 0-999999/52428800', totalSize: 52428800 }
```

### Conditional Writes

#### `putIfMatch(path, contents, etag, options?)`

Writes content only if the current file's ETag matches the expected value.

```ts
putIfMatch?(path: string, contents: string | Buffer, etag: string, options?: PutOptions): Promise<ConditionalWriteResult>;
```

```ts
const result = await disk.putIfMatch?.('config.json', newContent, currentEtag);
// { success: true, etag: '"newEtag123"' }
// or { success: false }
```

---

#### `putIfNoneMatch(path, contents, options?)`

Writes content only if the file does not already exist.

```ts
putIfNoneMatch?(path: string, contents: string | Buffer, options?: PutOptions): Promise<ConditionalWriteResult>;
```

```ts
const result = await disk.putIfNoneMatch?.('locks/deploy.lock', lockData);
// { success: true, etag: '"abc123"' } — lock acquired
// or { success: false } — lock already held
```

## Method Availability by Driver

| Method | Local | S3 | R2 | GCS | Azure | MinIO | B2 | DO | Wasabi | Fake |
|--------|:-----:|:--:|:--:|:---:|:-----:|:-----:|:--:|:--:|:------:|:----:|
| Core methods | All | All | All | All | All | All | All | All | All | All |
| `missing` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `json` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `checksum` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `deleteMany` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `presignedPost` | No | Yes | Yes | No | No | Yes | Yes | Yes | Yes | No |
| `initMultipartUpload` | Yes | Yes | Yes | Yes | No | Yes | Yes | Yes | Yes | No |
| `getRange` | Yes | Yes | Yes | Yes | Yes | No | No | No | No | Yes |
| `putIfMatch` | Yes | Yes | No | No | No | No | No | No | No | Yes |
| `putIfNoneMatch` | Yes | Yes | No | No | No | No | No | No | No | Yes |
| `listVersions` | Yes* | No | No | No | No | No | No | No | No | Yes |
| `invalidateCdn` | No | Yes | Yes | Yes | No | No | No | No | No | No |

\* Via `VersionedDisk` decorator
