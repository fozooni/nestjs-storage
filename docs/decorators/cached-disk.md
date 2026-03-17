# CachedDisk

`CachedDisk` provides **transparent metadata caching** for storage operations. It caches the results of metadata queries (existence checks, file sizes, MIME types, visibility, etc.) to reduce the number of API calls to your cloud provider. File content (`get`, `put`) is never cached.

## When to Use

- **High-traffic APIs**: reduce cloud storage API calls (and costs) for frequently accessed file metadata
- **Latency-sensitive paths**: cache `exists()` checks to avoid round-trips
- **Read-heavy workloads**: when the same metadata is queried repeatedly
- **Rate limit avoidance**: stay under provider API rate limits

## Factory Method

```typescript
storage.cached(diskName: string | FilesystemContract, opts?: CacheOptions): CachedDisk
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `diskName` | `string \| FilesystemContract` | Yes | Disk name or disk instance to wrap |
| `opts` | `CacheOptions` | No | Cache configuration options |

## CacheOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `ttl` | `number` | `60000` (60s) | Default time-to-live in milliseconds for all cached values |
| `ttlByMethod` | `Record<string, number>` | `{}` | Per-method TTL overrides. Keys are method names. |
| `backend` | `CacheBackend` | `MemoryCacheBackend` | Cache storage backend implementation |

## CacheBackend Interface

```typescript
interface CacheBackend {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttl: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

## Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class MediaService {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.cached('s3', {
      ttl: 120_000, // 2 minutes default
    });
  }

  async getFileInfo(path: string) {
    // First call: hits S3 API
    // Subsequent calls within 2 min: served from cache
    const [exists, size, mime] = await Promise.all([
      this.disk.exists(path),
      this.disk.size(path),
      this.disk.mimeType(path),
    ]);

    return { exists, size, mime };
  }
}
```

## Cached vs. Non-Cached Methods

Understanding which methods are cached is critical:

### Cached (metadata queries)

| Method | Cache Key Pattern |
|---|---|
| `exists(path)` | `exists:{diskName}:{path}` |
| `size(path)` | `size:{diskName}:{path}` |
| `lastModified(path)` | `lastModified:{diskName}:{path}` |
| `mimeType(path)` | `mimeType:{diskName}:{path}` |
| `getMetadata(path)` | `metadata:{diskName}:{path}` |
| `getVisibility(path)` | `visibility:{diskName}:{path}` |

### Never Cached (content and mutations)

| Method | Reason |
|---|---|
| `get(path)` | File content could be large and changes frequently |
| `readStream(path)` | Streams are not cacheable |
| `put(path, ...)` | Write operation (invalidates cache) |
| `delete(path)` | Write operation (invalidates cache) |
| `copy(src, dest)` | Write operation (invalidates cache) |
| `move(src, dest)` | Write operation (invalidates cache) |
| `files()` / `allFiles()` | Listings change too frequently |

## Cache Invalidation

Write operations **automatically invalidate** the cache for affected paths:

```typescript
const disk = storage.cached('s3');

// Populates cache
await disk.exists('report.pdf');  // → true (cached)
await disk.size('report.pdf');    // → 1024 (cached)

// This invalidates all cache entries for 'report.pdf'
await disk.put('report.pdf', newContent);

// Next call hits the actual disk again
await disk.size('report.pdf');    // → 2048 (fresh from S3)
```

Operations that trigger invalidation:
- `put()`, `putFile()` -- invalidates the target path
- `delete()` -- invalidates the deleted path
- `copy()` -- invalidates the destination path
- `move()` -- invalidates both source and destination paths
- `setVisibility()` -- invalidates visibility cache for the path
- `prepend()`, `append()` -- invalidates the target path

## Per-Method TTL

Different metadata types can have different cache durations:

```typescript
const disk = storage.cached('s3', {
  ttl: 60_000, // Default: 1 minute
  ttlByMethod: {
    exists: 30_000,        // 30 seconds — freshness matters
    size: 300_000,         // 5 minutes — sizes rarely change
    lastModified: 300_000, // 5 minutes
    mimeType: 3600_000,    // 1 hour — MIME types never change
    getVisibility: 600_000, // 10 minutes
  },
});
```

::: tip TTL Strategy
- **`exists`**: Keep short. A stale `exists` check can cause errors.
- **`mimeType`**: Cache aggressively. A file's MIME type almost never changes.
- **`size`**: Medium TTL. Only changes when the file is overwritten.
- **`lastModified`**: Medium TTL. Same as size.
:::

## Custom Redis Backend

For multi-instance deployments, share the cache across processes with Redis:

```typescript
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CacheBackend } from '@fozooni/nestjs-storage';

