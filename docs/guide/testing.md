# Testing

`@fozooni/nestjs-storage` provides first-class testing utilities that make it easy to write fast, deterministic tests without touching real cloud storage. The centerpiece is `FakeDisk` -- an in-memory implementation of `FilesystemContract` with built-in assertion methods.

## FakeDisk

`FakeDisk` stores all files in memory and implements the full `FilesystemContract` interface. It is fast, requires no configuration, and provides assertion methods for verifying storage operations in tests.

### Standalone Usage

Use `FakeDisk` directly when testing services in isolation:

```typescript
import { FakeDisk } from '@fozooni/nestjs-storage/testing';

describe('DocumentProcessor', () => {
  let disk: FakeDisk;

  beforeEach(() => {
    disk = new FakeDisk();
  });

  it('should store processed content', async () => {
    const processor = new DocumentProcessor(disk);

    await processor.process('Hello, World!');

    disk.assertExists('output/processed.txt');
    disk.assertContentEquals('output/processed.txt', 'HELLO, WORLD!');
  });

  it('should delete temporary files after processing', async () => {
    const processor = new DocumentProcessor(disk);

    await processor.processWithTempFile('data');

    disk.assertExists('output/result.txt');
    disk.assertMissing('temp/working.tmp');
  });
});
```

### Assertion Methods

`FakeDisk` provides the following assertion methods that throw descriptive errors on failure:

#### `assertExists(path)`

Assert that a file exists on disk:

```typescript
await disk.put('uploads/photo.jpg', imageBuffer);
disk.assertExists('uploads/photo.jpg'); // passes
disk.assertExists('uploads/missing.jpg'); // throws: "Expected file 'uploads/missing.jpg' to exist, but it does not"
```

#### `assertMissing(path)`

Assert that a file does NOT exist:

```typescript
await disk.delete('temp/old-file.txt');
disk.assertMissing('temp/old-file.txt'); // passes
```

#### `assertContentEquals(path, expected)`

Assert that a file exists and its content matches exactly:

```typescript
await disk.put('config.json', '{"version": 1}');
disk.assertContentEquals('config.json', '{"version": 1}'); // passes
disk.assertContentEquals('config.json', '{"version": 2}'); // throws with diff
```

#### `assertCount(expected, directory?)`

Assert the total number of stored files, optionally scoped to a directory:

```typescript
await disk.put('a.txt', 'a');
await disk.put('b.txt', 'b');
await disk.put('sub/c.txt', 'c');

disk.assertCount(3);           // all files
disk.assertCount(1, 'sub');    // files in 'sub/' directory
```

#### `assertDirectoryEmpty(directory)`

Assert that a directory contains no files:

```typescript
disk.assertDirectoryEmpty('uploads'); // passes if no files under uploads/
```

#### `getStoredFiles()`

Get a map of all stored file paths and their content (useful for debugging):

```typescript
await disk.put('a.txt', 'content-a');
await disk.put('b.txt', 'content-b');

const files = disk.getStoredFiles();
// Map { 'a.txt' => Buffer, 'b.txt' => Buffer }
```

#### `getStoredFile(path)`

Get the content of a specific stored file:

```typescript
await disk.put('config.json', '{"key": "value"}');
const content = disk.getStoredFile('config.json');
// Buffer containing '{"key": "value"}'
```

#### `reset()`

Clear all stored files and reset the disk to a clean state:

```typescript
await disk.put('a.txt', 'a');
disk.reset();
disk.assertCount(0); // passes
```

::: tip
Always call `disk.reset()` in `beforeEach` or create a fresh `FakeDisk` instance for each test to prevent state leakage between tests:
```typescript
beforeEach(() => {
  disk = new FakeDisk();
  // OR
  disk.reset();
});
```
:::

## StorageTestUtils

`StorageTestUtils` provides helper methods for common testing scenarios.

### `StorageTestUtils.fake(storageService, diskName)`

Swap a real disk for a `FakeDisk` within a `StorageService` instance. Returns the `FakeDisk` for assertions:

```typescript
import { StorageTestUtils, FakeDisk } from '@fozooni/nestjs-storage/testing';
import { StorageService } from '@fozooni/nestjs-storage';

let storage: StorageService;
let fakeDisk: FakeDisk;

beforeEach(() => {
  fakeDisk = StorageTestUtils.fake(storage, 'local');
});

it('should upload to the local disk', async () => {
  await myService.uploadFile('test.txt', 'content');
  fakeDisk.assertExists('test.txt');
});
```

### `StorageTestUtils.fakeFile(options?)`

Create a mock `Express.Multer.File` object for testing upload handlers:

```typescript
import { StorageTestUtils } from '@fozooni/nestjs-storage/testing';

const mockFile = StorageTestUtils.fakeFile({
  originalname: 'photo.jpg',
  mimetype: 'image/jpeg',
  buffer: Buffer.from('fake-image-data'),
  size: 1024,
});

// Use in tests
await myService.handleUpload(mockFile);
```

