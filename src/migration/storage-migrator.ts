import { Injectable } from '@nestjs/common';

import type {
  FilesystemContract,
  MigrationOptions,
  MigrationProgress,
} from '../interfaces/storage.interface';

@Injectable()
export class StorageMigrator {
  /**
   * Migrate all files (or a filtered subset) from `source` to `target`.
   *
   * Yields a `MigrationProgress` event for each file encountered:
   * - `'pending'` — about to be copied
   * - `'copied'`  — successfully written to target (and verified, if requested)
   * - `'failed'`  — copy or verification failed
   *
   * When `opts.dryRun` is `true` no writes are performed and all files
   * are reported as `'copied'` (simulated).
   */
  async *migrate(
    source: FilesystemContract,
    target: FilesystemContract,
    opts?: MigrationOptions,
  ): AsyncGenerator<MigrationProgress> {
    const {
      prefix,
      concurrency = 5,
      verify = false,
      deleteSource = false,
      dryRun = false,
      onError = 'skip',
    } = opts ?? {};

    const allPaths = await source.allFiles(prefix);

    // Process in sliding batches of `concurrency` files.
    for (let i = 0; i < allPaths.length; i += concurrency) {
      const batch = allPaths.slice(i, i + concurrency);

      // Yield 'pending' for every file in the batch before starting.
      for (const path of batch) {
        yield { path, status: 'pending' };
      }

      const results = await Promise.allSettled(
        batch.map((path) =>
          this.migrateOne(source, target, path, { verify, deleteSource, dryRun }),
        ),
      );

      for (let j = 0; j < batch.length; j++) {
        const path = batch[j];
        const result = results[j];

        if (result.status === 'fulfilled') {
          yield result.value;
        } else {
          const error =
            result.reason instanceof Error ? result.reason : new Error(String(result.reason));
          if (onError === 'abort') {
            throw error;
          }
          yield { path, status: 'failed', error };
        }
      }
    }
  }

  private async migrateOne(
    source: FilesystemContract,
    target: FilesystemContract,
    path: string,
    opts: { verify: boolean; deleteSource: boolean; dryRun: boolean },
  ): Promise<MigrationProgress> {
    const { verify, deleteSource, dryRun } = opts;

    if (dryRun) {
      return { path, status: 'copied' };
    }

    // Stream from source to target — never buffer all content at once.
    const stream = await source.get(path, { responseType: 'stream' });
    const size = await source.size(path);
    await target.put(path, stream as NodeJS.ReadableStream);

    if (verify) {
      const sourceChecksum = source.checksum ? await source.checksum(path, 'md5') : null;
      const targetChecksum = target.checksum ? await target.checksum(path, 'md5') : null;

      if (sourceChecksum !== null && targetChecksum !== null && sourceChecksum !== targetChecksum) {
        throw new Error(
          `Checksum mismatch for '${path}': source=${sourceChecksum} target=${targetChecksum}`,
        );
      }
    }

    if (deleteSource) {
      await source.delete(path);
    }

    return { path, status: 'copied', bytesTransferred: size };
  }
}
