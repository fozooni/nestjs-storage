# Installation

## Install the Package

::: code-group

```bash [pnpm]
pnpm add @fozooni/nestjs-storage
```

```bash [npm]
npm install @fozooni/nestjs-storage
```

```bash [yarn]
yarn add @fozooni/nestjs-storage
```

:::

## Peer Dependencies

`@fozooni/nestjs-storage` keeps its core footprint small by declaring cloud SDKs and optional features as **optional peer dependencies**. You only install what you actually use.

### Cloud Driver SDKs

| Package | When to Install | Required? |
|---------|-----------------|-----------|
| `@aws-sdk/client-s3` | S3, R2, MinIO, Backblaze B2, DigitalOcean Spaces, Wasabi | No -- only for S3-compatible drivers |
| `@aws-sdk/s3-request-presigner` | Presigned GET/PUT URLs on any S3-compatible driver | No -- only if you use `temporaryUrl()` |
| `@aws-sdk/s3-presigned-post` | Presigned POST (direct browser-to-S3 uploads) | No -- only if you use `presignedPost()` |
| `@aws-sdk/cloudfront-signer` | CloudFront signed URLs via `CdnDisk` | No -- only if `cdn.provider` is `'cloudfront'` |
| `@google-cloud/storage` | Google Cloud Storage driver | No -- only for GCS |
| `@azure/storage-blob` | Azure Blob Storage driver | No -- only for Azure |

### Feature Packages

| Package | When to Install | Required? |
|---------|-----------------|-----------|
| `multer` | `StorageFileInterceptor` / `StorageFilesInterceptor` | No -- only for file upload interceptors |
| `archiver` | `StorageArchiver` service (zip/tar creation) | No -- only if you use archiving |
| `zod` | Schema validation in `disk.json()` | No -- only if you pass a Zod schema to `json()` |
| `@opentelemetry/api` | `OtelDisk` tracing decorator | No -- only for OpenTelemetry integration |
| `@nestjs/terminus` | Storage health indicator | No -- only for health checks |
| `rxjs` | Event system, upload progress | **Yes** -- already required by NestJS |

::: warning
If you use a driver or feature without installing the corresponding peer dependency, you will receive a clear `StorageConfigurationError` at startup telling you exactly which package to install.
:::

## Quick Install Recipes

### Local-Only Development

No extra dependencies needed -- the local filesystem driver has zero peer dependencies:

```bash
pnpm add @fozooni/nestjs-storage
```

### S3 (or R2 / MinIO / B2 / DO Spaces / Wasabi)

All S3-compatible drivers share the same SDK:

```bash
pnpm add @fozooni/nestjs-storage @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

If you need presigned POST for direct browser uploads:

```bash
pnpm add @aws-sdk/s3-presigned-post
```

If you need CloudFront signed URLs:

```bash
pnpm add @aws-sdk/cloudfront-signer
```

### Google Cloud Storage

```bash
pnpm add @fozooni/nestjs-storage @google-cloud/storage
```

### Azure Blob Storage

```bash
pnpm add @fozooni/nestjs-storage @azure/storage-blob
```

### Multi-Driver (S3 + GCS + Local)

```bash
pnpm add @fozooni/nestjs-storage \
  @aws-sdk/client-s3 @aws-sdk/s3-request-presigner \
  @google-cloud/storage
```

### Full-Featured Setup

Everything you might need in a production application:

```bash
pnpm add @fozooni/nestjs-storage \
  @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @aws-sdk/s3-presigned-post \
  @google-cloud/storage \
  @azure/storage-blob \
  multer archiver zod \
  @opentelemetry/api @nestjs/terminus
```

::: tip
You can always add peer dependencies later. Start with what you need today and install additional packages as your requirements grow.
:::

## TypeScript Configuration

Ensure your `tsconfig.json` includes the following compiler options:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  }
}
```

::: danger
Both `experimentalDecorators` and `emitDecoratorMetadata` are **required** for NestJS dependency injection to work. Without them, `@InjectStorage()` and `@InjectDisk()` will silently fail.
:::

### Path Aliases (Optional)

If your project uses path aliases, no special configuration is needed -- `@fozooni/nestjs-storage` is a standard npm package and resolves normally through `node_modules`.

## Verify Installation

Create a minimal module to confirm everything is wired up:

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'local',
      disks: {
        local: {
          driver: 'local',
          root: './storage',
        },
      },
    }),
  ],
})
export class AppModule {}
```

```typescript
// app.controller.ts
import { Controller, Get } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Controller()
export class AppController {
  constructor(private readonly storage: StorageService) {}

  @Get('health')
  async checkStorage() {
    const disk = this.storage.disk();
    await disk.put('health-check.txt', 'ok');
    const content = await disk.get('health-check.txt');
    await disk.delete('health-check.txt');
    return { storage: content === 'ok' ? 'healthy' : 'unhealthy' };
  }
}
```

Start your application and hit `GET /health`. If you see `{"storage": "healthy"}`, you are ready to go.

## Next Steps

Now that the package is installed, head to [Configuration](./configuration) to learn how to set up multiple disks, async configuration, and environment-driven driver selection.
