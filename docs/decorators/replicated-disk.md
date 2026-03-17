# ReplicatedDisk

`ReplicatedDisk` provides **multi-disk replication** for write operations. Every write is automatically sent to a primary disk and one or more replica disks, ensuring data durability across multiple storage providers or regions.

## When to Use

- **Disaster recovery**: survive a complete cloud provider outage
- **Multi-region**: keep copies of data in different geographic regions
- **Migration**: gradually migrate from one provider to another by writing to both
- **Compliance**: store data in multiple jurisdictions simultaneously
- **Redundancy**: critical data that must never be lost

## Factory Method

```typescript
storage.replicated(
  diskName: string | FilesystemContract,
  replicas: (string | FilesystemContract)[],
  opts?: ReplicationOptions,
): ReplicatedDisk
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `diskName` | `string \| FilesystemContract` | Yes | Primary disk name or instance |
| `replicas` | `(string \| FilesystemContract)[]` | Yes | Array of replica disk names or instances |
| `opts` | `ReplicationOptions` | No | Replication strategy configuration |

## ReplicationOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `strategy` | `'all' \| 'quorum' \| 'async'` | `'all'` | How replicas are written and confirmed |

## Replication Strategies

### `'all'` (default) -- Strong Consistency

All disks (primary + every replica) must succeed. If any disk fails, the entire operation fails.

```typescript
const disk = storage.replicated('s3', ['gcs', 'azure'], {
  strategy: 'all',
});

// Must succeed on S3 AND GCS AND Azure — or throws
await disk.put('critical.dat', data);
```

**Use when**: data integrity is paramount and you cannot tolerate any inconsistency.

### `'quorum'` -- Majority Consistency

The operation succeeds when more than 50% of all disks (primary + replicas) confirm the write.

```typescript
const disk = storage.replicated('s3', ['gcs', 'azure'], {
  strategy: 'quorum',
});

// With 3 disks total, quorum = 2
// Succeeds if any 2 of (S3, GCS, Azure) succeed
await disk.put('important.dat', data);
```

**Use when**: you want high durability but can tolerate one replica being temporarily behind.

### `'async'` -- Eventual Consistency

The primary write is awaited. Replica writes happen in the background (fire-and-forget). The method returns as soon as the primary succeeds.

```typescript
const disk = storage.replicated('s3', ['gcs', 'azure'], {
  strategy: 'async',
});

// Returns immediately after S3 succeeds
// GCS and Azure writes happen in the background
await disk.put('data.json', data);
```

**Use when**: write latency is critical and you can tolerate temporary inconsistency.

::: warning Async Strategy Consistency
With `'async'` strategy, replicas may lag behind the primary. A file may exist on S3 but not yet on GCS immediately after a write returns. If your application requires reading from replicas, add a delay or consistency check.
:::

## Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class DurableStorageService {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.replicated('s3', ['gcs'], {
      strategy: 'all',
    });
  }

  async storeContract(id: string, pdf: Buffer): Promise<void> {
    // Written to both S3 and GCS atomically
    await this.disk.put(`contracts/${id}.pdf`, pdf);
  }

  async readContract(id: string): Promise<Buffer> {
    // Reads from primary (S3) only
    return this.disk.get(`contracts/${id}.pdf`);
  }
}
```

## Read Behavior

**Reads always come from the primary disk only.** Replicas are never read from. This simplifies consistency guarantees and avoids the complexity of read quorums.

```typescript
const disk = storage.replicated('s3', ['gcs', 'azure']);

// This reads from S3 only — GCS and Azure are not queried
const content = await disk.get('file.txt');
const exists = await disk.exists('file.txt');
const files = await disk.files();
```

## Replicated Operations

All write-like operations are replicated across disks:

| Method | Replicated? | Notes |
|---|---|---|
| `put(path, content)` | Yes | Content sent to all disks |
| `putFile(path, localPath)` | Yes | File read once, content sent to all disks |
| `delete(path)` | Yes | Deleted from all disks |
| `copy(src, dest)` | Yes | Copied on all disks |
| `move(src, dest)` | Yes | Moved on all disks |
| `setVisibility(path, vis)` | Yes | Visibility set on all disks |
| `makeDirectory(path)` | Yes | Directory created on all disks |
| `deleteDirectory(path)` | Yes | Directory deleted from all disks |
| `prepend(path, content)` | Yes | Prepended on all disks |
| `append(path, content)` | Yes | Appended on all disks |
| `get(path)` | No | Primary only |
| `exists(path)` | No | Primary only |
| `size(path)` | No | Primary only |
| `files()` / `allFiles()` | No | Primary only |

## Full Multi-Provider Example

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { StorageService, FilesystemContract } from '@fozooni/nestjs-storage';

@Injectable()
export class MultiCloudStorageService {
  private readonly logger = new Logger(MultiCloudStorageService.name);
  private readonly disk: FilesystemContract;

