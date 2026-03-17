# CdnDisk

`CdnDisk` provides **CDN URL rewriting and CloudFront signed URL generation**. Unlike other decorators, `CdnDisk` is **automatically applied** when a disk's configuration includes a `cdn` property. You do not need to manually wrap disks with it.

## When to Use

- **Public asset delivery**: serve images, CSS, JS through a CDN
- **CloudFront signed URLs**: time-limited access to private content via CloudFront
- **Custom domain URLs**: return `https://cdn.example.com/path` instead of S3 URLs
- **Edge caching**: leverage CDN edge locations for global performance

## Auto-Application

When you configure a disk with a `cdn` property, `CdnDisk` is automatically applied:

```typescript
// storage.config.ts
StorageModule.forRoot({
  default: 's3',
  disks: {
    s3: {
      driver: 's3',
      bucket: 'my-assets',
      region: 'us-east-1',
      // This automatically wraps the S3 disk with CdnDisk
      cdn: {
        baseUrl: 'https://cdn.example.com',
        provider: 'generic',
      },
    },
  },
}),
```

::: info Auto-Wrapping Behavior
You do not call `storage.withCdn()` or manually create a `CdnDisk`. The `StorageModule` detects the `cdn` config property and wraps the disk automatically during initialization. The disk you get from `storage.disk('s3')` is already a `CdnDisk`.
:::

## CdnConfig

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `baseUrl` | `string` | Yes | -- | The CDN base URL (e.g., `https://d1234.cloudfront.net`) |
| `provider` | `'cloudfront' \| 'generic'` | No | `'generic'` | CDN provider. `'cloudfront'` enables signed URL generation |
| `signingKeyId` | `string` | No | -- | CloudFront key pair ID (required when `provider: 'cloudfront'`) |
| `signingKey` | `string` | No | -- | CloudFront private key PEM (required when `provider: 'cloudfront'`) |

## Generic CDN

For simple URL rewriting without signing:

```typescript
StorageModule.forRoot({
  default: 's3',
  disks: {
    assets: {
      driver: 's3',
      bucket: 'public-assets',
      region: 'us-east-1',
      cdn: {
        baseUrl: 'https://cdn.myapp.com',
        provider: 'generic',
      },
    },
  },
}),
```

```typescript
@Injectable()
export class AssetService {
  constructor(private readonly storage: StorageService) {}

  async getAssetUrl(path: string): Promise<string> {
    // Returns: https://cdn.myapp.com/images/hero.jpg
    // Instead of: https://public-assets.s3.amazonaws.com/images/hero.jpg
    return this.storage.disk('assets').url(path);
  }
}
```

## CloudFront Signed URLs

For private content served through CloudFront with time-limited access:

### Setup

1. **Create a CloudFront key pair** in the AWS Console (CloudFront > Key Management > Public Keys)
2. **Get the key pair ID** and download the private key PEM file
3. **Configure the disk**:

```typescript
StorageModule.forRoot({
  default: 's3',
  disks: {
    private: {
      driver: 's3',
      bucket: 'private-content',
      region: 'us-east-1',
      cdn: {
        baseUrl: 'https://d1234abcdef.cloudfront.net',
        provider: 'cloudfront',
        signingKeyId: process.env.CLOUDFRONT_KEY_ID,
        signingKey: process.env.CLOUDFRONT_PRIVATE_KEY,
      },
    },
  },
}),
```

4. **Install the optional peer dependency**:

```bash
pnpm add @aws-sdk/cloudfront-signer
```

### Generating Signed URLs

```typescript
@Injectable()
export class PrivateContentService {
  constructor(private readonly storage: StorageService) {}

  async getSignedUrl(path: string): Promise<string> {
    // Returns a CloudFront signed URL valid for the specified duration
    // https://d1234abcdef.cloudfront.net/videos/lesson-1.mp4?Expires=...&Signature=...&Key-Pair-Id=...
    return this.storage.disk('private').temporaryUrl(path, {
      expiresIn: 3600, // 1 hour
    });
  }
}
```

::: warning CloudFront Signer Dependency
CloudFront signed URL generation requires the optional peer dependency `@aws-sdk/cloudfront-signer`. If this package is not installed and you attempt to generate a signed URL, a `StorageConfigurationError` will be thrown.

```bash
pnpm add @aws-sdk/cloudfront-signer
```
:::

## Full CloudFront Integration Example

```typescript
import {
  Controller,
  Get,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  Headers,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from '@fozooni/nestjs-storage';

@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    const path = `media/${Date.now()}-${file.originalname}`;
    const disk = this.storage.disk('private');
    await disk.put(path, file.buffer);

    return {
      path,
      // Public CDN URL (for public assets)
      cdnUrl: await disk.url(path),
      // Signed URL (for private assets, expires in 1 hour)
      signedUrl: await disk.temporaryUrl(path, { expiresIn: 3600 }),
    };
  }

  @Get('stream/:path(*)')
  async getStreamUrl(@Param('path') path: string) {
    const disk = this.storage.disk('private');

    // Short-lived signed URL for video streaming
    const url = await disk.temporaryUrl(path, {
      expiresIn: 7200, // 2 hours for video streaming
    });

    return { url };
  }

  @Get('thumbnail/:path(*)')
  async getThumbnailUrl(@Param('path') path: string) {
    const disk = this.storage.disk('private');

    // Longer-lived URL for static thumbnails
    const url = await disk.temporaryUrl(path, {
      expiresIn: 86400, // 24 hours
    });

    return { url };
  }
}
```

