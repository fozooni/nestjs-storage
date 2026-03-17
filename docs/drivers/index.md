# Drivers Overview

@fozooni/nestjs-storage provides a unified storage API across **9 drivers**. Every driver implements the `FilesystemContract` interface, so you can switch between local filesystem, cloud object stores, and S3-compatible services without changing application code.

The driver architecture follows two patterns:

1. **Independent drivers** — `LocalDisk`, `GcsDisk`, and `AzureDisk` each implement `FilesystemContract` directly with their own SDK.
2. **S3-compatible drivers** — `R2Disk`, `MinioDisk`, `B2Disk`, `DigitalOceanDisk`, and `WasabiDisk` all extend `S3Disk`, inheriting the full AWS S3 SDK integration and only overriding endpoint/auth configuration.

This means that any feature available on S3 — multipart uploads, presigned URLs, range requests — is automatically available on all S3-compatible drivers.

## Feature Comparison

| Feature | Local | S3 | R2 | GCS | Azure | MinIO | B2 | DO | Wasabi |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Multipart Upload | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Presigned URL | ✓¹ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Presigned POST | — | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ |
| Range Requests | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Conditional Writes | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ |
| ACL / Visibility | ✓ | ✓ | —² | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CDN Integration | — | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — |
| Streaming | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Checksum | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Custom Metadata | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

> ¹ Local presigned URLs use HMAC-signed query strings (requires `signSecret` config).
> ² R2 does not support per-object ACLs. Bucket-level public access is configured via the Cloudflare dashboard.

## Required SDK Packages

Each driver requires its cloud SDK as an optional peer dependency. Install only what you need:

| Driver | npm Package | Install Command |
|---|---|---|
| Local | *(none)* | — |
| S3 | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` |
| R2 | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` |
| GCS | `@google-cloud/storage` | `pnpm add @google-cloud/storage` |
| Azure | `@azure/storage-blob` | `pnpm add @azure/storage-blob` |
| MinIO | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` |
| B2 | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` |
| DigitalOcean | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` |
| Wasabi | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` |

::: tip
All S3-compatible drivers share the same SDK packages. Install them once and you can use any S3-compatible driver.
:::

## Minimum Configuration

| Driver | Required Fields |
|---|---|
| Local | `driver: 'local'`, `root` |
| S3 | `driver: 's3'`, `bucket`, `region`, `key`, `secret` |
| R2 | `driver: 'r2'`, `bucket`, `accountId`, `key`, `secret` |
| GCS | `driver: 'gcs'`, `bucket`, `projectId` |
| Azure | `driver: 'azure'`, `containerName`, `accountName`, `accountKey` or `sasToken` |
| MinIO | `driver: 'minio'`, `bucket`, `endpoint`, `key`, `secret` |
| B2 | `driver: 'b2'`, `bucket`, `endpoint`, `key`, `secret` |
| DigitalOcean | `driver: 'do'`, `bucket`, `region`, `key`, `secret` |
| Wasabi | `driver: 'wasabi'`, `bucket`, `region`, `key`, `secret` |

## Switching Drivers

Because every driver implements `FilesystemContract`, switching from one backend to another is a configuration change — no application code needs to change:

```typescript
// Development — local filesystem
StorageModule.forRoot({
  default: 'local',
  disks: {
    local: {
      driver: 'local',
      root: './storage',
    },
  },
})

// Production — Amazon S3
StorageModule.forRoot({
  default: 's3',
  disks: {
    s3: {
      driver: 's3',
      bucket: 'my-app-bucket',
      region: 'us-east-1',
      key: process.env.AWS_ACCESS_KEY_ID,
      secret: process.env.AWS_SECRET_ACCESS_KEY,
    },
  },
})
```

You can also register multiple disks simultaneously and switch between them at runtime:

```typescript
StorageModule.forRoot({
  default: 'uploads',
  disks: {
    uploads: {
      driver: 's3',
      bucket: 'user-uploads',
      region: 'us-east-1',
      key: process.env.AWS_ACCESS_KEY_ID,
      secret: process.env.AWS_SECRET_ACCESS_KEY,
    },
    backups: {
      driver: 'b2',
      bucket: 'app-backups',
      endpoint: 'https://s3.us-west-004.backblazeb2.com',
      key: process.env.B2_KEY_ID,
      secret: process.env.B2_APP_KEY,
    },
    local: {
      driver: 'local',
      root: './tmp',
    },
  },
})
```

```typescript
// Use different disks in your service
@Injectable()
export class FileService {
  constructor(private readonly storage: StorageService) {}

  async upload(file: Buffer, path: string) {
    // Uses the default disk ('uploads')
    await this.storage.disk().put(path, file);
  }

  async backup(path: string) {
    // Explicitly use the backups disk
    const content = await this.storage.disk('uploads').get(path);
    await this.storage.disk('backups').put(path, content);
  }
}
```

## Architecture: S3-Compatible Drivers

Five of the nine drivers — R2, MinIO, B2, DigitalOcean, and Wasabi — extend `S3Disk` rather than implementing `FilesystemContract` from scratch. They inherit all S3 functionality and only customize:

- **Endpoint URL** — pointing to the provider's S3-compatible API
- **Authentication** — provider-specific credential formats
- **Default options** — such as `forcePathStyle` for MinIO

```
FilesystemContract (interface)
├── LocalDisk
├── S3Disk
│   ├── R2Disk
│   ├── MinioDisk
│   ├── B2Disk
│   ├── DigitalOceanDisk
│   └── WasabiDisk
├── GcsDisk
└── AzureDisk
```

::: info
This inheritance model means that any bug fix or feature added to `S3Disk` is automatically available in all five S3-compatible drivers.
:::

## Next Steps

- Explore individual driver pages for detailed configuration and examples
- Learn how to [build a custom driver](./custom-drivers) for unsupported backends
- See [advanced patterns](/advanced/middleware) for CDN, middleware, and signed URLs
