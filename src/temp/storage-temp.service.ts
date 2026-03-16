import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage.service';
import { LocalDisk } from '../disk/local-disk';

export interface TempCleanupResult {
  /** Number of expired files (and their sidecars) deleted. */
  deleted: number;
  /** Number of files that failed to delete. */
  errors: number;
}

/**
 * `StorageTempCleanupService` scans a disk for expired temporary files created
 * by `putTemp()` and removes them.
 *
 * Works with **`LocalDisk`** only (S3 and compatible drivers handle expiry
 * natively via object expiration policies).
 *
 * For `LocalDisk`, `putTemp()` writes a `.ttl` sidecar JSON file alongside
 * each temporary file. This service reads those sidecars, checks the
 * `expiresAt` timestamp, and deletes both the sidecar and the original file
 * when expired.
 *
 * ### Usage
 *
 * ```ts
 * // Inject and run manually
 * const result = await tempCleanupService.runOnce('local');
 * console.log(`Deleted ${result.deleted} expired files`);
 * ```
 *
 * ### With `@nestjs/schedule`
 *
 * ```ts
 * @Injectable()
 * export class ScheduledCleanup {
 *   constructor(private readonly tempCleanup: StorageTempCleanupService) {}
 *
 *   @Cron('0 * * * *') // hourly
 *   async clean() {
 *     await this.tempCleanup.runOnce('local');
 *   }
 * }
 * ```
 */
@Injectable()
export class StorageTempCleanupService {
  constructor(private readonly storage: StorageService) {}

  /**
   * Scan the disk for expired temporary files and delete them.
   *
   * @param diskName - Name of the disk to scan (default: the default disk).
   * @returns Summary of deleted files and errors.
   */
  async runOnce(diskName?: string): Promise<TempCleanupResult> {
    const disk = this.storage.disk(diskName);

    // Only LocalDisk uses .ttl sidecar files
    if (!(disk instanceof LocalDisk)) {
      return { deleted: 0, errors: 0 };
    }

    let deleted = 0;
    let errors = 0;
    const now = Date.now();

    // Find all .ttl sidecar files
    let sidecarFiles: string[];
    try {
      const allFiles = await disk.allFiles();
      sidecarFiles = allFiles.filter((f) => f.endsWith('.ttl'));
    } catch {
      return { deleted: 0, errors: 1 };
    }

    for (const sidecarPath of sidecarFiles) {
      try {
        const raw = (await disk.get(sidecarPath, { responseType: 'string' })) as string;
        const { expiresAt } = JSON.parse(raw) as { expiresAt: number };

        if (now < expiresAt) continue; // not yet expired

        // Delete original file (sidecar path without the .ttl suffix)
        const originalPath = sidecarPath.slice(0, -'.ttl'.length);
        try {
          await disk.delete(originalPath);
        } catch {
          // Original may already be gone — that's fine
        }

        // Delete the sidecar
        await disk.delete(sidecarPath);
        deleted++;
      } catch {
        errors++;
      }
    }

    return { deleted, errors };
  }
}