Without arguments, `fakeFile()` returns a minimal valid file with defaults:

```typescript
const mockFile = StorageTestUtils.fakeFile();
// { originalname: 'test.txt', mimetype: 'text/plain', buffer: Buffer, size: 4 }
```

### `StorageTestUtils.fakeFileWithSize(bytes, name?)`

Create a mock file with a specific size. Useful for testing file size limits and quota enforcement:

```typescript
import { StorageTestUtils } from '@fozooni/nestjs-storage/testing';

// Create a 5 MB mock file
const largeFile = StorageTestUtils.fakeFileWithSize(
  5 * 1024 * 1024,
  'large-video.mp4',
);

// Test quota enforcement
it('should reject files over quota', async () => {
  await expect(
    quotaDisk.put('uploads/large.mp4', largeFile.buffer),
  ).rejects.toThrow(StorageQuotaExceededError);
});
```

## Full NestJS Testing Example

Here is a complete example of testing a service that depends on storage using NestJS's `TestingModule`:

```typescript
// documents.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { StorageModule, StorageService } from '@fozooni/nestjs-storage';
import { StorageTestUtils, FakeDisk } from '@fozooni/nestjs-storage/testing';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  let module: TestingModule;
  let service: DocumentsService;
  let storage: StorageService;
  let fakeDisk: FakeDisk;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          default: 'local',
          disks: {
            local: {
              driver: 'local',
              root: './test-storage',
            },
          },
        }),
      ],
      providers: [DocumentsService],
    }).compile();

    service = module.get(DocumentsService);
    storage = module.get(StorageService);

    // Replace the real disk with FakeDisk
    fakeDisk = StorageTestUtils.fake(storage, 'local');
  });

  afterEach(async () => {
    await module.close();
  });

  describe('uploadDocument', () => {
    it('should store the document on disk', async () => {
      const file = StorageTestUtils.fakeFile({
        originalname: 'report.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('pdf-content'),
      });

      const result = await service.uploadDocument('user-123', file);

      expect(result.path).toContain('documents/user-123');
      fakeDisk.assertExists(result.path);
    });

    it('should store metadata alongside the document', async () => {
      const file = StorageTestUtils.fakeFile({
        originalname: 'report.pdf',
        mimetype: 'application/pdf',
      });

      const result = await service.uploadDocument('user-123', file);

      fakeDisk.assertExists(`${result.path}.meta.json`);
      const meta = JSON.parse(
        fakeDisk.getStoredFile(`${result.path}.meta.json`).toString(),
      );
      expect(meta.author).toBe('user-123');
    });
  });

  describe('deleteDocument', () => {
    it('should remove the document and its metadata', async () => {
      // Arrange
      await fakeDisk.put('documents/user-123/doc.pdf', 'content');
      await fakeDisk.put('documents/user-123/doc.pdf.meta.json', '{}');

      // Act
      await service.deleteDocument('documents/user-123/doc.pdf');

      // Assert
      fakeDisk.assertMissing('documents/user-123/doc.pdf');
      fakeDisk.assertMissing('documents/user-123/doc.pdf.meta.json');
    });
  });

  describe('listUserDocuments', () => {
    it('should return all documents for a user', async () => {
      await fakeDisk.put('documents/user-123/a.pdf', 'a');
      await fakeDisk.put('documents/user-123/b.pdf', 'b');
      await fakeDisk.put('documents/user-456/c.pdf', 'c');

      const docs = await service.listUserDocuments('user-123');

      expect(docs).toHaveLength(2);
      expect(docs).toContain('documents/user-123/a.pdf');
      expect(docs).toContain('documents/user-123/b.pdf');
    });
  });
});
```

## Testing with Interceptors

Test controllers that use `StorageFileInterceptor` by sending real multipart requests through the test server:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { StorageModule, StorageService } from '@fozooni/nestjs-storage';
import { StorageTestUtils, FakeDisk } from '@fozooni/nestjs-storage/testing';
import { UploadsController } from './uploads.controller';

describe('UploadsController (e2e)', () => {
  let app: INestApplication;
  let fakeDisk: FakeDisk;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          default: 'local',
          disks: {
            local: { driver: 'local', root: './test-storage' },
          },
        }),
      ],
      controllers: [UploadsController],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    const storage = module.get(StorageService);
    fakeDisk = StorageTestUtils.fake(storage, 'local');
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /uploads/avatar should store the file', async () => {
    const response = await request(app.getHttpServer())
      .post('/uploads/avatar')
      .attach('avatar', Buffer.from('fake-image'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    expect(response.body.path).toBeDefined();
    expect(response.body.url).toBeDefined();
    fakeDisk.assertCount(1, 'avatars');
  });

  it('POST /uploads/avatar should reject non-image files', async () => {
    await request(app.getHttpServer())
      .post('/uploads/avatar')
      .attach('avatar', Buffer.from('not-an-image'), {
        filename: 'malware.exe',
        contentType: 'application/octet-stream',
      })
      .expect(400);

    fakeDisk.assertCount(0);
  });
});
```

## Testing Decorator Disks

When your application uses decorator disks (encrypted, cached, retry, etc.), test them by wrapping a `FakeDisk`:

```typescript
import { FakeDisk } from '@fozooni/nestjs-storage/testing';
import { EncryptedDisk, CachedDisk, RetryDisk } from '@fozooni/nestjs-storage';

