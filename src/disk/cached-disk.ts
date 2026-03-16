import {
  CacheBackend,
  CacheOptions,
  CopyOptions,
  DeleteManyResult,
  FileMetadata,
  FilesystemContract,
  MoveOptions,
  PutOptions,
} from '../interfaces/storage.interface';
import { DiskDecorator } from './disk-decorator';

// ─── Default in-memory cache backend ────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt?: number;
}

/**
 * Simple in-memory cache backend backed by a `Map`.
 *
 * For distributed/Redis-backed caching, implement `CacheBackend` and pass it
 * to `CachedDisk` via `CacheOptions.backend`.
 */
export class MemoryCacheBackend implements CacheBackend {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: ttlMs !== undefined ? Date.now() + ttlMs : undefined,
    });
  }

  del(key: string): void {
    // Also invalidate any key that contains the path as a segment
    for (const k of this.store.keys()) {
      if (k === key || k.endsWith(':' + key)) {
        this.store.delete(k);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }
}

// ─── Cached methods ──────────────────────────────────────────────────────────

type CacheableMethod =
  | 'exists'
  | 'size'
  | 'lastModified'
  | 'mimeType'
  | 'getMetadata'
  | 'getVisibility';

// ─── CachedDisk ──────────────────────────────────────────────────────────────

/**
 * `CachedDisk` is a decorator that caches read-only metadata operations to
 * avoid redundant network calls.
 *
 * Cached operations: `exists`, `size`, `lastModified`, `mimeType`, `getMetadata`,
 * `getVisibility`. All write operations automatically invalidate the relevant
 * cache entries.
 *
 * By default uses an in-memory `MemoryCacheBackend`. You can plug in a
 * Redis-backed backend for distributed caching.
 *
 * Use `StorageService.cached(diskName, opts)` instead of constructing directly.
 *
 * @example
 * ```ts
 * const disk = storageService.cached('s3', { ttl: 60_000 });
 * await disk.exists('file.txt'); // → network call
 * await disk.exists('file.txt'); // → cache hit
 * await disk.put('file.txt', 'data'); // → invalidates cache
 * await disk.exists('file.txt'); // → network call again
 * ```
 */
export class CachedDisk extends DiskDecorator {
  private readonly cache: CacheBackend;
  private readonly globalTtl: number | undefined;
  private readonly ttlByMethod: Partial<Record<CacheableMethod, number>>;

  constructor(disk: FilesystemContract, opts?: CacheOptions & { backend?: CacheBackend }) {
    super(disk);
    this.cache = opts?.backend ?? new MemoryCacheBackend();
    this.globalTtl = opts?.ttl;
    this.ttlByMethod = opts?.ttlByMethod ?? {};
  }

  private ttlFor(method: CacheableMethod): number | undefined {
    return this.ttlByMethod[method] ?? this.globalTtl;
  }

  private cacheKey(method: string, path: string): string {
    return `${method}:${path}`;
  }

  private invalidate(path: string): void {
    this.cache.del(path);
  }

  // ─── Cached reads ─────────────────────────────────────────────────────────

  override async exists(path: string): Promise<boolean> {
    const key = this.cacheKey('exists', path);
    const cached = this.cache.get<boolean>(key);
    if (cached !== undefined) return cached;
    const result = await this.disk.exists(path);
    this.cache.set(key, result, this.ttlFor('exists'));
    return result;
  }

  override async size(path: string): Promise<number> {
    const key = this.cacheKey('size', path);
    const cached = this.cache.get<number>(key);
    if (cached !== undefined) return cached;
    const result = await this.disk.size(path);
    this.cache.set(key, result, this.ttlFor('size'));
    return result;
  }

  override async lastModified(path: string): Promise<number> {
    const key = this.cacheKey('lastModified', path);
    const cached = this.cache.get<number>(key);
    if (cached !== undefined) return cached;
    const result = await this.disk.lastModified(path);
    this.cache.set(key, result, this.ttlFor('lastModified'));
    return result;
  }

  override async mimeType(path: string): Promise<string> {
    const key = this.cacheKey('mimeType', path);
    const cached = this.cache.get<string>(key);
    if (cached !== undefined) return cached;
    const result = await this.disk.mimeType(path);
    this.cache.set(key, result, this.ttlFor('mimeType'));
    return result;
  }

  override async getMetadata<T extends FileMetadata = FileMetadata>(path: string): Promise<T> {
    const key = this.cacheKey('getMetadata', path);
    const cached = this.cache.get<T>(key);
    if (cached !== undefined) return cached;
    const result = await this.disk.getMetadata<T>(path);
    this.cache.set(key, result, this.ttlFor('getMetadata'));
    return result;
  }

  override async getVisibility(path: string): Promise<'private' | 'public'> {
    const key = this.cacheKey('getVisibility', path);
    const cached = this.cache.get<'private' | 'public'>(key);
    if (cached !== undefined) return cached;
    const result = await this.disk.getVisibility(path);
    this.cache.set(key, result, this.ttlFor('getVisibility'));
    return result;
  }

  // ─── Invalidating writes ──────────────────────────────────────────────────

  override async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    const result = await this.disk.put(path, contents, options);
    if (result) this.invalidate(path);
    return result;
  }

  override async putFile(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    options?: PutOptions,
  ): Promise<string | false> {
    const result = await this.disk.putFile(path, file, options);
    if (result !== false) this.invalidate(result);
    return result;
  }

  override async putFileAs(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    name: string,
    options?: PutOptions,
  ): Promise<string | false> {
    const result = await this.disk.putFileAs(path, file, name, options);
    if (result !== false) this.invalidate(result);
    return result;
  }

  override async delete(path: string): Promise<boolean> {
    const result = await this.disk.delete(path);
    if (result) this.invalidate(path);
    return result;
  }

  override async copy(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    const result = await this.disk.copy(from, to, options);
    if (result) this.invalidate(to);
    return result;
  }

  override async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    const result = await this.disk.move(from, to, options);
    if (result) {
      this.invalidate(from);
      this.invalidate(to);
    }
    return result;
  }

  override async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    const result = await this.disk.setVisibility(path, visibility);
    if (result) this.invalidate(path);
    return result;
  }

  override async deleteMany(paths: string[]): Promise<DeleteManyResult> {
    if (!this.disk.deleteMany) throw new Error('Disk does not support deleteMany()');
    const result = await this.disk.deleteMany(paths);
    for (const p of result.succeeded) this.invalidate(p);
    return result;
  }

  override async deleteDirectory(directory: string): Promise<boolean> {
    const result = await this.disk.deleteDirectory(directory);
    if (result) this.cache.clear(); // Can't know what's under the directory
    return result;
  }

  /** Clear the entire cache manually. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Access the underlying cache backend (for inspection or manual control). */
  get cacheBackend(): CacheBackend {
    return this.cache;
  }
}
