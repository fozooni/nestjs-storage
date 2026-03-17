# StorageMigrator

`StorageMigrator` is an injectable service that migrates files between disks using an **async generator**. It streams files one-by-one (or in concurrent batches) without buffering all content in memory, making it suitable for migrating millions of files or very large datasets.

```ts
import { Injectable } from '@nestjs/common';
import { StorageMigrator } from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(private readonly migrator: StorageMigrator) {}
}
```

## Method Signature

```ts
migrate(
  source: FilesystemContract,
  target: FilesystemContract,
  options?: MigrationOptions,
): AsyncGenerator<MigrationProgress>
```

The method returns an `AsyncGenerator` that yields a `MigrationProgress` object for every file processed. You consume it with a `for await...of` loop.

## MigrationOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `prefix` | `string` | `undefined` | Only migrate files matching this path prefix |
| `concurrency` | `number` | `5` | Number of files to transfer in parallel |
| `verify` | `boolean` | `false` | Compute checksum on both source and target after copy, compare to ensure integrity |
| `deleteSource` | `boolean` | `false` | Delete each file from the source disk after successful transfer |
| `dryRun` | `boolean` | `false` | Enumerate files and yield progress events without actually copying anything |
| `onError` | `'skip' \| 'abort'` | `'skip'` | `'skip'` continues to the next file on error; `'abort'` throws and stops the generator |

## MigrationProgress

| Field | Type | Description |
|---|---|---|
| `path` | `string` | The file path being processed |
| `status` | `'pending' \| 'copied' \| 'verified' \| 'failed' \| 'skipped'` | Current status of this file |
| `error` | `Error \| undefined` | Error object if `status === 'failed'` |
| `bytesTransferred` | `number \| undefined` | Number of bytes transferred for this file |

## Basic Migration

```ts
import { Injectable, Logger } from '@nestjs/common';
import { StorageService, StorageMigrator } from '@fozooni/nestjs-storage';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly migrator: StorageMigrator,
  ) {}

  async migrateUploadsToS3(): Promise<{ total: number; failed: number }> {
    const source = this.storage.disk('local');
    const target = this.storage.disk('s3');

    let total = 0;
    let failed = 0;

    for await (const progress of this.migrator.migrate(source, target, {
      prefix: 'uploads/',
      concurrency: 10,
    })) {
      total++;

      if (progress.status === 'copied') {
        this.logger.log(`Copied: ${progress.path} (${progress.bytesTransferred} bytes)`);
      } else if (progress.status === 'failed') {
        failed++;
        this.logger.error(`Failed: ${progress.path} — ${progress.error?.message}`);
      }
    }

    return { total, failed };
  }
}
```

## Migration with Verification

When `verify: true` is set, the migrator computes a checksum on both the source and target after copying and compares them. If they differ, the file is marked as `'failed'`.

```ts
for await (const progress of this.migrator.migrate(source, target, {
  prefix: 'critical-data/',
  concurrency: 5,
  verify: true,
})) {
  switch (progress.status) {
    case 'copied':
      console.log(`Copied (unverified): ${progress.path}`);
      break;
    case 'verified':
      console.log(`Copied + verified: ${progress.path}`);
      break;
    case 'failed':
      console.error(`FAILED: ${progress.path}`, progress.error?.message);
      break;
  }
}
```

::: warning Use verify with deleteSource
When using `deleteSource: true`, it is strongly recommended to also set `verify: true`. This ensures files are only deleted from the source after their integrity has been confirmed on the target. Without verification, a corrupted transfer could result in data loss.
:::

## Dry Run

A dry run enumerates all files that would be migrated without actually copying anything. Useful for estimating migration scope and duration.

```ts
const filesToMigrate: string[] = [];

for await (const progress of this.migrator.migrate(source, target, {
  prefix: 'uploads/',
  dryRun: true,
})) {
  filesToMigrate.push(progress.path);
}

console.log(`Dry run complete. ${filesToMigrate.length} files would be migrated.`);
```

## Error Handling: Skip vs Abort

### Skip Mode (Default)

In `skip` mode, failures are recorded but migration continues to the next file:

```ts
const failures: Array<{ path: string; error: string }> = [];

for await (const progress of this.migrator.migrate(source, target, {
  onError: 'skip', // default
})) {
  if (progress.status === 'failed') {
    failures.push({
      path: progress.path,
      error: progress.error?.message ?? 'Unknown error',
    });
  }
}

if (failures.length > 0) {
  console.error(`Migration completed with ${failures.length} failures:`);
  failures.forEach((f) => console.error(`  ${f.path}: ${f.error}`));
}
```

### Abort Mode

In `abort` mode, the generator throws on the first failure. Wrap in try/catch:

```ts
try {
  for await (const progress of this.migrator.migrate(source, target, {
    onError: 'abort',
  })) {
    console.log(`${progress.path}: ${progress.status}`);
  }
  console.log('Migration completed successfully');
} catch (error) {
  console.error('Migration aborted:', error.message);
  // Handle partial migration — some files may already have been copied
}
```

::: danger
In `abort` mode, files copied before the failure are **not** rolled back. You may end up with a partial migration. Consider using `verify: true` and running the migration again — already-copied files will be overwritten with fresh copies.
:::

## Controller Endpoint with SSE Progress

Stream migration progress to the client using Server-Sent Events:

