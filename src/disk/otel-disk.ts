import {
  ChecksumAlgorithm,
  CopyOptions,
  DeleteManyResult,
  FileMetadata,
  FilesystemContract,
  GetOptions,
  MoveOptions,
  MultipartUploadInit,
  MultipartUploadOptions,
  PutOptions,
  TemporaryUrlOptions,
} from '../interfaces/storage.interface';
import { DiskDecorator } from './disk-decorator';

/** Minimal subset of the OpenTelemetry Span API we use. */
interface OtelSpan {
  setAttributes(attrs: Record<string, string | number | boolean | undefined>): this;
  recordException(err: Error): void;
  end(): void;
}

/** Minimal subset of the OpenTelemetry Tracer API we use. */
interface OtelTracer {
  startSpan(name: string): OtelSpan;
}

function tryLoadTracer(diskName: string): OtelTracer | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api = require('@opentelemetry/api') as {
      trace: { getTracer(name: string): OtelTracer };
    };
    return api.trace.getTracer(`nestjs-storage/${diskName}`);
  } catch {
    return null;
  }
}

/**
 * `OtelDisk` is a decorator that wraps every storage operation in an
 * **OpenTelemetry span** for distributed tracing.
 *
 * The `@opentelemetry/api` package is an **optional peer dependency** — when it
 * is not installed, `OtelDisk` is a transparent no-op with zero overhead.
 *
 * Span attributes set on every operation:
 * - `storage.disk` — disk name
 * - `storage.driver` — detected driver name (e.g. `s3`, `local`)
 * - `storage.operation` — method name (e.g. `put`, `get`)
 * - `storage.path` — file path
 *
 * Use `StorageService.withTracing(diskName)` instead of constructing directly.
 *
 * @example
 * ```ts
 * const disk = storageService.withTracing('s3');
 * await disk.put('file.txt', 'data'); // → creates an OpenTelemetry span
 * ```
 */
export class OtelDisk extends DiskDecorator {
  private readonly tracer: OtelTracer | null;
  private readonly diskName: string;

  constructor(disk: FilesystemContract, diskName = 'storage') {
    super(disk);
    this.diskName = diskName;
    this.tracer = tryLoadTracer(diskName);
  }

  private async withSpan<T>(operation: string, path: string, fn: () => Promise<T>): Promise<T> {
    if (!this.tracer) return fn();

    const span = this.tracer.startSpan(`storage.${operation}`);
    span.setAttributes({
      'storage.disk': this.diskName,
      'storage.operation': operation,
      'storage.path': path,
    });

    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  }

  // ─── Traced operations ────────────────────────────────────────────────────

  override async exists(path: string): Promise<boolean> {
    return this.withSpan('exists', path, () => this.disk.exists(path));
  }

  override async get(
    path: string,
    options?: GetOptions,
  ): Promise<Buffer | NodeJS.ReadableStream | string> {
    return this.withSpan('get', path, () => this.disk.get(path, options));
  }

  override async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    return this.withSpan('put', path, () => this.disk.put(path, contents, options));
  }

  override async putFile(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    options?: PutOptions,
  ): Promise<string | false> {
    return this.withSpan('putFile', path, () => this.disk.putFile(path, file, options));
  }

  override async putFileAs(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    name: string,
    options?: PutOptions,
  ): Promise<string | false> {
    return this.withSpan('putFileAs', path, () => this.disk.putFileAs(path, file, name, options));
  }

  override async delete(path: string): Promise<boolean> {
    return this.withSpan('delete', path, () => this.disk.delete(path));
  }

  override async copy(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    return this.withSpan('copy', from, () => this.disk.copy(from, to, options));
  }

  override async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    return this.withSpan('move', from, () => this.disk.move(from, to, options));
  }

  override async size(path: string): Promise<number> {
    return this.withSpan('size', path, () => this.disk.size(path));
  }

  override async lastModified(path: string): Promise<number> {
    return this.withSpan('lastModified', path, () => this.disk.lastModified(path));
  }

  override async getMetadata<T extends FileMetadata = FileMetadata>(path: string): Promise<T> {
    return this.withSpan('getMetadata', path, () => this.disk.getMetadata<T>(path));
  }

  override async mimeType(path: string): Promise<string> {
    return this.withSpan('mimeType', path, () => this.disk.mimeType(path));
  }

  override async temporaryUrl(
    path: string,
    expiration: Date | number,
    options?: TemporaryUrlOptions,
  ): Promise<string> {
    return this.withSpan('temporaryUrl', path, () =>
      this.disk.temporaryUrl(path, expiration, options),
    );
  }

  override async initMultipartUpload(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    if (!this.disk.initMultipartUpload) throw new Error('Disk does not support multipart upload');
    return this.withSpan('initMultipartUpload', path, () =>
      this.disk.initMultipartUpload!(path, options),
    );
  }

  override async checksum(path: string, algorithm?: ChecksumAlgorithm): Promise<string> {
    if (!this.disk.checksum) throw new Error('Disk does not support checksum()');
    return this.withSpan('checksum', path, () => this.disk.checksum!(path, algorithm));
  }

  override async deleteMany(paths: string[]): Promise<DeleteManyResult> {
    if (!this.disk.deleteMany) throw new Error('Disk does not support deleteMany()');
    return this.withSpan('deleteMany', paths.join(','), () => this.disk.deleteMany!(paths));
  }

  /** Whether the OpenTelemetry tracer was successfully loaded. */
  get isTracingActive(): boolean {
    return this.tracer !== null;
  }
}
