# StorageArchiver

`StorageArchiver` creates **streaming zip and tar archives** from files on any disk. It uses the `archiver` npm package under the hood and never loads all files into memory at once — each file is streamed directly from the disk into the archive.

```ts
import { Injectable } from '@nestjs/common';
import { StorageArchiver } from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(private readonly archiver: StorageArchiver) {}
}
```

::: warning Install the `archiver` Peer Dependency
`archiver` is an optional peer dependency. You must install it separately:

```bash
pnpm add archiver
pnpm add -D @types/archiver
```

If `archiver` is not installed, injecting `StorageArchiver` will throw a clear error at runtime.
:::

## Methods

| Method | Signature | Description |
|---|---|---|
| `createZip` | `createZip(files: ArchiveEntry[], disk: FilesystemContract, opts?: ArchiverOptions): Promise<ReadableStream>` | Create a ZIP archive stream from the given files |
| `createTar` | `createTar(files: ArchiveEntry[], disk: FilesystemContract, opts?: ArchiverOptions): Promise<ReadableStream>` | Create a TAR archive stream from the given files |

## ArchiveEntry

Each entry in the `files` array describes a file to include in the archive.

| Field | Type | Description |
|---|---|---|
| `path` | `string` | Path to the file on the disk |
| `name` | `string \| undefined` | Name of the file inside the archive. Defaults to the original `path` if not specified. |

```ts
const files: ArchiveEntry[] = [
  { path: 'reports/2025/q4.pdf', name: 'Q4-Report.pdf' },
  { path: 'reports/2025/q3.pdf', name: 'Q3-Report.pdf' },
  { path: 'reports/summary.xlsx' }, // keeps original path in archive
];
```

## ArchiverOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `zlib` | `{ level: number }` | `{ level: 6 }` | Compression level (0 = no compression, 9 = max compression). Only applies to ZIP. |
| `gzip` | `boolean` | `false` | Apply gzip compression to TAR archives (creates `.tar.gz`). |
| `gzipOptions` | `{ level: number }` | `{ level: 6 }` | Gzip compression options when `gzip: true`. |

## Download as ZIP — Controller Example

```ts
import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { StorageService, StorageArchiver } from '@fozooni/nestjs-storage';

@Controller('downloads')
export class DownloadController {
  constructor(
    private readonly storage: StorageService,
    private readonly archiver: StorageArchiver,
  ) {}

  @Get('reports/:year')
  async downloadReports(
    @Param('year') year: string,
    @Res() res: Response,
  ): Promise<void> {
    const disk = this.storage.disk();
    const allFiles = await disk.files(`reports/${year}/`);

    const entries = allFiles.map((filePath) => ({
      path: filePath,
      name: filePath.split('/').pop(), // Use just the filename in the archive
    }));

    const stream = await this.archiver.createZip(entries, disk);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="reports-${year}.zip"`,
    });

    stream.pipe(res);
  }
}
```

## Download as TAR — Controller Example

```ts
@Controller('backups')
export class BackupController {
  constructor(
    private readonly storage: StorageService,
    private readonly archiver: StorageArchiver,
  ) {}

  @Get('export')
  async exportBackup(@Res() res: Response): Promise<void> {
    const disk = this.storage.disk('local');
    const files = await disk.allFiles('data/');

    const entries = files.map((path) => ({
      path,
      name: path.replace('data/', ''), // Strip the 'data/' prefix
    }));

    const stream = await this.archiver.createTar(entries, disk, {
      gzip: true,
      gzipOptions: { level: 9 },
    });

    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': 'attachment; filename="backup.tar.gz"',
    });

    stream.pipe(res);
  }
}
```

## Combining with ScopedDisk for Per-User Archives

Use `StorageService.scope()` to create a scoped disk, then archive only that user's files:

```ts
@Controller('users')
export class UserFilesController {
  constructor(
    private readonly storage: StorageService,
    private readonly archiver: StorageArchiver,
  ) {}

