---
title: Types & Constants
description: Type aliases, enums, constants, injection tokens, and exported classes for @fozooni/nestjs-storage
---

# Types & Constants

Complete reference for all type aliases, string literal unions, constants, tokens, and exported classes.

## Type Aliases

### `ChecksumAlgorithm`

Algorithm for file checksum computation.

```ts
type ChecksumAlgorithm = 'md5' | 'sha1' | 'sha256';
```

```ts
const hash = await disk.checksum('file.bin', 'sha256');
```

---

### `Visibility`

File access visibility for ACL-based storage providers.

```ts
type Visibility = 'public' | 'private';
```

```ts
await disk.put('file.txt', data, { visibility: 'public' });
const vis: Visibility = await disk.getVisibility('file.txt');
```

---

### `StorageDriver`

Supported storage driver identifiers.

```ts
type StorageDriver =
  | 'local'
  | 's3'
  | 'r2'
  | 'gcs'
  | 'azure'
  | 'minio'
  | 'b2'
  | 'digitalocean'
  | 'wasabi';
```

```ts
const config: DiskConfig = {
  driver: 's3' satisfies StorageDriver,
  bucket: 'my-bucket',
  region: 'us-east-1',
};
```

---

### `ReplicationStrategy`

Strategy for `ReplicatedDisk` write operations.

```ts
type ReplicationStrategy = 'all' | 'quorum' | 'async';
```

| Strategy | Behavior |
|----------|----------|
| `'all'` | Write must succeed on all replicas before returning |
| `'quorum'` | Write must succeed on a majority of replicas |
| `'async'` | Write to primary immediately, replicate in background |

```ts
const replicated = new ReplicatedDisk(
  [primaryDisk, replicaDisk],
  { strategy: 'quorum' },
);
```

---

### `MigrationStatus`

Status of a single file during migration.

```ts
type MigrationStatus = 'pending' | 'copied' | 'failed';
```

```ts
for await (const progress of migrator.migrate(source, target, options)) {
  if (progress.status === 'failed') {
    console.error(`Failed: ${progress.path}`, progress.error);
  }
}
```

## Constants

### `StorageEvents`

Constant object mapping event names to string identifiers. Use these with NestJS `EventEmitter2` or the built-in event system.

```ts
const StorageEvents = {
  PUT: 'storage.put',
  PUT_FILE: 'storage.putFile',
  DELETE: 'storage.delete',
  DELETE_MANY: 'storage.deleteMany',
  COPY: 'storage.copy',
  MOVE: 'storage.move',
  RETRY: 'storage.retry',
} as const;
```

**Usage with `@OnEvent()`:**

```ts
import { OnEvent } from '@nestjs/event-emitter';
import {
  StorageEvents,
  StoragePutEvent,
  StorageDeleteEvent,
  StorageCopyEvent,
  StorageRetryEvent,
} from '@fozooni/nestjs-storage';

@Injectable()
export class StorageEventListener {
  @OnEvent(StorageEvents.PUT)
  handlePut(event: StoragePutEvent) {
    console.log(`File written: ${event.path} (${event.size} bytes)`);
  }

  @OnEvent(StorageEvents.DELETE)
  handleDelete(event: StorageDeleteEvent) {
    console.log(`File deleted: ${event.path}`);
  }

  @OnEvent(StorageEvents.COPY)
  handleCopy(event: StorageCopyEvent) {
    console.log(`File copied: ${event.source} → ${event.destination}`);
  }

  @OnEvent(StorageEvents.MOVE)
  handleMove(event: StorageMoveEvent) {
    console.log(`File moved: ${event.source} → ${event.destination}`);
  }

  @OnEvent(StorageEvents.RETRY)
  handleRetry(event: StorageRetryEvent) {
    console.warn(
      `Retry attempt ${event.attempt}/${event.maxRetries} for ${event.operation}: ${event.error.message}`,
    );
  }
}
```

## Injection Tokens

### `STORAGE_MODULE_OPTIONS`

A `Symbol` used as the injection token for the raw storage module configuration.

```ts
import { Inject } from '@nestjs/common';
import { STORAGE_MODULE_OPTIONS, StorageConfig } from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(
    @Inject(STORAGE_MODULE_OPTIONS)
    private readonly config: StorageConfig,
  ) {}
}
```

---

### `STORAGE_DISK_TOKEN_PREFIX`

The string prefix for disk injection tokens.

```ts
const STORAGE_DISK_TOKEN_PREFIX = 'STORAGE_DISK_';
```

---

### `getStorageDiskToken(name)`

Generates the injection token for a named disk.

```ts
function getStorageDiskToken(name: string): string;
```

```ts
import { getStorageDiskToken } from '@fozooni/nestjs-storage';

getStorageDiskToken('s3');
// → 'STORAGE_DISK_s3'

getStorageDiskToken('user-uploads');
// → 'STORAGE_DISK_user-uploads'
```

Used for custom providers:

```ts
@Module({
  providers: [
    {
      provide: getStorageDiskToken('custom'),
      useFactory: (storage: StorageService) => {
        return new ScopedDisk(storage.disk('s3'), 'custom-prefix');
      },
      inject: [StorageService],
    },
  ],
  exports: [getStorageDiskToken('custom')],
})
export class CustomDiskModule {}
```

---

### `RANGE_SERVE_DISK_KEY`

Metadata key used by the `@RangeServe()` decorator.

```ts
const RANGE_SERVE_DISK_KEY = 'RANGE_SERVE_DISK';
```

```ts
import { Reflector } from '@nestjs/core';
import { RANGE_SERVE_DISK_KEY } from '@fozooni/nestjs-storage';

// Reading the metadata (used internally by the framework)
const diskName = reflector.get<string>(RANGE_SERVE_DISK_KEY, handler);
```

