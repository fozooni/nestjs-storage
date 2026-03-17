# Configuration

## StorageModule.forRoot()

The simplest way to configure storage is with `forRoot()`, passing a `StorageConfig` object directly:

```typescript
import { Module } from '@nestjs/common';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'local',
      disks: {
        local: {
          driver: 'local',
          root: './storage/app',
          url: 'http://localhost:3000/files',
        },
      },
    }),
  ],
})
export class AppModule {}
```

::: tip
`StorageModule` sets `isGlobal: true` by default, meaning you only need to import it once in your root `AppModule`. Every other module in your application can inject `StorageService` without importing `StorageModule` again.
:::

### StorageConfig Interface

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `default` | `string` | `'local'` | Name of the default disk. Used when calling `storage.disk()` with no arguments. |
| `disks` | `Record<string, DiskConfig>` | `{}` | Map of disk names to their configuration objects. |
| `auditLog` | `boolean` | `false` | When `true`, enables the `StorageAuditService` to record all storage operations. |

## DiskConfig Interface

Each disk in the `disks` map is configured with a `DiskConfig` object. The available fields depend on the driver.

### Common Fields (All Drivers)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `driver` | `string` | -- | **Required.** One of: `'local'`, `'s3'`, `'r2'`, `'gcs'`, `'azure'`, `'minio'`, `'b2'`, `'do'`, `'wasabi'` |
| `root` | `string` | `'.'` | Root path or prefix for all operations on this disk. |
| `url` | `string` | `undefined` | Base URL for generating public file URLs. |
| `visibility` | `'public' \| 'private'` | `'private'` | Default visibility for new files. |
| `throw` | `boolean` | `true` | When `false`, read operations return `null` instead of throwing `StorageFileNotFoundError`. |
| `namingStrategy` | `NamingStrategy` | `undefined` | Default naming strategy for `putFile()` / `putFileAs()`. |
| `cdn` | `CdnConfig` | `undefined` | CDN configuration. When present, wraps the disk in a `CdnDisk`. |

### S3-Compatible Fields (s3, r2, minio, b2, do, wasabi)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `bucket` | `string` | -- | **Required.** The S3 bucket name. |
| `region` | `string` | `'us-east-1'` | AWS region. |
| `key` | `string` | `undefined` | AWS access key ID. Falls back to SDK credential chain. |
| `secret` | `string` | `undefined` | AWS secret access key. Falls back to SDK credential chain. |
| `endpoint` | `string` | `undefined` | Custom endpoint URL (required for R2, MinIO, B2, DO, Wasabi). |
| `use_path_style_endpoint` | `boolean` | `false` | Use path-style addressing (`endpoint/bucket`) instead of virtual-hosted. Required for MinIO. |
| `signSecret` | `string` | `undefined` | HMAC secret for signed URLs (LocalDisk only). |

### GCS Fields

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `bucket` | `string` | -- | **Required.** The GCS bucket name. |
| `projectId` | `string` | `undefined` | GCP project ID. |
| `keyFilename` | `string` | `undefined` | Path to service account JSON key file. |

### Azure Fields

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `bucket` | `string` | -- | **Required.** The Azure container name. |
| `connectionString` | `string` | `undefined` | Azure storage connection string. |
| `accountName` | `string` | `undefined` | Azure storage account name (alternative to connection string). |
| `accountKey` | `string` | `undefined` | Azure storage account key. |

### CDN Sub-Config

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `cdn.baseUrl` | `string` | -- | **Required.** CDN base URL (e.g., `'https://cdn.example.com'`). |
| `cdn.provider` | `'cloudfront' \| 'generic'` | `'generic'` | CDN provider. `'cloudfront'` enables CloudFront signed URLs. |
| `cdn.signingKeyId` | `string` | `undefined` | CloudFront key pair ID (required when provider is `'cloudfront'`). |
| `cdn.signingKey` | `string` | `undefined` | CloudFront private key PEM string (required when provider is `'cloudfront'`). |

## StorageModule.forRootAsync()

For dynamic configuration -- injecting `ConfigService`, connecting to a database, or fetching secrets at startup -- use `forRootAsync()`.

### useFactory