  @Get(':userId/download-all')
  async downloadUserFiles(
    @Param('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Scope the disk to this user's directory
    const userDisk = this.storage.scope(`users/${userId}/`);

    // List all files in the user's scope
    const files = await userDisk.allFiles();

    const entries = files.map((path) => ({
      path,
      // Files are already relative to the user's scope
    }));

    const stream = await this.archiver.createZip(entries, userDisk);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="user-${userId}-files.zip"`,
    });

    stream.pipe(res);
  }
}
```

## Custom Compression Levels

```ts
// No compression — fastest, largest file
const fast = await this.archiver.createZip(files, disk, {
  zlib: { level: 0 },
});

// Default compression (level 6) — good balance
const balanced = await this.archiver.createZip(files, disk);

// Maximum compression — slowest, smallest file
const small = await this.archiver.createZip(files, disk, {
  zlib: { level: 9 },
});
```

::: tip Compression Level Trade-offs
- **Level 0**: No compression. Use for already-compressed files (images, videos, other zips) where further compression provides no benefit.
- **Level 1-3**: Fast compression with moderate size reduction.
- **Level 6**: Default. Good balance of speed and compression ratio.
- **Level 9**: Maximum compression. Significantly slower but produces the smallest output. Best for text-heavy archives.
:::

## Selective Archive with Filtering

Build the archive from a filtered subset of files:

```ts
@Injectable()
export class ArchiveService {
  constructor(
    private readonly storage: StorageService,
    private readonly archiver: StorageArchiver,
  ) {}

  /** Archive only files matching a given extension */
  async archiveByExtension(
    directory: string,
    extensions: string[],
    format: 'zip' | 'tar' = 'zip',
  ): Promise<ReadableStream> {
    const disk = this.storage.disk();
    const allFiles = await disk.allFiles(directory);

    const entries = allFiles
      .filter((file) => extensions.some((ext) => file.endsWith(ext)))
      .map((path) => ({
        path,
        name: path.replace(`${directory}/`, ''),
      }));

    if (entries.length === 0) {
      throw new Error(`No files matching ${extensions.join(', ')} found in ${directory}`);
    }

    if (format === 'tar') {
      return this.archiver.createTar(entries, disk, { gzip: true });
    }

    return this.archiver.createZip(entries, disk);
  }

  /** Archive files from multiple disks into a single archive */
  async archiveFromMultipleDisks(
    sources: Array<{ disk: string; files: string[] }>,
  ): Promise<ReadableStream> {
    const entries: Array<{ path: string; name: string }> = [];

    // Collect all files and prefix names with disk name for clarity
    for (const source of sources) {
      for (const file of source.files) {
        entries.push({
          path: file,
          name: `${source.disk}/${file}`,
        });
      }
    }

    // Use the first disk as the primary — each entry will be read from
    // its corresponding disk by looking up the path
    const primaryDisk = this.storage.disk(sources[0].disk);
    return this.archiver.createZip(entries, primaryDisk);
  }
}
```

## Content-Disposition Header Patterns

```ts
// Simple filename
res.set('Content-Disposition', 'attachment; filename="archive.zip"');

// Filename with special characters (RFC 5987)
const filename = `report-${new Date().toISOString()}.zip`;
res.set(
  'Content-Disposition',
  `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
);

// Inline (display in browser if possible, e.g. PDF in archive)
res.set('Content-Disposition', `inline; filename="preview.zip"`);
```

## Error Handling

```ts
@Get('download')
async download(@Res() res: Response): Promise<void> {
  try {
    const disk = this.storage.disk();
    const files = await disk.files('exports/');

    if (files.length === 0) {
      res.status(404).json({ error: 'No files to archive' });
      return;
    }

    const entries = files.map((path) => ({ path }));
    const stream = await this.archiver.createZip(entries, disk);

    // Handle stream errors
    stream.on('error', (err) => {
      console.error('Archive stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Archive creation failed' });
      }
    });

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="export.zip"',
    });

    stream.pipe(res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
}
```

::: info Streaming Architecture
`StorageArchiver` streams each file directly from the disk into the archive output stream. No file content is fully buffered in memory. This means you can archive terabytes of data as long as the client connection stays open and disk reads are responsive.
:::

::: tip Internal Cast
Internally, `StorageArchiver` must cast disk read streams with `stream as unknown as Readable` to satisfy the `archiver` package's type requirements. This is handled for you — you never need to perform this cast in your own code.
:::
