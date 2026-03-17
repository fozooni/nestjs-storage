---
title: Multipart Uploads
description: Chunked uploads for large files with progress tracking and resumability
---

# Multipart Uploads

Multipart uploads split large files into smaller chunks and upload them in parallel or sequentially. This enables uploading multi-gigabyte files, tracking progress, and resuming interrupted uploads.

## Two Approaches

| Approach | Use Case | Complexity |
|----------|----------|------------|
| `putFileMultipart()` | Simple large file uploads with automatic chunking | Low |
| Low-level API | Custom chunk sizes, parallel uploads, resume support | Medium |

## High-Level: `putFileMultipart()`

The simplest way to upload a large file with automatic chunking and progress:

```ts
import { InjectDisk, FilesystemContract } from '@fozooni/nestjs-storage';

@Injectable()
export class UploadService {
  constructor(
    @InjectDisk('s3')
    private readonly disk: FilesystemContract,
  ) {}

  async uploadLargeFile(filePath: string, buffer: Buffer): Promise<boolean> {
    return this.disk.putFileMultipart(filePath, buffer, {
      chunkSize: 10 * 1024 * 1024, // 10 MB chunks
      onProgress: (status) => {
        console.log(
          `Upload progress: ${status.loaded}/${status.total} bytes (${status.percent}%)`,
        );
      },
    });
  }
}
```

### `MultipartUploadOptions`

Extends `PutOptions` with multipart-specific fields:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `chunkSize` | `number` | `5 * 1024 * 1024` | Size of each chunk in bytes |
| `partNumberStart` | `number` | `1` | Starting part number (for resuming) |
| `onProgress` | `(status: MultipartUploadStatus) => void` | — | Progress callback |
| `visibility` | `Visibility` | — | Inherited from `PutOptions` |
| `mimetype` | `string` | — | Inherited from `PutOptions` |
| `metadata` | `Record<string, string>` | — | Inherited from `PutOptions` |

### `MultipartUploadStatus`

| Property | Type | Description |
|----------|------|-------------|
| `loaded` | `number` | Bytes uploaded so far |
| `total` | `number` | Total bytes to upload |
| `percent` | `number?` | Upload progress percentage (0-100) |

## Low-Level API

For full control over the upload process, use the four-step low-level API.

### Step 1: Initialize

```ts
const init = await disk.initMultipartUpload('videos/large-movie.mp4', {
  mimetype: 'video/mp4',
  metadata: { uploadedBy: 'user-123' },
});
// init: { uploadId: 'abc123', path: 'videos/large-movie.mp4' }
```

### `MultipartUploadInit`

| Property | Type | Description |
|----------|------|-------------|
| `uploadId` | `string` | Unique identifier for this upload session |
| `path` | `string` | The target file path |

### Step 2: Upload Parts

```ts
const parts: MultipartUploadPart[] = [];

// Upload each chunk
for (let i = 0; i < chunks.length; i++) {
  const part = await disk.uploadPart(
    init.uploadId,
    i + 1,          // partNumber (1-based)
    chunks[i],       // Buffer or Readable
    init.path,
  );
  parts.push(part);
}
```

### `MultipartUploadPart`

| Property | Type | Description |
|----------|------|-------------|
| `partNumber` | `number` | The 1-based part number |
| `etag` | `string` | ETag returned by the storage provider for this part |

### Step 3: Complete

```ts
const success = await disk.completeMultipartUpload(
  init.uploadId,
  init.path,
  parts,
);
// success: true
```

### Step 4: Abort (if needed)

```ts
const aborted = await disk.abortMultipartUpload(init.uploadId, init.path);
// aborted: true — all uploaded parts are cleaned up
```

## Full Chunked Upload Controller

A complete NestJS controller for handling chunked uploads from a client:

