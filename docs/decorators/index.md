# Decorator Pattern Overview

The decorator pattern is the primary extension mechanism in `@fozooni/nestjs-storage`. Instead of building monolithic disk drivers with every possible feature baked in, the library provides a set of **composable wrappers** that layer behavior on top of any disk.

Each decorator implements the full `FilesystemContract` interface, delegates most methods to an inner disk, and overrides only the methods it transforms. This means you can stack decorators in any order to build exactly the storage pipeline your application needs.

## How It Works

Every decorator extends the `DiskDecorator` abstract class:

```
App Code
   │
   ▼
┌──────────────┐
│  CachedDisk  │  ← caches exists/size/metadata
├──────────────┤
│  RetryDisk   │  ← retries on network errors
├──────────────┤
│   S3Disk     │  ← actual cloud storage
└──────────────┘
```

When your code calls `disk.get('photo.jpg')`, the call flows through each decorator in order. `CachedDisk` passes it through (content is never cached), `RetryDisk` wraps it in retry logic, and finally `S3Disk` fetches from AWS.

## The `DiskDecorator` Base Class

```typescript
import { DiskDecorator } from '@fozooni/nestjs-storage';

// Every decorator extends this class.
// It implements FilesystemContract and delegates ALL methods
// to the inner disk by default.
abstract class DiskDecorator implements FilesystemContract {
  constructor(protected readonly inner: FilesystemContract) {}

  async get(path: string): Promise<Buffer> {
    return this.inner.get(path);
  }

  async put(path: string, content: Buffer | string): Promise<void> {
    return this.inner.put(path, content);
  }

  // ... all other FilesystemContract methods delegated
}
```

You only override the methods your decorator needs to transform. Everything else passes through untouched.

## Factory Methods

All decorators are created through factory methods on `StorageService`. This ensures proper dependency injection and configuration.

| Factory Method | Creates | Description |
|---|---|---|
| `storage.scope(prefix, disk?)` | `ScopedDisk` | Auto-prefixes all paths with a directory prefix |
| `storage.encrypted(disk, { key })` | `EncryptedDisk` | AES-256-GCM encryption at rest |
| `storage.cached(disk, opts?)` | `CachedDisk` | In-memory or custom metadata caching |
| `storage.withRetry(disk, opts?)` | `RetryDisk` | Exponential backoff with jitter on failures |
| `storage.replicated(disk, replicas, opts?)` | `ReplicatedDisk` | Write to multiple disks simultaneously |
| `storage.withQuota(disk, store, opts)` | `QuotaDisk` | Enforce per-tenant or global storage quotas |
| `storage.withVersioning(disk)` | `VersionedDisk` | Automatic file snapshots before every write |
| `storage.withRouting(routes, default)` | `RouterDisk` | Route files to different disks by extension, prefix, size, etc. |
| `storage.withTracing(disk)` | `OtelDisk` | OpenTelemetry tracing spans for every operation |
| _(auto-applied)_ | `CdnDisk` | CDN URL rewriting when `cdn` config is present |

## Stacking Decorators