@Injectable()
export class RedisCacheBackend implements CacheBackend {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.redis.get(`storage:cache:${key}`);
    if (value === null) {
      return undefined;
    }
    return JSON.parse(value) as T;
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    await this.redis.set(
      `storage:cache:${key}`,
      JSON.stringify(value),
      'PX',
      ttl,
    );
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(`storage:cache:${key}`);
  }

  async clear(): Promise<void> {
    const keys = await this.redis.keys('storage:cache:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

Then use it:

```typescript
@Injectable()
export class CachedStorageService {
  private readonly disk;

  constructor(
    private readonly storage: StorageService,
    private readonly redis: Redis,
  ) {
    const backend = new RedisCacheBackend(this.redis);
    this.disk = this.storage.cached('s3', {
      ttl: 120_000,
      backend,
    });
  }
}
```

## Manual Cache Invalidation

Use `clearCache()` to manually flush the entire cache:

```typescript
const disk = storage.cached('s3');

// Flush all cached entries
await disk.clearCache();
```

This is useful after bulk operations or when you know external changes have been made to the underlying storage.

## Full Service Example

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { StorageService, FilesystemContract } from '@fozooni/nestjs-storage';

@Injectable()
export class OptimizedAssetService {
  private readonly logger = new Logger(OptimizedAssetService.name);
  private readonly disk: FilesystemContract;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.cached('s3', {
      ttl: 60_000,
      ttlByMethod: {
        exists: 15_000,
        mimeType: 3600_000,
        size: 300_000,
      },
    });
  }

  async serveAsset(path: string) {
    // These three calls may all hit cache — only 0-1 API calls
    const exists = await this.disk.exists(path);
    if (!exists) {
      return null;
    }

    const [size, mime, modified] = await Promise.all([
      this.disk.size(path),
      this.disk.mimeType(path),
      this.disk.lastModified(path),
    ]);

    // Content is NEVER cached — always fetched fresh
    const content = await this.disk.get(path);

    return { content, size, mime, modified };
  }

  async replaceAsset(path: string, newContent: Buffer) {
    // put() auto-invalidates the cache for this path
    await this.disk.put(path, newContent);
    this.logger.log(`Asset replaced and cache invalidated: ${path}`);
  }

  async bulkInvalidate() {
    // After a deployment or migration, clear everything
    await (this.disk as any).clearCache();
    this.logger.log('Full cache cleared');
  }
}
```

## How It Works Under the Hood

1. **Cache key generation**: Each cached method generates a key in the format `{method}:{diskIdentifier}:{path}`.

2. **Read path**: Before calling the inner disk, `CachedDisk` checks the backend for a cached value. If found and not expired, it returns the cached value immediately.

3. **Write path**: After a successful write operation, `CachedDisk` deletes all cache entries for the affected path(s).

4. **Default backend**: `MemoryCacheBackend` uses a `Map<string, { value: any; expiresAt: number }>` with lazy expiration (values are checked on read, not proactively evicted).

::: info Cache Key Format
Cache keys follow the pattern: `{method}:{diskName}:{normalizedPath}`

For example: `exists:s3:uploads/photo.jpg` or `size:local:documents/report.pdf`

This means caching is per-disk. Two `CachedDisk` instances wrapping different disks will not share cache entries even with the same backend.
:::

## Gotchas

::: warning External Modifications
If files are modified outside your application (e.g., another service writes directly to S3), the cache will serve stale data until the TTL expires. Either keep TTLs short or use `clearCache()` after known external changes.
:::

::: tip Stack Order: Cache Above Retry
Place `CachedDisk` above `RetryDisk` in the decorator stack. This way, cached responses skip the retry logic entirely:

```typescript
// Good: cache hit avoids retry overhead
const retried = storage.withRetry('s3', { maxRetries: 3 });
const disk = storage.cached(retried, { ttl: 60_000 });

// Less optimal: retries happen even for cache misses
// before the cache layer
```
:::

::: warning Memory Usage with MemoryCacheBackend
The default `MemoryCacheBackend` stores values in process memory. For applications with millions of files, this can consume significant memory. Switch to a Redis backend for large-scale deployments.
:::

## Cross-References

- [Decorator Pattern Overview](./index) -- how decorators compose
- [RetryDisk](./retry-disk) -- combine retry below cache for optimal performance
- [EncryptedDisk](./encrypted-disk) -- cache metadata of encrypted files
- [OtelDisk](./otel-disk) -- trace cache hits and misses
