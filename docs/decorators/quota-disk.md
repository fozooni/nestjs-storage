# QuotaDisk

`QuotaDisk` enforces **storage quota limits** by tracking disk usage and rejecting writes that would exceed the configured maximum. It is essential for SaaS applications where each tenant has a storage allowance, or for preventing runaway storage costs.

## When to Use

- **SaaS per-tenant quotas**: limit each customer to their plan's storage allocation
- **User upload limits**: cap individual user storage consumption
- **Cost control**: prevent unexpected cloud storage bills
- **Resource fairness**: ensure one tenant cannot consume all available storage

## Factory Method

```typescript
storage.withQuota(
  diskName: string | FilesystemContract,
  quotaStore: QuotaStore,
  opts: QuotaOptions,
): QuotaDisk
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `diskName` | `string \| FilesystemContract` | Yes | Disk name or instance to enforce quota on |
| `quotaStore` | `QuotaStore` | Yes | Backend for tracking usage counters |
| `opts` | `QuotaOptions` | Yes | Quota configuration |

## QuotaOptions

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `maxBytes` | `number` | Yes | -- | Maximum allowed storage in bytes |
| `prefix` | `string` | No | `''` | Prefix key for usage tracking (e.g., tenant ID) |

## QuotaStore Interface

`QuotaStore` defines how usage counters are persisted:

```typescript
interface QuotaStore {
  getUsage(prefix: string): Promise<number>;
  addUsage(prefix: string, bytes: number): Promise<void>;
  removeUsage(prefix: string, bytes: number): Promise<void>;
}
```

### Default: `MemoryQuotaStore`

The library ships with an in-process memory-based store:

```typescript
import { MemoryQuotaStore } from '@fozooni/nestjs-storage';

const store = new MemoryQuotaStore();
```

::: warning In-Memory Store Limitations
`MemoryQuotaStore` loses all usage data when the process restarts. After a restart, the quota appears empty (0 bytes used), allowing writes that should be blocked. Use a persistent store (Redis, database) in production.
:::

## Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService, MemoryQuotaStore } from '@fozooni/nestjs-storage';

@Injectable()
export class LimitedUploadService {
  private readonly disk;
  private readonly quotaStore = new MemoryQuotaStore();

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.withQuota('s3', this.quotaStore, {
      maxBytes: 100 * 1024 * 1024, // 100 MB
    });
  }

  async upload(path: string, content: Buffer): Promise<void> {
    // Throws StorageQuotaExceededError if upload would exceed 100 MB
    await this.disk.put(path, content);
  }

  async getUsageInfo() {
    return this.disk.getUsage();
    // { used: 52_428_800, limit: 104_857_600, percent: 50 }
  }
}
```

## Quota Exceeded Error

When a write would exceed the quota, `QuotaDisk` throws `StorageQuotaExceededError`:

```typescript
import { StorageQuotaExceededError } from '@fozooni/nestjs-storage';

try {
  await quotaDisk.put('huge-file.bin', largeBuffer);
} catch (error) {
  if (error instanceof StorageQuotaExceededError) {
    console.log(error.message);
    // "Storage quota exceeded: 95MB used + 10MB write > 100MB limit"
    console.log(error.used);     // bytes currently used
    console.log(error.limit);    // max bytes allowed
    console.log(error.attempted); // bytes attempted to write
  }
}
```

## Usage Tracking

The `getUsage()` method returns a summary of current quota status:

```typescript
const usage = await quotaDisk.getUsage();

console.log(usage);
// {
//   used: 52_428_800,     // 50 MB used
//   limit: 104_857_600,   // 100 MB limit
//   percent: 50           // 50% consumed
// }
```

## Custom Redis QuotaStore

For production deployments, persist usage counters in Redis:

```typescript
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { QuotaStore } from '@fozooni/nestjs-storage';

@Injectable()
export class RedisQuotaStore implements QuotaStore {
  constructor(private readonly redis: Redis) {}

  async getUsage(prefix: string): Promise<number> {
    const value = await this.redis.get(`storage:quota:${prefix}`);
    return value ? parseInt(value, 10) : 0;
  }

  async addUsage(prefix: string, bytes: number): Promise<void> {
    await this.redis.incrby(`storage:quota:${prefix}`, bytes);
  }

  async removeUsage(prefix: string, bytes: number): Promise<void> {
    await this.redis.decrby(`storage:quota:${prefix}`, bytes);
    // Ensure usage never goes negative
    const current = await this.getUsage(prefix);
    if (current < 0) {
      await this.redis.set(`storage:quota:${prefix}`, '0');
    }
  }
}
```

## Custom Database QuotaStore

For applications using a relational database:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuotaStore } from '@fozooni/nestjs-storage';
import { StorageUsage } from './entities/storage-usage.entity';

@Injectable()
export class DatabaseQuotaStore implements QuotaStore {
  constructor(
    @InjectRepository(StorageUsage)
    private readonly repo: Repository<StorageUsage>,
  ) {}

  async getUsage(prefix: string): Promise<number> {
    const record = await this.repo.findOne({ where: { prefix } });
    return record?.bytesUsed ?? 0;
  }

  async addUsage(prefix: string, bytes: number): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(StorageUsage)
      .values({ prefix, bytesUsed: bytes })
      .orUpdate(['bytes_used'], ['prefix'])
      .setParameter('bytes', bytes)
      .execute();

