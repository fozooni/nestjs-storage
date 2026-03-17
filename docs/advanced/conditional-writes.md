---
title: Conditional Writes
description: Optimistic locking and create-only writes with ETag-based conditional operations
---

# Conditional Writes

<span class="badge">v0.1.0</span>

Conditional writes let you safely update files in concurrent environments using ETag-based optimistic locking. Two methods are available: `putIfMatch` for update-if-unchanged semantics and `putIfNoneMatch` for create-only semantics.

## Supported Drivers

| Driver | `putIfMatch` | `putIfNoneMatch` |
|--------|:------------:|:----------------:|
| LocalDisk | Yes | Yes |
| S3Disk | Yes | Yes |
| FakeDisk | Yes | Yes |
| GcsDisk | No | No |
| AzureDisk | No | No |

## Core API

### `putIfMatch(path, content, etag, options?)`

Writes content to `path` **only if** the file's current ETag matches the provided `etag`. This implements update-if-unchanged (optimistic locking) semantics.

```ts
const result = await disk.putIfMatch(
  'config/settings.json',
  JSON.stringify(updatedConfig),
  currentEtag,
);

if (result.success) {
  console.log('Updated! New ETag:', result.etag);
} else {
  console.log('Conflict — file was modified by another writer');
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | File path to write |
| `content` | `string \| Buffer` | File content |
| `etag` | `string` | Expected current ETag of the file |
| `options` | `PutOptions?` | Optional write options (visibility, mimetype, etc.) |

### `putIfNoneMatch(path, content, options?)`

Writes content to `path` **only if** the file does not already exist. This implements create-only semantics.

```ts
const result = await disk.putIfNoneMatch(
  'locks/deployment.lock',
  JSON.stringify({ lockedBy: 'server-1', at: Date.now() }),
);

if (result.success) {
  console.log('Lock acquired! ETag:', result.etag);
} else {
  console.log('Lock already held by another process');
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | File path to write |
| `content` | `string \| Buffer` | File content |
| `options` | `PutOptions?` | Optional write options |

### `ConditionalWriteResult`

Both methods return a `ConditionalWriteResult`:

| Property | Type | Description |
|----------|------|-------------|
| `success` | `boolean` | Whether the write succeeded |
| `etag` | `string?` | The new ETag of the file (present when `success` is `true`) |

## Patterns

### Optimistic Locking (Read-Modify-Write)

The most common pattern: read a file, modify its contents, and write back only if nobody else changed it in the meantime.

```ts
import { Injectable } from '@nestjs/common';
import { InjectStorage, StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class ConfigService {
  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  async updateConfig(
    key: string,
    value: unknown,
    maxRetries = 5,
  ): Promise<void> {
    const disk = this.storage.disk('config');
    const path = 'app/config.json';

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // 1. Read current state + ETag
      const metadata = await disk.getMetadata(path);
      const content = await disk.get(path);
      const config = JSON.parse(content);

      // 2. Modify
      config[key] = value;
      config._updatedAt = new Date().toISOString();

      // 3. Write back only if unchanged
      const result = await disk.putIfMatch(
        path,
        JSON.stringify(config, null, 2),
        metadata.etag!,
        { mimetype: 'application/json' },
      );

      if (result.success) {
        return; // Success!
      }

      // 4. Conflict — wait briefly and retry
      const backoff = Math.min(100 * 2 ** attempt, 2000);
      await new Promise((r) => setTimeout(r, backoff));
    }

    throw new Error(
      `Failed to update config after ${maxRetries} attempts — too much contention`,
    );
  }
}
```

### Create-Only (Prevent Overwrites)

Ensure a file is only written once. Useful for receipts, audit logs, or any write-once data.

```ts
import { Injectable, ConflictException } from '@nestjs/common';
import { InjectDisk, FilesystemContract } from '@fozooni/nestjs-storage';

@Injectable()
export class ReceiptService {
  constructor(
    @InjectDisk('receipts')
    private readonly disk: FilesystemContract,
  ) {}

  async createReceipt(orderId: string, data: object): Promise<string> {
    const path = `orders/${orderId}/receipt.json`;
    const content = JSON.stringify({
      ...data,
      createdAt: new Date().toISOString(),
      orderId,
    });

    const result = await this.disk.putIfNoneMatch(path, content, {
      mimetype: 'application/json',
      visibility: 'private',
    });

    if (!result.success) {
      throw new ConflictException(
        `Receipt for order ${orderId} already exists`,
      );
    }

    return path;
  }
}
```

### Distributed Lock using `putIfNoneMatch`

A simple distributed lock pattern using storage as the coordination layer:

```ts
import { Injectable } from '@nestjs/common';
import { InjectDisk, FilesystemContract } from '@fozooni/nestjs-storage';

@Injectable()
export class DistributedLockService {
  private readonly instanceId = `${process.pid}-${Date.now()}`;

  constructor(
    @InjectDisk('locks')
    private readonly disk: FilesystemContract,
  ) {}

  async acquireLock(
    lockName: string,
    ttlMs = 30_000,
  ): Promise<{ acquired: boolean; release: () => Promise<void> }> {
    const path = `locks/${lockName}.lock`;
    const expiresAt = Date.now() + ttlMs;

    const result = await this.disk.putIfNoneMatch(
      path,
      JSON.stringify({
        holder: this.instanceId,
        acquiredAt: Date.now(),
        expiresAt,
      }),
    );

    if (!result.success) {
      // Check if existing lock has expired
      try {
        const existing = JSON.parse(await this.disk.get(path));
        if (existing.expiresAt < Date.now()) {
          // Expired lock — force acquire via putIfMatch
          const metadata = await this.disk.getMetadata(path);
          const forceResult = await this.disk.putIfMatch(
            path,
            JSON.stringify({
              holder: this.instanceId,
              acquiredAt: Date.now(),
              expiresAt,
            }),
            metadata.etag!,
          );

          if (forceResult.success) {
            return {
              acquired: true,
              release: () => this.releaseLock(path),
            };
          }
        }
      } catch {
        // Lock file disappeared — try again
      }

      return { acquired: false, release: async () => {} };
    }

    return {
      acquired: true,
      release: () => this.releaseLock(path),
    };
  }

  private async releaseLock(path: string): Promise<void> {
    try {
      await this.disk.delete(path);
    } catch {
      // Lock may have expired and been taken by another holder
    }
  }
}
```

### Full Config File Update Service with Retry

A production-ready service that handles concurrent configuration updates:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectStorage, StorageService } from '@fozooni/nestjs-storage';

