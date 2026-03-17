# StorageUploadProgressService

`StorageUploadProgressService` provides **RxJS-based upload progress tracking** for multipart uploads. Each upload is identified by a unique upload ID and has its own `Subject` that emits progress updates as parts are uploaded.

```ts
import { Injectable } from '@nestjs/common';
import { StorageUploadProgressService } from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(private readonly uploadProgress: StorageUploadProgressService) {}
}
```

::: info
RxJS is already a peer dependency of NestJS, so no additional installation is required to use this service.
:::

## Methods

| Method | Signature | Description |
|---|---|---|
| `track` | `track(uploadId: string, status: MultipartUploadStatus): void` | Push a progress update for a given upload |
| `getProgress$` | `getProgress$(uploadId: string): Observable<MultipartUploadStatus>` | Get an observable stream of progress updates for a given upload |
| `complete` | `complete(uploadId: string): void` | Complete the subject for the upload (signals done, cleans up) |
| `error` | `error(uploadId: string, err: Error): void` | Error the subject for the upload (signals failure, cleans up) |

## MultipartUploadStatus

| Field | Type | Description |
|---|---|---|
| `loaded` | `number` | Number of bytes uploaded so far |
| `total` | `number` | Total number of bytes to upload |
| `percent` | `number \| undefined` | Computed percentage (0-100), may be undefined if total is unknown |

## Basic Usage

```ts
import { Injectable } from '@nestjs/common';
import { StorageService, StorageUploadProgressService } from '@fozooni/nestjs-storage';
import { v4 as uuid } from 'uuid';

@Injectable()
export class UploadService {
  constructor(
    private readonly storage: StorageService,
    private readonly progress: StorageUploadProgressService,
  ) {}

  async uploadLargeFile(file: Express.Multer.File): Promise<string> {
    const uploadId = uuid();
    const path = `uploads/${uploadId}-${file.originalname}`;

    try {
      const resultPath = await this.storage.disk('s3').putFileMultipart(
        path,
        file,
        {
          partSize: 10 * 1024 * 1024, // 10 MB
          onProgress: (loaded: number, total: number) => {
            this.progress.track(uploadId, {
              loaded,
              total,
              percent: Math.round((loaded / total) * 100),
            });
          },
        },
      );

      this.progress.complete(uploadId);
      return resultPath;
    } catch (error) {
      this.progress.error(uploadId, error);
      throw error;
    }
  }

  getProgress$(uploadId: string) {
    return this.progress.getProgress$(uploadId);
  }
}
```

## SSE Controller Example (Server-Sent Events)

The most common way to stream progress to the browser is via Server-Sent Events. NestJS has built-in support with the `@Sse()` decorator.

```ts
import {
  Controller,
  Post,
  Get,
  Sse,
  Param,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StorageUploadProgressService } from '@fozooni/nestjs-storage';
import { UploadService } from './upload.service';

@Controller('uploads')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly progress: StorageUploadProgressService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    const uploadId = crypto.randomUUID();

    // Start upload in background — don't await
    this.uploadService
      .uploadLargeFile(file)
      .catch((err) => console.error('Upload failed:', err));

    // Return the upload ID immediately so the client can subscribe
    return { uploadId };
  }

  @Sse(':uploadId/progress')
  trackProgress(@Param('uploadId') uploadId: string): Observable<MessageEvent> {
    return this.progress.getProgress$(uploadId).pipe(
      map((status) => ({
        data: JSON.stringify({
          loaded: status.loaded,
          total: status.total,
          percent: status.percent,
        }),
      } as MessageEvent)),
    );
  }
}
```

### Client-Side SSE Consumer

