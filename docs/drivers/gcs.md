# Google Cloud Storage Driver

The GCS driver provides integration with [Google Cloud Storage](https://cloud.google.com/storage) using the `@google-cloud/storage` SDK. It supports all standard `FilesystemContract` operations plus GCS-specific features like resumable uploads, uniform bucket-level access, and generation-based concurrency.

## Installation

```bash
pnpm add @google-cloud/storage
```

## Configuration

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `driver` | `'gcs'` | Yes | — | Must be `'gcs'` |
| `bucket` | `string` | Yes | — | GCS bucket name |
| `projectId` | `string` | Yes¹ | — | Google Cloud project ID |
| `keyFilename` | `string` | No | — | Path to service account JSON key file |
| `credentials` | `object` | No | — | Inline service account credentials (JSON object) |
| `url` | `string` | No | — | Custom base URL for public file URLs |
| `visibility` | `'public' \| 'private'` | No | `'private'` | Default visibility for new objects |

> ¹ When using Application Default Credentials (ADC) in GKE or Cloud Run, `projectId` is automatically detected from the environment.

## Basic Setup

```typescript
import { Module } from '@nestjs/common';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'gcs',
      disks: {
        gcs: {
          driver: 'gcs',
          bucket: 'my-app-uploads',
          projectId: 'my-gcp-project',
          keyFilename: '/path/to/service-account.json',
          visibility: 'private',
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
        default: 'gcs',
        disks: {
          gcs: {
            driver: 'gcs',
            bucket: config.getOrThrow('GCS_BUCKET'),
            projectId: config.getOrThrow('GCP_PROJECT_ID'),
            keyFilename: config.get('GCS_KEY_FILE'),
            visibility: 'private',
          },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

## Authentication Methods

GCS supports three authentication methods, listed from most to least recommended for production:

### 1. Application Default Credentials (ADC)

In GKE, Cloud Run, Cloud Functions, and Compute Engine, credentials are provided automatically by the environment. Omit `keyFilename` and `credentials`:

```typescript
{
  driver: 'gcs',
  bucket: 'my-app-uploads',
  projectId: 'my-gcp-project',
  // No keyFilename or credentials — ADC is used automatically
}
```

::: tip Application Default Credentials in GKE
When running in GKE, attach a Google Service Account to your Kubernetes Service Account using Workload Identity. The GCS SDK will automatically pick up the credentials. This is the most secure approach — no key files or secrets to manage.

```yaml
# k8s service account annotation for Workload Identity
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-app
  annotations:
    iam.gke.io/gcp-service-account: storage-sa@my-project.iam.gserviceaccount.com
```
:::

### 2. Service Account Key File

Download a JSON key file from the GCP Console and reference it by path:

```typescript
{
  driver: 'gcs',
  bucket: 'my-app-uploads',
  projectId: 'my-gcp-project',
  keyFilename: '/etc/secrets/gcs-service-account.json',
}
```

::: warning
Service account key files are long-lived credentials. If compromised, they grant full access until revoked. Prefer Workload Identity (ADC) in GCP environments. If you must use key files, store them securely and rotate them regularly.
:::

### 3. Inline Credentials

Pass the service account JSON directly as an object (useful for environment variables or secrets managers):

```typescript
{
  driver: 'gcs',
  bucket: 'my-app-uploads',
  projectId: 'my-gcp-project',
  credentials: JSON.parse(process.env.GCS_CREDENTIALS),
}
```

```bash
# .env — the entire service account JSON as a single-line string
GCS_CREDENTIALS='{"type":"service_account","project_id":"my-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"storage@my-project.iam.gserviceaccount.com",...}'
```

## GCS-Specific Metadata

When you call `getMetadata()` on a GCS object, you receive extended metadata in `GcsFileMetadata`:

```typescript
const meta = await disk.getMetadata('uploads/report.pdf');

// Standard metadata
console.log(meta.size);         // 2048576
console.log(meta.lastModified); // Date object
console.log(meta.mimeType);     // 'application/pdf'

// GCS-specific metadata
console.log(meta.generation);      // '1710672000000000' — object generation number
console.log(meta.metageneration);  // '1' — metadata generation number
console.log(meta.crc32c);         // 'aabbccdd'
console.log(meta.md5Hash);        // 'base64-encoded-md5'
```

::: info
**Generation numbers** are GCS's versioning mechanism. Each time an object is overwritten, it gets a new generation number. The `metageneration` increments when only the metadata (not the content) is updated.
:::

## File Operations

```typescript
@Injectable()
export class GcsDocumentService {
  constructor(private readonly storage: StorageService) {}

  async uploadDocument(name: string, content: Buffer) {
    const disk = this.storage.disk('gcs');

    // Write a file
    await disk.put(`documents/${name}`, content);

    // Read it back
    const data = await disk.get(`documents/${name}`);

    // Check existence
    const exists = await disk.exists(`documents/${name}`);

    // Get metadata
    const meta = await disk.getMetadata(`documents/${name}`);

    // Public URL
    const url = await disk.url(`documents/${name}`);
    // => https://storage.googleapis.com/my-bucket/documents/report.pdf

    // Copy and move
    await disk.copy(`documents/${name}`, `archive/${name}`);
    await disk.move(`archive/${name}`, `backup/${name}`);

    // Delete
    await disk.delete(`documents/${name}`);

    return { url, size: meta.size };
  }
}
```

## Presigned URLs

Generate time-limited signed URLs for private objects:

```typescript
@Injectable()
export class GcsSignedUrlService {
  constructor(private readonly storage: StorageService) {}

  async getDownloadUrl(path: string): Promise<string> {
    const disk = this.storage.disk('gcs');

    // URL valid for 30 minutes (1800 seconds)
    const url = await disk.temporaryUrl(path, 1800);

    return url;
  }

  async getUploadUrl(path: string): Promise<string> {
    const disk = this.storage.disk('gcs');

    // Signed URL for client-side PUT upload
    const url = await disk.temporaryUploadUrl(path, 1800, {
      contentType: 'image/png',
    });

    return url;
  }
}
```

::: info
GCS signed URLs require either a service account key file or inline credentials. ADC alone cannot generate signed URLs because the signing key is not available locally. If you use Workload Identity, consider the [IAM signBlob API](https://cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/signBlob) as an alternative.
:::

## Multipart / Resumable Uploads

GCS uses resumable uploads for large files. The driver handles this automatically:

```typescript
import { createReadStream } from 'fs';

@Injectable()
export class GcsUploadService {
  constructor(private readonly storage: StorageService) {}

  async uploadLargeFile(localPath: string, gcsPath: string) {
    const disk = this.storage.disk('gcs');

    // putFileMultipart uses GCS resumable uploads under the hood
    await disk.putFileMultipart(gcsPath, createReadStream(localPath), {
      partSize: 8 * 1024 * 1024, // 8 MB chunks
      concurrency: 4,
    });
  }

  async uploadWithStream(path: string, stream: Readable) {
    const disk = this.storage.disk('gcs');
    await disk.putStream(path, stream);
  }
}
```

### Manual Multipart Control

```typescript
const disk = this.storage.disk('gcs');

// Initialize
const uploadId = await disk.initMultipartUpload('large/file.zip');

// Upload parts
const part1 = await disk.putPart(uploadId, 1, chunk1);
const part2 = await disk.putPart(uploadId, 2, chunk2);

// Complete
await disk.completeMultipartUpload(uploadId, [part1, part2]);
```

## Range Requests

```typescript
// Read a specific byte range
const chunk = await disk.getRange('media/video.mp4', {
  start: 0,
  end: 1048575, // First 1 MB
});

// Serve with automatic range header parsing
@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get(':filename')
  @RangeServe()
  async serve(@Param('filename') filename: string) {
    return { disk: 'gcs', path: `media/${filename}` };
  }
}
```

## Visibility

GCS supports two bucket access control models:

### Uniform Bucket-Level Access (Recommended)

All objects in the bucket share the same access policy. Controlled via IAM:

```typescript
// With uniform access, visibility is controlled at the bucket level
// Individual object ACLs are not available
await disk.put('public/image.png', buffer);
```

### Fine-Grained Access

Per-object ACLs are available when fine-grained access is enabled on the bucket:

```typescript
// Set visibility on upload
await disk.put('public/image.png', buffer, { visibility: 'public' });
await disk.put('private/secret.pdf', buffer, { visibility: 'private' });