The most common pattern. Inject any NestJS providers into the factory function:

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
        default: config.get('STORAGE_DEFAULT', 'local'),
        disks: {
          local: {
            driver: 'local',
            root: config.get('STORAGE_LOCAL_ROOT', './storage'),
            url: config.get('STORAGE_LOCAL_URL', 'http://localhost:3000/files'),
          },
          s3: {
            driver: 's3',
            bucket: config.get('AWS_BUCKET'),
            region: config.get('AWS_REGION', 'us-east-1'),
            key: config.get('AWS_ACCESS_KEY_ID'),
            secret: config.get('AWS_SECRET_ACCESS_KEY'),
          },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

### useClass

Encapsulate configuration logic in a dedicated class:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StorageModule,
  StorageOptionsFactory,
  StorageConfig,
} from '@fozooni/nestjs-storage';

@Injectable()
class StorageConfigService implements StorageOptionsFactory {
  constructor(private readonly config: ConfigService) {}

  createStorageOptions(): StorageConfig {
    const isProduction = this.config.get('NODE_ENV') === 'production';

    return {
      default: isProduction ? 's3' : 'local',
      disks: {
        local: {
          driver: 'local',
          root: './storage',
          url: this.config.get('APP_URL') + '/files',
        },
        s3: {
          driver: 's3',
          bucket: this.config.get('AWS_BUCKET'),
          region: this.config.get('AWS_REGION'),
          key: this.config.get('AWS_ACCESS_KEY_ID'),
          secret: this.config.get('AWS_SECRET_ACCESS_KEY'),
          cdn: isProduction
            ? {
                baseUrl: this.config.get('CDN_URL'),
                provider: 'cloudfront',
                signingKeyId: this.config.get('CF_KEY_ID'),
                signingKey: this.config.get('CF_PRIVATE_KEY'),
              }
            : undefined,
        },
      },
    };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot(),
    StorageModule.forRootAsync({
      imports: [ConfigModule],
      useClass: StorageConfigService,
    }),
  ],
})
export class AppModule {}
```

### useExisting

Reference a provider already registered in another module:

```typescript
@Module({
  imports: [
    ConfigModule.forRoot(),
    SharedModule, // exports StorageConfigService
    StorageModule.forRootAsync({
      useExisting: StorageConfigService,
    }),
  ],
})
export class AppModule {}
```

## Injecting Specific Disks

### Using StorageService

The most flexible approach -- select disks at runtime:

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class DocumentsService {
  constructor(private readonly storage: StorageService) {}

  async save(content: Buffer) {
    // Use default disk
    await this.storage.disk().put('doc.pdf', content);

    // Use named disk
    await this.storage.disk('s3').put('doc.pdf', content);
  }
}
```

### Using @InjectDisk()

For services that always operate on a specific disk, inject it directly with the `injectDisks` option:

```typescript
// app.module.ts
StorageModule.forRoot({
  default: 'local',
  injectDisks: ['s3', 'gcs'],
  disks: {
    local: { driver: 'local', root: './storage' },
    s3: { driver: 's3', bucket: 'my-bucket', region: 'us-east-1' },
    gcs: { driver: 'gcs', bucket: 'my-gcs-bucket' },
  },
})
```

```typescript
// uploads.service.ts
import { Injectable } from '@nestjs/common';
import { InjectDisk, FilesystemContract } from '@fozooni/nestjs-storage';

@Injectable()
export class UploadsService {
  constructor(
    @InjectDisk('s3') private readonly s3: FilesystemContract,
  ) {}

  async upload(path: string, content: Buffer) {
    await this.s3.put(path, content);
    return this.s3.url(path);
  }
}
```

::: warning
Disk names passed to `injectDisks` must match keys in the `disks` config. If a disk name is not listed in `injectDisks`, `@InjectDisk()` will throw at startup because no provider was registered for that token.
:::

### Using @InjectStorage()

Injects the `StorageService` instance (equivalent to constructor injection but useful in edge cases):

```typescript
import { InjectStorage, StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(
    @InjectStorage() private readonly storage: StorageService,
  ) {}
}
```

## Environment-Driven Configuration

A production-ready pattern using `@nestjs/config` with validation:

```typescript
// storage.config.ts
import { registerAs } from '@nestjs/config';

export const storageConfig = registerAs('storage', () => ({
  default: process.env.STORAGE_DRIVER || 'local',
  localRoot: process.env.STORAGE_LOCAL_ROOT || './storage',
  localUrl: process.env.STORAGE_LOCAL_URL || 'http://localhost:3000/files',
  s3Bucket: process.env.AWS_S3_BUCKET,
  s3Region: process.env.AWS_REGION || 'us-east-1',
  s3Key: process.env.AWS_ACCESS_KEY_ID,
  s3Secret: process.env.AWS_SECRET_ACCESS_KEY,
  cdnUrl: process.env.CDN_BASE_URL,
}));
```

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from '@fozooni/nestjs-storage';
import { storageConfig } from './storage.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [storageConfig],
    }),
    StorageModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        default: config.get('storage.default'),
        disks: {
          local: {
            driver: 'local',
            root: config.get('storage.localRoot'),
            url: config.get('storage.localUrl'),
          },
          s3: {
            driver: 's3',
            bucket: config.get('storage.s3Bucket'),
            region: config.get('storage.s3Region'),
            key: config.get('storage.s3Key'),
            secret: config.get('storage.s3Secret'),
            cdn: config.get('storage.cdnUrl')
              ? { baseUrl: config.get('storage.cdnUrl') }
              : undefined,
          },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

```bash
# .env
STORAGE_DRIVER=s3
AWS_S3_BUCKET=my-production-bucket
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
CDN_BASE_URL=https://cdn.example.com
```

## Multi-Disk Configuration

Here is a full example with local, S3, and R2 configured simultaneously:

```typescript
StorageModule.forRoot({
  default: 'local',
  disks: {
    // Local filesystem for development and temporary files
    local: {
      driver: 'local',
      root: './storage/app',
      url: 'http://localhost:3000/files',
      visibility: 'public',
    },

    // S3 for primary cloud storage
    s3: {
      driver: 's3',
      bucket: 'my-app-primary',
      region: 'us-east-1',
      key: process.env.AWS_ACCESS_KEY_ID,
      secret: process.env.AWS_SECRET_ACCESS_KEY,
      visibility: 'private',
      cdn: {
        baseUrl: 'https://d1234.cloudfront.net',
        provider: 'cloudfront',
        signingKeyId: process.env.CF_KEY_ID,
        signingKey: process.env.CF_PRIVATE_KEY,
      },
    },

    // Cloudflare R2 for cost-effective egress
    r2: {
      driver: 'r2',
      bucket: 'my-app-public',
      key: process.env.R2_ACCESS_KEY_ID,
      secret: process.env.R2_SECRET_ACCESS_KEY,
      endpoint: process.env.R2_ENDPOINT,
      visibility: 'public',
    },

    // Temporary disk for processing
    temp: {
      driver: 'local',
      root: '/tmp/my-app',
      throw: false, // Returns null instead of throwing when files are missing
    },
  },
})
```

::: info
You can have **multiple disks using the same driver** with different configurations. In the example above, `local` and `temp` both use the `'local'` driver but point to different root directories with different behaviors.
:::

## Driver-Specific Endpoint Examples

### Cloudflare R2

```typescript
{
  driver: 'r2',
  bucket: 'my-bucket',
  key: process.env.R2_ACCESS_KEY_ID,
  secret: process.env.R2_SECRET_ACCESS_KEY,
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
}
```

### MinIO (Self-Hosted)

```typescript
{
  driver: 'minio',
  bucket: 'my-bucket',
  region: 'us-east-1',
  key: 'minioadmin',
  secret: 'minioadmin',
  endpoint: 'http://localhost:9000',
  use_path_style_endpoint: true,
}
```

### Backblaze B2

```typescript
{
  driver: 'b2',
  bucket: 'my-bucket',
  region: 'us-west-004',
  key: process.env.B2_APPLICATION_KEY_ID,
  secret: process.env.B2_APPLICATION_KEY,
  endpoint: `https://s3.${process.env.B2_REGION}.backblazeb2.com`,
}
```

### DigitalOcean Spaces

```typescript
{
  driver: 'do',
  bucket: 'my-space',
  region: 'nyc3',
  key: process.env.DO_SPACES_KEY,
  secret: process.env.DO_SPACES_SECRET,
  endpoint: 'https://nyc3.digitaloceanspaces.com',
}
```

### Wasabi

```typescript
{
  driver: 'wasabi',
  bucket: 'my-bucket',
  region: 'us-east-1',
  key: process.env.WASABI_ACCESS_KEY,
  secret: process.env.WASABI_SECRET_KEY,
  endpoint: 'https://s3.wasabisys.com',
}
```

## Next Steps

With your storage configured, you are ready to start performing [Core Operations](./core-operations) -- reading, writing, deleting, and streaming files.