```ts
import { Controller, Post, Sse, Query } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { StorageService, StorageMigrator } from '@fozooni/nestjs-storage';

interface MigrationEvent {
  path: string;
  status: string;
  bytes?: number;
  error?: string;
}

@Controller('admin/migration')
export class MigrationController {
  constructor(
    private readonly storage: StorageService,
    private readonly migrator: StorageMigrator,
  ) {}

  @Sse('progress')
  async streamMigration(
    @Query('from') fromDisk: string,
    @Query('to') toDisk: string,
    @Query('prefix') prefix?: string,
  ): Promise<Observable<MessageEvent>> {
    const subject = new Subject<MessageEvent>();

    const source = this.storage.disk(fromDisk);
    const target = this.storage.disk(toDisk);

    // Run migration in background, push events to SSE stream
    (async () => {
      let copied = 0;
      let failed = 0;

      try {
        for await (const progress of this.migrator.migrate(source, target, {
          prefix,
          concurrency: 10,
          verify: true,
        })) {
          if (progress.status === 'copied' || progress.status === 'verified') {
            copied++;
          } else if (progress.status === 'failed') {
            failed++;
          }

          subject.next({
            data: JSON.stringify({
              path: progress.path,
              status: progress.status,
              bytes: progress.bytesTransferred,
              error: progress.error?.message,
              stats: { copied, failed },
            }),
          } as MessageEvent);
        }

        subject.next({
          data: JSON.stringify({
            status: 'complete',
            stats: { copied, failed },
          }),
        } as MessageEvent);
      } catch (error) {
        subject.next({
          data: JSON.stringify({
            status: 'aborted',
            error: error.message,
          }),
        } as MessageEvent);
      } finally {
        subject.complete();
      }
    })();

    return subject.asObservable();
  }
}
```

### Client-Side SSE Consumer

```ts
const eventSource = new EventSource(
  '/admin/migration/progress?from=local&to=s3&prefix=uploads/'
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.status === 'complete') {
    console.log('Migration complete!', data.stats);
    eventSource.close();
  } else if (data.status === 'aborted') {
    console.error('Migration aborted:', data.error);
    eventSource.close();
  } else {
    console.log(`[${data.status}] ${data.path} (${data.bytes} bytes)`);
    updateProgressBar(data.stats.copied, data.stats.copied + data.stats.failed);
  }
};
```

## Full Migration Service with Reporting

```ts
import { Injectable, Logger } from '@nestjs/common';
import { StorageService, StorageMigrator, MigrationOptions } from '@fozooni/nestjs-storage';

interface MigrationReport {
  startedAt: Date;
  completedAt: Date;
  totalFiles: number;
  copiedFiles: number;
  failedFiles: number;
  totalBytes: number;
  durationMs: number;
  failures: Array<{ path: string; error: string }>;
}

@Injectable()
export class FullMigrationService {
  private readonly logger = new Logger(FullMigrationService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly migrator: StorageMigrator,
  ) {}

  async runMigration(
    sourceDisk: string,
    targetDisk: string,
    options?: Partial<MigrationOptions>,
  ): Promise<MigrationReport> {
    const source = this.storage.disk(sourceDisk);
    const target = this.storage.disk(targetDisk);
    const startedAt = new Date();

    const report: MigrationReport = {
      startedAt,
      completedAt: startedAt,
      totalFiles: 0,
      copiedFiles: 0,
      failedFiles: 0,
      totalBytes: 0,
      durationMs: 0,
      failures: [],
    };

    this.logger.log(
      `Starting migration: [${sourceDisk}] -> [${targetDisk}]` +
      (options?.prefix ? ` (prefix: ${options.prefix})` : ''),
    );

    for await (const progress of this.migrator.migrate(source, target, {
      concurrency: 10,
      verify: true,
      onError: 'skip',
      ...options,
    })) {
      report.totalFiles++;

      if (progress.status === 'copied' || progress.status === 'verified') {
        report.copiedFiles++;
        report.totalBytes += progress.bytesTransferred ?? 0;
      } else if (progress.status === 'failed') {
        report.failedFiles++;
        report.failures.push({
          path: progress.path,
          error: progress.error?.message ?? 'Unknown error',
        });
      }

      // Log every 100 files
      if (report.totalFiles % 100 === 0) {
        this.logger.log(
          `Progress: ${report.totalFiles} files processed ` +
          `(${report.copiedFiles} copied, ${report.failedFiles} failed)`,
        );
      }
    }

    report.completedAt = new Date();
    report.durationMs = report.completedAt.getTime() - report.startedAt.getTime();

    this.logger.log(
      `Migration complete in ${report.durationMs}ms: ` +
      `${report.copiedFiles}/${report.totalFiles} copied, ` +
      `${report.failedFiles} failed, ` +
      `${(report.totalBytes / 1024 / 1024).toFixed(2)} MB transferred`,
    );

    return report;
  }
}
```

::: tip Concurrency Tuning
The default concurrency of `5` is conservative. For high-bandwidth networks or small files, increase to `20`-`50`. For very large files or constrained bandwidth, reduce to `2`-`3`. Monitor memory usage — each concurrent transfer holds one file's content stream in flight.
:::

::: info Streaming Architecture
The migrator never reads an entire file into memory. It streams data from the source disk's read stream directly to the target disk's write stream. This means you can migrate files of any size without worrying about memory pressure, as long as you keep concurrency reasonable.
:::
