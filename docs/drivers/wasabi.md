# Wasabi Driver

The Wasabi driver provides integration with [Wasabi Hot Cloud Storage](https://wasabi.com/), an S3-compatible object storage service known for its simple, predictable pricing with no egress fees and no API request charges. The driver extends `S3Disk`, so all S3 features are available.

## Installation

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## Configuration

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `driver` | `'wasabi'` | Yes | — | Must be `'wasabi'` |
| `bucket` | `string` | Yes | — | Wasabi bucket name |
| `region` | `string` | Yes | — | Wasabi region (e.g., `'us-east-1'`, `'eu-central-1'`) |
| `endpoint` | `string` | No | Auto | Custom endpoint (auto-derived from region if omitted) |
| `key` | `string` | Yes | — | Wasabi access key ID |
| `secret` | `string` | Yes | — | Wasabi secret access key |
| `url` | `string` | No | — | Custom base URL for public file URLs |
| `visibility` | `'public' \| 'private'` | No | `'private'` | Default visibility for new objects |

::: info Wasabi Service URL Format Per Region
Wasabi endpoints follow this pattern:
```
https://s3.<region>.wasabisys.com
```

| Region | Location | Endpoint |
|---|---|---|
| `us-east-1` | N. Virginia | `https://s3.us-east-1.wasabisys.com` |
| `us-east-2` | N. Virginia | `https://s3.us-east-2.wasabisys.com` |
| `us-west-1` | Oregon | `https://s3.us-west-1.wasabisys.com` |
| `us-central-1` | Texas | `https://s3.us-central-1.wasabisys.com` |
| `eu-central-1` | Amsterdam | `https://s3.eu-central-1.wasabisys.com` |
| `eu-central-2` | Frankfurt | `https://s3.eu-central-2.wasabisys.com` |
| `eu-west-1` | London | `https://s3.eu-west-1.wasabisys.com` |
| `eu-west-2` | Paris | `https://s3.eu-west-2.wasabisys.com` |
| `ap-northeast-1` | Tokyo | `https://s3.ap-northeast-1.wasabisys.com` |
| `ap-northeast-2` | Osaka | `https://s3.ap-northeast-2.wasabisys.com` |
| `ap-southeast-1` | Singapore | `https://s3.ap-southeast-1.wasabisys.com` |
| `ap-southeast-2` | Sydney | `https://s3.ap-southeast-2.wasabisys.com` |

The legacy endpoint `https://s3.wasabisys.com` maps to `us-east-1` and is still supported but not recommended for new configurations.
:::

## Basic Setup

```typescript
import { Module } from '@nestjs/common';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'wasabi',
      disks: {
        wasabi: {
          driver: 'wasabi',
          bucket: 'my-app-storage',
          region: 'us-east-1',
          key: process.env.WASABI_ACCESS_KEY,
          secret: process.env.WASABI_SECRET_KEY,
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
        default: 'wasabi',
        disks: {
          wasabi: {
            driver: 'wasabi',
            bucket: config.getOrThrow('WASABI_BUCKET'),
            region: config.getOrThrow('WASABI_REGION'),
            key: config.getOrThrow('WASABI_ACCESS_KEY'),
            secret: config.getOrThrow('WASABI_SECRET_KEY'),
          },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

## Wasabi Extends S3Disk

Wasabi is fully S3-compatible, and `WasabiDisk` extends `S3Disk`:

```
S3Disk
└── WasabiDisk (endpoint: https://s3.<region>.wasabisys.com)
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

## Wasabi Pricing Model

Wasabi's pricing is distinctive for its simplicity:

| Feature | Wasabi | S3 Standard |
|---|---|---|
| Storage | $6.99/TB/mo ($0.0068/GB) | $0.023/GB/mo |
| Egress | **Free** | $0.09/GB |
| API requests | **Free** | $0.0004-$0.005 per 1K |
| Minimum storage duration | 90 days | None |
| Minimum object size | 4 KB (billed) | None |

::: warning Minimum Storage Duration
Wasabi has a 90-day minimum storage duration policy. Objects deleted before 90 days are still billed for the remaining period. This makes Wasabi ideal for data you intend to keep for at least 3 months, but less suitable for highly ephemeral files.
:::

::: tip
Despite the 90-day minimum, Wasabi is often still cheaper than S3 for most use cases due to the absence of egress and API fees. Calculate your total cost based on your access patterns.
:::

## Wasabi Account Setup

1. Sign up at [wasabi.com](https://wasabi.com/)
2. Navigate to **Access Keys** in the Wasabi Console
3. Click **Create New Access Key**
4. Download or copy the **Access Key** and **Secret Key**
5. Create a bucket in the desired region

## File Operations

```typescript
@Injectable()
export class WasabiFileService {
  constructor(private readonly storage: StorageService) {}

  async upload(file: Express.Multer.File) {
    const disk = this.storage.disk('wasabi');
    const key = `uploads/${Date.now()}-${file.originalname}`;

    await disk.put(key, file.buffer, {
      visibility: 'private',
      metadata: {
        originalName: file.originalname,
        mimeType: file.mimetype,
      },
    });

    return {
      key,
      url: await disk.url(key),
      size: file.size,
    };
  }

  async download(key: string): Promise<Buffer> {
    const disk = this.storage.disk('wasabi');
    return disk.get(key);
  }

  async list(prefix = '') {
    const disk = this.storage.disk('wasabi');
    return disk.listContents(prefix, { deep: true });
  }

  async remove(key: string): Promise<void> {
    const disk = this.storage.disk('wasabi');
    await disk.delete(key);
  }
}
```

## Presigned URLs

```typescript
@Injectable()
export class WasabiPresignedService {
  constructor(private readonly storage: StorageService) {}

  async getDownloadUrl(path: string): Promise<string> {
    const disk = this.storage.disk('wasabi');

    // URL valid for 2 hours
    return disk.temporaryUrl(path, 7200);
  }

  async getUploadUrl(path: string, contentType: string): Promise<string> {
    const disk = this.storage.disk('wasabi');

    return disk.temporaryUploadUrl(path, 3600, {
      contentType,
    });
  }
}
```

## Multipart Uploads

```typescript
import { createReadStream } from 'fs';

@Injectable()
export class WasabiLargeUploadService {
  constructor(private readonly storage: StorageService) {}

  async uploadLargeFile(localPath: string, remotePath: string) {
    const disk = this.storage.disk('wasabi');

    await disk.putFileMultipart(remotePath, createReadStream(localPath), {
      partSize: 50 * 1024 * 1024, // 50 MB parts
      concurrency: 4,
    });
  }

  async manualMultipart(path: string, chunks: Buffer[]) {
    const disk = this.storage.disk('wasabi');

    const uploadId = await disk.initMultipartUpload(path);

    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      const part = await disk.putPart(uploadId, i + 1, chunks[i]);
      parts.push(part);
    }

    await disk.completeMultipartUpload(uploadId, parts);
  }
}
```

## Range Requests and Streaming

```typescript
@Controller('files')
export class WasabiFileController {
  constructor(private readonly storage: StorageService) {}

  @Get(':path(*)')
  @RangeServe()
  async serve(@Param('path') path: string) {
    return { disk: 'wasabi', path };
  }
}
```

## Visibility

```typescript
const disk = this.storage.disk('wasabi');

// Set visibility on write
await disk.put('public/image.png', buffer, { visibility: 'public' });
await disk.put('private/doc.pdf', buffer, { visibility: 'private' });

// Change visibility
await disk.setVisibility('public/image.png', 'private');

// Check visibility
const vis = await disk.getVisibility('private/doc.pdf');
// => 'private'
```

## Wasabi Immutability (Object Lock)

Wasabi supports S3 Object Lock for compliance and data protection. While this is typically configured at the bucket level via the Wasabi Console, the driver interacts with locked objects normally:

```typescript
// Writes to an Object Lock-enabled bucket work the same way
await disk.put('compliance/audit-log-2024.json', auditData);

// Deletes will fail if the object is within its retention period
try {
  await disk.delete('compliance/audit-log-2024.json');
} catch (error) {
  // AccessDenied — object is locked
}
```

::: info
Object Lock must be enabled at bucket creation time in the Wasabi Console. It cannot be added to existing buckets. Use this feature for compliance requirements (HIPAA, SEC 17a-4, etc.).
:::

## Complete Example: Data Lake Service

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class DataLakeService {
  private readonly logger = new Logger(DataLakeService.name);

  constructor(private readonly storage: StorageService) {}

  private get disk() {
    return this.storage.disk('wasabi');
  }

  async ingest(source: string, data: Buffer, metadata: Record<string, string> = {}) {
    const date = new Date();
    const partition = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    const key = `data-lake/${source}/${partition}/${Date.now()}.json`;

    await this.disk.put(key, data, {
      metadata: {
        source,
        ingestedAt: date.toISOString(),
        ...metadata,
      },
    });

    this.logger.log(`Ingested: ${key} (${data.length} bytes)`);
    return { key };
  }

  async query(source: string, date: string): Promise<Buffer[]> {
    const prefix = `data-lake/${source}/${date.replace(/-/g, '/')}/`;
    const items = await this.disk.listContents(prefix);

    const results: Buffer[] = [];
    for (const item of items) {
      if (item.type === 'file') {
        const content = await this.disk.get(item.path);
        results.push(content);
      }
    }

    return results;
  }

  async getSignedUrl(key: string): Promise<string> {
    if (!(await this.disk.exists(key))) {
      throw new NotFoundException('Data file not found');
    }

    return this.disk.temporaryUrl(key, 3600);
  }
}
```

## Environment Variables Example

```bash
# .env
WASABI_BUCKET=my-app-storage
WASABI_REGION=us-east-1
WASABI_ACCESS_KEY=your-wasabi-access-key
WASABI_SECRET_KEY=your-wasabi-secret-key
```