```ts
import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  InjectStorage,
  StorageService,
  MultipartUploadPart,
} from '@fozooni/nestjs-storage';

interface InitUploadDto {
  filename: string;
  mimetype: string;
  totalSize: number;
}

interface CompleteUploadDto {
  parts: MultipartUploadPart[];
}

@Controller('chunked-uploads')
export class ChunkedUploadController {
  // In-memory store — use Redis in production
  private uploads = new Map<
    string,
    { path: string; parts: MultipartUploadPart[] }
  >();

  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  /**
   * Initialize a new multipart upload
   */
  @Post('init')
  async initUpload(@Body() dto: InitUploadDto) {
    const disk = this.storage.disk('uploads');
    const path = `chunked/${Date.now()}-${dto.filename}`;

    const init = await disk.initMultipartUpload(path, {
      mimetype: dto.mimetype,
    });

    this.uploads.set(init.uploadId, { path, parts: [] });

    return {
      uploadId: init.uploadId,
      path: init.path,
      chunkSize: 5 * 1024 * 1024, // Tell client the minimum chunk size
    };
  }

  /**
   * Upload a single part/chunk
   */
  @Put(':uploadId/parts/:partNumber')
  async uploadPart(
    @Param('uploadId') uploadId: string,
    @Param('partNumber') partNumber: string,
    @Body() data: Buffer,
  ) {
    const upload = this.uploads.get(uploadId);
    if (!upload) {
      throw new BadRequestException(`Unknown upload: ${uploadId}`);
    }

    const disk = this.storage.disk('uploads');
    const part = await disk.uploadPart(
      uploadId,
      parseInt(partNumber, 10),
      data,
      upload.path,
    );

    upload.parts.push(part);

    return {
      partNumber: part.partNumber,
      etag: part.etag,
      partsUploaded: upload.parts.length,
    };
  }

  /**
   * Complete the multipart upload
   */
  @Post(':uploadId/complete')
  @HttpCode(HttpStatus.OK)
  async completeUpload(
    @Param('uploadId') uploadId: string,
    @Body() dto: CompleteUploadDto,
  ) {
    const upload = this.uploads.get(uploadId);
    if (!upload) {
      throw new BadRequestException(`Unknown upload: ${uploadId}`);
    }

    const disk = this.storage.disk('uploads');
    const parts = dto.parts.length > 0 ? dto.parts : upload.parts;

    // Sort parts by partNumber
    parts.sort((a, b) => a.partNumber - b.partNumber);

    const success = await disk.completeMultipartUpload(
      uploadId,
      upload.path,
      parts,
    );

    this.uploads.delete(uploadId);

    return {
      success,
      path: upload.path,
      url: await disk.url(upload.path),
    };
  }

  /**
   * Abort a multipart upload
   */
  @Delete(':uploadId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async abortUpload(@Param('uploadId') uploadId: string) {
    const upload = this.uploads.get(uploadId);
    if (!upload) {
      throw new BadRequestException(`Unknown upload: ${uploadId}`);
    }

    const disk = this.storage.disk('uploads');
    await disk.abortMultipartUpload(uploadId, upload.path);
    this.uploads.delete(uploadId);
  }
}
```

## Resumable Upload Pattern

Store part metadata so uploads can be resumed after interruption:

```ts
import { Injectable, Logger } from '@nestjs/common';
import {
  InjectStorage,
  StorageService,
  MultipartUploadPart,
} from '@fozooni/nestjs-storage';
import { Readable } from 'stream';

interface UploadSession {
  uploadId: string;
  path: string;
  totalSize: number;
  chunkSize: number;
  completedParts: MultipartUploadPart[];
  lastPartNumber: number;
}

@Injectable()
export class ResumableUploadService {
  private readonly logger = new Logger(ResumableUploadService.name);
  // In production, persist this to Redis or a database
  private sessions = new Map<string, UploadSession>();

  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  async startUpload(
    filename: string,
    totalSize: number,
    mimetype: string,
  ): Promise<UploadSession> {
    const disk = this.storage.disk('uploads');
    const path = `resumable/${filename}`;
    const chunkSize = 10 * 1024 * 1024; // 10 MB

    const init = await disk.initMultipartUpload(path, { mimetype });

    const session: UploadSession = {
      uploadId: init.uploadId,
      path: init.path,
      totalSize,
      chunkSize,
      completedParts: [],
      lastPartNumber: 0,
    };

    this.sessions.set(init.uploadId, session);
    return session;
  }

  async uploadChunk(
    uploadId: string,
    data: Buffer,
  ): Promise<{ partNumber: number; remaining: number }> {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw new Error(`No session found for upload ${uploadId}`);
    }

    const disk = this.storage.disk('uploads');
    const partNumber = session.lastPartNumber + 1;

    const part = await disk.uploadPart(
      uploadId,
      partNumber,
      data,
      session.path,
    );

    session.completedParts.push(part);
    session.lastPartNumber = partNumber;

    const uploadedBytes = session.completedParts.length * session.chunkSize;
    const remaining = Math.max(0, session.totalSize - uploadedBytes);

    this.logger.log(
      `Upload ${uploadId}: part ${partNumber} complete, ${remaining} bytes remaining`,
    );

    return { partNumber, remaining };
  }

  async resumeUpload(uploadId: string): Promise<{
    nextPartNumber: number;
    completedParts: number;
    bytesUploaded: number;
  }> {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw new Error(`No session found for upload ${uploadId}`);
    }

    return {
      nextPartNumber: session.lastPartNumber + 1,
      completedParts: session.completedParts.length,
      bytesUploaded: session.completedParts.length * session.chunkSize,
    };
  }

  async completeUpload(uploadId: string): Promise<string> {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw new Error(`No session found for upload ${uploadId}`);
    }

    const disk = this.storage.disk('uploads');

    session.completedParts.sort((a, b) => a.partNumber - b.partNumber);

    await disk.completeMultipartUpload(
      uploadId,
      session.path,
      session.completedParts,
    );

    this.sessions.delete(uploadId);
    return session.path;
  }
}
```

