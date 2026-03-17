# StorageTempCleanupService

`StorageTempCleanupService` manages the lifecycle of temporary files created with `putTemp()`. It uses TTL-based expiration with sidecar `.ttl` files and can be triggered manually or on a cron schedule.

```ts
import { Injectable } from '@nestjs/common';
import { StorageTempCleanupService } from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(private readonly tempCleanup: StorageTempCleanupService) {}
}
```

::: warning LocalDisk Only
`StorageTempCleanupService` only works with `LocalDisk`. Cloud providers (S3, GCS, Azure) have their own native object lifecycle policies that handle expiration at the infrastructure level. See the tip at the bottom of this page for cloud alternatives.
:::

## How It Works

1. When you call `putTemp(path, content, ttlSeconds, opts?)` on a `LocalDisk`, it writes two files:
   - The actual file at the given `path`
   - A sidecar file at `{path}.ttl` containing the expiration timestamp (Unix epoch in milliseconds)

2. When `runOnce()` is called, the service:
   - Scans for all `.ttl` files in the disk's root directory (recursively)
   - Reads each `.ttl` file to get the expiration timestamp
   - If the timestamp has passed, deletes both the `.ttl` file and the corresponding data file
   - Returns a `TempCleanupResult` with counts and any errors

## Methods

| Method | Signature | Description |
|---|---|---|
| `runOnce` | `runOnce(disk?: FilesystemContract): Promise<TempCleanupResult>` | Scan for expired temp files and delete them. Uses the default disk if none specified. |

## TempCleanupResult

| Field | Type | Description |
|---|---|---|
| `deleted` | `number` | Number of expired files successfully deleted |
| `errors` | `Array<{ path: string; error: string }>` | Files that could not be deleted, with error details |

## Creating Temporary Files

Before cleanup can work, you need to create temporary files using `putTemp()` on a `LocalDisk`:

```ts
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class ExportService {
  constructor(private readonly storage: StorageService) {}

  async generateReport(): Promise<string> {
    const reportData = await this.buildReportData();
    const path = `temp/reports/${Date.now()}-report.pdf`;

    // File expires in 1 hour (3600 seconds)
    await this.storage.disk('local').putTemp(
      path,
      reportData,
      3600,
    );

    // Return a URL for the user to download within the TTL
    return this.storage.url(path);
  }

  async generatePreview(imageBuffer: Buffer): Promise<string> {
    const path = `temp/previews/${crypto.randomUUID()}.jpg`;

    // Preview expires in 15 minutes
    await this.storage.disk('local').putTemp(
      path,
      imageBuffer,
      900,
    );

    return path;
  }
}
```

## Manual Cleanup

Trigger cleanup manually from a controller or service:

```ts
@Controller('admin')
export class AdminController {
  constructor(
    private readonly tempCleanup: StorageTempCleanupService,
    private readonly storage: StorageService,
  ) {}

  @Post('cleanup')
  async runCleanup() {
    const result = await this.tempCleanup.runOnce(this.storage.disk('local'));

    return {
      deletedFiles: result.deleted,
      errors: result.errors,
      message: `Cleaned up ${result.deleted} expired temporary files`,
    };
  }
}
```

## Scheduled Cleanup with @nestjs/schedule

The most common pattern is running cleanup on a cron schedule using `@nestjs/schedule`:

### Installation

```bash
pnpm add @nestjs/schedule
```

### Setup

```ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    StorageModule.forRoot({
      default: 'local',
      disks: {
        local: { driver: 'local', root: './storage' },
      },
    }),
  ],
})
export class AppModule {}
```

### Scheduled Cleanup Service

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  StorageTempCleanupService,
  StorageService,
} from '@fozooni/nestjs-storage';

@Injectable()
export class ScheduledCleanupService {
  private readonly logger = new Logger(ScheduledCleanupService.name);

  constructor(
    private readonly tempCleanup: StorageTempCleanupService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup(): Promise<void> {
    this.logger.log('Starting scheduled temp file cleanup...');

    const result = await this.tempCleanup.runOnce(this.storage.disk('local'));

    this.logger.log(`Cleanup complete: ${result.deleted} files deleted`);

    if (result.errors.length > 0) {
      this.logger.warn(
        `Cleanup encountered ${result.errors.length} errors:`,
      );
      result.errors.forEach(({ path, error }) => {
        this.logger.warn(`  ${path}: ${error}`);
      });
    }
  }
}
```

### Alternative Cron Schedules

```ts
// Every 5 minutes — aggressive cleanup for high-churn environments
@Cron(CronExpression.EVERY_5_MINUTES)

// Every 30 minutes
@Cron('*/30 * * * *')

// Every hour (default recommendation)
@Cron(CronExpression.EVERY_HOUR)

// Every day at midnight
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)

