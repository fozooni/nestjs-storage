---
title: Composing Decorators
description: Stacking decorator disks for enterprise patterns — ordering rules, common compositions, and best practices
---

# Composing Decorators

Decorator disks extend `DiskDecorator` and wrap an inner disk to add behavior (caching, encryption, retries, etc.). You can stack multiple decorators to build sophisticated storage pipelines. The **order matters** — each decorator processes operations before delegating to the next.

## How Stacking Works

Decorators form a chain. The outermost decorator receives the call first, and the innermost decorator delegates to the actual storage driver:

```
Client Request
     │
     ▼
┌─────────────┐
│  OtelDisk   │  ← Outermost: traces everything
├─────────────┤
│  QuotaDisk  │  ← Checks quota before write
├─────────────┤
│ RetryDisk   │  ← Retries on transient failures
├─────────────┤
│ CachedDisk  │  ← Returns cached data if available
├─────────────┤
│EncryptedDisk│  ← Encrypts/decrypts content
├─────────────┤
│  ScopedDisk │  ← Prefixes path with tenant ID
├─────────────┤
│   S3Disk    │  ← Actual storage driver
└─────────────┘
```

**Read flow** (top → bottom): OtelDisk starts a span → QuotaDisk passes through (no quota for reads) → RetryDisk wraps with retry → CachedDisk checks cache → EncryptedDisk decrypts → ScopedDisk prefixes path → S3Disk fetches from S3.

**Write flow** (top → bottom): OtelDisk starts a span → QuotaDisk checks remaining quota → RetryDisk wraps with retry → CachedDisk invalidates cache → EncryptedDisk encrypts content → ScopedDisk prefixes path → S3Disk writes to S3.

## Stacking in Configuration

```ts
import {
  StorageModule,
  CachedDisk,
  RetryDisk,
  EncryptedDisk,
  OtelDisk,
  ScopedDisk,
  QuotaDisk,
} from '@fozooni/nestjs-storage';

// Programmatic stacking
const s3Disk = storage.disk('s3');
const scoped = new ScopedDisk(s3Disk, 'tenants/acme');
const encrypted = new EncryptedDisk(scoped, { algorithm: 'aes-256-gcm', key: SECRET });
const cached = new CachedDisk(encrypted, { ttl: 300 });
const retried = new RetryDisk(cached, { maxRetries: 3 });
const quota = new QuotaDisk(retried, { maxBytes: 10_737_418_240 });
const traced = new OtelDisk(quota, { serviceName: 'my-app' });

// `traced` is the entry point — it delegates through the full chain
```

## Stacking Rules

### Rule 1: OtelDisk at the Top

Place `OtelDisk` as the outermost decorator for complete trace coverage of all operations, including retries, cache hits, and encryption.

```ts
// CORRECT — OtelDisk sees everything
const disk = new OtelDisk(
  new RetryDisk(
    new CachedDisk(baseDisk, cacheOpts),
    retryOpts,
  ),
  otelOpts,
);

// WRONG — OtelDisk misses retry and cache operations
const disk = new RetryDisk(
  new OtelDisk(
    new CachedDisk(baseDisk, cacheOpts),
    otelOpts,
  ),
  retryOpts,
);
```

### Rule 2: QuotaDisk at the Top (Below OtelDisk)

`QuotaDisk` should reject oversized writes before any other processing. Placing it below encryption would check encrypted sizes (larger than original).

```ts
// CORRECT — Quota checks original content size
new OtelDisk(
  new QuotaDisk(
    new EncryptedDisk(baseDisk, encOpts),
    { maxBytes: 10_737_418_240 },
  ),
);

// WRONG — Quota checks encrypted size (inflated by IV + auth tag)
new OtelDisk(
  new EncryptedDisk(
    new QuotaDisk(baseDisk, { maxBytes: 10_737_418_240 }),
    encOpts,
  ),
);
```

### Rule 3: CachedDisk Above RetryDisk

Cache should return data without triggering retries. If cache is below retry, a cache hit still gets wrapped in retry logic unnecessarily.

```ts
// CORRECT — Cache hit returns immediately, no retry needed
new CachedDisk(
  new RetryDisk(baseDisk, retryOpts),
  cacheOpts,
);

// SUBOPTIMAL — Cache hit still goes through retry wrapper
new RetryDisk(
  new CachedDisk(baseDisk, cacheOpts),
  retryOpts,
);
```

### Rule 4: EncryptedDisk Below CachedDisk

Encrypted content is cached as-is. This means the cache stores encrypted data, which is both secure (cache contains only ciphertext) and correct (encrypted sizes match what CachedDisk reports).

```ts
// CORRECT — Cache stores encrypted content
new CachedDisk(
  new EncryptedDisk(baseDisk, encOpts),
  cacheOpts,
);

// WRONG — Cache stores plaintext (security issue)
new EncryptedDisk(
  new CachedDisk(baseDisk, cacheOpts),
  encOpts,
);
```

### Rule 5: ScopedDisk Near the Bottom

`ScopedDisk` prefixes paths. Place it close to the actual disk so all operations (including cache keys) use the full path.