  constructor(private readonly storage: StorageService) {
    // Primary: AWS S3 (us-east-1)
    // Replicas: Google Cloud Storage + Azure Blob
    this.disk = this.storage.replicated(
      's3',
      ['gcs', 'azure'],
      { strategy: 'quorum' },
    );
  }

  async storeDocument(path: string, content: Buffer): Promise<void> {
    await this.disk.put(path, content);
    this.logger.log(`Document replicated across 3 providers: ${path}`);
  }

  async readDocument(path: string): Promise<Buffer> {
    try {
      // Try primary (S3)
      return await this.disk.get(path);
    } catch (error) {
      // Fallback to replicas manually if primary is down
      this.logger.warn(`Primary read failed, trying replicas: ${path}`);
      return this.readFromReplica(path);
    }
  }

  private async readFromReplica(path: string): Promise<Buffer> {
    const replicas = ['gcs', 'azure'];
    for (const replica of replicas) {
      try {
        return await this.storage.disk(replica).get(path);
      } catch {
        continue;
      }
    }
    throw new Error(`File not readable from any provider: ${path}`);
  }
}
```

## Disaster Recovery Pattern

Use replication for automated disaster recovery:

```typescript
@Injectable()
export class DisasterRecoveryService {
  private readonly primaryDisk;
  private readonly replicatedDisk;

  constructor(private readonly storage: StorageService) {
    this.primaryDisk = this.storage.disk('s3');

    // Async replication — don't slow down primary writes
    this.replicatedDisk = this.storage.replicated(
      's3',
      ['gcs-disaster-recovery'],
      { strategy: 'async' },
    );
  }

  async write(path: string, content: Buffer): Promise<void> {
    // Writes to S3 immediately, replicates to GCS in background
    await this.replicatedDisk.put(path, content);
  }

  async failoverRead(path: string): Promise<Buffer> {
    try {
      return await this.primaryDisk.get(path);
    } catch {
      // S3 is down — read from DR replica
      return this.storage.disk('gcs-disaster-recovery').get(path);
    }
  }
}
```

## Introspection

Access the replica disk instances for monitoring or manual operations:

```typescript
const disk = storage.replicated('s3', ['gcs', 'azure']);

// Access replica disks
const replicas = (disk as ReplicatedDisk).replicaDisks;
// replicas is an array of FilesystemContract instances

for (const replica of replicas) {
  const size = await replica.directorySize('');
  console.log(`Replica storage used: ${size} bytes`);
}
```

## Combining with RetryDisk

For maximum resilience, add retry logic to each disk individually:

```typescript
const retriedS3 = storage.withRetry('s3', { maxRetries: 3 });
const retriedGcs = storage.withRetry('gcs', { maxRetries: 3 });
const retriedAzure = storage.withRetry('azure', { maxRetries: 3 });

const disk = storage.replicated(retriedS3, [retriedGcs, retriedAzure], {
  strategy: 'all',
});

// Each write retries independently per provider
// S3 might retry 2 times while GCS succeeds on the first try
await disk.put('critical.dat', data);
```

## How It Works Under the Hood

1. **Write interception**: Every write method is intercepted by `ReplicatedDisk`.

2. **Stream buffering**: For stream-based content (e.g., `Readable` streams), the content is buffered into memory first so it can be sent to multiple disks.

3. **Strategy execution**:
   - `'all'`: Uses `Promise.all()` — all must resolve
   - `'quorum'`: Uses a custom promise combinator that resolves when >50% resolve
   - `'async'`: Awaits only the primary, calls replicas with `.catch()` for error suppression

4. **Read passthrough**: All read methods are delegated directly to the primary disk without touching replicas.

## Gotchas

::: danger Memory Usage with Large Files
When replicating stream-based writes, the entire stream content is **buffered into memory** so it can be sent to multiple disks. For very large files (hundreds of MB+), this can cause significant memory pressure. Consider:
- Using `putFile()` with a local file path (reads from disk per replica)
- Breaking large files into chunks
- Using async replication to limit concurrent memory usage
:::

::: warning Partial Failures with `'all'` Strategy
If one replica fails in `'all'` mode, the operation throws even if the primary and other replicas succeeded. The data is now inconsistent. Consider using `'quorum'` strategy if you can tolerate occasional inconsistency in exchange for availability.
:::

::: info Delete Semantics
`delete()` is also replicated. If a delete succeeds on the primary but fails on a replica, that replica will retain a stale copy. With `'async'` strategy, this is common. Implement periodic consistency checks for production deployments.
:::

::: warning Cross-Provider Differences
Different cloud providers have different consistency models, size limits, and path conventions. Test your replication setup thoroughly. For example, Azure has different metadata capabilities than S3.
:::

## Cross-References

- [Decorator Pattern Overview](./index) -- how decorators compose
- [RetryDisk](./retry-disk) -- add per-replica retry logic
- [VersionedDisk](./versioned-disk) -- version files on the primary disk
- [OtelDisk](./otel-disk) -- trace replication across providers
