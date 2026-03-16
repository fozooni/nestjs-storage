import {
  CopyOptions,
  DeleteManyResult,
  FileMetadata,
  FilesystemContract,
  GetOptions,
  MoveOptions,
  MultipartUploadInit,
  MultipartUploadOptions,
  MultipartUploadPart,
  PutOptions,
  StorageRoute,
  TemporaryUrlOptions,
} from '../interfaces/storage.interface';
import { DiskDecorator } from './disk-decorator';

// ─── Built-in route factory functions ────────────────────────────────────────

/**
 * Route files to `disk` if the path ends with one of the given extensions.
 * Works for both reads and writes.
 *
 * @example
 * ```ts
 * byExtension(['.jpg', '.png', '.webp'], imageDisk)
 * ```
 */
export function byExtension(extensions: string[], disk: FilesystemContract): StorageRoute {
  const normalised = extensions.map((e) => (e.startsWith('.') ? e : `.${e}`).toLowerCase());
  return {
    match(path: string): boolean {
      const lower = path.toLowerCase();
      return normalised.some((ext) => lower.endsWith(ext));
    },
    disk,
  };
}

/**
 * Route files to `disk` if the path starts with the given prefix.
 * Works for both reads and writes.
 *
 * @example
 * ```ts
 * byPrefix('uploads/docs/', docDisk)
 * ```
 */
export function byPrefix(prefix: string, disk: FilesystemContract): StorageRoute {
  return {
    match(path: string): boolean {
      return path.startsWith(prefix);
    },
    disk,
  };
}

/**
 * Route files to `disk` if the mimetype matches one of the given types.
 * Only effective at **write** time (mimetype is unknown at read time).
 *
 * @example
 * ```ts
 * byMimeType(['image/jpeg', 'image/png'], imageDisk)
 * ```
 */
export function byMimeType(mimetypes: string[], disk: FilesystemContract): StorageRoute {
  return {
    match(_path: string, mimetype?: string): boolean {
      if (!mimetype) return false;
      return mimetypes.includes(mimetype);
    },
    disk,
  };
}

/**
 * Route files to `disk` if the content size is at most `maxBytes`.
 * Only effective at **write** time (size is unknown at read time).
 *
 * @example
 * ```ts
 * bySize(5 * 1024 * 1024, smallFilesDisk)   // ≤ 5 MB
 * ```
 */
export function bySize(maxBytes: number, disk: FilesystemContract): StorageRoute {
  return {
    match(_path: string, _mimetype?: string, size?: number): boolean {
      if (size === undefined) return false;
      return size <= maxBytes;
    },
    disk,
  };
}

/**
 * Route files using a fully custom match function.
 *
 * @example
 * ```ts
 * custom((path) => path.includes('/private/'), privateDisk)
 * ```
 */
export function custom(
  fn: (path: string, mimetype?: string, size?: number) => boolean,
  disk: FilesystemContract,
): StorageRoute {
  return { match: fn, disk };
}

// ─── RouterDisk ───────────────────────────────────────────────────────────────

/**
 * RouterDisk routes reads and writes to different underlying disks based on
 * configurable rules.
 *
 * Write routing: the first matching route wins; falls back to `defaultDisk`.
 * Read  routing: same path-based rules (byExtension / byPrefix); falls back
 * to `defaultDisk`. Size- and mimetype-based rules are skipped at read time
 * because the content is not yet known.
 *
 * Use `StorageService.withRouting(routes, defaultDisk)` to create.
 *
 * @example
 * ```ts
 * const disk = storage.withRouting(
 *   [
 *     byExtension(['.jpg', '.png'], imageDisk),
 *     byPrefix('docs/', docsDisk),
 *   ],
 *   storage.disk('default'),
 * );
 * await disk.put('avatar.jpg', buffer);  // → imageDisk
 * await disk.put('docs/report.pdf', pdf); // → docsDisk
 * await disk.put('data.json', json);     // → default
 * ```
 */
export class RouterDisk extends DiskDecorator {
  private readonly routes: StorageRoute[];

  constructor(defaultDisk: FilesystemContract, routes: StorageRoute[]) {
    super(defaultDisk);
    this.routes = routes;
  }

  // ─── Route resolution ─────────────────────────────────────────────────────

  /**
   * Resolves the disk to use for **write** operations.
   * Considers all match criteria: path, mimetype, and size.
   */
  private resolveWriteDisk(path: string, mimetype?: string, size?: number): FilesystemContract {
    for (const route of this.routes) {
      if (route.match(path, mimetype, size)) return route.disk;
    }
    return this.disk; // defaultDisk
  }

  /**
   * Resolves the disk to use for **read** operations.
   * Only path-based rules (byExtension / byPrefix) apply deterministically;
   * size/mimetype rules are not evaluated.
   */
  private resolveReadDisk(path: string): FilesystemContract {
    for (const route of this.routes) {
      if (route.match(path, undefined, undefined)) return route.disk;
    }
    return this.disk; // defaultDisk
  }

  // ─── Write operations (use resolveWriteDisk) ──────────────────────────────

