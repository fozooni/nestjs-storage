# Services Overview

All services in `@fozooni/nestjs-storage` are decorated with `@Injectable()` and **auto-registered** by `StorageModule`. You do not need to manually provide them — simply import `StorageModule` (or `StorageModule.forRoot(config)`) and inject whatever you need.

```ts
import { Module } from '@nestjs/common';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'local',
      disks: {
        local: { driver: 'local', root: './storage' },
        s3: { driver: 's3', bucket: 'my-bucket', region: 'us-east-1' },
      },
    }),
  ],
})
export class AppModule {}
```

## Available Services

| Service | Purpose | Optional Peer Dependency |
|---|---|---|
| [`StorageService`](./storage-service) | Main API entry point — disk management, proxy methods, decorator factories | None |
| [`StorageEventsService`](./events-service) | Event emitter for storage operations (put, delete, copy, move, etc.) | `@nestjs/event-emitter` (optional) |
| [`StorageMigrator`](./migrator) | Async file migration between disks with concurrency, verification, dry-run | None |
| [`StorageUploadProgressService`](./upload-progress) | RxJS-based upload progress tracking per upload ID | `rxjs` |
| [`StorageArchiver`](./archiver) | Streaming zip/tar archive creation from disk files | `archiver` |
| [`StorageAuditService`](./audit-service) | Audit logging with pluggable sinks for all write operations | None (enabled via config) |
| [`StorageTempCleanupService`](./temp-cleanup) | Temporary file cleanup with TTL-based expiration | None |

## Injecting Services

Every service follows the standard NestJS injection pattern. Simply declare it as a constructor parameter:

```ts
import { Injectable } from '@nestjs/common';
import {
  StorageService,
  StorageEventsService,
  StorageMigrator,
  StorageUploadProgressService,
  StorageArchiver,
  StorageAuditService,
  StorageTempCleanupService,
} from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(
    private readonly storage: StorageService,
    private readonly events: StorageEventsService,
    private readonly migrator: StorageMigrator,
    private readonly uploadProgress: StorageUploadProgressService,
    private readonly archiver: StorageArchiver,
    private readonly audit: StorageAuditService,
    private readonly tempCleanup: StorageTempCleanupService,
  ) {}
}
```

::: tip
You only need to inject the services you actually use. NestJS will resolve them lazily — unused services have zero overhead.
:::

::: info
Services that depend on optional peer packages (like `StorageArchiver` requiring `archiver`) will throw a clear error at injection time if the peer is not installed. See each service's page for installation instructions.
:::

## Quick Examples

### Upload a file and emit an event

```ts
@Injectable()
export class FileUploadService {
  constructor(private readonly storage: StorageService) {}

  async upload(file: Express.Multer.File): Promise<string> {
    const path = `uploads/${Date.now()}-${file.originalname}`;
    await this.storage.put(path, file.buffer);
    return this.storage.url(path);
  }
}
```

### Migrate files between disks

```ts
@Injectable()
export class MigrationService {
  constructor(
    private readonly storage: StorageService,
    private readonly migrator: StorageMigrator,
  ) {}

  async migrateToCloud(): Promise<void> {
    const source = this.storage.disk('local');
    const target = this.storage.disk('s3');

    for await (const progress of this.migrator.migrate(source, target, {
      prefix: 'uploads/',
      concurrency: 10,
      verify: true,
    })) {
      console.log(`${progress.path}: ${progress.status}`);
    }
  }
}
```

### Download files as ZIP

```ts
@Controller('downloads')
export class DownloadController {
  constructor(
    private readonly storage: StorageService,
    private readonly archiver: StorageArchiver,
  ) {}

  @Get('archive')
  async downloadArchive(@Res() res: Response): Promise<void> {
    const files = [
      { path: 'reports/q1.pdf', name: 'Q1-Report.pdf' },
      { path: 'reports/q2.pdf', name: 'Q2-Report.pdf' },
    ];

    const stream = await this.archiver.createZip(files, this.storage.disk());

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="reports.zip"',
    });

    stream.pipe(res);
  }
}
```

## Next Steps

Dive into each service's dedicated page for full method references, configuration options, and advanced usage patterns.
