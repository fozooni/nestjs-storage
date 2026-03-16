import {
  FilesystemContract,
  PutOptions,
  QuotaOptions,
  QuotaStore,
} from '../interfaces/storage.interface';
import { StorageQuotaExceededError } from '../errors/storage-errors';
import { DiskDecorator } from './disk-decorator';

// ─── Default in-memory quota store ───────────────────────────────────────────

/**
 * Simple in-memory quota store backed by a `Map`.
 *
 * For distributed quota tracking, implement `QuotaStore` and pass it
 * to `QuotaDisk` constructor.
 */
export class MemoryQuotaStore implements QuotaStore {
  private readonly usage = new Map<string, number>();

  private key(prefix?: string): string {
    return prefix ?? '__global__';
  }

  async getUsage(prefix?: string): Promise<number> {
    return this.usage.get(this.key(prefix)) ?? 0;
  }

  async addUsage(prefix: string | undefined, bytes: number): Promise<void> {
    const k = this.key(prefix);
    this.usage.set(k, (this.usage.get(k) ?? 0) + bytes);
  }

  async removeUsage(prefix: string | undefined, bytes: number): Promise<void> {
    const k = this.key(prefix);
    const current = this.usage.get(k) ?? 0;
    this.usage.set(k, Math.max(0, current - bytes));
  }

  /** Reset all tracked usage. */
  reset(): void {
    this.usage.clear();
  }
}

// ─── QuotaDisk ────────────────────────────────────────────────────────────────

/**
 * `QuotaDisk` is a decorator that enforces a maximum storage quota.
 *
 * Before each `put()`, it checks whether the new content would exceed the
 * configured `maxBytes` limit. If it would, it throws `StorageQuotaExceededError`.
 *
 * After a successful write, it updates the quota store. After a successful
 * `delete()`, it releases the bytes (best-effort — requires `size()` to be
 * callable before deletion).
 *
 * Use `StorageService.withQuota(diskName, quotaStore, opts)` instead of constructing directly.
 *
 * @example
 * ```ts
 * const quotaStore = new MemoryQuotaStore();
 * const disk = storageService.withQuota('local', quotaStore, { maxBytes: 100 * 1024 * 1024 });
 * await disk.put('file.txt', Buffer.alloc(50 * 1024 * 1024)); // OK
 * await disk.put('file2.txt', Buffer.alloc(60 * 1024 * 1024)); // throws StorageQuotaExceededError
 * ```
 */
export class QuotaDisk extends DiskDecorator {
  private readonly quotaStore: QuotaStore;
  private readonly maxBytes: number;
  private readonly prefix: string | undefined;

  constructor(disk: FilesystemContract, quotaStore: QuotaStore, opts: QuotaOptions) {
    super(disk);
    this.quotaStore = quotaStore;
    this.maxBytes = opts.maxBytes;
    this.prefix = opts.prefix;
  }

  private async contentBytes(
    contents: string | Buffer | NodeJS.ReadableStream,
  ): Promise<{ size: number; buffered: Buffer }> {
    if (Buffer.isBuffer(contents)) return { size: contents.length, buffered: contents };
    if (typeof contents === 'string') {
      const buf = Buffer.from(contents, 'utf-8');
      return { size: buf.length, buffered: buf };
    }
    // Stream: buffer it to measure size
    const chunks: Buffer[] = [];
    for await (const chunk of contents) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
    }
    const buffered = Buffer.concat(chunks);
    return { size: buffered.length, buffered };
  }

  private async checkQuota(additionalBytes: number): Promise<void> {
    const used = await this.quotaStore.getUsage(this.prefix);
    if (used + additionalBytes > this.maxBytes) {
      throw new StorageQuotaExceededError(
        `Quota exceeded: ${used + additionalBytes} bytes requested, ` +
          `${this.maxBytes} bytes allowed (${used} bytes used).`,
        undefined,
        undefined,
      );
    }
  }

  override async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    const { size, buffered } = await this.contentBytes(contents);
    await this.checkQuota(size);
    const result = await this.disk.put(path, buffered, options);
    if (result) await this.quotaStore.addUsage(this.prefix, size);
    return result;
  }

  override async delete(path: string): Promise<boolean> {
    // Attempt to measure size before deletion for accurate quota tracking
    let fileSize = 0;
    try {
      fileSize = await this.disk.size(path);
    } catch {
      // Best-effort — if size() fails, we skip quota release
    }
    const result = await this.disk.delete(path);
    if (result && fileSize > 0) {
      await this.quotaStore.removeUsage(this.prefix, fileSize).catch(() => undefined);
    }
    return result;
  }

  /**
   * Returns the current quota usage and limit.
   *
   * @example
   * ```ts
   * const { used, limit, percent } = await quotaDisk.getUsage();
   * console.log(`Using ${used} of ${limit} bytes (${percent.toFixed(1)}%)`);
   * ```
   */
  async getUsage(): Promise<{ used: number; limit: number; percent: number }> {
    const used = await this.quotaStore.getUsage(this.prefix);
    return {
      used,
      limit: this.maxBytes,
      percent: this.maxBytes > 0 ? (used / this.maxBytes) * 100 : 0,
    };
  }
}