    // Or simpler with upsert:
    await this.repo.increment({ prefix }, 'bytesUsed', bytes);
  }

  async removeUsage(prefix: string, bytes: number): Promise<void> {
    await this.repo.decrement({ prefix }, 'bytesUsed', bytes);
  }
}
```

## Multi-Tenant Quota Pattern

Use the `prefix` option to enforce per-tenant quotas:

```typescript
@Injectable()
export class TenantStorageService {
  constructor(
    private readonly storage: StorageService,
    private readonly quotaStore: RedisQuotaStore,
    private readonly planService: PlanService,
  ) {}

  async getDiskForTenant(tenantId: string): Promise<FilesystemContract> {
    const plan = await this.planService.getPlan(tenantId);

    // Scope the disk to the tenant's directory
    const scoped = this.storage.scope(`tenants/${tenantId}`, 's3');

    // Apply tenant-specific quota
    return this.storage.withQuota(scoped, this.quotaStore, {
      maxBytes: plan.storageLimit, // e.g., 1 GB for Basic, 100 GB for Pro
      prefix: tenantId,           // usage tracked per tenant
    });
  }
}
```

## Full SaaS Quota Controller

```typescript
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Headers,
  UploadedFile,
  UseInterceptors,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  StorageService,
  StorageQuotaExceededError,
  MemoryQuotaStore,
} from '@fozooni/nestjs-storage';

@Controller('storage')
export class StorageQuotaController {
  private readonly quotaStore = new MemoryQuotaStore();

  constructor(private readonly storage: StorageService) {}

  private getDisk(tenantId: string) {
    const scoped = this.storage.scope(`tenants/${tenantId}`, 's3');
    return this.storage.withQuota(scoped, this.quotaStore, {
      maxBytes: 500 * 1024 * 1024, // 500 MB per tenant
      prefix: tenantId,
    });
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Headers('x-tenant-id') tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const disk = this.getDisk(tenantId);

    try {
      await disk.put(file.originalname, file.buffer);
      const usage = await disk.getUsage();

      return {
        stored: true,
        path: file.originalname,
        quota: usage,
      };
    } catch (error) {
      if (error instanceof StorageQuotaExceededError) {
        throw new HttpException(
          {
            message: 'Storage quota exceeded',
            used: error.used,
            limit: error.limit,
            attempted: error.attempted,
          },
          HttpStatus.INSUFFICIENT_STORAGE, // 507
        );
      }
      throw error;
    }
  }

  @Get('usage')
  async getUsage(@Headers('x-tenant-id') tenantId: string) {
    const disk = this.getDisk(tenantId);
    return disk.getUsage();
  }

  @Delete(':path(*)')
  async deleteFile(
    @Headers('x-tenant-id') tenantId: string,
    @Param('path') path: string,
  ) {
    const disk = this.getDisk(tenantId);
    await disk.delete(path);
    const usage = await disk.getUsage();

    return { deleted: true, quota: usage };
  }
}
```

## Initializing Quota from Existing Data

If you deploy quotas to an existing system, initialize the usage counter from the actual disk contents:

```typescript
@Injectable()
export class QuotaInitializer implements OnModuleInit {
  constructor(
    private readonly storage: StorageService,
    private readonly quotaStore: RedisQuotaStore,
  ) {}

  async onModuleInit() {
    const tenants = await this.getTenantIds();

    for (const tenantId of tenants) {
      const disk = this.storage.scope(`tenants/${tenantId}`, 's3');
      const actualSize = await disk.directorySize('');
      const currentUsage = await this.quotaStore.getUsage(tenantId);

      if (currentUsage === 0 && actualSize > 0) {
        await this.quotaStore.addUsage(tenantId, actualSize);
        console.log(`Initialized quota for ${tenantId}: ${actualSize} bytes`);
      }
    }
  }

  private async getTenantIds(): Promise<string[]> {
    // Fetch from your tenant registry
    return [];
  }
}
```

::: tip Initialize from directorySize()
Use `directorySize('')` on the scoped disk to get the total bytes stored for a prefix. This is the most accurate way to initialize quota counters for existing data.
:::

## How It Works Under the Hood

1. **Pre-write check**: Before every `put()`, `putFile()`, `prepend()`, `append()`, `copy()`, the decorator:
   - Determines the content size in bytes
   - Fetches current usage from the `QuotaStore`
   - If `currentUsage + contentSize > maxBytes`, throws `StorageQuotaExceededError`

2. **Post-write tracking**: After a successful write, `addUsage(prefix, contentSize)` is called on the store.

3. **Delete tracking**: After a successful `delete()`, the file size is fetched (best-effort) and `removeUsage(prefix, fileSize)` is called.

4. **Stream buffering**: For stream-based writes, the content is buffered to measure its size before the quota check.

5. **Overwrite handling**: When overwriting an existing file, the old file's size is subtracted before adding the new size.

## Gotchas

::: warning Best-Effort Delete Tracking
When a file is deleted, `QuotaDisk` attempts to read its size before deletion to update the usage counter. If the size read fails (e.g., file already deleted externally), the usage counter may drift. Periodically reconcile with `directorySize()`.
:::

::: warning Concurrent Writes
Usage tracking with `MemoryQuotaStore` is not atomic. Two concurrent writes may both pass the quota check and exceed the limit. For strict enforcement, use a Redis store with atomic INCRBY operations.
:::

::: info Stream Content Buffering
To check quota before writing, stream content must be buffered into memory to determine its size. For very large uploads, this adds memory overhead. Consider chunked uploads with per-chunk quota checks for files over 100 MB.
:::

## Cross-References

- [Decorator Pattern Overview](./index) -- how decorators compose
- [ScopedDisk](./scoped-disk) -- scope + quota for per-tenant isolation
- [EncryptedDisk](./encrypted-disk) -- size accounting with encryption overhead
- [ReplicatedDisk](./replicated-disk) -- quota applied before replication
