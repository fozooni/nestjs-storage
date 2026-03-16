import { randomUUID } from 'crypto';

import { FileVersion, FilesystemContract, PutOptions } from '../interfaces/storage.interface';
import { streamToBuffer } from '../utils/storage.utils';
import { DiskDecorator } from './disk-decorator';

/**
 * VersionedDisk decorates any `FilesystemContract` with transparent file versioning.
 *
 * On every `put()`, the current file is snapshotted to:
 *   `.versions/{path}/{timestamp}_{uuid}`
 * before being overwritten.  All version files live within the same underlying
 * disk — no SDK-level bucket versioning is required.
 *
 * Use `StorageService.withVersioning(diskName)` to create.
 *
 * @example
 * ```ts
 * const disk = storage.withVersioning('local');
 *
 * await disk.put('report.pdf', v1);
 * await disk.put('report.pdf', v2);  // v1 is snapshotted automatically
 *
 * const versions = await disk.listVersions('report.pdf');
 * await disk.restoreVersion('report.pdf', versions[0].versionId);
 * ```
 */
export class VersionedDisk extends DiskDecorator {
  private static readonly VERSION_PREFIX = '.versions';

  constructor(disk: FilesystemContract) {
    super(disk);
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private versionKey(path: string, versionId: string): string {
    return `${VersionedDisk.VERSION_PREFIX}/${path}/${versionId}`;
  }

  private versionDir(path: string): string {
    return `${VersionedDisk.VERSION_PREFIX}/${path}`;
  }

  // ─── Write interception ───────────────────────────────────────────────────

  override async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    // Snapshot the current file before overwriting (best-effort — never blocks write)
    try {
      const exists = await this.disk.exists(path);
      if (exists) {
        const current = await this.disk.get(path);
        const versionId = `${Date.now()}_${randomUUID()}`;
        const vkey = this.versionKey(path, versionId);
        const buf = Buffer.isBuffer(current)
          ? current
          : typeof current === 'string'
            ? Buffer.from(current)
            : await streamToBuffer(current as NodeJS.ReadableStream);
        await this.disk.put(vkey, buf);
      }
    } catch {
      // Versioning failure must never block the actual write
    }
    return this.disk.put(path, contents, options);
  }

  // ─── Versioning API ───────────────────────────────────────────────────────

  override async listVersions(path: string): Promise<FileVersion[]> {
    const dir = this.versionDir(path);
    let versionFiles: string[];
    try {
      versionFiles = await this.disk.allFiles(dir);
    } catch {
      return [];
    }

    if (versionFiles.length === 0) return [];

    const versions: FileVersion[] = [];
    for (const vfile of versionFiles) {
      // vfile is the full stored path, e.g. ".versions/report.pdf/1700000000000_<uuid>"
      const versionId = vfile.split('/').pop() ?? vfile;
      try {
        const [size, lmTs] = await Promise.all([
          this.disk.size(vfile),
          this.disk.lastModified(vfile),
        ]);
        versions.push({
          versionId,
          size,
          lastModified: new Date(lmTs),
          isLatest: false,
        });
      } catch {
        // Skip unreadable/corrupt version entries
      }
    }

    // Sort by lastModified descending; mark the most-recent as isLatest
    versions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    if (versions.length > 0) versions[0].isLatest = true;

    return versions;
  }

  override async getVersion(path: string, versionId: string): Promise<Buffer> {
    const vkey = this.versionKey(path, versionId);
    const result = await this.disk.get(vkey);
    if (Buffer.isBuffer(result)) return result;
    if (typeof result === 'string') return Buffer.from(result);
    return streamToBuffer(result as NodeJS.ReadableStream);
  }

  override async restoreVersion(path: string, versionId: string): Promise<boolean> {
    const vkey = this.versionKey(path, versionId);
    // Copy the versioned file back to the original path (this triggers another snapshot)
    return this.disk.copy(vkey, path);
  }

  override async deleteVersion(path: string, versionId: string): Promise<boolean> {
    const vkey = this.versionKey(path, versionId);
    return this.disk.delete(vkey);
  }
}
