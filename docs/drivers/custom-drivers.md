# Custom Drivers

@fozooni/nestjs-storage is designed to be extensible. You can create custom drivers for storage backends not included in the package — FTP servers, SFTP, WebDAV, database blob storage, or any other system. There are two approaches:

1. **Implement `FilesystemContract`** — for entirely new storage backends
2. **Extend `DiskDecorator`** — for wrapping existing drivers with additional behavior

## The FilesystemContract Interface

Every driver must implement the `FilesystemContract` interface. Here is the full interface with required and optional methods:

```typescript
import { Readable } from 'stream';

interface FilesystemContract {
  // === Required Methods ===

  /** Read a file's contents as a Buffer */
  get(path: string): Promise<Buffer>;

  /** Read a file as a readable stream */
  getStream(path: string): Promise<Readable>;

  /** Write content to a file */
  put(path: string, content: Buffer | string, options?: PutOptions): Promise<void>;

  /** Write a readable stream to a file */
  putStream(path: string, stream: Readable, options?: PutOptions): Promise<void>;

  /** Check if a file exists */
  exists(path: string): Promise<boolean>;

  /** Delete a file */
  delete(path: string): Promise<void>;

  /** Copy a file from one path to another */
  copy(from: string, to: string): Promise<void>;

  /** Move a file from one path to another */
  move(from: string, to: string): Promise<void>;

  /** Get file metadata (size, last modified, mime type, etc.) */
  getMetadata(path: string): Promise<FileMetadata>;

  /** Get the public URL for a file */
  url(path: string): Promise<string>;

  /** List files and directories at a path */
  listContents(path: string, options?: ListOptions): Promise<ListItem[]>;

  /** Get the visibility (public/private) of a file */
  getVisibility(path: string): Promise<string>;

  /** Set the visibility (public/private) of a file */
  setVisibility(path: string, visibility: string): Promise<void>;

  /** Delete a directory and all its contents */
  deleteDirectory(path: string): Promise<void>;

  /** Create a directory */
  createDirectory(path: string): Promise<void>;

  // === Optional Methods ===

  /** Generate a temporary (signed) URL with expiration */
  temporaryUrl?(path: string, expiration: number, options?: TemporaryUrlOptions): Promise<string>;

  /** Generate a temporary upload URL */
  temporaryUploadUrl?(path: string, expiration: number, options?: TemporaryUrlOptions): Promise<string>;

  /** Generate presigned POST data for browser uploads */
  presignedPost?(options: PresignedPostOptions): Promise<PresignedPostData>;

  /** Read a byte range from a file */
  getRange?(path: string, range: { start: number; end: number }): Promise<Buffer>;

  /** Write only if the ETag matches (optimistic concurrency) */
  putIfMatch?(path: string, content: Buffer | string, etag: string): Promise<boolean>;

  /** Write only if the file does NOT exist */
  putIfNoneMatch?(path: string, content: Buffer | string): Promise<boolean>;

  /** Initialize a multipart upload */
  initMultipartUpload?(path: string): Promise<string>;

  /** Upload a single part of a multipart upload */
  putPart?(uploadId: string, partNumber: number, data: Buffer): Promise<PartResult>;

  /** Complete a multipart upload */
  completeMultipartUpload?(uploadId: string, parts: PartResult[]): Promise<void>;

  /** Abort a multipart upload */
  abortMultipartUpload?(uploadId: string): Promise<void>;

  /** Convenience: upload a stream as multipart */
  putFileMultipart?(path: string, stream: Readable, options?: MultipartOptions): Promise<void>;

  /** Write a temporary file with TTL */
  putTemp?(path: string, content: Buffer | string, options: { ttl: number }): Promise<void>;

  /** Get the underlying client wrapper */
  getClient?(): unknown;
}
```

::: info
Optional methods (marked with `?`) are capabilities that not every backend supports. If your custom driver does not support presigned URLs or multipart uploads, simply omit those methods. The storage service will throw an informative error if application code tries to call an unsupported method.
:::

## Minimum Required Implementation

Here is a skeleton class implementing only the required methods:

```typescript
import { Readable } from 'stream';
import {
  FilesystemContract,
  FileMetadata,
  PutOptions,
  ListOptions,
  ListItem,
} from '@fozooni/nestjs-storage';

export class MyCustomDisk implements FilesystemContract {
  constructor(private readonly config: Record<string, any>) {
    // Initialize your storage client here
  }

  async get(path: string): Promise<Buffer> {
    // Read file contents and return as Buffer
    throw new Error('Not implemented');
  }

  async getStream(path: string): Promise<Readable> {
    // Return a readable stream for the file
    throw new Error('Not implemented');
  }

  async put(path: string, content: Buffer | string, options?: PutOptions): Promise<void> {
    // Write content to the given path
    throw new Error('Not implemented');
  }

  async putStream(path: string, stream: Readable, options?: PutOptions): Promise<void> {
    // Write a stream to the given path
    throw new Error('Not implemented');
  }

  async exists(path: string): Promise<boolean> {
    // Return true if the file exists
    throw new Error('Not implemented');
  }

  async delete(path: string): Promise<void> {
    // Delete the file at the given path
    throw new Error('Not implemented');
  }

  async copy(from: string, to: string): Promise<void> {
    // Copy a file from one path to another
    throw new Error('Not implemented');
  }

  async move(from: string, to: string): Promise<void> {
    // Move a file from one path to another
    throw new Error('Not implemented');
  }

  async getMetadata(path: string): Promise<FileMetadata> {
    // Return file metadata (size, lastModified, mimeType)
    throw new Error('Not implemented');
  }

  async url(path: string): Promise<string> {
    // Return the public URL for the file
    throw new Error('Not implemented');
  }

  async listContents(path: string, options?: ListOptions): Promise<ListItem[]> {
    // List files and directories
    throw new Error('Not implemented');
  }

  async getVisibility(path: string): Promise<string> {
    // Return 'public' or 'private'
    throw new Error('Not implemented');
  }

  async setVisibility(path: string, visibility: string): Promise<void> {
    // Set file visibility
    throw new Error('Not implemented');
  }

  async deleteDirectory(path: string): Promise<void> {
    // Delete a directory and all its contents
    throw new Error('Not implemented');
  }

  async createDirectory(path: string): Promise<void> {
    // Create a directory
    throw new Error('Not implemented');
  }
}
```

## Registering a Custom Driver

Use `storage.extend()` to register your custom driver with the storage manager:

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { StorageService, StorageModule } from '@fozooni/nestjs-storage';
import { MyCustomDisk } from './my-custom-disk';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'custom',
      disks: {
        custom: {
          driver: 'custom',
          host: 'ftp.example.com',
          username: 'admin',
          password: 'secret',
        },
      },
    }),
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly storage: StorageService) {}

  onModuleInit() {
    // Register the custom driver factory
    this.storage.extend('custom', (config) => {
      return new MyCustomDisk(config);
    });
  }
}
```

### Using the Custom Driver

Once registered, use it like any built-in driver:

```typescript
@Injectable()
export class FileService {
  constructor(private readonly storage: StorageService) {}

  async upload(path: string, content: Buffer) {
    const disk = this.storage.disk('custom');
    await disk.put(path, content);
    return disk.url(path);
  }
}
```

## Full Example: FTP Driver

Here is a more complete example implementing an FTP storage driver using the `basic-ftp` package:

```typescript
import { Readable, PassThrough } from 'stream';
import { Client as FtpClient } from 'basic-ftp';
import {
  FilesystemContract,
  FileMetadata,
  PutOptions,
  ListOptions,
  ListItem,
} from '@fozooni/nestjs-storage';

interface FtpDiskConfig {
  driver: 'ftp';
  host: string;
  port?: number;
  username: string;
  password: string;
  basePath?: string;
  baseUrl?: string;
  secure?: boolean;
}

export class FtpDisk implements FilesystemContract {
  private readonly config: FtpDiskConfig;

  constructor(config: FtpDiskConfig) {
    this.config = {
      port: 21,
      basePath: '/',
      secure: false,
      ...config,
    };
  }

  /** Create and connect an FTP client */
  private async connect(): Promise<FtpClient> {
    const client = new FtpClient();
    await client.access({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      secure: this.config.secure,
    });
    return client;
  }

  /** Resolve full remote path */
  private resolvePath(path: string): string {
    return `${this.config.basePath}/${path}`.replace(/\/+/g, '/');
  }