The real power is composition. Stack decorators to build sophisticated storage pipelines:

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class SecureStorageService {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    // Build from the inside out:
    // 1. Start with S3 as the base disk
    // 2. Add retry logic for network resilience
    // 3. Add caching for metadata performance
    // 4. Add encryption for security
    const retried = this.storage.withRetry('s3', {
      maxRetries: 5,
      baseDelay: 200,
    });

    const cached = this.storage.cached(retried, {
      ttl: 60_000, // 1 minute
    });

    this.disk = this.storage.encrypted(cached, {
      key: process.env.STORAGE_ENCRYPTION_KEY,
    });
  }

  async storeSecret(path: string, data: Buffer): Promise<void> {
    // Flows through: EncryptedDisk → CachedDisk → RetryDisk → S3Disk
    await this.disk.put(path, data);
  }

  async readSecret(path: string): Promise<Buffer> {
    return this.disk.get(path);
  }
}
```

::: tip Decorator Order Matters
Think about decorator order from the **caller's perspective** (outside-in):
- **Encryption** should be outermost so data is encrypted before caching
- **Caching** should be above retry so cached responses skip retries
- **Retry** should be closest to the actual disk driver

A good mental model: `App → Encrypt → Cache → Retry → CloudDisk`
:::

## Advanced Stacking Example

```typescript
@Injectable()
export class EnterpriseStorageService {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    // Enterprise-grade pipeline:
    // Tracing → Quota → Encryption → Cache → Retry → S3
    const retried = this.storage.withRetry('s3', { maxRetries: 3 });
    const cached = this.storage.cached(retried, { ttl: 30_000 });
    const encrypted = this.storage.encrypted(cached, {
      key: process.env.ENCRYPTION_KEY,
    });
    const quotaEnforced = this.storage.withQuota(
      encrypted,
      this.quotaStore,
      { maxBytes: 10 * 1024 * 1024 * 1024 }, // 10 GB
    );
    this.disk = this.storage.withTracing(quotaEnforced);
  }
}
```

## Creating Your Own Decorator

Extend `DiskDecorator` and override only the methods you want to transform:

```typescript
import { DiskDecorator, FilesystemContract } from '@fozooni/nestjs-storage';

export class LoggingDisk extends DiskDecorator {
  constructor(
    inner: FilesystemContract,
    private readonly logger: Logger,
  ) {
    super(inner);
  }

  async put(path: string, content: Buffer | string): Promise<void> {
    this.logger.log(`Writing file: ${path} (${Buffer.byteLength(content)} bytes)`);
    const start = Date.now();
    await super.put(path, content);
    this.logger.log(`Write complete: ${path} in ${Date.now() - start}ms`);
  }

  async delete(path: string): Promise<void> {
    this.logger.warn(`Deleting file: ${path}`);
    await super.delete(path);
  }

  async get(path: string): Promise<Buffer> {
    this.logger.log(`Reading file: ${path}`);
    return super.get(path);
  }
}
```

Then register it as a factory in your module:

```typescript
@Injectable()
export class StorageFactory {
  constructor(
    private readonly storage: StorageService,
    private readonly logger: Logger,
  ) {}

  createLoggedDisk(diskName: string): LoggingDisk {
    const disk = this.storage.disk(diskName);
    return new LoggingDisk(disk, this.logger);
  }
}
```

::: info Custom Decorators Are First-Class
Your custom decorators work with all factory methods. You can wrap a `LoggingDisk` in a `CachedDisk`, or wrap a `RetryDisk` in your custom decorator. They all implement `FilesystemContract`.
:::

## Accessing the Inner Disk

Every decorator exposes the inner disk for introspection:

```typescript
const encrypted = storage.encrypted('s3', { key });
const inner = (encrypted as DiskDecorator).inner; // the raw S3Disk
```

::: warning
Accessing the inner disk bypasses all decorator behavior. Use this only for debugging or advanced introspection, never in production application logic.
:::

## What's Next?

Explore each decorator in detail:

- [ScopedDisk](./scoped-disk) -- path isolation and multi-tenancy
- [EncryptedDisk](./encrypted-disk) -- AES-256-GCM encryption at rest
- [CachedDisk](./cached-disk) -- metadata caching with pluggable backends
- [RetryDisk](./retry-disk) -- exponential backoff with jitter
- [ReplicatedDisk](./replicated-disk) -- multi-disk replication strategies
- [QuotaDisk](./quota-disk) -- storage quota enforcement
- [VersionedDisk](./versioned-disk) -- automatic file versioning
- [RouterDisk](./router-disk) -- content-aware routing
- [CdnDisk](./cdn-disk) -- CDN URL rewriting and CloudFront signing
- [OtelDisk](./otel-disk) -- OpenTelemetry distributed tracing

For advanced composition patterns, see the [Composing Decorators](/advanced/composing-decorators) guide.