// Change visibility
await disk.setVisibility('public/image.png', 'private');

// Check visibility
const vis = await disk.getVisibility('private/secret.pdf');
// => 'private'
```

| Visibility | GCS ACL | Effect |
|---|---|---|
| `'public'` | `publicRead` | Anyone can access via the object URL |
| `'private'` | `private` | Only authenticated requests with IAM permission |

::: warning
Google recommends uniform bucket-level access for new buckets. Fine-grained ACLs are a legacy feature. If your bucket uses uniform access, `setVisibility()` and `getVisibility()` will operate based on bucket-level IAM policies rather than per-object ACLs.
:::

## Streaming

```typescript
import { Controller, Get, Res, Param } from '@nestjs/common';
import { Response } from 'express';

@Controller('files')
export class FileController {
  constructor(private readonly storage: StorageService) {}

  @Get(':path(*)')
  async download(@Param('path') path: string, @Res() res: Response) {
    const disk = this.storage.disk('gcs');

    const stream = await disk.getStream(path);
    const meta = await disk.getMetadata(path);

    res.set({
      'Content-Type': meta.mimeType ?? 'application/octet-stream',
      'Content-Length': meta.size?.toString(),
    });

    stream.pipe(res);
  }
}
```

## GcsClientWrapper

Access the underlying `@google-cloud/storage` client for operations not covered by `FilesystemContract`:

```typescript
@Injectable()
export class AdvancedGcsService {
  constructor(private readonly storage: StorageService) {}