  async get(path: string): Promise<Buffer> {
    const client = await this.connect();
    try {
      const stream = new PassThrough();
      const chunks: Buffer[] = [];

      stream.on('data', (chunk) => chunks.push(chunk));

      await client.downloadTo(stream, this.resolvePath(path));

      return Buffer.concat(chunks);
    } finally {
      client.close();
    }
  }

  async getStream(path: string): Promise<Readable> {
    const client = await this.connect();
    const stream = new PassThrough();

    // Download in background; close client when done
    client
      .downloadTo(stream, this.resolvePath(path))
      .then(() => client.close())
      .catch((err) => {
        stream.destroy(err);
        client.close();
      });

    return stream;
  }

  async put(path: string, content: Buffer | string, options?: PutOptions): Promise<void> {
    const client = await this.connect();
    try {
      const buffer = typeof content === 'string' ? Buffer.from(content) : content;
      const stream = Readable.from(buffer);
      await client.uploadFrom(stream, this.resolvePath(path));
    } finally {
      client.close();
    }
  }

  async putStream(path: string, stream: Readable, options?: PutOptions): Promise<void> {
    const client = await this.connect();
    try {
      await client.uploadFrom(stream, this.resolvePath(path));
    } finally {
      client.close();
    }
  }

  async exists(path: string): Promise<boolean> {
    const client = await this.connect();
    try {
      await client.size(this.resolvePath(path));
      return true;
    } catch {
      return false;
    } finally {
      client.close();
    }
  }

  async delete(path: string): Promise<void> {
    const client = await this.connect();
    try {
      await client.remove(this.resolvePath(path));
    } finally {
      client.close();
    }
  }

  async copy(from: string, to: string): Promise<void> {
    // FTP doesn't have a native copy — download and re-upload
    const content = await this.get(from);
    await this.put(to, content);
  }

  async move(from: string, to: string): Promise<void> {
    const client = await this.connect();
    try {
      await client.rename(this.resolvePath(from), this.resolvePath(to));
    } finally {
      client.close();
    }
  }

  async getMetadata(path: string): Promise<FileMetadata> {
    const client = await this.connect();
    try {
      const size = await client.size(this.resolvePath(path));
      const lastModified = await client.lastMod(this.resolvePath(path));

      return {
        path,
        size,
        lastModified,
        mimeType: undefined, // FTP doesn't provide MIME types
      };
    } finally {
      client.close();
    }
  }

  async url(path: string): Promise<string> {
    if (this.config.baseUrl) {
      return `${this.config.baseUrl}/${path}`;
    }
    return `ftp://${this.config.host}${this.resolvePath(path)}`;
  }

  async listContents(path: string, options?: ListOptions): Promise<ListItem[]> {
    const client = await this.connect();
    try {
      const items = await client.list(this.resolvePath(path));

      return items.map((item) => ({
        path: `${path}/${item.name}`.replace(/\/+/g, '/'),
        type: item.isDirectory ? 'directory' as const : 'file' as const,
        size: item.size,
        lastModified: item.modifiedAt,
      }));
    } finally {
      client.close();
    }
  }

  async getVisibility(path: string): Promise<string> {
    // FTP doesn't have a standard visibility concept
    return 'private';
  }

  async setVisibility(path: string, visibility: string): Promise<void> {
    // No-op for FTP; could use chmod if the server supports it
  }

  async deleteDirectory(path: string): Promise<void> {
    const client = await this.connect();
    try {
      await client.removeDir(this.resolvePath(path));
    } finally {
      client.close();
    }
  }

  async createDirectory(path: string): Promise<void> {
    const client = await this.connect();
    try {
      await client.ensureDir(this.resolvePath(path));
    } finally {
      client.close();
    }
  }
}
```

### Registering the FTP Driver

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { StorageService, StorageModule } from '@fozooni/nestjs-storage';
import { FtpDisk } from './ftp-disk';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'ftp',
      disks: {
        ftp: {
          driver: 'ftp',
          host: process.env.FTP_HOST,
          port: parseInt(process.env.FTP_PORT ?? '21', 10),
          username: process.env.FTP_USER,
          password: process.env.FTP_PASS,
          basePath: '/var/www/uploads',
          baseUrl: 'https://files.example.com/uploads',
          secure: true,
        },
      },
    }),
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly storage: StorageService) {}

  onModuleInit() {
    this.storage.extend('ftp', (config) => new FtpDisk(config));
  }
}
```

### Using the FTP Driver