describe('Encrypted + Cached storage', () => {
  let fakeDisk: FakeDisk;
  let encryptedDisk: EncryptedDisk;
  let cachedDisk: CachedDisk;

  beforeEach(() => {
    fakeDisk = new FakeDisk();

    // Stack decorators on top of FakeDisk
    encryptedDisk = new EncryptedDisk(fakeDisk, {
      key: 'test-encryption-key-32-chars-ok!',
      algorithm: 'aes-256-cbc',
    });

    cachedDisk = new CachedDisk(encryptedDisk, {
      ttl: 60,
    });
  });

  it('should encrypt content before storage', async () => {
    await encryptedDisk.put('secret.txt', 'sensitive data');

    // The raw content in FakeDisk should be encrypted
    const rawContent = fakeDisk.getStoredFile('secret.txt').toString();
    expect(rawContent).not.toBe('sensitive data');

    // But reading through the encrypted disk should decrypt
    const decrypted = await encryptedDisk.get('secret.txt');
    expect(decrypted).toBe('sensitive data');
  });

  it('should serve from cache on second read', async () => {
    await cachedDisk.put('data.json', '{"key": "value"}');

    // First read -- hits the underlying disk
    const first = await cachedDisk.get('data.json');

    // Delete the underlying file
    await fakeDisk.delete('data.json');

    // Second read -- served from cache
    const second = await cachedDisk.get('data.json');
    expect(second).toBe(first);
  });
});
```

### Testing RetryDisk

```typescript
import { FakeDisk } from '@fozooni/nestjs-storage/testing';
import { RetryDisk, StorageNetworkError } from '@fozooni/nestjs-storage';

describe('RetryDisk', () => {
  it('should retry on network errors', async () => {
    const fakeDisk = new FakeDisk();
    let callCount = 0;

    // Mock a network failure on the first two attempts
    const originalGet = fakeDisk.get.bind(fakeDisk);
    jest.spyOn(fakeDisk, 'get').mockImplementation(async (...args) => {
      callCount++;
      if (callCount <= 2) {
        throw new StorageNetworkError('Connection reset');
      }
      return originalGet(...args);
    });

    await fakeDisk.put('data.txt', 'hello');

    const retryDisk = new RetryDisk(fakeDisk, {
      maxRetries: 3,
      delay: 10, // Short delay for tests
    });

    const result = await retryDisk.get('data.txt');
    expect(result).toBe('hello');
    expect(callCount).toBe(3); // Failed twice, succeeded on third
  });
});
```

## Testing with Multiple Disks

```typescript
describe('CrossDiskSync', () => {
  let primaryDisk: FakeDisk;
  let backupDisk: FakeDisk;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          default: 'primary',
          disks: {
            primary: { driver: 'local', root: './primary' },
            backup: { driver: 'local', root: './backup' },
          },
        }),
      ],
      providers: [CrossDiskSyncService],
    }).compile();

    const storage = module.get(StorageService);
    primaryDisk = StorageTestUtils.fake(storage, 'primary');
    backupDisk = StorageTestUtils.fake(storage, 'backup');
  });

  it('should sync files from primary to backup', async () => {
    await primaryDisk.put('important.pdf', 'data');

    await service.syncToBackup('important.pdf');

    primaryDisk.assertExists('important.pdf');
    backupDisk.assertExists('important.pdf');
    backupDisk.assertContentEquals('important.pdf', 'data');
  });
});
```

## Best Practices

::: tip Reset Between Tests
Always create a fresh `FakeDisk` or call `reset()` in `beforeEach`. Shared state between tests leads to flaky, order-dependent test suites:
```typescript
beforeEach(() => {
  fakeDisk = new FakeDisk(); // Fresh instance every test
});
```
:::

::: info FakeDisk Supports All Operations
`FakeDisk` implements the full `FilesystemContract` including `exists()`, `get()`, `put()`, `delete()`, `copy()`, `move()`, `files()`, `allFiles()`, `directories()`, `size()`, `lastModified()`, `mimeType()`, `getMetadata()`, `checksum()`, `getRange()`, `putIfMatch()`, `putIfNoneMatch()`, `setVisibility()`, `getVisibility()`, and more. You can test any operation without real storage.
:::

::: warning
`FakeDisk` does **not** simulate network latency, rate limiting, or eventual consistency. If you need to test those behaviors, use the real driver against a local instance (e.g., MinIO for S3 compatibility testing) or mock specific methods on `FakeDisk`.
:::

## Next Steps

Learn how to leverage AI-ready documentation with [LLM Docs](./llm-docs) -- use `llm.md` and `llm-full.md` with Cursor, Claude Code, GitHub Copilot, and other AI tools.
