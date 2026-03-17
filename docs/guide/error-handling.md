# Error Handling

`@fozooni/nestjs-storage` provides a structured error hierarchy that maps cleanly to HTTP status codes and enables precise error handling in your application. Every storage error extends the base `StorageError` class, making it easy to catch all storage-related failures or handle specific error types.

## Error Hierarchy

```
StorageError (base class)
  ├── StorageFileNotFoundError   → HTTP 404
  ├── StoragePermissionError     → HTTP 403
  ├── StorageNetworkError        → HTTP 502/503/504
  ├── StorageConfigurationError  → (startup / misconfiguration)
  └── StorageQuotaExceededError  → HTTP 413
```

## StorageError (Base Class)

All storage errors extend `StorageError`. It carries contextual information about where the error occurred:

```typescript
class StorageError extends Error {
  readonly message: string;
  readonly disk?: string;    // Which disk threw the error
  readonly path?: string;    // Which file path was involved
  readonly cause?: Error;    // Original underlying error
}
```

```typescript
import { StorageError } from '@fozooni/nestjs-storage';

try {
  await disk.get('some/file.txt');
} catch (error) {
  if (error instanceof StorageError) {
    console.error(`Storage error on disk "${error.disk}" at path "${error.path}"`);
    console.error(`Cause: ${error.cause?.message}`);
  }
}
```

## StorageFileNotFoundError

Thrown when a requested file does not exist. Map this to HTTP 404:

```typescript
import {
  StorageService,
  StorageFileNotFoundError,
} from '@fozooni/nestjs-storage';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class DocumentsService {
  constructor(private readonly storage: StorageService) {}

  async getDocument(path: string): Promise<Buffer> {
    try {
      return await this.storage.disk().get(path, { responseType: 'buffer' });
    } catch (error) {
      if (error instanceof StorageFileNotFoundError) {
        throw new NotFoundException(`Document not found: ${path}`);
      }
      throw error;
    }
  }
}
```

## StoragePermissionError

Thrown when the operation is denied due to insufficient permissions (wrong IAM policy, private file access, etc.). Map to HTTP 403:

```typescript
import { StoragePermissionError } from '@fozooni/nestjs-storage';
import { ForbiddenException } from '@nestjs/common';

try {
  await disk.put('restricted/config.json', data);
} catch (error) {
  if (error instanceof StoragePermissionError) {
    throw new ForbiddenException(
      'Insufficient permissions to write to this location',
    );
  }
  throw error;
}
```

## StorageNetworkError

Thrown for transient network failures -- DNS resolution errors, timeouts, connection resets. These are **retryable** by nature:

```typescript
import { StorageNetworkError } from '@fozooni/nestjs-storage';

try {
  await disk.put('backup/data.json', largePayload);
} catch (error) {
  if (error instanceof StorageNetworkError) {
    // Safe to retry -- the error is transient
    console.warn('Network error, will retry:', error.message);
    await retryOperation(() => disk.put('backup/data.json', largePayload));
  }
  throw error;
}
```

::: info How RetryDisk Uses This
The `RetryDisk` decorator automatically retries operations that throw `StorageNetworkError`. By default, it will **not** retry other error types because they are typically not transient. You can customize this behavior by providing a custom `shouldRetry` function to the `RetryDisk` configuration.
:::

## StorageConfigurationError

Thrown when the storage system is misconfigured -- missing credentials, invalid bucket name, unavailable driver, missing peer dependency. These errors occur at **startup** or on first use and indicate a problem that must be fixed in code or environment configuration:

```typescript
import { StorageConfigurationError } from '@fozooni/nestjs-storage';

try {
  const disk = storage.disk('s3');
  await disk.put('test.txt', 'hello');
} catch (error) {
  if (error instanceof StorageConfigurationError) {
    console.error('Storage misconfiguration:', error.message);
    // Example messages:
    // "Missing peer dependency: @aws-sdk/client-s3"
    // "S3 bucket 'my-bucket' not found or not accessible"
    // "Invalid region: us-east-99"
  }
}
```

::: danger
**Never catch and suppress `StorageConfigurationError` in production.** These errors indicate fundamental misconfigurations that prevent the storage system from functioning. Swallowing them will lead to silent data loss. Let them propagate to your error monitoring system (Sentry, Datadog, etc.) and fix the root cause.
:::

## StorageQuotaExceededError

Thrown when a write would exceed the configured quota (used with `QuotaDisk`). Map to HTTP 413:

```typescript
import { StorageQuotaExceededError } from '@fozooni/nestjs-storage';
import { PayloadTooLargeException } from '@nestjs/common';

try {
  await disk.put('uploads/large-file.zip', hugeBuffer);
} catch (error) {
  if (error instanceof StorageQuotaExceededError) {
    throw new PayloadTooLargeException(
      'Storage quota exceeded. Please delete some files before uploading.',
    );
  }
  throw error;
}
```

## The `instanceof` Pattern

The recommended approach is a cascading `instanceof` check from most specific to least specific:

```typescript
import {
  StorageError,
  StorageFileNotFoundError,
  StoragePermissionError,
  StorageNetworkError,
  StorageConfigurationError,
  StorageQuotaExceededError,
} from '@fozooni/nestjs-storage';

async function handleStorageOperation(disk, path: string) {
  try {
    return await disk.get(path, { responseType: 'buffer' });
  } catch (error) {
    if (error instanceof StorageFileNotFoundError) {
      // 404 - File does not exist
      return null;
    }
    if (error instanceof StoragePermissionError) {
      // 403 - Access denied
      throw new ForbiddenException('Access denied');
    }
    if (error instanceof StorageQuotaExceededError) {
      // 413 - Over quota
      throw new PayloadTooLargeException('Quota exceeded');
    }
    if (error instanceof StorageNetworkError) {
      // 5xx - Transient, retryable
      throw new ServiceUnavailableException('Storage temporarily unavailable');
    }
    if (error instanceof StorageConfigurationError) {
      // Bug in configuration - log and rethrow
      console.error('CRITICAL: Storage misconfigured', error);
      throw new InternalServerErrorException('Internal server error');
    }
    if (error instanceof StorageError) {
      // Catch-all for any other storage errors
      throw new InternalServerErrorException('Storage operation failed');
    }
    // Non-storage error - rethrow as-is
    throw error;
  }
}
```

## NestJS Exception Filter

Create a global exception filter that automatically maps storage errors to HTTP responses:

```typescript
// storage-exception.filter.ts
import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  StorageError,
  StorageFileNotFoundError,
  StoragePermissionError,
  StorageNetworkError,
  StorageConfigurationError,
  StorageQuotaExceededError,
} from '@fozooni/nestjs-storage';

@Catch(StorageError)
export class StorageExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(StorageExceptionFilter.name);

  catch(exception: StorageError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number;
    let message: string;

    if (exception instanceof StorageFileNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = `File not found: ${exception.path}`;
    } else if (exception instanceof StoragePermissionError) {
      status = HttpStatus.FORBIDDEN;
      message = 'Access denied to the requested resource';
    } else if (exception instanceof StorageQuotaExceededError) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      message = 'Storage quota exceeded';
    } else if (exception instanceof StorageNetworkError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Storage service temporarily unavailable';
      this.logger.warn(
        `Network error on disk "${exception.disk}": ${exception.message}`,
      );
    } else if (exception instanceof StorageConfigurationError) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      this.logger.error(
        `Configuration error on disk "${exception.disk}": ${exception.message}`,
        exception.stack,
      );
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected storage error occurred';
      this.logger.error(
        `Storage error: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status],
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
```

Register the filter globally in your `main.ts`:

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { StorageExceptionFilter } from './storage-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new StorageExceptionFilter());
  await app.listen(3000);
}
bootstrap();
```

Or register it via dependency injection to access other services:

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { StorageExceptionFilter } from './storage-exception.filter';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: StorageExceptionFilter,
    },
  ],
})
export class AppModule {}
```

## The `throw` Config Option

By default, all disks throw errors when operations fail. You can change this behavior per-disk by setting `throw: false`:

```typescript
StorageModule.forRoot({
  default: 'local',
  disks: {
    local: {
      driver: 'local',
      root: './storage',
      throw: false, // Read operations return null instead of throwing
    },
  },
})
```

When `throw` is `false`:
- `get()` returns `null` instead of throwing `StorageFileNotFoundError`
- `exists()` / `missing()` still work normally
- Write operations (`put()`, `delete()`) still throw on actual errors

```typescript
// With throw: false
const content = await disk.get('maybe-exists.txt');
if (content === null) {
  // File does not exist -- no exception thrown
  console.log('File not found, using default');
}

// With throw: true (default)
try {
  const content = await disk.get('maybe-exists.txt');
} catch (error) {
  // StorageFileNotFoundError thrown
}
```

::: tip
Use `throw: false` for disks where missing files are a normal part of the application flow (e.g., optional configuration files, cache lookups). Keep the default `throw: true` for disks where a missing file indicates a real problem.
:::

## RetryDisk Error Classification

The `RetryDisk` decorator uses the error type to decide whether to retry:

| Error Type | Retried? | Reason |
|------------|----------|--------|
| `StorageNetworkError` | Yes | Transient -- network may recover |
| `StorageFileNotFoundError` | No | File is deterministically missing |
| `StoragePermissionError` | No | Permissions won't change between retries |
| `StorageConfigurationError` | No | Configuration won't fix itself |
| `StorageQuotaExceededError` | No | Quota won't free itself between retries |
| Other `StorageError` | No | Unknown -- conservative default |

You can customize retry behavior:

```typescript
import { RetryDisk } from '@fozooni/nestjs-storage';

const retryDisk = new RetryDisk(innerDisk, {
  maxRetries: 3,
  delay: 1000,
  backoff: 'exponential',
  shouldRetry: (error) => {
    // Retry on network errors AND quota errors (maybe space frees up)
    return (
      error instanceof StorageNetworkError ||
      error instanceof StorageQuotaExceededError
    );
  },
});
```

## Next Steps

Now that you understand error handling, learn how to write reliable tests for your storage code with [Testing](./testing) -- FakeDisk, assertions, and NestJS test module patterns.