  override async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    const size = Buffer.isBuffer(contents)
      ? contents.length
      : typeof contents === 'string'
        ? Buffer.byteLength(contents)
        : undefined;
    const target = this.resolveWriteDisk(path, options?.mimetype, size);
    return target.put(path, contents, options);
  }

  override async putFile(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    options?: PutOptions,
  ): Promise<string | false> {
    const size = file?.size as number | undefined;
    const mimetype = file?.mimetype as string | undefined;
    const target = this.resolveWriteDisk(path, options?.mimetype ?? mimetype, size);
    return target.putFile(path, file, options);
  }

  override async putFileAs(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    name: string,
    options?: PutOptions,
  ): Promise<string | false> {
    const size = file?.size as number | undefined;
    const mimetype = file?.mimetype as string | undefined;
    const target = this.resolveWriteDisk(path, options?.mimetype ?? mimetype, size);
    return target.putFileAs(path, file, name, options);
  }

  override async delete(path: string): Promise<boolean> {
    return this.resolveWriteDisk(path).delete(path);
  }

  override async copy(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    const srcDisk = this.resolveReadDisk(from);
    const dstDisk = this.resolveWriteDisk(to);
    if (srcDisk === dstDisk) return srcDisk.copy(from, to, options);
    // Cross-disk copy: read from source, write to destination
    const content = await srcDisk.get(from);
    return dstDisk.put(to, content as Buffer, options);
  }

  override async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    const srcDisk = this.resolveReadDisk(from);
    const dstDisk = this.resolveWriteDisk(to);
    if (srcDisk === dstDisk) return srcDisk.move(from, to, options);
    // Cross-disk move: copy then delete
    const content = await srcDisk.get(from);
    const success = await dstDisk.put(to, content as Buffer, options);
    if (success) await srcDisk.delete(from);
    return success;
  }

  override async deleteMany(paths: string[]): Promise<DeleteManyResult> {
    const succeeded: string[] = [];
    const failed: string[] = [];
    await Promise.allSettled(
      paths.map(async (p) => {
        const result = await this.resolveWriteDisk(p).delete(p);
        if (result) {
          succeeded.push(p);
        } else {
          failed.push(p);
        }
      }),
    );
    return { succeeded, failed };
  }

  override async makeDirectory(path: string): Promise<boolean> {
    return this.resolveWriteDisk(path).makeDirectory(path);
  }

  override async deleteDirectory(directory: string): Promise<boolean> {
    return this.resolveWriteDisk(directory).deleteDirectory(directory);
  }

  override async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    return this.resolveWriteDisk(path).setVisibility(path, visibility);
  }

  override async prepend(path: string, data: string): Promise<boolean> {
    return this.resolveWriteDisk(path).prepend(path, data);
  }

  override async append(path: string, data: string): Promise<boolean> {
    return this.resolveWriteDisk(path).append(path, data);
  }

  // ─── Multipart uploads (routed by path) ──────────────────────────────────

  override async initMultipartUpload(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    const target = this.resolveWriteDisk(path);
    if (!target.initMultipartUpload) throw new Error('Disk does not support multipart upload');
    return target.initMultipartUpload(path, options);
  }

  override async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    path: string,
  ): Promise<MultipartUploadPart> {
    const target = this.resolveWriteDisk(path);
    if (!target.uploadPart) throw new Error('Disk does not support multipart upload');
    return target.uploadPart(uploadId, partNumber, data, path);
  }

  override async completeMultipartUpload(
    uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean> {
    const target = this.resolveWriteDisk(path);
    if (!target.completeMultipartUpload) throw new Error('Disk does not support multipart upload');
    return target.completeMultipartUpload(uploadId, path, parts);
  }

  override async abortMultipartUpload(uploadId: string, path: string): Promise<boolean> {
    const target = this.resolveWriteDisk(path);
    if (!target.abortMultipartUpload) throw new Error('Disk does not support multipart upload');
    return target.abortMultipartUpload(uploadId, path);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async putFileMultipart(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    options?: MultipartUploadOptions,
  ): Promise<string | false> {
    const target = this.resolveWriteDisk(path);
    if (!target.putFileMultipart) throw new Error('Disk does not support multipart upload');
    return target.putFileMultipart(path, file, options);
  }

  // ─── Read operations (use resolveReadDisk) ────────────────────────────────

  override async exists(path: string): Promise<boolean> {
    return this.resolveReadDisk(path).exists(path);
  }

  override async get(
    path: string,
    options?: GetOptions,
  ): Promise<Buffer | NodeJS.ReadableStream | string> {
    return this.resolveReadDisk(path).get(path, options);
  }

  override async size(path: string): Promise<number> {
    return this.resolveReadDisk(path).size(path);
  }

  override async lastModified(path: string): Promise<number> {
    return this.resolveReadDisk(path).lastModified(path);
  }

  override async mimeType(path: string): Promise<string> {
    return this.resolveReadDisk(path).mimeType(path);
  }

  override async getMetadata<T extends FileMetadata = FileMetadata>(path: string): Promise<T> {
    return this.resolveReadDisk(path).getMetadata<T>(path);
  }

  override async getVisibility(path: string): Promise<'private' | 'public'> {
    return this.resolveReadDisk(path).getVisibility(path);
  }

  override async files(directory?: string, recursive?: boolean): Promise<string[]> {
    return this.resolveReadDisk(directory ?? '').files(directory, recursive);
  }

  override async allFiles(directory?: string): Promise<string[]> {
    return this.resolveReadDisk(directory ?? '').allFiles(directory);
  }

  override async directories(directory?: string, recursive?: boolean): Promise<string[]> {
    return this.resolveReadDisk(directory ?? '').directories(directory, recursive);
  }

  override async allDirectories(directory?: string): Promise<string[]> {
    return this.resolveReadDisk(directory ?? '').allDirectories(directory);
  }

  override url(path: string): string {
    return this.resolveReadDisk(path).url(path);
  }

  override async temporaryUrl(
    path: string,
    expiration: Date | number,
    options?: TemporaryUrlOptions,
  ): Promise<string> {
    return this.resolveReadDisk(path).temporaryUrl(path, expiration, options);
  }

  override async directorySize(directory?: string): Promise<number> {
    return this.resolveReadDisk(directory ?? '').directorySize(directory);
  }
}
