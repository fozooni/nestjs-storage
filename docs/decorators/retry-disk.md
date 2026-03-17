# RetryDisk

`RetryDisk` adds **automatic retry with exponential backoff and jitter** to any disk. When a transient network error occurs, the operation is transparently retried instead of failing immediately. This is essential for production cloud storage where occasional timeouts and connection resets are inevitable.

## When to Use

- **Cloud storage in production**: S3, GCS, Azure Blob all experience transient failures
- **Unreliable networks**: edge deployments, mobile backends, multi-region architectures
- **Critical write paths**: ensure important uploads survive temporary outages
- **High-throughput systems**: reduce error rates during traffic spikes

## Factory Method

```typescript
storage.withRetry(diskName: string | FilesystemContract, opts?: RetryOptions): RetryDisk
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `diskName` | `string \| FilesystemContract` | Yes | Disk name or disk instance to wrap |
| `opts` | `RetryOptions` | No | Retry configuration |

## RetryOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `maxRetries` | `number` | `3` | Maximum number of retry attempts (not counting the initial attempt) |
| `baseDelay` | `number` | `100` | Base delay in milliseconds for the first retry |
| `maxDelay` | `number` | `10000` | Maximum delay cap in milliseconds |
| `factor` | `number` | `2` | Exponential backoff multiplier |
| `jitter` | `boolean` | `true` | Whether to apply random jitter to delays |
| `retryOn` | `(error: Error) => boolean` | _(see below)_ | Custom predicate to determine if an error is retryable |

## Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class ResilientUploadService {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.withRetry('s3', {
      maxRetries: 5,
      baseDelay: 200,
    });
  }

  async uploadFile(path: string, content: Buffer): Promise<void> {
    // If S3 returns a transient error, retries up to 5 times
    // with exponential backoff: ~200ms, ~400ms, ~800ms, ~1600ms, ~3200ms
    await this.disk.put(path, content);
  }
}
```

## Backoff Algorithm

`RetryDisk` uses a **full-jitter exponential backoff** algorithm:

```
delay = random(0, min(maxDelay, baseDelay * factor ^ attempt))
```

### Retry Timeline (default settings)

```
Attempt 0: Initial request
  ╳ FAIL (StorageNetworkError)
  ├── delay: random(0, min(10000, 100 * 2^0)) = random(0, 100)
  │
Attempt 1: First retry
  ╳ FAIL
  ├── delay: random(0, min(10000, 100 * 2^1)) = random(0, 200)
  │
Attempt 2: Second retry
  ╳ FAIL
  ├── delay: random(0, min(10000, 100 * 2^2)) = random(0, 400)
  │
Attempt 3: Third retry (final)
  ✓ SUCCESS — return result
     (or ╳ FAIL — throw the last error)
```

Without jitter (`jitter: false`), delays are deterministic:

```
Attempt 1: wait exactly 100ms
Attempt 2: wait exactly 200ms
Attempt 3: wait exactly 400ms
```

::: tip Why Jitter?
Without jitter, when many clients fail simultaneously (e.g., during a brief S3 outage), they all retry at the exact same times, creating a "thundering herd" effect. Jitter spreads retries randomly across the delay window, reducing load on the recovering service.
:::

## Default Retry Classification

By default, only `StorageNetworkError` is retried. These errors represent transient conditions that are likely to succeed on a subsequent attempt:

| Error Type | Retried? | Rationale |
|---|---|---|
| `StorageNetworkError` | Yes | Transient network issues, timeouts, connection resets |
| `StorageFileNotFoundError` | No | File genuinely does not exist |
| `StoragePermissionError` | No | Permissions will not change between retries |
| `StorageConfigurationError` | No | Configuration errors are permanent |
| Other errors | No | Unknown errors are not assumed transient |

## Custom Retry Predicate

Override the default classification with a custom `retryOn` function:

```typescript
const disk = storage.withRetry('s3', {
  maxRetries: 3,
  retryOn: (error: Error) => {
    // Retry on network errors
    if (error.name === 'StorageNetworkError') {
      return true;
    }

    // Also retry on HTTP 429 (rate limited) and 503 (service unavailable)
    if ('statusCode' in error) {
      const code = (error as any).statusCode;
      return code === 429 || code === 503;
    }

    return false;
  },
});
```

## Retry Events

`RetryDisk` emits a `StorageEvents.RETRY` event for each retry attempt, allowing you to log or monitor retries:

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StorageEvents } from '@fozooni/nestjs-storage';

@Injectable()
export class RetryMonitor implements OnModuleInit {
  private readonly logger = new Logger(RetryMonitor.name);

  constructor(private readonly events: EventEmitter2) {}

