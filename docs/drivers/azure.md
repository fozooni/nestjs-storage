# Azure Blob Storage Driver

The Azure driver provides integration with [Azure Blob Storage](https://azure.microsoft.com/en-us/products/storage/blobs) using the `@azure/storage-blob` SDK. It supports all standard `FilesystemContract` operations including range requests, streaming, and SAS token URL generation.

## Installation

```bash
pnpm add @azure/storage-blob
```

## Configuration

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `driver` | `'azure'` | Yes | — | Must be `'azure'` |
| `containerName` | `string` | Yes | — | Azure Blob container name (alias: `bucket`) |
| `accountName` | `string` | Yes | — | Azure Storage account name |
| `accountKey` | `string` | No¹ | — | Storage account access key |
| `sasToken` | `string` | No¹ | — | Shared Access Signature token |
| `url` | `string` | No | — | Custom base URL for public file URLs |
| `visibility` | `'public' \| 'private'` | No | `'private'` | Default visibility for new blobs |

> ¹ Exactly one of `accountKey` or `sasToken` is required.

## Basic Setup

### Using Account Key

```typescript
import { Module } from '@nestjs/common';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'azure',
      disks: {
        azure: {
          driver: 'azure',
          containerName: 'my-app-uploads',
          accountName: process.env.AZURE_STORAGE_ACCOUNT,
          accountKey: process.env.AZURE_STORAGE_KEY,
        },
      },
    }),
  ],
})
export class AppModule {}
```

### Using SAS Token

```typescript
StorageModule.forRoot({
  default: 'azure',
  disks: {
    azure: {
      driver: 'azure',
      containerName: 'my-app-uploads',
      accountName: process.env.AZURE_STORAGE_ACCOUNT,
      sasToken: process.env.AZURE_SAS_TOKEN,
    },
  },
})
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
        default: 'azure',
        disks: {
          azure: {
            driver: 'azure',
            containerName: config.getOrThrow('AZURE_CONTAINER'),
            accountName: config.getOrThrow('AZURE_STORAGE_ACCOUNT'),
            accountKey: config.get('AZURE_STORAGE_KEY'),
            sasToken: config.get('AZURE_SAS_TOKEN'),
          },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

## Authentication Methods

::: info Account Key vs SAS Token
| | Account Key | SAS Token |
|---|---|---|
| **Scope** | Full access to all containers and operations | Scoped to specific containers, operations, and time range |
| **Rotation** | Rotate via Azure portal; invalidates all clients | Generate new tokens with updated permissions |
| **Best for** | Server-side applications with full control | Limited-scope access, temporary access, delegated access |
| **Security risk** | High — grants complete control | Lower — can be time-limited and permission-scoped |

For production, prefer SAS tokens with minimum required permissions. Use account keys only for administrative or backend-only services.
:::

## Container Requirement

::: warning Container Must Pre-Exist
The Azure driver does **not** create containers automatically. The container specified in `containerName` must already exist in your Azure Storage account before the application starts. Attempting to use a non-existent container will result in a runtime error.

Create the container via:
- **Azure Portal**: Storage account > Containers > + Container
- **Azure CLI**: `az storage container create --name my-app-uploads --account-name mystorageaccount`
- **Terraform/Bicep**: Infrastructure as code
:::

## File Operations

```typescript
@Injectable()
export class AzureDocumentService {
  constructor(private readonly storage: StorageService) {}

  async manageDocuments() {
    const disk = this.storage.disk('azure');

    // Write a file
    await disk.put('documents/report.pdf', pdfBuffer);

    // Read it back
    const data = await disk.get('documents/report.pdf');

    // Check existence
    const exists = await disk.exists('documents/report.pdf');

    // Get metadata
    const meta = await disk.getMetadata('documents/report.pdf');
    console.log(meta.size);         // 1048576
    console.log(meta.lastModified); // Date
    console.log(meta.mimeType);     // 'application/pdf'

    // Public URL
    const url = await disk.url('documents/report.pdf');
    // => https://mystorageaccount.blob.core.windows.net/my-app-uploads/documents/report.pdf

    // Copy and move
    await disk.copy('documents/report.pdf', 'archive/report.pdf');
    await disk.move('archive/report.pdf', 'backup/report.pdf');

    // Delete
    await disk.delete('backup/report.pdf');
  }
}
```

## SAS Token URL Generation

Generate temporary access URLs using SAS tokens:

```typescript
@Injectable()
export class AzureSignedUrlService {
  constructor(private readonly storage: StorageService) {}

  async getTemporaryDownloadUrl(path: string): Promise<string> {
    const disk = this.storage.disk('azure');

    // URL valid for 1 hour (3600 seconds)
    const url = await disk.temporaryUrl(path, 3600);
    // => https://mystorageaccount.blob.core.windows.net/container/path?sv=2021-06-08&se=...&sig=...

    return url;
  }

  async getTemporaryUploadUrl(path: string): Promise<string> {
    const disk = this.storage.disk('azure');

    // Presigned URL for client-side upload
    const url = await disk.temporaryUploadUrl(path, 3600, {
      contentType: 'image/jpeg',
    });

    return url;
  }
}
```

## Range Requests

The Azure driver supports partial content retrieval:

```typescript
@Injectable()
export class AzureMediaService {
  constructor(private readonly storage: StorageService) {}

  async getPartialContent(path: string, start: number, end: number) {
    const disk = this.storage.disk('azure');

    const chunk = await disk.getRange(path, { start, end });
    return chunk;
  }
}

// Or use the @RangeServe() decorator for automatic HTTP range handling
@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get(':filename')
  @RangeServe()
  async serve(@Param('filename') filename: string) {
    return { disk: 'azure', path: `media/${filename}` };
  }
}
```

## Blob Tiers

Azure Blob Storage supports access tiers that affect cost and retrieval latency:

| Tier | Use Case | Retrieval | Cost |
|---|---|---|---|
| `Hot` | Frequently accessed data | Instant | Higher storage, lower access |
| `Cool` | Infrequently accessed (30+ days) | Instant | Lower storage, higher access |
| `Cold` | Rarely accessed (90+ days) | Instant | Lower storage, higher access |
| `Archive` | Long-term backup | Hours (rehydration required) | Lowest storage, highest access |

```typescript
// Set tier on upload via metadata
await disk.put('backups/db-dump.sql.gz', dumpBuffer, {
  metadata: {
    tier: 'Cool',
  },
});
```

::: info
Blob tier management is typically handled at the Azure Storage level via lifecycle management policies rather than per-upload in application code. Configure lifecycle rules in the Azure portal to automatically transition blobs between tiers based on age.
:::

## Streaming

```typescript
import { Controller, Get, Res, Param } from '@nestjs/common';
import { Response } from 'express';

