# URLs & Downloads

Generating URLs and serving file downloads are central to most storage-backed applications. `@fozooni/nestjs-storage` provides multiple URL strategies and download patterns to cover every scenario.

## Public URLs

### `url(path)`

Generate a public URL for a file based on the disk's `url` configuration:

```typescript
const publicUrl = await disk.url('avatars/user-123.jpg');
// LocalDisk:  'http://localhost:3000/files/avatars/user-123.jpg'
// S3Disk:     'https://my-bucket.s3.us-east-1.amazonaws.com/avatars/user-123.jpg'
// GcsDisk:    'https://storage.googleapis.com/my-bucket/avatars/user-123.jpg'
// AzureDisk:  'https://myaccount.blob.core.windows.net/my-container/avatars/user-123.jpg'
```

For local disks, configure the `url` property in your disk config:

```typescript
{
  driver: 'local',
  root: './storage/public',
  url: 'https://example.com/files',
}
```

::: tip
For S3-compatible drivers, `url()` generates the standard public URL. If you need the file to be accessible, ensure the file's visibility is set to `'public'` or your bucket policy allows public reads.
:::

## Temporary / Presigned URLs

### `temporaryUrl(path, expiration, options?)`

Generate a time-limited signed URL that grants temporary access to a private file:

```typescript
// Expire in 60 minutes
const signedUrl = await disk.temporaryUrl(
  'reports/confidential.pdf',
  60, // minutes
);

// Expire at a specific date
const signedUrl = await disk.temporaryUrl(
  'reports/confidential.pdf',
  new Date('2026-03-18T00:00:00Z'),
);
```

```typescript
// Full controller example
import { Controller, Get, Param, Query } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get(':path(*)/signed-url')
  async getSignedUrl(
    @Param('path') path: string,
    @Query('expires') expiresInMinutes: number = 60,
  ) {
    const url = await this.storage
      .disk('s3')
      .temporaryUrl(path, expiresInMinutes);

    return { url, expiresIn: `${expiresInMinutes} minutes` };
  }
}
```

::: warning
Presigned URLs are supported on S3-compatible drivers and GCS. They require `@aws-sdk/s3-request-presigner` or the equivalent GCS SDK to be installed.
:::

### Options for `temporaryUrl`

You can pass additional options to control the signed URL behavior:

```typescript
const url = await disk.temporaryUrl('file.pdf', 30, {
  ResponseContentDisposition: 'attachment; filename="download.pdf"',
  ResponseContentType: 'application/pdf',
});
```

## HMAC Signed URLs for LocalDisk

For local file serving, you can create signed URLs using HMAC signatures. This allows you to serve private local files through a controlled endpoint.

### Configuration

Set a `signSecret` on your local disk:

```typescript
StorageModule.forRoot({
  default: 'local',
  disks: {
    local: {
      driver: 'local',
      root: './storage',
      url: 'http://localhost:3000/storage',
      signSecret: process.env.STORAGE_SIGN_SECRET, // Any random string
    },
  },
})
```

### Generating Signed URLs

```typescript
// This creates an HMAC-signed URL with expiration
const signedUrl = await localDisk.temporaryUrl('private/invoice.pdf', 30);
// => 'http://localhost:3000/storage/private/invoice.pdf?expires=1710720000&signature=abc123...'
```

### LocalSignedUrlMiddleware

Apply the middleware to validate signed URLs on incoming requests:

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LocalSignedUrlMiddleware } from '@fozooni/nestjs-storage';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LocalSignedUrlMiddleware)
      .forRoutes('storage/*');
  }
}
```

The middleware will:
1. Verify the HMAC signature matches
2. Check that the URL has not expired
3. Return `403 Forbidden` if either check fails

## Presigned POST (Direct Browser Uploads)

### `presignedPost(path, expiration, options?)`

Generate presigned POST data that allows browsers to upload directly to S3 without routing through your server:

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { StorageService, PresignedPostData } from '@fozooni/nestjs-storage';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post('presign')
  async createPresignedPost(
    @Body('filename') filename: string,
    @Body('contentType') contentType: string,
  ): Promise<PresignedPostData> {
    const path = `uploads/${crypto.randomUUID()}/${filename}`;

    return this.storage.disk('s3').presignedPost(path, 60, {
      contentType,
      maxSize: 10 * 1024 * 1024, // 10 MB limit
    });
  }
}
```

::: info
Presigned POST requires `@aws-sdk/s3-presigned-post` to be installed:
```bash
pnpm add @aws-sdk/s3-presigned-post
```
:::

### PresignedPostData

The returned object contains everything the browser needs to perform the upload:

```typescript
interface PresignedPostData {
  url: string;       // The S3 endpoint to POST to
  fields: {          // Form fields to include in the POST
    key: string;
    bucket: string;
    'Content-Type': string;
    Policy: string;
    'X-Amz-Algorithm': string;
    'X-Amz-Credential': string;
    'X-Amz-Date': string;
    'X-Amz-Signature': string;
    // ... additional fields
  };
}
```

### Frontend HTML Form

