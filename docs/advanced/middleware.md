---
title: LocalSignedUrlMiddleware
description: HMAC-SHA256 signed URL verification middleware for LocalDisk temporary URLs
---

# LocalSignedUrlMiddleware

The `LocalSignedUrlMiddleware` validates HMAC-SHA256 signatures for LocalDisk temporary URLs. When you generate a `temporaryUrl()` on LocalDisk, the URL includes `?expires={timestamp}&signature={hex}`. This middleware verifies those parameters before serving the file.

## How It Works

```
1. Generate:  disk.temporaryUrl('secret/report.pdf', 3600)
   → /files/secret/report.pdf?expires=1742500000&signature=a1b2c3d4...

2. Client requests that URL

3. Middleware:
   ├── Check: ?expires and ?signature params present → else 403
   ├── Check: expires > now → else 403 (link expired)
   ├── Reconstruct: HMAC-SHA256(signSecret, path + expires)
   ├── Compare: timing-safe compare → else 403 (invalid signature)
   └── Pass: next() → serve the file
```

## Configuration

The middleware requires a `signSecret` in your LocalDisk configuration:

```ts
StorageModule.forRoot({
  default: 'local',
  disks: {
    local: {
      driver: 'local',
      root: '/data/storage',
      signSecret: 'your-secret-key-at-least-32-characters-long!!',
      url: 'https://api.example.com/files',
    },
  },
});
```

::: warning Minimum Secret Length
The `signSecret` must be at least 32 characters long. Shorter secrets will throw a `StorageConfigurationError` at startup. Use a cryptographically random string:

```bash
# Generate a secure secret
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
:::

## Module Setup

### Basic Setup

```ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import {
  StorageModule,
  LocalSignedUrlMiddleware,
} from '@fozooni/nestjs-storage';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'local',
      disks: {
        local: {
          driver: 'local',
          root: '/data/storage',
          signSecret: process.env.STORAGE_SIGN_SECRET,
          url: 'https://api.example.com/files',
        },
      },
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LocalSignedUrlMiddleware)
      .forRoutes('/files/*');
  }
}
```

### With Async Configuration

```ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  StorageModule,
  LocalSignedUrlMiddleware,
} from '@fozooni/nestjs-storage';

@Module({
  imports: [
    ConfigModule.forRoot(),
    StorageModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        default: 'local',
        disks: {
          local: {
            driver: 'local',
            root: config.get('STORAGE_ROOT', '/data/storage'),
            signSecret: config.getOrThrow('STORAGE_SIGN_SECRET'),
            url: config.get('STORAGE_URL', 'https://api.example.com/files'),
          },
        },
      }),
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LocalSignedUrlMiddleware)
      .forRoutes('/files/*');
  }
}
```

## Route Mounting Patterns

### Serve All LocalDisk Files

```ts
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(LocalSignedUrlMiddleware)
    .forRoutes('/files/*');
}
```

### Protect Only Specific Paths

```ts
configure(consumer: MiddlewareConsumer) {
  // Only protect private files — public files served without signature
  consumer
    .apply(LocalSignedUrlMiddleware)
    .forRoutes('/files/private/*', '/files/reports/*');
}
```

### With Static File Serving

```ts
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    // Serve static files from the local disk root
    ServeStaticModule.forRoot({
      rootPath: '/data/storage',
      serveRoot: '/files',
    }),
    StorageModule.forRoot({
      default: 'local',
      disks: {
        local: {
          driver: 'local',
          root: '/data/storage',
          signSecret: process.env.STORAGE_SIGN_SECRET,
          url: 'https://api.example.com/files',
        },
      },
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Middleware runs BEFORE static serving
    consumer
      .apply(LocalSignedUrlMiddleware)
      .forRoutes('/files/*');
  }
}
```

## Generating Signed URLs

### Basic Temporary URL

```ts
import { Controller, Get, Param } from '@nestjs/common';
import { InjectDisk, FilesystemContract } from '@fozooni/nestjs-storage';

@Controller('documents')
export class DocumentController {
  constructor(
    @InjectDisk('local')
    private readonly disk: FilesystemContract,
  ) {}