## Exported Classes

### Disk Classes

All disk implementations that can be instantiated directly:

| Class | Description |
|-------|-------------|
| `LocalDisk` | Local filesystem storage |
| `S3Disk` | Amazon S3 storage |
| `R2Disk` | Cloudflare R2 storage |
| `GcsDisk` | Google Cloud Storage |
| `AzureDisk` | Azure Blob Storage |
| `MinioDisk` | MinIO-compatible S3 storage |
| `B2Disk` | Backblaze B2 storage |
| `DigitalOceanDisk` | DigitalOcean Spaces |
| `WasabiDisk` | Wasabi Hot Cloud Storage |
| `FakeDisk` | In-memory disk for testing |

### Decorator Disk Classes

Decorator disks that wrap other disks to add behavior. All extend `DiskDecorator`:

| Class | Description |
|-------|-------------|
| `DiskDecorator` | Abstract base class for decorator disks |
| `CachedDisk` | Caches read operations with configurable TTL |
| `EncryptedDisk` | Client-side AES encryption/decryption |
| `RetryDisk` | Retries failed operations with exponential backoff |
| `ReplicatedDisk` | Writes to multiple disks with configurable strategy |
| `ScopedDisk` | Prefixes all paths with a given directory |
| `QuotaDisk` | Enforces storage quota limits |
| `VersionedDisk` | Creates file version snapshots on write |
| `OtelDisk` | OpenTelemetry tracing for all operations |
| `CdnDisk` | CDN URL generation and cache invalidation |
| `RouterDisk` | Routes operations to different disks based on rules |

### Service Classes

Injectable NestJS services:

| Class | Description |
|-------|-------------|
| `StorageService` | Main entry point for disk access |
| `StorageMigrator` | Migrates files between disks with async generator |
| `StorageUploadProgressService` | RxJS-based upload progress tracking |
| `StorageArchiver` | Creates zip/tar archives from disk files |
| `StorageHealthIndicator` | Health checks for `@nestjs/terminus` |

### Error Classes

Custom error types:

| Class | Description |
|-------|-------------|
| `StorageConfigurationError` | Thrown on invalid disk configuration |
| `FileNotFoundException` | Thrown when a file is not found |
| `StorageError` | Base error class for storage operations |
| `QuotaExceededError` | Thrown when quota limit is exceeded |

```ts
import {
  StorageConfigurationError,
  FileNotFoundException,
  StorageError,
  QuotaExceededError,
} from '@fozooni/nestjs-storage';

try {
  await disk.get('nonexistent.txt');
} catch (error) {
  if (error instanceof FileNotFoundException) {
    console.error('File not found:', error.path);
  } else if (error instanceof QuotaExceededError) {
    console.error('Quota exceeded:', error.message);
  } else if (error instanceof StorageError) {
    console.error('Storage error:', error.message);
  }
}
```

### Naming Strategy Classes

Built-in naming strategies for file uploads:

| Class | Generated Name Pattern |
|-------|----------------------|
| `UuidNamingStrategy` | `a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg` |
| `TimestampNamingStrategy` | `1742400000000-photo.jpg` |
| `HashNamingStrategy` | `a1b2c3d4e5f6.jpg` (content hash) |
| `OriginalNamingStrategy` | `photo.jpg` (original name, no change) |

```ts
import { UuidNamingStrategy, TimestampNamingStrategy } from '@fozooni/nestjs-storage';

// Use in interceptor options
@UseInterceptors(
  StorageFileInterceptor('file', {
    namingStrategy: new UuidNamingStrategy(),
  }),
)
```

### Validator Classes

File validation pipe classes:

| Class | Description |
|-------|-------------|
| `FileExtensionValidator` | Validates file extension against an allow list |
| `MagicBytesValidator` | Validates file type by reading magic bytes (file header) |

```ts
import { FileExtensionValidator, MagicBytesValidator } from '@fozooni/nestjs-storage';

new FileExtensionValidator({ allowedExtensions: ['jpg', 'png', 'pdf'] });
new MagicBytesValidator({ allowedTypes: ['jpeg', 'png', 'pdf'] });
```

### Router Factory Functions

Factory functions that create `StorageRoute` objects for `RouterDisk`:

| Function | Description |
|----------|-------------|
| `byExtension(extensions, disk)` | Route by file extension |
| `byPrefix(prefix, disk)` | Route by path prefix |
| `byMimeType(mimeTypes, disk)` | Route by MIME type |
| `bySize(maxBytes, disk)` | Route files under a size threshold |
| `custom(matchFn, disk)` | Route by custom match function |

```ts
import {
  RouterDisk,
  byExtension,
  byPrefix,
  byMimeType,
  bySize,
  custom,
} from '@fozooni/nestjs-storage';

const router = new RouterDisk([
  byExtension(['.jpg', '.png', '.webp'], imagesDisk),
  byPrefix('documents/', documentsDisk),
  byMimeType(['video/mp4', 'video/webm'], videoDisk),
  bySize(1024 * 1024, smallFileDisk), // Files under 1 MB
  custom((path) => path.startsWith('vip/'), premiumDisk),
  // Default fallback (matches everything)
  { match: () => true, disk: defaultDisk },
]);
```

### Client Wrappers

Low-level cloud client wrappers:

| Class | Description |
|-------|-------------|
| `S3ClientWrapper` | Wraps `@aws-sdk/client-s3` with convenience methods |
| `GcsClientWrapper` | Wraps `@google-cloud/storage` with convenience methods |

### Middleware

| Class | Description |
|-------|-------------|
| `LocalSignedUrlMiddleware` | NestJS middleware for HMAC-SHA256 signed URL validation |
