# OtelDisk

`OtelDisk` adds **OpenTelemetry distributed tracing** to every storage operation. Each method call is wrapped in a span, providing full observability into your storage layer. When `@opentelemetry/api` is not installed, `OtelDisk` degrades gracefully to a transparent no-op wrapper.

## When to Use

- **Production observability**: trace storage operations alongside HTTP requests, database queries, and other spans
- **Performance monitoring**: identify slow storage operations in your distributed traces
- **Debugging**: correlate storage errors with upstream requests
- **SLA tracking**: measure P99 latency of storage operations

## Factory Method

```typescript
storage.withTracing(diskName: string | FilesystemContract): OtelDisk
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `diskName` | `string \| FilesystemContract` | Yes | Disk name or instance to trace |

## Optional Peer Dependency

```bash
pnpm add @opentelemetry/api
```

::: info Graceful Degradation
If `@opentelemetry/api` is not installed, `OtelDisk` functions as a transparent passthrough with zero overhead. No errors are thrown, no warnings are logged. You can safely apply `withTracing()` in your code and let the deployment environment decide whether tracing is active by installing or omitting the dependency.
:::

## Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class TracedStorageService {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.withTracing('s3');
  }

  async uploadFile(path: string, content: Buffer): Promise<void> {
    // Creates a span: "storage.put" with attributes
    await this.disk.put(path, content);
  }

  async readFile(path: string): Promise<Buffer> {
    // Creates a span: "storage.get" with attributes
    return this.disk.get(path);
  }
}
```

## Span Attributes

Every span includes these attributes:

| Attribute | Type | Example | Description |
|---|---|---|---|
| `storage.disk` | `string` | `"s3"` | The disk name or identifier |
| `storage.operation` | `string` | `"put"` | The operation being performed |
| `storage.path` | `string` | `"uploads/file.txt"` | The file path being operated on |

On error, the span additionally records:

| Attribute | Type | Description |
|---|---|---|
| `otel.status_code` | `string` | Set to `"ERROR"` |
| `exception.type` | `string` | Error class name |
| `exception.message` | `string` | Error message |

## Span Naming Convention

Spans follow the convention: `storage.{operation}`

Examples:
- `storage.put`
- `storage.get`
- `storage.delete`
- `storage.exists`
- `storage.copy`
- `storage.move`
- `storage.size`
- `storage.readStream`
- `storage.files`
- `storage.allFiles`

## Checking Tracing Status

Use the `isTracingActive` getter to determine if OpenTelemetry is available:

```typescript
const disk = storage.withTracing('s3');

if ((disk as OtelDisk).isTracingActive) {
  console.log('OpenTelemetry tracing is active');
} else {
  console.log('Tracing is a no-op (OTel not installed)');
}
```

## Full OpenTelemetry Setup Example

### 1. Install Dependencies

```bash
pnpm add @opentelemetry/api \
         @opentelemetry/sdk-node \
         @opentelemetry/exporter-jaeger \
         @opentelemetry/sdk-trace-node \
         @opentelemetry/instrumentation-http \
         @opentelemetry/instrumentation-nestjs-core
```

### 2. Initialize Tracing (tracing.ts)

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

const sdk = new NodeSDK({
  serviceName: 'my-nestjs-app',
  traceExporter: new JaegerExporter({
    endpoint: 'http://localhost:14268/api/traces',
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new NestInstrumentation(),
  ],
});

sdk.start();
```

### 3. Bootstrap Before NestJS

```typescript
// main.ts
import './tracing'; // Must be imported before NestJS
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

### 4. Use OtelDisk in Services

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService, FilesystemContract } from '@fozooni/nestjs-storage';

@Injectable()
export class DocumentService {
  private readonly disk: FilesystemContract;

  constructor(private readonly storage: StorageService) {
    // Tracing wraps every operation with an OpenTelemetry span
    this.disk = this.storage.withTracing('s3');
  }