  async advancedOperation() {
    const disk = this.storage.disk('gcs');
    const wrapper = disk.getClient() as GcsClientWrapper;
    const bucket = wrapper.bucket;

    // Access the raw @google-cloud/storage Bucket instance
    const [files] = await bucket.getFiles({ prefix: 'logs/', maxResults: 100 });

    // Use GCS-specific features like notifications, HMAC keys, etc.
    const [notifications] = await bucket.getNotifications();
  }
}
```

## Custom Metadata

```typescript
await disk.put('documents/report.pdf', content, {
  metadata: {
    department: 'engineering',
    author: 'alice',
    reviewStatus: 'approved',
  },
});

const meta = await disk.getMetadata('documents/report.pdf');
console.log(meta.metadata);
// { department: 'engineering', author: 'alice', reviewStatus: 'approved' }
```

## Complete Example: Image Processing Pipeline

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';
import { v4 as uuid } from 'uuid';

@Injectable()
export class ImagePipelineService {
  private readonly logger = new Logger(ImagePipelineService.name);

  constructor(private readonly storage: StorageService) {}

  private get disk() {
    return this.storage.disk('gcs');
  }

  async processUpload(file: Express.Multer.File) {
    const id = uuid();
    const originalKey = `images/originals/${id}/${file.originalname}`;

    // Upload original
    await this.disk.put(originalKey, file.buffer, {
      metadata: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        uploadedAt: new Date().toISOString(),
      },
    });

    this.logger.log(`Uploaded original: ${originalKey}`);

    // Generate public URL
    const publicUrl = await this.disk.url(originalKey);

    // Generate signed download URL (1 hour)
    const signedUrl = await this.disk.temporaryUrl(originalKey, 3600);

    return {
      id,
      key: originalKey,
      publicUrl,
      signedUrl,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  async deleteImage(id: string) {
    const prefix = `images/originals/${id}/`;
    const files = await this.disk.listContents(prefix);

    for (const file of files) {
      await this.disk.delete(file.path);
    }

    this.logger.log(`Deleted all files for image ${id}`);
  }
}
```

## Environment Variables Example

```bash
# .env
GCS_BUCKET=my-app-uploads
GCP_PROJECT_ID=my-gcp-project
GCS_KEY_FILE=/path/to/service-account.json
# Or use inline credentials:
# GCS_CREDENTIALS='{"type":"service_account",...}'
```