```ts
async function uploadWithProgress(file: File): Promise<void> {
  // 1. Start the upload
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/uploads', {
    method: 'POST',
    body: formData,
  });

  const { uploadId } = await response.json();

  // 2. Subscribe to progress via SSE
  const eventSource = new EventSource(`/uploads/${uploadId}/progress`);

  eventSource.onmessage = (event) => {
    const { loaded, total, percent } = JSON.parse(event.data);

    // Update your UI
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${formatBytes(loaded)} / ${formatBytes(total)} (${percent}%)`;
  };

  eventSource.onerror = () => {
    // SSE connection closed — upload either completed or failed
    eventSource.close();
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
```

## WebSocket Gateway Example

For bidirectional communication, you can use a NestJS WebSocket gateway:

```ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { StorageUploadProgressService } from '@fozooni/nestjs-storage';
import { Subscription } from 'rxjs';

@WebSocketGateway({ namespace: 'uploads' })
export class UploadGateway {
  @WebSocketServer()
  server: Server;

  private subscriptions = new Map<string, Subscription>();

  constructor(private readonly progress: StorageUploadProgressService) {}

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { uploadId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const { uploadId } = data;

    // Clean up any existing subscription for this client+upload
    const key = `${client.id}:${uploadId}`;
    this.subscriptions.get(key)?.unsubscribe();

    const subscription = this.progress.getProgress$(uploadId).subscribe({
      next: (status) => {
        client.emit('progress', {
          uploadId,
          loaded: status.loaded,
          total: status.total,
          percent: status.percent,
        });
      },
      error: (err) => {
        client.emit('upload-error', {
          uploadId,
          error: err.message,
        });
        this.subscriptions.delete(key);
      },
      complete: () => {
        client.emit('upload-complete', { uploadId });
        this.subscriptions.delete(key);
      },
    });

    this.subscriptions.set(key, subscription);
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: { uploadId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const key = `${client.id}:${data.uploadId}`;
    this.subscriptions.get(key)?.unsubscribe();
    this.subscriptions.delete(key);
  }

  handleDisconnect(client: Socket): void {
    // Clean up all subscriptions for this client
    for (const [key, sub] of this.subscriptions.entries()) {
      if (key.startsWith(`${client.id}:`)) {
        sub.unsubscribe();
        this.subscriptions.delete(key);
      }
    }
  }
}
```

### Client-Side WebSocket Consumer

```ts
import { io } from 'socket.io-client';

const socket = io('/uploads');

socket.emit('subscribe', { uploadId: 'abc-123' });

socket.on('progress', (data) => {
  console.log(`Upload ${data.uploadId}: ${data.percent}%`);
  updateProgressBar(data.percent);
});

socket.on('upload-complete', (data) => {
  console.log(`Upload ${data.uploadId} completed!`);
  socket.emit('unsubscribe', { uploadId: data.uploadId });
});

socket.on('upload-error', (data) => {
  console.error(`Upload ${data.uploadId} failed:`, data.error);
});
```

## Integration with Multipart Uploads

The `putFileMultipart` method on disk instances accepts an `onProgress` callback that pairs naturally with the progress service:

```ts
@Injectable()
export class MultipartUploadService {
  constructor(
    private readonly storage: StorageService,
    private readonly progress: StorageUploadProgressService,
  ) {}

  async uploadWithTracking(
    uploadId: string,
    file: Express.Multer.File,
    diskName: string = 's3',
  ): Promise<string> {
    const disk = this.storage.disk(diskName);
    const path = `uploads/${file.originalname}`;

    try {
      const resultPath = await disk.putFileMultipart(path, file, {
        partSize: 5 * 1024 * 1024, // 5 MB parts
        onProgress: (loaded, total) => {
          this.progress.track(uploadId, {
            loaded,
            total,
            percent: total > 0 ? Math.round((loaded / total) * 100) : undefined,
          });
        },
      });

      this.progress.complete(uploadId);
      return resultPath;
    } catch (error) {
      this.progress.error(uploadId, error);
      throw error;
    }
  }
}
```

## Manual Low-Level Multipart with Progress

For full control over the multipart upload lifecycle:

```ts
async uploadManualMultipart(
  uploadId: string,
  filePath: string,
  chunks: Buffer[],
): Promise<void> {
  const disk = this.storage.disk('s3');
  const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
  let uploadedBytes = 0;

  const mpUploadId = await disk.initMultipartUpload(filePath);
  const parts = [];

  try {
    for (let i = 0; i < chunks.length; i++) {
      const part = await disk.uploadPart(filePath, mpUploadId, i + 1, chunks[i]);
      parts.push(part);

      uploadedBytes += chunks[i].length;
      this.progress.track(uploadId, {
        loaded: uploadedBytes,
        total: totalBytes,
        percent: Math.round((uploadedBytes / totalBytes) * 100),
      });
    }

    await disk.completeMultipartUpload(filePath, mpUploadId, parts);
    this.progress.complete(uploadId);
  } catch (error) {
    await disk.abortMultipartUpload(filePath, mpUploadId);
    this.progress.error(uploadId, error);
    throw error;
  }
}
```

## Polling Endpoint Alternative

If SSE or WebSockets are not viable (e.g., behind certain proxies), you can expose a simple polling endpoint:

```ts
@Controller('uploads')
export class UploadPollingController {
  private readonly latestStatus = new Map<string, MultipartUploadStatus>();

  constructor(private readonly progress: StorageUploadProgressService) {}

  /** Subscribe internally and cache the latest status */
  trackUpload(uploadId: string): void {
    this.progress.getProgress$(uploadId).subscribe({
      next: (status) => this.latestStatus.set(uploadId, status),
      complete: () => {
        // Keep the final status around for a minute
        setTimeout(() => this.latestStatus.delete(uploadId), 60_000);
      },
      error: () => this.latestStatus.delete(uploadId),
    });
  }

  @Get(':uploadId/status')
  getStatus(@Param('uploadId') uploadId: string) {
    const status = this.latestStatus.get(uploadId);

    if (!status) {
      return { status: 'not_found' };
    }

    return {
      status: 'in_progress',
      loaded: status.loaded,
      total: status.total,
      percent: status.percent,
    };
  }
}
```

::: tip Cleaning Up Completed Uploads
Always call `complete(uploadId)` or `error(uploadId, err)` when an upload finishes. This closes the internal `Subject` and allows garbage collection. If you forget to call these, the Subject will remain in memory indefinitely, causing a memory leak for long-running applications.
:::

::: warning Subject Lifecycle
Once `complete()` or `error()` is called on an upload ID, that Subject is closed permanently. Any subsequent calls to `track()` with the same upload ID will create a new Subject. Subscribers that connected before `complete()` will receive the completion signal and should clean up accordingly.
:::