```typescript
@Injectable()
export class LegacyFileService {
  constructor(private readonly storage: StorageService) {}

  async uploadToFtp(file: Express.Multer.File): Promise<string> {
    const disk = this.storage.disk('ftp');

    await disk.put(`incoming/${file.originalname}`, file.buffer);

    return disk.url(`incoming/${file.originalname}`);
  }

  async downloadFromFtp(path: string): Promise<Buffer> {
    const disk = this.storage.disk('ftp');
    return disk.get(path);
  }
}
```

## Testing Custom Drivers with FakeDisk

@fozooni/nestjs-storage includes `FakeDisk`, an in-memory implementation of `FilesystemContract` designed for testing. Use the same patterns to test your custom driver:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { StorageModule, StorageService, FakeDisk } from '@fozooni/nestjs-storage';

describe('LegacyFileService', () => {
  let service: LegacyFileService;
  let storage: StorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          default: 'ftp',
          disks: {
            ftp: {
              driver: 'fake', // Use FakeDisk in tests
            },
          },
        }),
      ],
      providers: [LegacyFileService],
    }).compile();

    service = module.get(LegacyFileService);
    storage = module.get(StorageService);
  });

  it('should upload a file', async () => {
    const file = {
      originalname: 'test.txt',
      buffer: Buffer.from('hello world'),
    } as Express.Multer.File;

    const url = await service.uploadToFtp(file);

    expect(url).toContain('test.txt');

    const disk = storage.disk('ftp');
    const exists = await disk.exists('incoming/test.txt');
    expect(exists).toBe(true);

    const content = await disk.get('incoming/test.txt');
    expect(content.toString()).toBe('hello world');
  });
});
```

### Integration Testing Your Custom Driver

To test the custom driver itself (not the services that use it), write tests that exercise each `FilesystemContract` method:

```typescript
import { FtpDisk } from './ftp-disk';

describe('FtpDisk', () => {
  let disk: FtpDisk;

  beforeAll(() => {
    disk = new FtpDisk({
      driver: 'ftp',
      host: 'localhost',
      port: 2121, // Test FTP server
      username: 'testuser',
      password: 'testpass',
      basePath: '/test',
    });
  });

  it('should write and read a file', async () => {
    await disk.put('test/hello.txt', Buffer.from('hello'));
    const content = await disk.get('test/hello.txt');
    expect(content.toString()).toBe('hello');
  });

  it('should check file existence', async () => {
    await disk.put('test/exists.txt', Buffer.from('data'));
    expect(await disk.exists('test/exists.txt')).toBe(true);
    expect(await disk.exists('test/does-not-exist.txt')).toBe(false);
  });

  it('should delete a file', async () => {
    await disk.put('test/deleteme.txt', Buffer.from('data'));
    await disk.delete('test/deleteme.txt');
    expect(await disk.exists('test/deleteme.txt')).toBe(false);
  });

  it('should list directory contents', async () => {
    await disk.put('test/list/a.txt', Buffer.from('a'));
    await disk.put('test/list/b.txt', Buffer.from('b'));

    const items = await disk.listContents('test/list');
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.path)).toEqual(
      expect.arrayContaining(['test/list/a.txt', 'test/list/b.txt']),
    );
  });

  it('should copy a file', async () => {
    await disk.put('test/original.txt', Buffer.from('content'));
    await disk.copy('test/original.txt', 'test/copied.txt');
    const content = await disk.get('test/copied.txt');
    expect(content.toString()).toBe('content');
  });

  it('should move a file', async () => {
    await disk.put('test/source.txt', Buffer.from('content'));
    await disk.move('test/source.txt', 'test/destination.txt');
    expect(await disk.exists('test/source.txt')).toBe(false);
    expect(await disk.exists('test/destination.txt')).toBe(true);
  });

  it('should return metadata', async () => {
    await disk.put('test/meta.txt', Buffer.from('hello world'));
    const meta = await disk.getMetadata('test/meta.txt');
    expect(meta.size).toBe(11);
    expect(meta.lastModified).toBeInstanceOf(Date);
  });

  it('should stream a file', async () => {
    await disk.put('test/stream.txt', Buffer.from('streamed content'));
    const stream = await disk.getStream('test/stream.txt');

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(Buffer.concat(chunks).toString()).toBe('streamed content');
  });

  afterAll(async () => {
    await disk.deleteDirectory('test');
  });
});
```

## DiskDecorator vs FilesystemContract

::: tip Extending DiskDecorator vs Implementing FilesystemContract
Choose the right approach based on what you are building:

| | Implement `FilesystemContract` | Extend `DiskDecorator` |
|---|---|---|
| **When** | New storage backend (FTP, SFTP, WebDAV, database) | Adding behavior to existing drivers |
| **What** | Full driver implementation from scratch | Wraps an existing disk, intercepts/modifies calls |
| **Examples** | FtpDisk, SftpDisk, DatabaseBlobDisk | VersionedDisk, CdnDisk, LoggingDisk, EncryptedDisk |
| **Effort** | Higher — implement all required methods | Lower — override only the methods you need |

**DiskDecorator** is the right choice when you want to add cross-cutting behavior (logging, caching, encryption, versioning) to *any* driver without modifying the driver itself:

```typescript
import { DiskDecorator, FilesystemContract } from '@fozooni/nestjs-storage';

