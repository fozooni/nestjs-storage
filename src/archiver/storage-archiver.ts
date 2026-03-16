import { Injectable } from '@nestjs/common';
import { Readable } from 'stream';

import { StorageConfigurationError } from '../errors/storage-errors';
import type { ArchiverOptions, FilesystemContract } from '../interfaces/storage.interface';

/**
 * Streams multiple files from a disk into a ZIP or TAR archive without
 * loading all file content into memory at once.
 *
 * Requires the optional peer dependency `archiver`:
 * ```
 * npm install archiver
 * ```
 */
@Injectable()
export class StorageArchiver {
  /**
   * Create a ZIP archive from the given file list.
   *
   * @param files   Array of `{ path, name? }` objects. `name` overrides the
   *                entry name inside the archive (defaults to `path`).
   * @param disk    The `FilesystemContract` to read files from.
   * @param opts    Optional compression / format settings.
   * @returns       A readable stream of the zip archive bytes.
   */
  async createZip(
    files: Array<{ path: string; name?: string }>,
    disk: FilesystemContract,
    opts?: ArchiverOptions,
  ): Promise<NodeJS.ReadableStream> {
    return this.create('zip', files, disk, opts);
  }

  /**
   * Create a TAR archive from the given file list.
   */
  async createTar(
    files: Array<{ path: string; name?: string }>,
    disk: FilesystemContract,
    opts?: ArchiverOptions,
  ): Promise<NodeJS.ReadableStream> {
    return this.create('tar', files, disk, opts);
  }

  private async create(
    format: 'zip' | 'tar',
    files: Array<{ path: string; name?: string }>,
    disk: FilesystemContract,
    opts?: ArchiverOptions,
  ): Promise<NodeJS.ReadableStream> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    let archiver: typeof import('archiver');
    try {
      archiver = require('archiver') as typeof import('archiver');
    } catch {
      throw new StorageConfigurationError(
        `The 'archiver' package is required for StorageArchiver. ` +
          `Install it with: npm install archiver`,
      );
    }

    const archiverOpts: Record<string, unknown> = {};
    if (format === 'zip' && opts?.zlib) {
      archiverOpts['zlib'] = opts.zlib;
    }

    const archive = archiver(format, archiverOpts);

    // Pipe each file as a stream — never buffer the full content.
    for (const { path, name } of files) {
      const stream = await disk.get(path, { responseType: 'stream' });
      archive.append(stream as unknown as Readable, { name: name ?? path });
    }

    // Finalize kicks off the streaming write.
    void archive.finalize();

    return archive;
  }
}