  onModuleInit() {
    this.events.on(StorageEvents.RETRY, (payload) => {
      this.logger.warn(
        `Retry attempt ${payload.attempt}/${payload.maxRetries} ` +
        `for ${payload.operation}('${payload.path}') ` +
        `after ${payload.delay}ms delay. ` +
        `Error: ${payload.error.message}`,
      );
    });
  }
}
```

## Full Service Example with Retry and Logging

```typescript
import { Injectable, Logger } from '@nestjs/common';
import {
  StorageService,
  FilesystemContract,
  StorageEvents,
} from '@fozooni/nestjs-storage';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ReliableStorageService {
  private readonly logger = new Logger(ReliableStorageService.name);
  private readonly disk: FilesystemContract;

  constructor(
    private readonly storage: StorageService,
    private readonly events: EventEmitter2,
  ) {
    this.disk = this.storage.withRetry('s3', {
      maxRetries: 5,
      baseDelay: 200,
      maxDelay: 15_000,
      factor: 2,
      jitter: true,
    });

    // Monitor retry attempts
    this.events.on(StorageEvents.RETRY, (payload) => {
      this.logger.warn(`Retry ${payload.attempt}: ${payload.operation}`, {
        path: payload.path,
        delay: payload.delay,
        error: payload.error.message,
      });
    });
  }

  async uploadWithFallback(
    path: string,
    content: Buffer,
  ): Promise<{ success: boolean; path: string }> {
    try {
      await this.disk.put(path, content);
      return { success: true, path };
    } catch (error) {
      // All retries exhausted — fall back to local disk
      this.logger.error(
        `Upload failed after all retries: ${path}`,
        error,
      );
      const localDisk = this.storage.disk('local');
      const fallbackPath = `failed-uploads/${path}`;
      await localDisk.put(fallbackPath, content);

      return { success: false, path: fallbackPath };
    }
  }
}
```

## Aggressive Retry Configuration

For critical operations where you absolutely must succeed:

```typescript
const criticalDisk = storage.withRetry('s3', {
  maxRetries: 10,
  baseDelay: 500,
  maxDelay: 30_000,
  factor: 1.5,   // Slower backoff growth
  jitter: true,
});

// Total maximum wait time: ~30s * 10 = up to ~5 minutes
// But with jitter, typical total wait is much less
```

## Minimal Retry Configuration

For latency-sensitive operations where you want a quick retry but not a long wait:

```typescript
const quickDisk = storage.withRetry('s3', {
  maxRetries: 2,
  baseDelay: 50,
  maxDelay: 500,
  jitter: true,
});

// Maximum total wait: ~1 second
```

## How It Works Under the Hood

1. **Method interception**: Every `FilesystemContract` method is wrapped in retry logic.

2. **Error classification**: When an error is thrown, the `retryOn` predicate is evaluated. If it returns `false`, the error is thrown immediately.

3. **Delay calculation**: If the error is retryable and attempts remain, the delay is computed using the full-jitter formula.

4. **Event emission**: A `StorageEvents.RETRY` event is emitted with details about the retry attempt.

5. **Sleep**: The decorator waits for the computed delay using `setTimeout`.

6. **Retry**: The method is called again with the same arguments.

7. **Exhaustion**: If all retries are exhausted, the last error is thrown.

## Gotchas

::: warning Write Operations Are Retried
`put()`, `putFile()`, `copy()`, `move()`, `delete()`, and other write operations ARE retried. This is usually safe because cloud storage operations are idempotent (writing the same content to the same key twice produces the same result). However, if your application relies on write-once semantics or uses non-idempotent side effects triggered by writes, be aware that the operation may execute multiple times.
:::

::: warning Streams and Retries
Stream-based operations (`readStream()`, `writeStream()`) may not be safely retryable if the stream has been partially consumed. `RetryDisk` handles this by buffering stream content internally when possible, but for very large streams, the retry may fail on the second attempt if the source stream is exhausted.
:::

::: tip Combine with ReplicatedDisk
For maximum durability, stack `RetryDisk` under `ReplicatedDisk`. Each replica write will have its own retry logic:

```typescript
const retriedS3 = storage.withRetry('s3');
const retriedGcs = storage.withRetry('gcs');
const disk = storage.replicated(retriedS3, [retriedGcs]);
```
:::

::: info Metrics
Listen for `StorageEvents.RETRY` events and forward them to your metrics system (Prometheus, DataDog, CloudWatch) to track retry rates and identify problematic disks or paths.
:::

## Cross-References

- [Decorator Pattern Overview](./index) -- how decorators compose
- [CachedDisk](./cached-disk) -- place cache above retry to skip retries on cache hits
- [ReplicatedDisk](./replicated-disk) -- replicate across disks with per-replica retry
- [OtelDisk](./otel-disk) -- trace retry attempts in distributed traces