  async processDocument(path: string): Promise<{ size: number; type: string }> {
    // Each of these creates a child span under the current trace
    const exists = await this.disk.exists(path);
    if (!exists) {
      throw new Error('Document not found');
    }

    const [size, mimeType] = await Promise.all([
      this.disk.size(path),      // span: storage.size
      this.disk.mimeType(path),  // span: storage.mimeType
    ]);

    return { size, type: mimeType };
  }
}
```

### Resulting Trace in Jaeger

```
HTTP POST /documents/upload            [250ms]
├── NestJS DocumentController.upload   [248ms]
│   ├── storage.put                    [200ms]
│   │   ├── storage.disk: "s3"
│   │   ├── storage.operation: "put"
│   │   └── storage.path: "documents/report.pdf"
│   ├── storage.exists                 [15ms]
│   │   ├── storage.disk: "s3"
│   │   ├── storage.operation: "exists"
│   │   └── storage.path: "documents/report.pdf"
│   └── storage.size                   [12ms]
│       ├── storage.disk: "s3"
│       ├── storage.operation: "size"
│       └── storage.path: "documents/report.pdf"
```

## Error Recording

When a storage operation fails, the span is marked with an error status:

```typescript
try {
  await tracedDisk.get('nonexistent.txt');
} catch (error) {
  // The span automatically records:
  // - otel.status_code: "ERROR"
  // - exception.type: "StorageFileNotFoundError"
  // - exception.message: "File not found: nonexistent.txt"
  // The error is still thrown to the caller
}
```

## Combining with Other Decorators

Place `OtelDisk` as the outermost decorator to trace the full operation including all decorator overhead:

```typescript
// Recommended: tracing is outermost
const retried = storage.withRetry('s3', { maxRetries: 3 });
const cached = storage.cached(retried, { ttl: 60_000 });
const disk = storage.withTracing(cached);

// The span for storage.get includes:
// - Cache check time (if cache miss)
// - Retry attempts (if any)
// - Actual S3 API call
```

Alternatively, place tracing at the innermost layer to trace only the raw disk operations:

```typescript
// Alternative: tracing only on raw operations
const traced = storage.withTracing('s3');
const retried = storage.withRetry(traced, { maxRetries: 3 });
const disk = storage.cached(retried, { ttl: 60_000 });

// The span for storage.get covers only the actual S3 call
// Cache checks and retry overhead are NOT in the span
```

## Zipkin Integration

```typescript
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';

const sdk = new NodeSDK({
  serviceName: 'my-nestjs-app',
  traceExporter: new ZipkinExporter({
    url: 'http://localhost:9411/api/v2/spans',
  }),
});
```

## Conditional Tracing

Enable tracing only in specific environments:

```typescript
@Injectable()
export class StorageFactory {
  constructor(private readonly storage: StorageService) {}

  getDisk(name: string): FilesystemContract {
    const disk = this.storage.disk(name);

    if (process.env.ENABLE_TRACING === 'true') {
      return this.storage.withTracing(disk);
    }

    return disk;
  }
}
```

::: tip Production vs Development Tracing
In development, tracing adds minimal overhead since `OtelDisk` is a thin wrapper. In production, the overhead depends on your OTel exporter configuration (batch vs. immediate export, sampling rate). Use an appropriate sampling strategy to control overhead:

```typescript
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node';

const sdk = new NodeSDK({
  sampler: new TraceIdRatioBasedSampler(0.1), // Sample 10% of traces
});
```
:::

## How It Works Under the Hood

1. **Dynamic import**: On construction, `OtelDisk` attempts to `require('@opentelemetry/api')`. If the import fails, a flag is set and all methods become direct passthroughs.

2. **Tracer acquisition**: If OTel is available, a tracer is obtained via `trace.getTracer('@fozooni/nestjs-storage')`.

3. **Span creation**: Each method call creates a new span using `tracer.startActiveSpan()`, sets the standard attributes, and executes the inner disk operation within the span's context.

4. **Error handling**: If the inner operation throws, the error is recorded on the span (`span.recordException(error)`), the span status is set to `ERROR`, and the error is re-thrown.

5. **Span lifecycle**: Spans are ended in a `finally` block, ensuring they are always closed even on errors.

## Gotchas

::: warning Span Cardinality
If your application accesses millions of unique file paths, the `storage.path` attribute creates high-cardinality span data. Some observability backends (like Prometheus for metrics) struggle with high cardinality. Consider using path patterns instead of exact paths in production, or filter high-cardinality attributes at the exporter level.
:::

::: info No OTel = No Overhead
When `@opentelemetry/api` is not installed, `OtelDisk` adds zero overhead. The methods are direct pass-throughs to the inner disk. There is no try/catch, no attribute creation, no span lifecycle. This makes it safe to always include `withTracing()` in your application code.
:::

## Cross-References

- [Decorator Pattern Overview](./index) -- how decorators compose
- [RetryDisk](./retry-disk) -- trace retry attempts in your spans
- [CachedDisk](./cached-disk) -- trace cache hits vs. misses
- [ReplicatedDisk](./replicated-disk) -- trace multi-provider replication