## URL Behavior

| Method | Generic CDN | CloudFront CDN |
|---|---|---|
| `url(path)` | `{baseUrl}/{path}` | `{baseUrl}/{path}` (unsigned) |
| `temporaryUrl(path, opts)` | Falls through to inner disk's presigned URL | CloudFront signed URL |
| `presignedPost(path, opts)` | Falls through to inner disk | Falls through to inner disk |

## Manual Construction

While auto-application is the standard approach, you can manually create a `CdnDisk`:

```typescript
import { CdnDisk } from '@fozooni/nestjs-storage';

const innerDisk = storage.disk('s3');
const cdnDisk = new CdnDisk(innerDisk, {
  baseUrl: 'https://cdn.example.com',
  provider: 'generic',
});

const url = await cdnDisk.url('images/logo.png');
// https://cdn.example.com/images/logo.png
```

## CDN Invalidation

`CdnDisk` exposes an `invalidateCdn()` placeholder method for cache invalidation:

```typescript
// Note: This is a placeholder — actual CDN invalidation
// requires provider-specific API calls
await cdnDisk.invalidateCdn('/images/logo.png');
```

::: info CDN Invalidation
The `invalidateCdn()` method is a placeholder for future CDN-specific invalidation implementations. For production cache invalidation, use the cloud provider's SDK directly (e.g., `CloudFront.createInvalidation()`).
:::

## Multi-CDN Configuration

Different disks can use different CDN providers:

```typescript
StorageModule.forRoot({
  default: 'public',
  disks: {
    public: {
      driver: 's3',
      bucket: 'public-assets',
      cdn: {
        baseUrl: 'https://assets.example.com',
        provider: 'generic', // Simple URL rewriting
      },
    },
    premium: {
      driver: 's3',
      bucket: 'premium-content',
      cdn: {
        baseUrl: 'https://d1234.cloudfront.net',
        provider: 'cloudfront', // Signed URLs
        signingKeyId: process.env.CF_KEY_ID,
        signingKey: process.env.CF_PRIVATE_KEY,
      },
    },
    media: {
      driver: 'gcs',
      bucket: 'media-files',
      // No CDN — uses direct GCS URLs
    },
  },
}),
```

```typescript
@Injectable()
export class UrlService {
  constructor(private readonly storage: StorageService) {}

  async getPublicUrl(path: string): Promise<string> {
    // https://assets.example.com/path
    return this.storage.disk('public').url(path);
  }

  async getPremiumUrl(path: string): Promise<string> {
    // CloudFront signed URL
    return this.storage.disk('premium').temporaryUrl(path, {
      expiresIn: 3600,
    });
  }

  async getMediaUrl(path: string): Promise<string> {
    // Direct GCS URL (no CDN)
    return this.storage.disk('media').url(path);
  }
}
```

## How It Works Under the Hood

1. **Auto-detection**: During module initialization, `StorageModule` checks each disk configuration for a `cdn` property. If found, the driver disk is wrapped with `CdnDisk`.

2. **URL rewriting**: The `url()` method concatenates `baseUrl + '/' + normalizedPath` instead of generating a provider-specific URL.

3. **Signed URLs**: When `provider: 'cloudfront'`, `temporaryUrl()` dynamically imports `@aws-sdk/cloudfront-signer` and calls `getSignedUrl()` with the configured key pair.

4. **Passthrough**: All non-URL methods (`get`, `put`, `delete`, etc.) are delegated directly to the inner disk without modification.

## Gotchas

::: tip CDN for Public, Presigned for Private
Use CDN URLs (`url()`) for publicly accessible content and presigned URLs (`temporaryUrl()`) for access-controlled content. CloudFront signed URLs combine CDN performance with access control.
:::

::: warning Base URL Trailing Slash
Do not include a trailing slash in `baseUrl`. The library handles path joining:

```typescript
// Correct
cdn: { baseUrl: 'https://cdn.example.com' }

// Incorrect — will produce double slashes
cdn: { baseUrl: 'https://cdn.example.com/' }
```
:::

::: danger Keep CloudFront Private Keys Secure
Never commit CloudFront private keys to source control. Store them in environment variables or a secrets manager. The private key grants the ability to generate signed URLs for any content in your distribution.
:::

## Cross-References

- [Decorator Pattern Overview](./index) -- how decorators compose
- [ScopedDisk](./scoped-disk) -- scoped paths are reflected in CDN URLs
- [EncryptedDisk](./encrypted-disk) -- encrypted content served through CDN
- [S3 Disk Configuration](/drivers/s3) -- S3-specific CDN setup