interface AppConfig {
  features: Record<string, boolean>;
  limits: Record<string, number>;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  async getConfig(): Promise<AppConfig> {
    const content = await this.storage.disk('config').get('app.json');
    return JSON.parse(content);
  }

  async toggleFeature(
    featureName: string,
    enabled: boolean,
    userId: string,
  ): Promise<AppConfig> {
    return this.updateWithRetry((config) => {
      config.features[featureName] = enabled;
      config.updatedBy = userId;
      return config;
    });
  }

  async setLimit(
    limitName: string,
    value: number,
    userId: string,
  ): Promise<AppConfig> {
    return this.updateWithRetry((config) => {
      config.limits[limitName] = value;
      config.updatedBy = userId;
      return config;
    });
  }

  private async updateWithRetry(
    mutator: (config: AppConfig) => AppConfig,
    maxRetries = 10,
  ): Promise<AppConfig> {
    const disk = this.storage.disk('config');
    const path = 'app.json';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const metadata = await disk.getMetadata(path);
      const raw = await disk.get(path);
      let config: AppConfig = JSON.parse(raw);

      // Apply mutation
      config = mutator(config);
      config.version += 1;
      config.updatedAt = new Date().toISOString();

      const result = await disk.putIfMatch(
        path,
        JSON.stringify(config, null, 2),
        metadata.etag!,
      );

      if (result.success) {
        this.logger.log(
          `Config updated to v${config.version} on attempt ${attempt}`,
        );
        return config;
      }

      this.logger.warn(
        `Config update conflict on attempt ${attempt}/${maxRetries}`,
      );

      // Exponential backoff with jitter
      const delay = Math.min(50 * 2 ** attempt, 5000);
      const jitter = Math.random() * delay * 0.5;
      await new Promise((r) => setTimeout(r, delay + jitter));
    }

    throw new Error('Config update failed: too many concurrent writers');
  }
}
```

::: warning ETag Format Varies by Driver
ETags are generated differently per driver:
- **LocalDisk** — MD5 hash of file content (e.g. `"d41d8cd98f00b204e9800998ecf8427e"`)
- **S3Disk** — S3-generated ETag (may include multipart suffix like `"abc123-5"`)
- **FakeDisk** — Incremental counter-based ETag for testing

Never compare ETags across different drivers. Always read the ETag from the same driver you intend to write to.
:::

::: tip Combine with VersionedDisk for Full Audit Trail
Wrap your disk with `VersionedDisk` to keep a history of all writes. When a `putIfMatch` succeeds, the previous version is automatically snapshotted:

```ts
StorageModule.forRoot({
  default: 'config',
  disks: {
    config: {
      driver: 's3',
      bucket: 'my-config-bucket',
      region: 'us-east-1',
      decorators: ['versioned'],
    },
  },
});
```

This gives you both optimistic locking (via conditional writes) and a full audit trail (via versioned snapshots).
:::

::: info When to Use Conditional Writes vs. Database Locks
Conditional writes are ideal when:
- The data lives in object storage (not a database)
- Write contention is low to moderate
- You need a simple, infrastructure-free locking mechanism

For high-contention scenarios (hundreds of concurrent writers to the same key), consider a dedicated distributed lock (Redis, DynamoDB) instead.
:::