export class LoggingDisk extends DiskDecorator {
  constructor(
    protected readonly inner: FilesystemContract,
    private readonly logger: Logger,
  ) {
    super(inner);
  }

  async put(path: string, content: Buffer | string, options?: PutOptions): Promise<void> {
    this.logger.log(`Writing: ${path}`);
    await this.inner.put(path, content, options);
    this.logger.log(`Written: ${path}`);
  }

  async delete(path: string): Promise<void> {
    this.logger.log(`Deleting: ${path}`);
    await this.inner.delete(path);
    this.logger.log(`Deleted: ${path}`);
  }

  // All other methods are delegated to `this.inner` automatically by DiskDecorator
}
```

**FilesystemContract** is the right choice when you are building a completely new storage backend that communicates with a system the library does not support.
:::

## Adding Optional Capabilities

If your backend supports features like presigned URLs or multipart uploads, implement the optional methods:

```typescript
export class AdvancedCustomDisk implements FilesystemContract {
  // ... required methods ...

  // Add presigned URL support
  async temporaryUrl(path: string, expiration: number): Promise<string> {
    const token = this.generateSignedToken(path, expiration);
    return `${this.config.baseUrl}/${path}?token=${token}&expires=${expiration}`;
  }

  // Add range request support
  async getRange(path: string, range: { start: number; end: number }): Promise<Buffer> {
    const fullContent = await this.get(path);
    return fullContent.subarray(range.start, range.end + 1);
  }

  // Add multipart upload support
  async initMultipartUpload(path: string): Promise<string> {
    const uploadId = uuid();
    this.pendingUploads.set(uploadId, { path, parts: [] });
    return uploadId;
  }

  async putPart(uploadId: string, partNumber: number, data: Buffer) {
    const upload = this.pendingUploads.get(uploadId);
    upload.parts.push({ partNumber, data });
    return { ETag: md5(data), PartNumber: partNumber };
  }

  async completeMultipartUpload(uploadId: string, parts: PartResult[]): Promise<void> {
    const upload = this.pendingUploads.get(uploadId);
    const sorted = upload.parts.sort((a, b) => a.partNumber - b.partNumber);
    const content = Buffer.concat(sorted.map((p) => p.data));
    await this.put(upload.path, content);
    this.pendingUploads.delete(uploadId);
  }

  async abortMultipartUpload(uploadId: string): Promise<void> {
    this.pendingUploads.delete(uploadId);
  }
}
```

## Multiple Custom Drivers

You can register multiple custom drivers in the same application:

```typescript
@Module({
  imports: [
    StorageModule.forRoot({
      default: 'ftp',
      disks: {
        ftp: { driver: 'ftp', host: 'ftp.example.com', /* ... */ },
        sftp: { driver: 'sftp', host: 'sftp.example.com', /* ... */ },
        webdav: { driver: 'webdav', url: 'https://dav.example.com', /* ... */ },
      },
    }),
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly storage: StorageService) {}

  onModuleInit() {
    this.storage.extend('ftp', (config) => new FtpDisk(config));
    this.storage.extend('sftp', (config) => new SftpDisk(config));
    this.storage.extend('webdav', (config) => new WebDavDisk(config));
  }
}
```

```typescript
// Switch between custom drivers at runtime
const ftpDisk = this.storage.disk('ftp');
const sftpDisk = this.storage.disk('sftp');
const webdavDisk = this.storage.disk('webdav');
```
