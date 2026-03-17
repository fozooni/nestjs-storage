# VersionedDisk

`VersionedDisk` provides **automatic file versioning** by creating snapshots of files before every write. This is an application-level versioning system that works with any underlying disk driver, giving you a complete history of file changes without relying on cloud provider-specific versioning features.

## When to Use

- **Document management**: track revision history of contracts, reports, policies
- **Audit trails**: maintain a record of every change to a file
- **Undo/rollback**: restore a previous version of a file after accidental changes
- **Compliance**: regulatory requirements to retain historical versions of data
- **Content management**: editorial workflows with draft/revision tracking

## Factory Method

```typescript
storage.withVersioning(diskName: string | FilesystemContract): VersionedDisk
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `diskName` | `string \| FilesystemContract` | Yes | Disk name or instance to add versioning to |

## Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class DocumentService {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.withVersioning('s3');
  }

  async updateDocument(path: string, content: Buffer): Promise<void> {
    // Before writing, VersionedDisk automatically snapshots
    // the current file to .versions/{path}/{timestamp}_{uuid}
    await this.disk.put(path, content);
  }

  async getHistory(path: string) {
    // List all versions of a file
    const versions = await this.disk.listVersions(path);
    return versions;
    // [
    //   { versionId: '1710633600000_abc-123', size: 1024, lastModified: Date, isLatest: true },
    //   { versionId: '1710630000000_def-456', size: 980, lastModified: Date, isLatest: false },
    //   { versionId: '1710626400000_ghi-789', size: 512, lastModified: Date, isLatest: false },
    // ]
  }
}
```

## Version Storage Format

Versions are stored within the same disk under a `.versions/` directory:

```
.versions/
└── documents/
    └── report.pdf/
        ├── 1710633600000_a1b2c3d4-e5f6-7890-abcd-ef1234567890
        ├── 1710630000000_b2c3d4e5-f6a7-8901-bcde-f12345678901
        └── 1710626400000_c3d4e5f6-a7b8-9012-cdef-123456789012
```

The version ID format is: `{timestamp}_{uuid}`
- **timestamp**: Unix milliseconds when the snapshot was created
- **uuid**: Random UUID to prevent collisions

## API Reference

### `listVersions(path: string): Promise<FileVersion[]>`

Returns all versions of a file, sorted by most recent first.

```typescript
interface FileVersion {
  versionId: string;      // e.g., '1710633600000_abc-123'
  size: number;           // Size in bytes of this version
  lastModified: Date;     // When this version was created
  isLatest: boolean;      // Whether this is the most recent version
  checksum?: string;      // Optional content checksum
}
```

```typescript
const versions = await disk.listVersions('contracts/agreement.pdf');

for (const version of versions) {
  console.log(
    `Version: ${version.versionId}, ` +
    `Size: ${version.size} bytes, ` +
    `Date: ${version.lastModified.toISOString()}, ` +
    `Latest: ${version.isLatest}`,
  );
}
```

### `getVersion(path: string, versionId: string): Promise<Buffer>`

Retrieves the content of a specific version.

```typescript
const oldContent = await disk.getVersion(
  'contracts/agreement.pdf',
  '1710630000000_def-456',
);
```

### `restoreVersion(path: string, versionId: string): Promise<void>`

Restores a specific version by copying it back to the current path. This triggers a new snapshot of the current content first.

```typescript
// Current file is v3. Restore to v1.
// This creates v4 (snapshot of v3), then writes v1 content as current.
await disk.restoreVersion(
  'contracts/agreement.pdf',
  '1710626400000_ghi-789',
);
```

::: info Restore Creates a New Version
Restoring a version does not delete the current content. It first snapshots the current content (creating a new version), then writes the old version's content as the current file. This means you can always "undo" a restore.
:::

### `deleteVersion(path: string, versionId: string): Promise<void>`

Removes a specific version from the version history.

```typescript
await disk.deleteVersion(
  'contracts/agreement.pdf',
  '1710626400000_ghi-789',
);
```

## Full Version History Controller

```typescript
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { StorageService } from '@fozooni/nestjs-storage';

@Controller('documents')
export class DocumentVersionController {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.withVersioning('s3');
  }

  @Post(':path(*)')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('path') path: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // Automatically versions the previous content
    await this.disk.put(path, file.buffer);

    const versions = await this.disk.listVersions(path);
    return {
      path,
      currentSize: file.buffer.length,
      totalVersions: versions.length,
    };
  }

  @Get(':path(*)/versions')
  async listVersions(@Param('path') path: string) {
    const versions = await this.disk.listVersions(path);
    return {
      path,
      versions: versions.map((v) => ({
        versionId: v.versionId,
        size: v.size,
        date: v.lastModified.toISOString(),
        isLatest: v.isLatest,
      })),
    };
  }

  @Get(':path(*)/versions/:versionId')
  async getVersion(
    @Param('path') path: string,
    @Param('versionId') versionId: string,
    @Res() res: Response,
  ) {
    const content = await this.disk.getVersion(path, versionId);
    const mime = await this.disk.mimeType(path);

    res.set('Content-Type', mime);
    res.set('Content-Length', content.length.toString());
    res.set('X-Version-Id', versionId);
    res.send(content);
  }

  @Post(':path(*)/versions/:versionId/restore')
  async restoreVersion(
    @Param('path') path: string,
    @Param('versionId') versionId: string,
  ) {
    await this.disk.restoreVersion(path, versionId);
    const versions = await this.disk.listVersions(path);

    return {
      restored: true,
      restoredVersion: versionId,
      totalVersions: versions.length,
    };
  }

  @Delete(':path(*)/versions/:versionId')
  async deleteVersion(
    @Param('path') path: string,
    @Param('versionId') versionId: string,
  ) {
    await this.disk.deleteVersion(path, versionId);
    return { deleted: true, versionId };
  }
}
```

