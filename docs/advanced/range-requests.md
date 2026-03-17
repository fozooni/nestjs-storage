---
title: Range Requests (HTTP 206)
description: Stream partial file content for video, audio, and resumable downloads with @fozooni/nestjs-storage
---

# Range Requests (HTTP 206)

<span class="badge">v0.1.0</span>

Range requests allow clients to request a specific byte range of a file instead of the entire content. This is essential for video/audio streaming, resumable downloads, and PDF viewers.

## Supported Drivers

| Driver | `getRange()` Support |
|--------|---------------------|
| LocalDisk | Yes |
| S3Disk | Yes |
| GcsDisk | Yes |
| AzureDisk | Yes |
| FakeDisk | Yes |
| MinIODisk | Via S3Disk |
| R2Disk | Via S3Disk |
| B2Disk | Via S3Disk |
| DigitalOceanDisk | Via S3Disk |
| WasabiDisk | Via S3Disk |

## Core API

### `getRange(path, options)`

Reads a byte range from a file and returns a readable stream along with metadata.

```ts
const result = await storage.disk('s3').getRange('videos/intro.mp4', {
  start: 0,
  end: 999_999,
});
```

### `RangeOptions`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `start` | `number` | Yes | Start byte offset (inclusive, 0-based) |
| `end` | `number` | No | End byte offset (inclusive). Defaults to end of file (EOF) |

### `RangeResult`

| Property | Type | Description |
|----------|------|-------------|
| `stream` | `ReadableStream` | Readable stream of the requested byte range |
| `size` | `number` | Number of bytes in this range chunk |
| `contentRange` | `string` | HTTP Content-Range header value, e.g. `"bytes 0-999999/5000000"` |
| `totalSize` | `number` | Total size of the full file in bytes |

## `StorageService.serveRange()`

The `serveRange` helper parses the incoming `Range` header, calls `getRange()`, and sets the appropriate response headers automatically.

```ts
await storageService.serveRange(path, request, response, 'videos');
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | File path on the disk |
| `req` | `Request` | Express/Fastify request object |
| `res` | `Response` | Express/Fastify response object |
| `diskName` | `string?` | Optional disk name (defaults to the default disk) |

**Behavior:**
- If the `Range` header is present: responds with `206 Partial Content`
- If the `Range` header is absent: responds with `200 OK` and the full file
- If the range is invalid: responds with `416 Range Not Satisfiable`

## `@RangeServe()` Decorator

A metadata decorator that marks a controller method as a range-serving endpoint. Used in combination with interceptors for automatic range handling.

```ts
import { RangeServe } from '@fozooni/nestjs-storage';

@Get('stream/:filename')
@RangeServe('videos')
async streamVideo(@Param('filename') filename: string) {
  return { path: `uploads/${filename}` };
}
```

## Full Examples

### Video Streaming Controller

A complete controller that serves video files with range request support, enabling scrubbing and seeking in the browser's `<video>` element.

```ts
import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectStorage, StorageService } from '@fozooni/nestjs-storage';

@Controller('videos')
export class VideoStreamController {
  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  @Get(':filename')
  async stream(
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const disk = this.storage.disk('videos');
    const path = `uploads/${filename}`;

    // Check file exists
    if (!(await disk.exists(path))) {
      throw new HttpException('Video not found', HttpStatus.NOT_FOUND);
    }

    const rangeHeader = req.headers.range;

    if (!rangeHeader) {
      // No Range header — serve full file with 200
      const fileSize = await disk.size(path);
      const stream = await disk.get(path, { responseType: 'stream' });
      const mimeType = await disk.mimeType(path);

      res.writeHead(HttpStatus.OK, {
        'Content-Type': mimeType ?? 'video/mp4',
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
      });

      stream.pipe(res);
      return;
    }

    // Parse Range header: "bytes=START-END"
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      throw new HttpException(
        'Invalid Range header',
        HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
      );
    }

    const start = parseInt(match[1], 10);
    const totalSize = await disk.size(path);
    const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