// Every day at 3 AM (low-traffic window)
@Cron('0 3 * * *')
```

## Full Example: Temporary File Download Service

A complete workflow where files are generated, served, and automatically cleaned up:

```ts
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class TempDownloadService {
  constructor(private readonly storage: StorageService) {}

  /**
   * Generate a temporary file and return a download path.
   * The file will be automatically cleaned up after the TTL expires.
   */
  async createTempDownload(
    content: Buffer,
    filename: string,
    ttlSeconds: number = 3600,
  ): Promise<{ path: string; expiresAt: Date }> {
    const path = `temp/downloads/${crypto.randomUUID()}/${filename}`;

    await this.storage.disk('local').putTemp(path, content, ttlSeconds);

    return {
      path,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }
}
```

```ts
import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '@fozooni/nestjs-storage';
import { TempDownloadService } from './temp-download.service';

@Controller('downloads')
export class TempDownloadController {
  constructor(
    private readonly storage: StorageService,
    private readonly tempDownloads: TempDownloadService,
  ) {}

  @Get('generate-report')
  async generateReport() {
    const reportBuffer = await this.buildReport();

    const { path, expiresAt } = await this.tempDownloads.createTempDownload(
      reportBuffer,
      'monthly-report.pdf',
      7200, // 2 hours
    );

    return {
      downloadUrl: `/downloads/file/${encodeURIComponent(path)}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  @Get('file/:path(*)')
  async downloadFile(
    @Param('path') path: string,
    @Res() res: Response,
  ): Promise<void> {
    const disk = this.storage.disk('local');

    if (await disk.missing(path)) {
      throw new NotFoundException('File not found or has expired');
    }

    const content = await disk.get(path);
    const filename = path.split('/').pop();

    res.set({
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': await disk.mimeType(path),
    });

    res.send(content);
  }

  private async buildReport(): Promise<Buffer> {
    // Your report generation logic here
    return Buffer.from('Report content...');
  }
}
```

## Cleanup on Application Shutdown

Run a final cleanup when the application shuts down to clear any remaining expired files:

```ts
import { Injectable, OnApplicationShutdown, Logger } from '@nestjs/common';
import { StorageTempCleanupService, StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class ShutdownCleanupService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownCleanupService.name);

  constructor(
    private readonly tempCleanup: StorageTempCleanupService,
    private readonly storage: StorageService,
  ) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Application shutting down (${signal}), running final temp cleanup...`);

    const result = await this.tempCleanup.runOnce(this.storage.disk('local'));
    this.logger.log(`Final cleanup: ${result.deleted} expired files deleted`);
  }
}
```

## Error Handling

The `runOnce()` method is designed to be resilient. Individual file deletion failures are collected in the `errors` array rather than throwing, so one corrupted `.ttl` file does not prevent the rest of the cleanup from running.

```ts
const result = await this.tempCleanup.runOnce(localDisk);

if (result.errors.length > 0) {
  // Log errors but don't panic — they'll be retried next run
  for (const { path, error } of result.errors) {
    this.logger.warn(`Failed to clean up ${path}: ${error}`);
  }

  // Optionally alert if too many errors
  if (result.errors.length > 10) {
    this.alertService.warn(
      `Temp cleanup had ${result.errors.length} errors — filesystem may need attention`,
    );
  }
}
```

::: tip Cloud Provider Lifecycle Policies
For S3, GCS, and Azure Blob Storage, use the provider's native object lifecycle management instead of `StorageTempCleanupService`:

**Amazon S3**: Configure [Lifecycle Rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html) in the bucket settings to automatically expire objects with a specific prefix or tag.

**Google Cloud Storage**: Set up [Object Lifecycle Management](https://cloud.google.com/storage/docs/lifecycle) rules to delete objects older than a specified age.

**Azure Blob Storage**: Use [Lifecycle Management Policies](https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-overview) to automatically tier or delete blobs.

These are more reliable than application-level cleanup because they work even if your application is down.
:::

::: info Sidecar File Format
The `.ttl` sidecar file contains a single line with the Unix epoch timestamp (in milliseconds) at which the file expires. For example, a file expiring on January 1, 2026 at midnight UTC would contain: `1767225600000`. This simple format makes it easy to inspect and debug manually if needed.
:::
