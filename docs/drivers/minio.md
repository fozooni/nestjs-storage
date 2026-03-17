# MinIO Driver

The MinIO driver provides integration with [MinIO](https://min.io/), a high-performance, self-hosted S3-compatible object storage server. The driver extends `S3Disk`, so all S3 features (multipart uploads, presigned URLs, range requests, conditional writes) are fully available.

## Installation

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## Configuration

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `driver` | `'minio'` | Yes | — | Must be `'minio'` |
| `bucket` | `string` | Yes | — | MinIO bucket name |
| `endpoint` | `string` | Yes | — | MinIO server URL (e.g., `http://localhost:9000`) |
| `key` | `string` | Yes | — | MinIO access key |
| `secret` | `string` | Yes | — | MinIO secret key |
| `use_path_style_endpoint` | `boolean` | No | `true` | Use path-style URLs (default for MinIO) |
| `region` | `string` | No | `'us-east-1'` | Region (typically unused, but required by the S3 SDK) |
| `url` | `string` | No | — | Custom base URL for public file URLs |
| `visibility` | `'public' \| 'private'` | No | `'private'` | Default visibility for new objects |

## Basic Setup

```typescript
import { Module } from '@nestjs/common';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'minio',
      disks: {
        minio: {
          driver: 'minio',
          bucket: 'my-app-uploads',
          endpoint: 'http://localhost:9000',
          key: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
          secret: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
          use_path_style_endpoint: true,
        },
      },
    }),
  ],
})
export class AppModule {}
```

### Async Configuration with ConfigService

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    ConfigModule.forRoot(),
    StorageModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        default: 'minio',
        disks: {
          minio: {
            driver: 'minio',
            bucket: config.getOrThrow('MINIO_BUCKET'),
            endpoint: config.getOrThrow('MINIO_ENDPOINT'),
            key: config.getOrThrow('MINIO_ACCESS_KEY'),
            secret: config.getOrThrow('MINIO_SECRET_KEY'),
            use_path_style_endpoint: true,
          },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

## MinIO Extends S3Disk

MinIO is fully S3-compatible, and `MinioDisk` extends `S3Disk`:

```
S3Disk
└── MinioDisk (endpoint: your MinIO server, forcePathStyle: true)
```

All features from the [S3 driver page](./s3) work identically:

- **Presigned URLs** via `temporaryUrl()` and `temporaryUploadUrl()`
- **Presigned POST** via `presignedPost()`
- **Multipart uploads** via `initMultipartUpload()` / `putFileMultipart()`
- **Range requests** via `getRange()`
- **Conditional writes** via `putIfMatch()` / `putIfNoneMatch()`
- **Streaming** via `getStream()` / `putStream()`
- **Checksums** and **custom metadata**
- **Visibility / ACLs**

## Docker Setup for Local Development

The easiest way to run MinIO locally is with Docker:

::: tip Docker Compose for Development
Add MinIO to your `docker-compose.yml` for a complete local development environment:

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      MINIO_ENDPOINT: http://minio:9000
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
      MINIO_BUCKET: my-app-uploads
    depends_on:
      minio-setup:
        condition: service_completed_successfully

  minio:
    image: minio/minio:latest
    ports:
      - '9000:9000'   # S3 API
      - '9001:9001'   # Web console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

  minio-setup:
    image: minio/mc:latest
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 minioadmin minioadmin;
      mc mb local/my-app-uploads --ignore-existing;
      mc anonymous set download local/my-app-uploads/public;
      exit 0;
      "

volumes:
  minio_data:
```
:::

### Standalone Docker

```bash
# Start MinIO
docker run -d \
  --name minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"

# Create a bucket using the MinIO client
docker run --rm --network host minio/mc \
  alias set local http://localhost:9000 minioadmin minioadmin && \
  mc mb local/my-app-uploads
```

Access the MinIO web console at `http://localhost:9001`.

## Path-Style URLs

MinIO uses path-style URLs by default (unlike AWS S3 which uses virtual-hosted style). This is why `use_path_style_endpoint` defaults to `true` for the MinIO driver:

```
# Path-style (MinIO default)
http://localhost:9000/my-bucket/path/to/file.txt

# Virtual-hosted style (AWS S3 default)
http://my-bucket.s3.amazonaws.com/path/to/file.txt
```

::: info
You generally do not need to change `use_path_style_endpoint` for MinIO. It defaults to `true` automatically.
:::

## File Operations

```typescript
@Injectable()
export class MinioFileService {
  constructor(private readonly storage: StorageService) {}

  async upload(file: Express.Multer.File) {
    const disk = this.storage.disk('minio');

    await disk.put(`uploads/${file.originalname}`, file.buffer, {
      visibility: 'public',
      metadata: {
        uploadedBy: 'user-123',
      },
    });

    const url = await disk.url(`uploads/${file.originalname}`);
    // => http://localhost:9000/my-app-uploads/uploads/avatar.png

    return { url };
  }
}
```

## Presigned URLs

```typescript
@Injectable()
export class MinioPresignedService {
  constructor(private readonly storage: StorageService) {}

  async getDownloadLink(path: string): Promise<string> {
    const disk = this.storage.disk('minio');

    // Presigned URL valid for 1 hour
    return disk.temporaryUrl(path, 3600);
  }

  async getUploadLink(path: string): Promise<string> {
    const disk = this.storage.disk('minio');

    return disk.temporaryUploadUrl(path, 3600, {
      contentType: 'application/pdf',
    });
  }
}
```

## Multipart Uploads

```typescript
import { createReadStream } from 'fs';

@Injectable()
export class MinioUploadService {
  constructor(private readonly storage: StorageService) {}

  async uploadLargeFile(localPath: string, remotePath: string) {
    const disk = this.storage.disk('minio');

    await disk.putFileMultipart(remotePath, createReadStream(localPath), {
      partSize: 10 * 1024 * 1024, // 10 MB parts
      concurrency: 4,
    });
  }
}
```

## Range Requests and Streaming

```typescript
@Controller('files')
export class MinioFileController {
  constructor(private readonly storage: StorageService) {}

  @Get(':path(*)')
  @RangeServe()
  async serve(@Param('path') path: string) {
    return { disk: 'minio', path };
  }
}
```

## Using MinIO as an S3 Drop-In Replacement

A common pattern is to use MinIO in development and S3 in production. Because both implement the same interface, you can switch via environment variables:

```typescript
StorageModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const isProduction = config.get('NODE_ENV') === 'production';

    return {
      default: 'storage',
      disks: {
        storage: isProduction
          ? {
              driver: 's3',
              bucket: config.getOrThrow('AWS_S3_BUCKET'),
              region: config.getOrThrow('AWS_REGION'),
              key: config.get('AWS_ACCESS_KEY_ID'),
              secret: config.get('AWS_SECRET_ACCESS_KEY'),
            }
          : {
              driver: 'minio',
              bucket: config.get('MINIO_BUCKET', 'dev-uploads'),
              endpoint: config.get('MINIO_ENDPOINT', 'http://localhost:9000'),
              key: config.get('MINIO_ACCESS_KEY', 'minioadmin'),
              secret: config.get('MINIO_SECRET_KEY', 'minioadmin'),
              use_path_style_endpoint: true,
            },
      },
    };
  },
})
```

::: tip
This pattern gives you a free, local S3-compatible environment for development without any cloud costs or credentials. Your application code stays exactly the same regardless of which driver is used.
:::

## Complete Example

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private readonly storage: StorageService) {}

  private get disk() {
    return this.storage.disk('minio');
  }

  async createBackup(name: string, data: Buffer) {
    const key = `backups/${new Date().toISOString().split('T')[0]}/${name}`;

    await this.disk.put(key, data, {
      metadata: {
        createdAt: new Date().toISOString(),
        type: 'database-backup',
      },
    });

    this.logger.log(`Backup created: ${key}`);
    return key;
  }

  async listBackups(date?: string) {
    const prefix = date ? `backups/${date}/` : 'backups/';
    return this.disk.listContents(prefix, { deep: true });
  }

  async getBackup(key: string): Promise<Buffer> {
    return this.disk.get(key);
  }
}
```

## Environment Variables Example

```bash
# .env (development)
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=my-app-uploads
```