## Audit Trail Pattern

Combine versioning with metadata for a full audit trail:

```typescript
@Injectable()
export class AuditedDocumentService {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.withVersioning('s3');
  }

  async updateDocument(
    path: string,
    content: Buffer,
    userId: string,
    reason: string,
  ): Promise<void> {
    // Store the document (automatically versioned)
    await this.disk.put(path, content);

    // Store audit metadata alongside the document
    const audit = {
      updatedBy: userId,
      reason,
      timestamp: new Date().toISOString(),
      size: content.length,
    };
    await this.disk.put(`${path}.audit.json`, JSON.stringify(audit));
  }

  async getAuditTrail(path: string) {
    const versions = await this.disk.listVersions(path);
    const auditVersions = await this.disk.listVersions(`${path}.audit.json`);

    return versions.map((version, index) => ({
      version: version.versionId,
      size: version.size,
      date: version.lastModified,
      audit: auditVersions[index] ?? null,
    }));
  }
}
```

## Version Cleanup

Versions accumulate over time and consume disk space. Implement a cleanup strategy:

```typescript
@Injectable()
export class VersionCleanupService {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.withVersioning('s3');
  }

  /**
   * Keep only the N most recent versions of a file.
   */
  async pruneVersions(path: string, keepCount: number): Promise<number> {
    const versions = await this.disk.listVersions(path);

    if (versions.length <= keepCount) {
      return 0;
    }

    // Versions are sorted newest-first; delete the oldest ones
    const toDelete = versions.slice(keepCount);
    for (const version of toDelete) {
      await this.disk.deleteVersion(path, version.versionId);
    }

    return toDelete.length;
  }

  /**
   * Delete versions older than a given date.
   */
  async purgeOldVersions(path: string, olderThan: Date): Promise<number> {
    const versions = await this.disk.listVersions(path);
    let purged = 0;

    for (const version of versions) {
      if (version.lastModified < olderThan && !version.isLatest) {
        await this.disk.deleteVersion(path, version.versionId);
        purged++;
      }
    }

    return purged;
  }
}
```

```typescript
// Usage in a scheduled task (e.g., with @nestjs/schedule)
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class VersionCleanupTask {
  constructor(
    private readonly cleanup: VersionCleanupService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldVersions() {
    const disk = this.storage.withVersioning('s3');
    const files = await disk.allFiles('documents');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    for (const file of files) {
      await this.cleanup.purgeOldVersions(file, thirtyDaysAgo);
    }
  }
}
```

::: warning Disk Space Accumulation
Versions are full copies of the file, not deltas. A 10 MB file with 100 versions consumes approximately 1 GB of storage. Always implement a cleanup strategy for production deployments.
:::

## How It Works Under the Hood

1. **Intercept `put()`**: Before every `put()` call, `VersionedDisk` checks if the file already exists on the inner disk.

2. **Snapshot**: If the file exists, its current content is read and written to `.versions/{path}/{timestamp}_{uuid}`.

3. **Best-effort**: If the snapshot operation fails (e.g., the file was just created, or a read error occurs), the actual `put()` still proceeds. **Versioning failures never block writes.**

4. **Write**: The new content is written to the original path via the inner disk.

5. **List versions**: `listVersions()` reads the `.versions/{path}/` directory, parses version IDs from filenames, and returns sorted `FileVersion` objects.

6. **Restore**: `restoreVersion()` calls `put()` (which triggers a new snapshot), writing the old version's content as the current file.

::: info Application-Level Versioning
This is not cloud provider versioning (like S3 Versioning or GCS Object Versioning). It works at the application level by storing copies within the same disk. This means it works identically across all disk drivers -- local, S3, GCS, Azure, and even `FakeDisk` in tests.
:::

## Edge Cases

```typescript
// Versioning a file that doesn't exist yet — no snapshot created
await disk.put('new-file.txt', 'hello');
const versions = await disk.listVersions('new-file.txt');
// versions.length === 0 (no previous version to snapshot)

// Second write creates the first version
await disk.put('new-file.txt', 'updated');
const versions2 = await disk.listVersions('new-file.txt');
// versions2.length === 1 (snapshot of 'hello')

// Deleting a file does NOT delete its versions
await disk.delete('new-file.txt');
const versions3 = await disk.listVersions('new-file.txt');
// versions3.length === 1 (versions are preserved)
```

## Gotchas

::: warning .versions Directory
The `.versions/` directory is stored within the same disk. If you call `allFiles()` or `files()` on the raw (unversioned) disk, you will see version files. The `VersionedDisk` itself filters out `.versions/` paths from listing results.
:::

::: tip Combining with Other Decorators
Place `VersionedDisk` close to the actual storage driver. If you combine with `EncryptedDisk`, ensure encryption is outside versioning so that versions are also encrypted:

```typescript
const versioned = storage.withVersioning('s3');
const disk = storage.encrypted(versioned, { key });
// Versions are encrypted because they pass through EncryptedDisk
```
:::

## Cross-References

- [Decorator Pattern Overview](./index) -- how decorators compose
- [ScopedDisk](./scoped-disk) -- versioning within a scoped prefix
- [QuotaDisk](./quota-disk) -- versions count toward quota usage
- [ReplicatedDisk](./replicated-disk) -- versions are replicated with the primary disk