@Controller('downloads')
export class AzureDownloadController {
  constructor(private readonly storage: StorageService) {}

  @Get(':path(*)')
  async download(@Param('path') path: string, @Res() res: Response) {
    const disk = this.storage.disk('azure');

    const stream = await disk.getStream(path);
    const meta = await disk.getMetadata(path);

    res.set({
      'Content-Type': meta.mimeType ?? 'application/octet-stream',
      'Content-Length': meta.size?.toString(),
      'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
    });

    stream.pipe(res);
  }
}
```

## Multipart Uploads

```typescript
@Injectable()
export class AzureLargeUploadService {
  constructor(private readonly storage: StorageService) {}

  async uploadLargeFile(path: string, stream: Readable) {
    const disk = this.storage.disk('azure');

    // Convenience method — handles block staging and commit internally
    await disk.putFileMultipart(path, stream, {
      partSize: 4 * 1024 * 1024, // 4 MB blocks
      concurrency: 4,
    });
  }

  async manualBlockUpload(path: string) {
    const disk = this.storage.disk('azure');

    // Manual control over block upload
    const uploadId = await disk.initMultipartUpload(path);

    const part1 = await disk.putPart(uploadId, 1, chunk1);
    const part2 = await disk.putPart(uploadId, 2, chunk2);

    await disk.completeMultipartUpload(uploadId, [part1, part2]);
  }
}
```

## Visibility

```typescript
// Set visibility on upload
await disk.put('public/logo.png', buffer, { visibility: 'public' });
await disk.put('private/secret.pdf', buffer, { visibility: 'private' });

// Change visibility
await disk.setVisibility('public/logo.png', 'private');

// Check current visibility
const vis = await disk.getVisibility('private/secret.pdf');
// => 'private'
```

::: warning
Public access requires the Azure Storage account to allow blob public access, and the container must have its public access level set to `blob` or `container`. By default, Azure Storage accounts created after 2023 have public access disabled.
:::

## Custom Metadata

```typescript
await disk.put('documents/contract.pdf', content, {
  metadata: {
    department: 'legal',
    author: 'alice',
    classification: 'confidential',
  },
});

const meta = await disk.getMetadata('documents/contract.pdf');
console.log(meta.metadata);
// { department: 'legal', author: 'alice', classification: 'confidential' }
```

## Directory Operations

```typescript
const disk = this.storage.disk('azure');

// List blobs with a prefix (simulated directory)
const items = await disk.listContents('uploads/2024/');

for (const item of items) {
  console.log(item.path, item.type, item.size);
}

// Delete all blobs with a prefix
await disk.deleteDirectory('uploads/2024/01/');
```

## Complete Example: Document Management

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';
import { v4 as uuid } from 'uuid';

@Injectable()
export class DocumentManager {
  constructor(private readonly storage: StorageService) {}

  private get disk() {
    return this.storage.disk('azure');
  }

  async upload(file: Express.Multer.File, userId: string) {
    const key = `users/${userId}/documents/${uuid()}/${file.originalname}`;

    await this.disk.put(key, file.buffer, {
      metadata: {
        uploadedBy: userId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        uploadedAt: new Date().toISOString(),
      },
    });

    return {
      key,
      url: await this.disk.url(key),
      size: file.size,
    };
  }

  async getDownloadUrl(key: string): Promise<string> {
    if (!(await this.disk.exists(key))) {
      throw new NotFoundException('Document not found');
    }

    // SAS URL valid for 30 minutes
    return this.disk.temporaryUrl(key, 1800);
  }

  async listUserDocuments(userId: string) {
    return this.disk.listContents(`users/${userId}/documents/`);
  }

  async deleteDocument(key: string): Promise<void> {
    await this.disk.delete(key);
  }
}
```

## Environment Variables Example

```bash
# .env
AZURE_STORAGE_ACCOUNT=mystorageaccount
AZURE_CONTAINER=my-app-uploads

# Use ONE of these:
AZURE_STORAGE_KEY=your-storage-account-key
# AZURE_SAS_TOKEN=sv=2021-06-08&ss=b&srt=sco&sp=rwdlac&se=2025-12-31&sig=...
```
