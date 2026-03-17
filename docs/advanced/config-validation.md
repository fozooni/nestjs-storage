---
title: Config Validation
description: Automatic disk configuration validation and required fields per driver
---

# Config Validation

`@fozooni/nestjs-storage` validates disk configurations automatically when disks are constructed. Invalid or missing configuration throws a `StorageConfigurationError` early, preventing runtime failures.

## How It Works

The `DiskConfigValidator` runs when each disk is instantiated. It checks:

1. The `driver` field is a valid `StorageDriver`
2. All required fields for that driver are present
3. CDN config (if provided) has the required fields
4. Type correctness of configuration values

```ts
import { DiskConfigValidator } from '@fozooni/nestjs-storage';

// Validation happens automatically during disk construction.
// You can also validate manually:
DiskConfigValidator.validate({
  driver: 's3',
  bucket: 'my-bucket',
  region: 'us-east-1',
});
// No error — config is valid

DiskConfigValidator.validate({
  driver: 's3',
  // Missing bucket and region
});
// Throws: StorageConfigurationError: S3 disk requires "bucket" and "region"
```

## Required Fields by Driver

### Cloud & S3-Compatible Drivers

| Driver | Required Fields | Recommended Fields |
|--------|-----------------|--------------------|
| `local` | _(none)_ | `root`, `signSecret` (for temporaryUrl) |
| `s3` | `bucket`, `region` | `credentials`, `endpoint` |
| `r2` | `bucket`, `accountId` | `credentials` |
| `gcs` | `bucket` | `projectId`, `keyFilename` |
| `minio` | `bucket`, `endpoint` | `credentials`, `port`, `useSSL` |
| `b2` | `bucket`, `endpoint` | `credentials` |
| `digitalocean` | `bucket`, `region`, `endpoint` | `credentials` |
| `wasabi` | `bucket`, `region`, `endpoint` | `credentials` |
| `azure` | `containerName`, (`accountKey` OR `sasToken`) | `accountName` |

### Detailed Driver Configurations

#### LocalDisk

```ts
{
  driver: 'local',
  // No required fields, but root is strongly recommended
  root: '/data/storage',          // Base directory for file storage
  signSecret: 'min-32-chars...', // Required for temporaryUrl()
  url: 'https://api.example.com/files', // Public URL base
}
```

#### S3Disk

```ts
{
  driver: 's3',
  bucket: 'my-bucket',           // Required
  region: 'us-east-1',           // Required
  credentials: {                 // Optional — falls back to AWS SDK chain
    accessKeyId: '...',
    secretAccessKey: '...',
  },
  endpoint: 'https://...',       // Optional — for custom S3 endpoints
  forcePathStyle: false,         // Optional — path-style addressing
}
```

#### R2Disk (Cloudflare)

```ts
{
  driver: 'r2',
  bucket: 'my-r2-bucket',        // Required
  accountId: 'cf-account-id',    // Required
  credentials: {                 // Optional — for API tokens
    accessKeyId: '...',
    secretAccessKey: '...',
  },
}
```

#### GcsDisk (Google Cloud Storage)

```ts
{
  driver: 'gcs',
  bucket: 'my-gcs-bucket',       // Required
  projectId: 'my-project',       // Recommended
  keyFilename: '/path/to/sa.json', // Or use GOOGLE_APPLICATION_CREDENTIALS
}
```

#### MinIODisk

```ts
{
  driver: 'minio',
  bucket: 'my-minio-bucket',     // Required
  endpoint: 'http://localhost',   // Required
  port: 9000,                    // Recommended
  useSSL: false,                 // Recommended
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
  },
}
```

#### B2Disk (Backblaze B2)

```ts
{
  driver: 'b2',
  bucket: 'my-b2-bucket',        // Required
  endpoint: 'https://s3.us-west-002.backblazeb2.com', // Required
  credentials: {
    accessKeyId: '...',           // B2 application key ID
    secretAccessKey: '...',       // B2 application key
  },
}
```

#### DigitalOceanDisk (Spaces)

```ts
{
  driver: 'digitalocean',
  bucket: 'my-space',            // Required
  region: 'nyc3',                // Required
  endpoint: 'https://nyc3.digitaloceanspaces.com', // Required
  credentials: {
    accessKeyId: '...',
    secretAccessKey: '...',
  },
}
```

#### WasabiDisk

```ts
{
  driver: 'wasabi',
  bucket: 'my-wasabi-bucket',    // Required
  region: 'us-east-1',           // Required
  endpoint: 'https://s3.wasabisys.com', // Required
  credentials: {
    accessKeyId: '...',
    secretAccessKey: '...',
  },
}
```

#### AzureDisk