```ts
// CORRECT — All layers see the full scoped path
new CachedDisk(
  new ScopedDisk(baseDisk, 'tenants/acme'),
  cacheOpts,
);
```

### Rule 6: VersionedDisk Below CachedDisk

`VersionedDisk` creates snapshots on write. It should sit below the cache so version snapshots happen on actual writes, not cache invalidations.

```ts
// CORRECT
new CachedDisk(
  new VersionedDisk(baseDisk),
  cacheOpts,
);
```

## Summary: Recommended Order (Top to Bottom)

| Position | Decorator | Reason |
|----------|-----------|--------|
| 1 (top) | `OtelDisk` | Full observability of all operations |
| 2 | `QuotaDisk` | Reject oversized writes early |
| 3 | `CachedDisk` | Short-circuit reads from cache |
| 4 | `RetryDisk` | Retry transient failures to storage |
| 5 | `ReplicatedDisk` | Write to multiple destinations |
| 6 | `EncryptedDisk` | Encrypt before storage |
| 7 | `VersionedDisk` | Snapshot on actual writes |
| 8 | `ScopedDisk` | Prefix paths for multi-tenancy |
| 9 (bottom) | Actual Disk | S3Disk, GcsDisk, LocalDisk, etc. |

## Common Patterns

### Pattern 1: Security-First

Encrypt data at rest with caching for performance and retries for reliability.

```ts
import {
  EncryptedDisk,
  CachedDisk,
  RetryDisk,
} from '@fozooni/nestjs-storage';

function createSecureDisk(baseDisk: FilesystemContract) {
  const encrypted = new EncryptedDisk(baseDisk, {
    algorithm: 'aes-256-gcm',
    key: process.env.ENCRYPTION_KEY!,
  });

  const cached = new CachedDisk(encrypted, {
    ttl: 600, // 10 minutes
    ttlByMethod: {
      exists: 120,
      getMetadata: 300,
    },
  });

  return new RetryDisk(cached, {
    maxRetries: 3,
    baseDelay: 200,
    maxDelay: 5000,
  });
}
```

### Pattern 2: High Availability

Observability, retries, and cross-region replication.

```ts
import {
  OtelDisk,
  RetryDisk,
  ReplicatedDisk,
} from '@fozooni/nestjs-storage';

function createHADisk(
  primaryDisk: FilesystemContract,
  replicaDisk: FilesystemContract,
) {
  const replicated = new ReplicatedDisk(
    [primaryDisk, replicaDisk],
    { strategy: 'all' }, // Write to both, read from primary
  );

  const retried = new RetryDisk(replicated, {
    maxRetries: 5,
    baseDelay: 500,
    maxDelay: 10_000,
    factor: 2,
    jitter: true,
  });

  return new OtelDisk(retried, {
    serviceName: 'storage-ha',
  });
}
```

### Pattern 3: Multi-Tenant SaaS

Quota enforcement, path scoping, and encryption per tenant.

```ts
import {
  QuotaDisk,
  ScopedDisk,
  EncryptedDisk,
} from '@fozooni/nestjs-storage';

function createTenantDisk(
  baseDisk: FilesystemContract,
  tenantId: string,
  tenantKey: string,
  quotaStore: QuotaStore,
) {
  const scoped = new ScopedDisk(baseDisk, `tenants/${tenantId}`);

  const encrypted = new EncryptedDisk(scoped, {
    algorithm: 'aes-256-gcm',
    key: tenantKey, // Per-tenant encryption key
  });

  return new QuotaDisk(encrypted, {
    maxBytes: 10 * 1024 * 1024 * 1024, // 10 GB per tenant
    prefix: tenantId,
    store: quotaStore,
  });
}
```

### Pattern 4: Content Platform

Versioned content with caching.

```ts
import { VersionedDisk, CachedDisk } from '@fozooni/nestjs-storage';

function createContentDisk(baseDisk: FilesystemContract) {
  const versioned = new VersionedDisk(baseDisk);

  return new CachedDisk(versioned, {
    ttl: 3600, // 1 hour — content changes infrequently
    ttlByMethod: {
      exists: 1800,
      url: 7200,
    },
  });
}
```

### Pattern 5: Media Routing

Route files to different disks based on type, with a default fallback.

```ts
import {
  RouterDisk,
  byExtension,
  byMimeType,
} from '@fozooni/nestjs-storage';

function createMediaRouter(
  imageDisk: FilesystemContract,
  videoDisk: FilesystemContract,
  documentDisk: FilesystemContract,
  defaultDisk: FilesystemContract,
) {
  return new RouterDisk([
    byExtension(['.jpg', '.jpeg', '.png', '.gif', '.webp'], imageDisk),
    byMimeType(['video/mp4', 'video/webm', 'video/quicktime'], videoDisk),
    byExtension(['.pdf', '.doc', '.docx', '.xls', '.xlsx'], documentDisk),
    // Default — everything else
    {
      match: () => true,
      disk: defaultDisk,
    },
  ]);
}
```

## Full Enterprise Example

Combining 6+ decorators for a production multi-tenant storage system:

```ts
import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import {
  InjectStorage,
  StorageService,
  FilesystemContract,
  OtelDisk,
  QuotaDisk,
  CachedDisk,
  RetryDisk,
  EncryptedDisk,
  VersionedDisk,
  ScopedDisk,
  QuotaStore,
} from '@fozooni/nestjs-storage';

@Injectable({ scope: Scope.REQUEST })
export class EnterpriseTenantDisk {
  private disk: FilesystemContract;

  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
    @Inject(REQUEST)
    private readonly request: Request,
    @Inject('QUOTA_STORE')
    private readonly quotaStore: QuotaStore,
    @Inject('KEY_VAULT')
    private readonly keyVault: { getKey(tenantId: string): string },
  ) {
    const tenantId = this.request.headers['x-tenant-id'] as string;
    this.disk = this.buildDiskChain(tenantId);
  }

  private buildDiskChain(tenantId: string): FilesystemContract {
    // Layer 9 (bottom): Actual S3 disk
    const s3 = this.storage.disk('s3');

    // Layer 8: Scope to tenant directory
    const scoped = new ScopedDisk(s3, `tenants/${tenantId}`);

    // Layer 7: Version all writes for audit trail
    const versioned = new VersionedDisk(scoped);

    // Layer 6: Encrypt with tenant-specific key
    const encrypted = new EncryptedDisk(versioned, {
      algorithm: 'aes-256-gcm',
      key: this.keyVault.getKey(tenantId),
    });

    // Layer 5: Retry transient S3 failures
    const retried = new RetryDisk(encrypted, {
      maxRetries: 3,
      baseDelay: 200,
      maxDelay: 5000,
      factor: 2,
      jitter: true,
      retryOn: (error) => {
        const code = (error as any)?.code;
        return ['ECONNRESET', 'ETIMEDOUT', 'SlowDown'].includes(code);
      },
    });

    // Layer 4: Cache reads (stores encrypted content — secure)
    const cached = new CachedDisk(retried, {
      ttl: 300,
      ttlByMethod: {
        exists: 60,
        getMetadata: 120,
        url: 600,
      },
    });

    // Layer 3: Enforce per-tenant quota
    const quota = new QuotaDisk(cached, {
      maxBytes: 50 * 1024 * 1024 * 1024, // 50 GB
      prefix: tenantId,
      store: this.quotaStore,
    });

    // Layer 1 (top): Full OpenTelemetry tracing
    return new OtelDisk(quota, {
      serviceName: 'enterprise-storage',
      attributes: { 'tenant.id': tenantId },
    });
  }

  getDisk(): FilesystemContract {
    return this.disk;
  }
}
```

Usage in a controller:

```ts
@Controller('files')
export class TenantFileController {
  constructor(
    private readonly tenantDisk: EnterpriseTenantDisk,
  ) {}

  @Post()
  async upload(@Body() body: { path: string; content: string }) {
    const disk = this.tenantDisk.getDisk();
    await disk.put(body.path, body.content);
    return { url: await disk.url(body.path) };
  }

  @Get(':path(*)')
  async read(@Param('path') path: string) {
    const disk = this.tenantDisk.getDisk();
    return disk.get(path);
  }
}
```

## Decorator Conflicts

Some decorator combinations are incompatible:

| Combination | Issue | Workaround |
|-------------|-------|------------|
| `EncryptedDisk` + `presignedPost()` | Encryption is server-side; presigned POST bypasses it | Upload to unencrypted staging disk, then copy |
| `EncryptedDisk` + `getRange()` | Cannot decrypt a partial byte range | Read full file, then slice |
| `CachedDisk` + `VersionedDisk` (cache above) | Version listing may be stale | Set short TTL or invalidate on write |
| `ScopedDisk` + `ReplicatedDisk` (scope above) | Replica writes use unscoped paths | Place ScopedDisk below ReplicatedDisk |
| `QuotaDisk` + `ReplicatedDisk` | Quota counts once, but data stored N times | Account for replication factor in quota |

## Performance Considerations

| Decorator | Read Overhead | Write Overhead | Memory |
|-----------|:------------:|:--------------:|:------:|
| `OtelDisk` | ~0.1ms (span creation) | ~0.1ms | Low |
| `QuotaDisk` | None | ~1ms (quota check) | Low |
| `CachedDisk` | Negative (cache hit) | ~0.5ms (invalidation) | Medium-High |
| `RetryDisk` | None (success) | None (success) | Low |
| `ReplicatedDisk` | None | 2-Nx (N replicas) | Low |
| `EncryptedDisk` | ~2-5ms (decrypt) | ~2-5ms (encrypt) | +16-32 bytes/file |
| `VersionedDisk` | None | ~10-50ms (snapshot) | Low |
| `ScopedDisk` | None | None | None |

**Tips:**
- A 6-decorator stack adds ~5-10ms overhead on a cache miss, which is negligible compared to network I/O to cloud storage (50-200ms).
- `CachedDisk` dominates performance when cache hit rate is high.
- `EncryptedDisk` adds CPU overhead proportional to file size; for large files (>100MB), consider using S3 server-side encryption instead.
- `VersionedDisk` doubles write latency (original write + snapshot copy).