  @Get(':id/download')
  async getDownloadLink(@Param('id') id: string) {
    const path = `documents/${id}.pdf`;

    if (!(await this.disk.exists(path))) {
      throw new Error('Document not found');
    }

    // Generate a URL valid for 1 hour (3600 seconds)
    const url = await this.disk.temporaryUrl(path, 3600);

    return { url, expiresIn: 3600 };
  }
}
```

### Signed URL with Custom Expiration

```ts
@Get(':id/preview')
async getPreviewLink(@Param('id') id: string) {
  const path = `documents/${id}.pdf`;

  // Short-lived URL for preview (5 minutes)
  const previewUrl = await this.disk.temporaryUrl(path, 300);

  // Longer-lived URL for download (24 hours)
  const downloadUrl = await this.disk.temporaryUrl(path, 86400);

  return {
    preview: { url: previewUrl, expiresIn: 300 },
    download: { url: downloadUrl, expiresIn: 86400 },
  };
}
```

## Complete Signed URL Flow

End-to-end example: generate, serve, and validate signed URLs.

### 1. Controller — Generate Signed URLs

```ts
import {
  Controller,
  Get,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { InjectDisk, FilesystemContract } from '@fozooni/nestjs-storage';

@Controller('api/files')
export class FileController {
  constructor(
    @InjectDisk('local')
    private readonly disk: FilesystemContract,
  ) {}

  @Get(':path(*)/signed-url')
  async getSignedUrl(@Param('path') path: string) {
    if (!(await this.disk.exists(path))) {
      throw new NotFoundException();
    }

    const url = await this.disk.temporaryUrl(path, 3600);
    const metadata = await this.disk.getMetadata(path);

    return {
      url,
      filename: path.split('/').pop(),
      size: metadata.size,
      mimetype: metadata.mimetype,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  }
}
```

### 2. Module — Wire Up Middleware

```ts
@Module({
  imports: [StorageModule.forRoot(storageConfig)],
  controllers: [FileController],
})
export class FileModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Protect the /files/* route where static files are served
    consumer
      .apply(LocalSignedUrlMiddleware)
      .forRoutes('/files/*');
  }
}
```

### 3. Client — Use the Signed URL

```ts
// 1. Request a signed URL from your API
const response = await fetch('/api/files/reports/q1-2026.pdf/signed-url');
const { url } = await response.json();
// url: "https://api.example.com/files/reports/q1-2026.pdf?expires=1742500000&signature=a1b2c3..."

// 2. Access the file directly using the signed URL
window.open(url); // Browser navigates to the signed URL

// 3. Middleware validates the signature and serves the file
//    If the signature is invalid or expired → 403 Forbidden
```

## Validation Failure Responses

When the middleware rejects a request, it returns a `403 Forbidden` JSON response:

### Missing Parameters

```json
{
  "statusCode": 403,
  "message": "Forbidden: missing signature or expiration",
  "error": "Forbidden"
}
```

### Expired URL

```json
{
  "statusCode": 403,
  "message": "Forbidden: URL has expired",
  "error": "Forbidden"
}
```

### Invalid Signature

```json
{
  "statusCode": 403,
  "message": "Forbidden: invalid signature",
  "error": "Forbidden"
}
```

::: info Timing-Safe Comparison
The middleware uses `crypto.timingSafeEqual()` to compare signatures, preventing timing attacks that could be used to guess the secret. This is a security best practice for HMAC verification.
:::

::: tip HTTPS in Production
Always use HTTPS in production when serving signed URLs. Over HTTP, the signature and expiration parameters are visible in plain text, and a man-in-the-middle could extract valid signed URLs.

Set the `url` configuration to your HTTPS endpoint:

```ts
{
  driver: 'local',
  root: '/data/storage',
  signSecret: process.env.STORAGE_SIGN_SECRET,
  url: 'https://api.example.com/files', // Always HTTPS in production
}
```
:::

::: warning Secret Rotation
If you need to rotate the `signSecret`, be aware that all existing signed URLs will immediately become invalid. To implement graceful rotation:

1. Support verifying against both old and new secrets during a transition period
2. Generate new URLs with the new secret
3. Remove the old secret after all outstanding URLs have expired
:::