```ts
{
  driver: 'azure',
  containerName: 'my-container', // Required
  // One of these is required:
  accountKey: '...',             // Account key auth
  // OR
  sasToken: '...',               // SAS token auth
  accountName: 'myaccount',     // Recommended
}
```

## CDN Config Validation

When a `cdn` field is provided on a disk config, additional validation runs:

| CDN Field | Required | Description |
|-----------|----------|-------------|
| `baseUrl` | Always | Base URL for CDN-served files |
| `provider` | No | CDN provider name (`'cloudfront'`, etc.) |
| `signingKeyId` | If CloudFront | CloudFront key pair ID |
| `signingKey` | If CloudFront | CloudFront private key (PEM) |

### CDN Configuration Examples

#### Basic CDN

```ts
{
  driver: 's3',
  bucket: 'my-bucket',
  region: 'us-east-1',
  cdn: {
    baseUrl: 'https://cdn.example.com', // Required
  },
}
```

#### CloudFront with Signed URLs

```ts
{
  driver: 's3',
  bucket: 'my-bucket',
  region: 'us-east-1',
  cdn: {
    baseUrl: 'https://d1234.cloudfront.net',
    provider: 'cloudfront',
    signingKeyId: 'K1234567890',       // Required for CloudFront signing
    signingKey: fs.readFileSync('pk.pem', 'utf-8'), // Required
  },
}
```

::: warning CloudFront Signer Validation
If `provider` is `'cloudfront'`, the validator requires both `signingKeyId` and `signingKey`. Missing either will throw:

```
StorageConfigurationError: CloudFront CDN requires "signingKeyId" and "signingKey"
```
:::

## `StorageConfigurationError`

The error class thrown on validation failure:

```ts
import { StorageConfigurationError } from '@fozooni/nestjs-storage';

try {
  DiskConfigValidator.validate({
    driver: 'azure',
    // Missing containerName
  });
} catch (error) {
  if (error instanceof StorageConfigurationError) {
    console.error(error.message);
    // "Azure disk requires "containerName" and either "accountKey" or "sasToken""
    console.error(error.driver);  // 'azure'
    console.error(error.fields);  // ['containerName', 'accountKey|sasToken']
  }
}
```

### Error Properties

| Property | Type | Description |
|----------|------|-------------|
| `message` | `string` | Human-readable error description |
| `driver` | `string` | The driver that failed validation |
| `fields` | `string[]` | The missing or invalid fields |

## Using the Validator in Custom Driver Factories

If you build custom disk factories or dynamic disk creation, validate configs early:

```ts
import { Injectable } from '@nestjs/common';
import {
  DiskConfigValidator,
  StorageConfigurationError,
  DiskConfig,
  FilesystemContract,
  InjectStorage,
  StorageService,
} from '@fozooni/nestjs-storage';

@Injectable()
export class DynamicDiskFactory {
  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  createDisk(config: DiskConfig): FilesystemContract {
    // Validate before constructing
    try {
      DiskConfigValidator.validate(config);
    } catch (error) {
      if (error instanceof StorageConfigurationError) {
        throw new Error(
          `Cannot create disk: ${error.message} (missing: ${error.fields.join(', ')})`,
        );
      }
      throw error;
    }

    // Config is valid — create the disk
    return this.storage.createDisk(config);
  }
}
```

## Validation at Startup

By default, disk configs are validated lazily (when the disk is first accessed). To validate all disks at application startup, use an `onModuleInit` hook:

```ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectStorage, StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class StorageStartupValidator implements OnModuleInit {
  private readonly logger = new Logger(StorageStartupValidator.name);

  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    const diskNames = this.storage.getDiskNames();

    for (const name of diskNames) {
      try {
        // Accessing the disk triggers validation
        this.storage.disk(name);
        this.logger.log(`Disk "${name}" configuration is valid`);
      } catch (error) {
        this.logger.error(`Disk "${name}" configuration is INVALID: ${error}`);
        throw error; // Fail fast — prevent app from starting with bad config
      }
    }

    this.logger.log(
      `All ${diskNames.length} disk configurations validated successfully`,
    );
  }
}
```

Register it in your module:

```ts
@Module({
  imports: [StorageModule.forRoot(config)],
  providers: [StorageStartupValidator],
})
export class AppModule {}
```

::: tip Validate Early in Application Startup
Catching configuration errors at startup is much better than discovering them at runtime when a user tries to upload a file. Use the `onModuleInit` pattern above or run `DiskConfigValidator.validate()` in your configuration factory.
:::

::: info Environment-Specific Validation
In development and testing, you might use `FakeDisk` or `LocalDisk` which have minimal configuration requirements. In production, cloud drivers require proper credentials. Consider environment-aware validation:

```ts
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !config.disks.s3.credentials) {
  throw new Error('S3 credentials are required in production');
}
```
:::