## Progress Tracking with `StorageUploadProgressService`

Integrate with the RxJS-based progress service for real-time upload progress via WebSocket or SSE:

```ts
import { Injectable } from '@nestjs/common';
import {
  InjectStorage,
  StorageService,
  StorageUploadProgressService,
} from '@fozooni/nestjs-storage';

@Injectable()
export class TrackedUploadService {
  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
    private readonly progressService: StorageUploadProgressService,
  ) {}

  async uploadWithTracking(
    uploadId: string,
    path: string,
    data: Buffer,
  ): Promise<void> {
    const disk = this.storage.disk('s3');

    await disk.putFileMultipart(path, data, {
      chunkSize: 10 * 1024 * 1024,
      onProgress: (status) => {
        // Emit progress to the RxJS Subject for this upload
        this.progressService.emit(uploadId, {
          loaded: status.loaded,
          total: status.total,
          percent: status.percent,
        });
      },
    });

    // Signal completion
    this.progressService.complete(uploadId);
  }

  /**
   * Subscribe to progress in a Gateway/Controller
   */
  getProgress(uploadId: string) {
    return this.progressService.observe(uploadId);
  }
}
```

### SSE Progress Endpoint

```ts
import { Controller, Sse, Param } from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Controller('uploads')
export class UploadProgressController {
  constructor(
    private readonly trackedUpload: TrackedUploadService,
  ) {}

  @Sse(':uploadId/progress')
  progress(@Param('uploadId') uploadId: string): Observable<MessageEvent> {
    return this.trackedUpload.getProgress(uploadId).pipe(
      map((status) => ({
        data: JSON.stringify(status),
      } as MessageEvent)),
    );
  }
}
```

## LocalDisk Multipart

LocalDisk implements multipart uploads using a temporary directory. Each part is written as a separate file, and `completeMultipartUpload` concatenates them:

```
.tmp/multipart/{uploadId}/
  part-001
  part-002
  part-003
  ...
→ completeMultipartUpload → concatenated into final file
```

This means LocalDisk multipart uploads work identically to S3 from the API perspective, making local development and testing seamless.

```ts
// Same API works for both local and S3
const init = await disk.initMultipartUpload('large-file.zip');
// ... upload parts ...
await disk.completeMultipartUpload(init.uploadId, init.path, parts);
```

::: warning 5 MB Minimum Chunk Size for S3
Amazon S3 requires each part (except the last) to be at least 5 MB. Smaller chunks will cause `EntityTooSmall` errors. The default `chunkSize` in `putFileMultipart` is 5 MB.

```ts
// This will fail on S3 (except for the last part):
await disk.putFileMultipart(path, data, {
  chunkSize: 1 * 1024 * 1024, // 1 MB — too small!
});

// Use at least 5 MB:
await disk.putFileMultipart(path, data, {
  chunkSize: 5 * 1024 * 1024, // 5 MB — minimum for S3
});
```

LocalDisk has no minimum chunk size requirement.
:::

::: tip Use `putFileMultipart()` for Simple Cases
If you do not need resume support or custom parallel logic, use `putFileMultipart()`. It handles chunking, part ordering, and completion automatically. The low-level API is only needed when you require:
- Client-driven chunked uploads (e.g., browser uploading chunk by chunk)
- Resumable uploads across server restarts
- Custom parallelism strategies
:::

::: info Cleaning Up Aborted Uploads
If a multipart upload is not completed or aborted, the uploaded parts remain in cloud storage and incur charges. For S3, configure a lifecycle rule to auto-delete incomplete multipart uploads:

```json
{
  "Rules": [
    {
      "ID": "AbortIncompleteMultipartUpload",
      "Status": "Enabled",
      "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": 7
      }
    }
  ]
}
```
:::