    // Validate range bounds
    if (start >= totalSize || end >= totalSize || start > end) {
      res.writeHead(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE, {
        'Content-Range': `bytes */${totalSize}`,
      });
      res.end();
      return;
    }

    const result = await disk.getRange(path, { start, end });
    const mimeType = await disk.mimeType(path);

    res.writeHead(HttpStatus.PARTIAL_CONTENT, {
      'Content-Type': mimeType ?? 'video/mp4',
      'Content-Length': result.size,
      'Content-Range': result.contentRange,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });

    result.stream.pipe(res);
  }
}
```

### Simplified with `serveRange()`

The same controller using the built-in `serveRange()` helper for much less boilerplate:

```ts
import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectStorage, StorageService } from '@fozooni/nestjs-storage';

@Controller('videos')
export class VideoStreamController {
  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  @Get(':filename')
  async stream(
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.storage.serveRange(
      `uploads/${filename}`,
      req,
      res,
      'videos', // disk name
    );
  }
}
```

### Audio Streaming

Serve audio files with range support for HTML5 `<audio>` players:

```ts
import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectStorage, StorageService } from '@fozooni/nestjs-storage';

@Controller('audio')
export class AudioStreamController {
  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  @Get('tracks/:trackId')
  async streamTrack(
    @Param('trackId') trackId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.storage.serveRange(
      `music/tracks/${trackId}.mp3`,
      req,
      res,
      's3',
    );
  }

  @Get('podcasts/:episode')
  async streamPodcast(
    @Param('episode') episode: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.storage.serveRange(
      `podcasts/${episode}.mp3`,
      req,
      res,
      'gcs',
    );
  }
}
```

### Resumable Download Support

Allow clients to resume interrupted downloads:

```ts
import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  Header,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectStorage, StorageService } from '@fozooni/nestjs-storage';

@Controller('downloads')
export class DownloadController {
  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  @Get(':fileId')
  async download(
    @Param('fileId') fileId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const disk = this.storage.disk('downloads');
    const path = `files/${fileId}`;

    const fileSize = await disk.size(path);
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      // Resumable download — serve partial content
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

      const result = await disk.getRange(path, { start, end });

      res.writeHead(206, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileId}"`,
        'Content-Length': result.size,
        'Content-Range': result.contentRange,
        'Accept-Ranges': 'bytes',
      });

      result.stream.pipe(res);
    } else {
      // Full file download
      const stream = await disk.get(path, { responseType: 'stream' });

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileId}"`,
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
      });

      stream.pipe(res);
    }
  }
}
```

### Frontend HTML5 Video Player

```html
<!-- The browser automatically sends Range headers for <video> elements -->
<video controls preload="metadata" width="720">
  <source src="/videos/intro.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>
```

### 416 Range Not Satisfiable Handling

When the requested range exceeds the file size or is malformed:

```ts
const totalSize = await disk.size(path);
const start = parseInt(match[1], 10);
const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

if (start >= totalSize || end >= totalSize || start > end) {
  res.writeHead(416, {
    'Content-Range': `bytes */${totalSize}`,
  });
  res.end();
  return;
}
```

The `serveRange()` helper handles this automatically and returns a `416` response with the correct `Content-Range: bytes */{totalSize}` header.

::: info Browser Behavior with Range Requests
Modern browsers automatically send `Range` headers for `<video>` and `<audio>` elements. When a user seeks to a new position, the browser sends a new range request for that byte offset. Your server must respond with `Accept-Ranges: bytes` in the initial response for the browser to know range requests are supported.
:::

::: tip CDN Range Request Support
Most CDNs (CloudFront, Cloudflare, Fastly) natively support range requests and will forward them to your origin. If you use a CDN in front of your storage, ensure the `Accept-Ranges` and `Content-Range` headers are not stripped. CloudFront passes range requests through by default when the origin supports them.
:::

::: warning Performance Tip
For very large files (multi-GB), prefer serving range requests from cloud storage (S3, GCS, Azure) rather than LocalDisk. Cloud providers handle range requests at the infrastructure level with better throughput and lower latency.
:::