```html
<!-- The form action and hidden fields come from the presignedPost() response -->
<form id="upload-form" method="POST" enctype="multipart/form-data">
  <input type="file" name="file" id="file-input" />
  <button type="submit">Upload Directly to S3</button>
</form>

<script>
  document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];

    // 1. Get presigned POST data from your backend
    const response = await fetch('/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
      }),
    });
    const { url, fields } = await response.json();

    // 2. Build the form data with all the signed fields
    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      formData.append(key, value);
    });
    formData.append('file', file); // file MUST be the last field

    // 3. Upload directly to S3
    const uploadResponse = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (uploadResponse.ok) {
      console.log('Upload successful!');
    }
  });
</script>
```

::: danger
The `file` field **must be the last field** appended to the FormData. S3 will reject the request if any fields come after the file content.
:::

## File Downloads

### StreamableFile Controller

Serve files as downloads using NestJS `StreamableFile`:

```typescript
import {
  Controller,
  Get,
  Param,
  Res,
  StreamableFile,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  StorageService,
  StorageFileNotFoundError,
} from '@fozooni/nestjs-storage';

@Controller('downloads')
export class DownloadsController {
  constructor(private readonly storage: StorageService) {}

  @Get(':path(*)')
  async download(
    @Param('path') path: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const disk = this.storage.disk();

    try {
      const [mime, size] = await Promise.all([
        disk.mimeType(path),
        disk.size(path),
      ]);

      const filename = path.split('/').pop();

      res.set({
        'Content-Type': mime,
        'Content-Length': size.toString(),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, max-age=3600',
      });

      return disk.getStreamableFile(path);
    } catch (error) {
      if (error instanceof StorageFileNotFoundError) {
        throw new NotFoundException('File not found');
      }
      throw error;
    }
  }
}
```

### Inline Display vs. Download

Control whether the browser displays or downloads the file:

```typescript
// Force download
res.set({
  'Content-Disposition': `attachment; filename="${filename}"`,
});

// Display inline (e.g., images, PDFs in browser)
res.set({
  'Content-Disposition': `inline; filename="${filename}"`,
});
```

## CDN URLs

When a disk has a `cdn` configuration, URLs are automatically rewritten to use the CDN base URL:

```typescript
StorageModule.forRoot({
  default: 's3',
  disks: {
    s3: {
      driver: 's3',
      bucket: 'my-bucket',
      region: 'us-east-1',
      cdn: {
        baseUrl: 'https://cdn.example.com',
      },
    },
  },
})
```

```typescript
const url = await disk.url('images/hero.jpg');
// Without CDN: 'https://my-bucket.s3.us-east-1.amazonaws.com/images/hero.jpg'
// With CDN:    'https://cdn.example.com/images/hero.jpg'
```

::: info
When `cdn` is configured, the disk is automatically wrapped in a `CdnDisk` decorator. The `CdnDisk` intercepts `url()` calls and rewrites them to use the CDN base URL while proxying all other operations to the underlying disk.
:::

### CloudFront Signed URLs

For private content served through CloudFront, configure the CloudFront provider:

```typescript
{
  driver: 's3',
  bucket: 'my-private-bucket',
  cdn: {
    baseUrl: 'https://d1234.cloudfront.net',
    provider: 'cloudfront',
    signingKeyId: process.env.CF_KEY_PAIR_ID,
    signingKey: process.env.CF_PRIVATE_KEY, // PEM string
  },
}
```

```typescript
// Generates a CloudFront signed URL
const signedUrl = await disk.temporaryUrl('private/video.mp4', 120);
// => 'https://d1234.cloudfront.net/private/video.mp4?Expires=...&Signature=...&Key-Pair-Id=...'
```

::: warning
CloudFront signed URLs require `@aws-sdk/cloudfront-signer` to be installed:
```bash
pnpm add @aws-sdk/cloudfront-signer
```
:::

## Complete URL Strategy Example

A controller that supports multiple URL strategies based on context:

```typescript
import { Controller, Get, Param, Query } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Controller('assets')
export class AssetsController {
  constructor(private readonly storage: StorageService) {}

  // Public CDN URL for public assets
  @Get('public/:path(*)')
  async publicUrl(@Param('path') path: string) {
    const url = await this.storage.disk('s3').url(`public/${path}`);
    return { url };
  }

  // Presigned URL for private assets (time-limited access)
  @Get('private/:path(*)')
  async privateUrl(
    @Param('path') path: string,
    @Query('ttl') ttl: number = 60,
  ) {
    const url = await this.storage
      .disk('s3')
      .temporaryUrl(`private/${path}`, ttl);
    return { url, expiresIn: `${ttl} minutes` };
  }

  // Presigned POST for direct client uploads
  @Get('upload-token')
  async uploadToken(
    @Query('filename') filename: string,
    @Query('contentType') contentType: string,
  ) {
    const key = `uploads/${Date.now()}/${filename}`;
    const post = await this.storage
      .disk('s3')
      .presignedPost(key, 15, { contentType });
    return { ...post, key };
  }
}
```

## Next Steps

Learn how uploaded files get their names with [Naming Strategies](./naming-strategies) -- UUID, hash, date-path, and custom strategies.
