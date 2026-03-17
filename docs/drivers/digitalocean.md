# DigitalOcean Spaces Driver

The DigitalOcean Spaces driver provides integration with [DigitalOcean Spaces](https://www.digitalocean.com/products/spaces), an S3-compatible object storage service with a built-in CDN. The driver extends `S3Disk`, so all S3 features are available out of the box.

## Installation

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## Configuration

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `driver` | `'do'` | Yes | — | Must be `'do'` |
| `bucket` | `string` | Yes | — | Spaces name |
| `region` | `string` | Yes | — | Spaces region (e.g., `'nyc3'`, `'sfo3'`, `'ams3'`) |
| `endpoint` | `string` | No | Auto | Custom endpoint URL (auto-derived from region if omitted) |
| `key` | `string` | Yes | — | Spaces access key ID |
| `secret` | `string` | Yes | — | Spaces secret access key |
| `url` | `string` | No | — | Custom base URL for public file URLs |
| `visibility` | `'public' \| 'private'` | No | `'private'` | Default visibility for new objects |

## Basic Setup

```typescript
import { Module } from '@nestjs/common';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'spaces',
      disks: {
        spaces: {
          driver: 'do',
          bucket: 'my-app-assets',
          region: 'nyc3',
          key: process.env.DO_SPACES_KEY,
          secret: process.env.DO_SPACES_SECRET,
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
        default: 'spaces',
        disks: {
          spaces: {
            driver: 'do',
            bucket: config.getOrThrow('DO_SPACES_BUCKET'),
            region: config.getOrThrow('DO_SPACES_REGION'),
            key: config.getOrThrow('DO_SPACES_KEY'),
            secret: config.getOrThrow('DO_SPACES_SECRET'),
            url: config.get('DO_SPACES_CDN_URL'),
          },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

## API Key Generation

To create Spaces access keys:

1. Log into the [DigitalOcean Control Panel](https://cloud.digitalocean.com)
2. Navigate to **API** in the left sidebar
3. Scroll to the **Spaces Keys** section
4. Click **Generate New Key**
5. Give the key a descriptive name
6. Copy both the **Key** (access key ID) and **Secret** (secret access key)

::: warning
The secret key is only shown once at creation time. Store it securely immediately.
:::

## DigitalOcean Spaces Extends S3Disk

Spaces is fully S3-compatible, and `DigitalOceanDisk` extends `S3Disk`:

```
S3Disk
└── DigitalOceanDisk (endpoint: https://<region>.digitaloceanspaces.com)
```

All features from the [S3 driver page](./s3) are available:

- **Presigned URLs** via `temporaryUrl()` and `temporaryUploadUrl()`
- **Presigned POST** via `presignedPost()`
- **Multipart uploads** via `initMultipartUpload()` / `putFileMultipart()`
- **Range requests** via `getRange()`
- **Conditional writes** via `putIfMatch()` / `putIfNoneMatch()`
- **Streaming** via `getStream()` / `putStream()`
- **Visibility / ACLs**
- **Custom metadata**

## Spaces Endpoints

The endpoint is automatically derived from the region:

| Region | Location | Endpoint |
|---|---|---|
| `nyc3` | New York | `https://nyc3.digitaloceanspaces.com` |
| `sfo3` | San Francisco | `https://sfo3.digitaloceanspaces.com` |
| `ams3` | Amsterdam | `https://ams3.digitaloceanspaces.com` |
| `sgp1` | Singapore | `https://sgp1.digitaloceanspaces.com` |
| `fra1` | Frankfurt | `https://fra1.digitaloceanspaces.com` |
| `syd1` | Sydney | `https://syd1.digitaloceanspaces.com` |

You can also provide a custom endpoint explicitly:

```typescript
{
  driver: 'do',
  bucket: 'my-space',
  region: 'nyc3',
  endpoint: 'https://nyc3.digitaloceanspaces.com',
  key: process.env.DO_SPACES_KEY,
  secret: process.env.DO_SPACES_SECRET,
}
```

## Built-in CDN

DigitalOcean Spaces includes a free built-in CDN. When enabled, your files are served from edge locations worldwide.

::: tip Spaces CDN Endpoint
When CDN is enabled for a Space, files are available at two URLs:

| Type | URL Pattern |
|---|---|
| **Origin** | `https://<space>.<region>.digitaloceanspaces.com/<path>` |
| **CDN** | `https://<space>.<region>.cdn.digitaloceanspaces.com/<path>` |

To serve files via CDN, set the `url` config to the CDN endpoint:

```typescript
{
  driver: 'do',
  bucket: 'my-app-assets',
  region: 'nyc3',
  key: process.env.DO_SPACES_KEY,
  secret: process.env.DO_SPACES_SECRET,
  url: 'https://my-app-assets.nyc3.cdn.digitaloceanspaces.com',
}
```

You can also use a custom domain with your Space's CDN by adding a CNAME record.
:::

### Custom CDN Domain

```typescript
{
  driver: 'do',
  bucket: 'my-app-assets',
  region: 'nyc3',
  key: process.env.DO_SPACES_KEY,
  secret: process.env.DO_SPACES_SECRET,
  url: 'https://assets.example.com', // Custom domain pointing to Spaces CDN
}
```

```typescript
const disk = this.storage.disk('spaces');

// Returns: https://assets.example.com/images/hero.jpg
const url = await disk.url('images/hero.jpg');
```

## File Operations

```typescript
@Injectable()
export class SpacesFileService {
  constructor(private readonly storage: StorageService) {}

  async upload(file: Express.Multer.File) {
    const disk = this.storage.disk('spaces');
    const key = `uploads/${Date.now()}-${file.originalname}`;

    await disk.put(key, file.buffer, {
      visibility: 'public',
      metadata: {
        originalName: file.originalname,
        mimeType: file.mimetype,
      },
    });

    return {
      key,
      url: await disk.url(key),
    };
  }

  async getFile(key: string): Promise<Buffer> {
    const disk = this.storage.disk('spaces');
    return disk.get(key);
  }

  async deleteFile(key: string): Promise<void> {
    const disk = this.storage.disk('spaces');
    await disk.delete(key);
  }
}
```

## Presigned URLs

```typescript
@Injectable()
export class SpacesPresignedService {
  constructor(private readonly storage: StorageService) {}

  async getTemporaryDownloadUrl(path: string): Promise<string> {
    const disk = this.storage.disk('spaces');

    // Signed URL valid for 1 hour
    return disk.temporaryUrl(path, 3600);
  }

  async getClientUploadUrl(path: string, contentType: string): Promise<string> {
    const disk = this.storage.disk('spaces');

    return disk.temporaryUploadUrl(path, 3600, {
      contentType,
    });
  }

  async getPresignedPost(prefix: string) {
    const disk = this.storage.disk('spaces');

    return disk.presignedPost({
      key: `${prefix}/\${filename}`,
      expires: 3600,
      conditions: [
        ['content-length-range', 0, 25 * 1024 * 1024], // max 25 MB
      ],
    });
  }
}
```

## Multipart Uploads

```typescript
import { createReadStream } from 'fs';

@Injectable()
export class SpacesUploadService {
  constructor(private readonly storage: StorageService) {}

  async uploadLargeFile(localPath: string, remotePath: string) {
    const disk = this.storage.disk('spaces');

    await disk.putFileMultipart(remotePath, createReadStream(localPath), {
      partSize: 15 * 1024 * 1024, // 15 MB parts
      concurrency: 4,
    });
  }
}
```

## Range Requests and Streaming

```typescript
@Controller('assets')
export class SpacesAssetController {
  constructor(private readonly storage: StorageService) {}

  @Get(':path(*)')
  @RangeServe()
  async serve(@Param('path') path: string) {
    return { disk: 'spaces', path };
  }
}
```

## Visibility

```typescript
const disk = this.storage.disk('spaces');

// Public files are accessible via the Space URL
await disk.put('public/logo.png', buffer, { visibility: 'public' });

// Private files require presigned URLs
await disk.put('private/document.pdf', buffer, { visibility: 'private' });

// Toggle visibility
await disk.setVisibility('public/logo.png', 'private');
```

## Complete Example: Static Asset Service

```typescript
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';
import { v4 as uuid } from 'uuid';
import * as path from 'path';

@Injectable()
export class StaticAssetService {
  private readonly logger = new Logger(StaticAssetService.name);

  constructor(private readonly storage: StorageService) {}

  private get disk() {
    return this.storage.disk('spaces');
  }

  async uploadAsset(file: Express.Multer.File, folder = 'assets') {
    const ext = path.extname(file.originalname);
    const key = `${folder}/${uuid()}${ext}`;

    await this.disk.put(key, file.buffer, {
      visibility: 'public',
      metadata: {
        originalName: file.originalname,
        mimeType: file.mimetype,
      },
    });

    const url = await this.disk.url(key);
    this.logger.log(`Asset uploaded: ${url}`);

    return { key, url, size: file.size };
  }

  async getAssetUrl(key: string): Promise<string> {
    if (!(await this.disk.exists(key))) {
      throw new NotFoundException('Asset not found');
    }

    return this.disk.url(key);
  }

  async deleteAsset(key: string): Promise<void> {
    await this.disk.delete(key);
    this.logger.log(`Asset deleted: ${key}`);
  }

  async listAssets(folder = 'assets') {
    return this.disk.listContents(`${folder}/`, { deep: true });
  }

  async getStorageUsage(folder = 'assets'): Promise<{ totalFiles: number; totalBytes: number }> {
    const items = await this.disk.listContents(`${folder}/`, { deep: true });
    let totalBytes = 0;

    for (const item of items) {
      if (item.type === 'file') {
        const meta = await this.disk.getMetadata(item.path);
        totalBytes += meta.size ?? 0;
      }
    }

    return { totalFiles: items.length, totalBytes };
  }
}
```

## Environment Variables Example

```bash
# .env
DO_SPACES_BUCKET=my-app-assets
DO_SPACES_REGION=nyc3
DO_SPACES_KEY=your-spaces-access-key
DO_SPACES_SECRET=your-spaces-secret-key
DO_SPACES_CDN_URL=https://my-app-assets.nyc3.cdn.digitaloceanspaces.com
```
