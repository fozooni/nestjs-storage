# Getting Started

## What is @fozooni/nestjs-storage?

`@fozooni/nestjs-storage` is a unified file storage abstraction for NestJS applications that lets you write storage code once and swap between **9 cloud and local drivers** without changing a single line of business logic. Whether you are saving user avatars to the local filesystem during development and deploying to Amazon S3 in production, or replicating critical documents across GCS and Azure simultaneously, this package provides a single, consistent API through the `FilesystemContract` interface.

Beyond simple read/write operations, the package ships with a powerful **decorator disk** system that layers cross-cutting concerns -- encryption, caching, retry logic, quota enforcement, CDN integration, OpenTelemetry tracing, versioning, and content-based routing -- on top of any driver. Combined with first-class NestJS integration (interceptors for file uploads, validation pipes, injectable services, event broadcasting, and health checks), it eliminates the boilerplate that typically surrounds file management in production applications.

## Architecture Overview

The architecture follows a layered, decorator-based design:

```
StorageModule (NestJS Module)
  └─ StorageService (Injectable facade)
       └─ Disk Registry (name → disk mapping)
            ├─ LocalDisk
            ├─ S3Disk
            ├─ GcsDisk
            ├─ AzureDisk
            ├─ ...
            └─ DiskDecorators (composable wrappers)
                 ├─ ScopedDisk
                 ├─ EncryptedDisk
                 ├─ CachedDisk
                 ├─ RetryDisk
                 ├─ ReplicatedDisk
                 ├─ QuotaDisk
                 ├─ CdnDisk
                 ├─ OtelDisk
                 ├─ VersionedDisk
                 └─ RouterDisk
```

Every disk implements the **`FilesystemContract`** interface, and every decorator disk extends **`DiskDecorator`**, which also implements `FilesystemContract`. This means you can stack decorators freely -- a `RetryDisk` wrapping an `EncryptedDisk` wrapping an `S3Disk` -- and the consuming code never knows the difference.

## Quick Start

### Step 1: Install the package

```bash
pnpm add @fozooni/nestjs-storage
```

For S3-compatible storage, also install the AWS SDK:

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### Step 2: Configure the module

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
          url: 'http://localhost:3000/files',
        },
        s3: {
          driver: 's3',
          bucket: 'my-app-uploads',
          region: 'us-east-1',
          key: process.env.AWS_ACCESS_KEY_ID,
          secret: process.env.AWS_SECRET_ACCESS_KEY,
        },
      },
    }),
  ],
})
export class AppModule {}
```

### Step 3: Inject and use

```typescript
// files.service.ts
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class FilesService {
  constructor(private readonly storage: StorageService) {}

  async uploadAvatar(userId: string, file: Buffer): Promise<string> {
    const path = `avatars/${userId}.jpg`;
    await this.storage.disk().put(path, file, {
      visibility: 'public',
      mimetype: 'image/jpeg',
    });
    return this.storage.disk().url(path);
  }

  async getAvatar(userId: string): Promise<Buffer> {
    return this.storage.disk().get(`avatars/${userId}.jpg`, {
      responseType: 'buffer',
    });
  }

  async deleteAvatar(userId: string): Promise<void> {
    await this.storage.disk().delete(`avatars/${userId}.jpg`);
  }

  async uploadToCloud(path: string, content: Buffer): Promise<string> {
    // Switch disks at runtime
    await this.storage.disk('s3').put(path, content);
    return this.storage.disk('s3').url(path);
  }
}
```

::: tip
`StorageModule` is **global by default** (`isGlobal: true`), so you only need to import it once in your root module. Every module in your application can inject `StorageService` without re-importing.
:::

## What You'll Learn

This guide covers everything you need to build production-grade file storage into your NestJS application:

| Guide | What You'll Learn |
|-------|-------------------|
| [Installation](./installation) | Package setup, peer dependencies, and TypeScript configuration |
| [Configuration](./configuration) | Module registration, multi-disk setups, async config, environment-driven configuration |
| [Core Operations](./core-operations) | Reading, writing, deleting, copying, streaming, metadata, and directory operations |
| [File Uploads](./file-uploads) | Interceptors, validation pipes, stored file handling, multi-file uploads |
| [URLs & Downloads](./urls-and-downloads) | Public URLs, presigned URLs, signed URLs, CDN integration, file downloads |
| [Naming Strategies](./naming-strategies) | UUID, hash, date-path, original, and custom naming strategies |
| [Error Handling](./error-handling) | Error hierarchy, exception filters, retry classification, and the `throw` config option |
| [Testing](./testing) | FakeDisk, assertions, test utilities, and full NestJS testing patterns |
| [LLM Documentation](./llm-docs) | AI-ready docs for Cursor, Claude Code, Copilot, and other AI coding tools |

## Compatibility

| Requirement | Supported Versions |
|-------------|-------------------|
| **Node.js** | 18.x, 20.x, 22.x |
| **NestJS** | 10.x, 11.x |
| **TypeScript** | 5.0+ |
| **Package Managers** | npm, pnpm, yarn |

::: info
The package is distributed as both **CommonJS** and **ESM** with full TypeScript declaration files, built with `tsup`. It works seamlessly in any NestJS project regardless of your module system configuration.
:::
