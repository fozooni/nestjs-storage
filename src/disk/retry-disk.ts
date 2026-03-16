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
  MultipartUploadPart,
  RetryOptions,
  TemporaryUrlOptions,
} from '../interfaces/storage.interface';
import {
  StorageConfigurationError,
  StorageFileNotFoundError,
  StorageNetworkError,
  StoragePermissionError,
} from '../errors/storage-errors';
import { StorageEventsService } from '../events/storage-events.service';
import { StorageEvents } from '../events/storage-events.constants';
import { DiskDecorator } from './disk-decorator';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY = 100;
const DEFAULT_MAX_DELAY = 10_000;
const DEFAULT_FACTOR = 2;

function defaultRetryOn(err: unknown): boolean {
  if (err instanceof StorageFileNotFoundError) return false;
  if (err instanceof StoragePermissionError) return false;
  if (err instanceof StorageConfigurationError) return false;
  if (err instanceof StorageNetworkError) return true;
  return false;
}

function computeDelay(attempt: number, opts: Required<Omit<RetryOptions, 'retryOn'>>): number {
  const base = Math.min(opts.maxDelay, opts.baseDelay * Math.pow(opts.factor, attempt));
  return opts.jitter ? Math.random() * base : base;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `RetryDisk` is a decorator that automatically retries transient storage failures
 * using **full-jitter exponential backoff**.
 *
 * By default, retries are triggered only on `StorageNetworkError`.
 * Non-retryable errors (`StorageFileNotFoundError`, `StoragePermissionError`,
 * `StorageConfigurationError`) are re-thrown immediately.
 *
 * Use `StorageService.withRetry(diskName, opts)` instead of constructing directly.
 *
 * @example
 * ```ts
 * const disk = storageService.withRetry('s3', { maxRetries: 5, baseDelay: 200 });
 * // If S3 returns a transient error, it retries up to 5 times with jitter backoff
 * await disk.get('file.txt');
 * ```
 */
export class RetryDisk extends DiskDecorator {
  private readonly maxRetries: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly factor: number;
  private readonly jitter: boolean;
  private readonly retryOn: (err: unknown) => boolean;
  private readonly storageEvents?: StorageEventsService;
  private readonly diskName: string;

  constructor(
    disk: FilesystemContract,
    opts?: RetryOptions,
    storageEvents?: StorageEventsService,
    diskName = 'unknown',
  ) {
    super(disk);
    this.maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelay = opts?.baseDelay ?? DEFAULT_BASE_DELAY;
    this.maxDelay = opts?.maxDelay ?? DEFAULT_MAX_DELAY;
    this.factor = opts?.factor ?? DEFAULT_FACTOR;
    this.jitter = opts?.jitter ?? true;
    this.retryOn = opts?.retryOn ?? defaultRetryOn;
    this.storageEvents = storageEvents;
    this.diskName = diskName;
  }

  private async withRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;

        if (attempt === this.maxRetries || !this.retryOn(err)) {
          throw err;
        }

        const delay = computeDelay(attempt, {
          maxRetries: this.maxRetries,
          baseDelay: this.baseDelay,
          maxDelay: this.maxDelay,
          factor: this.factor,
          jitter: this.jitter,
        });

        this.storageEvents?.emit(StorageEvents.RETRY, {
          disk: this.diskName,
          operation,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          delay,
          error: err,
          timestamp: new Date(),
        });

        await sleep(delay);
      }
    }

    throw lastError;
  }

  // ─── Retried operations ───────────────────────────────────────────────────

  override async exists(path: string): Promise<boolean> {
    return this.withRetry('exists', () => this.disk.exists(path));
  }

  override async get(
    path: string,
    options?: GetOptions,
  ): Promise<Buffer | NodeJS.ReadableStream | string> {
    return this.withRetry('get', () => this.disk.get(path, options));
  }

  override async delete(path: string): Promise<boolean> {
    return this.withRetry('delete', () => this.disk.delete(path));
  }

  override async copy(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    return this.withRetry('copy', () => this.disk.copy(from, to, options));
  }

  override async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    return this.withRetry('move', () => this.disk.move(from, to, options));
  }

  override async size(path: string): Promise<number> {
    return this.withRetry('size', () => this.disk.size(path));
  }

  override async lastModified(path: string): Promise<number> {
    return this.withRetry('lastModified', () => this.disk.lastModified(path));
  }

  override async files(directory?: string, recursive?: boolean): Promise<string[]> {
    return this.withRetry('files', () => this.disk.files(directory, recursive));
  }

  override async allFiles(directory?: string): Promise<string[]> {
    return this.withRetry('allFiles', () => this.disk.allFiles(directory));
  }

  override async directories(directory?: string, recursive?: boolean): Promise<string[]> {
    return this.withRetry('directories', () => this.disk.directories(directory, recursive));
  }

  override async allDirectories(directory?: string): Promise<string[]> {
    return this.withRetry('allDirectories', () => this.disk.allDirectories(directory));
  }

  override async makeDirectory(path: string): Promise<boolean> {
    return this.withRetry('makeDirectory', () => this.disk.makeDirectory(path));
  }

  override async deleteDirectory(directory: string): Promise<boolean> {
    return this.withRetry('deleteDirectory', () => this.disk.deleteDirectory(directory));
  }

  override async getVisibility(path: string): Promise<'private' | 'public'> {
    return this.withRetry('getVisibility', () => this.disk.getVisibility(path));
  }

  override async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    return this.withRetry('setVisibility', () => this.disk.setVisibility(path, visibility));
  }

  override async temporaryUrl(
    path: string,
    expiration: Date | number,
    options?: TemporaryUrlOptions,
  ): Promise<string> {
    return this.withRetry('temporaryUrl', () => this.disk.temporaryUrl(path, expiration, options));
  }

  override async prepend(path: string, data: string): Promise<boolean> {
    return this.withRetry('prepend', () => this.disk.prepend(path, data));
  }

  override async append(path: string, data: string): Promise<boolean> {
    return this.withRetry('append', () => this.disk.append(path, data));
  }

  override async getMetadata<T extends FileMetadata = FileMetadata>(path: string): Promise<T> {
    return this.withRetry('getMetadata', () => this.disk.getMetadata<T>(path));
  }

  override async mimeType(path: string): Promise<string> {
    return this.withRetry('mimeType', () => this.disk.mimeType(path));
  }

  override async directorySize(directory?: string): Promise<number> {
    return this.withRetry('directorySize', () => this.disk.directorySize(directory));
  }

  override async initMultipartUpload(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    if (!this.disk.initMultipartUpload) throw new Error('Disk does not support multipart upload');
    return this.withRetry('initMultipartUpload', () =>
      this.disk.initMultipartUpload!(path, options),
    );
  }

  override async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    path: string,
  ): Promise<MultipartUploadPart> {
    if (!this.disk.uploadPart) throw new Error('Disk does not support multipart upload');
    return this.withRetry('uploadPart', () =>
      this.disk.uploadPart!(uploadId, partNumber, data, path),
    );
  }

  override async completeMultipartUpload(
    uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean> {
    if (!this.disk.completeMultipartUpload)
      throw new Error('Disk does not support multipart upload');
    return this.withRetry('completeMultipartUpload', () =>
      this.disk.completeMultipartUpload!(uploadId, path, parts),
    );
  }

  override async abortMultipartUpload(uploadId: string, path: string): Promise<boolean> {
    if (!this.disk.abortMultipartUpload) throw new Error('Disk does not support multipart upload');
    return this.withRetry('abortMultipartUpload', () =>
      this.disk.abortMultipartUpload!(uploadId, path),
    );
  }

  override async checksum(path: string, algorithm?: ChecksumAlgorithm): Promise<string> {
    if (!this.disk.checksum) throw new Error('Disk does not support checksum()');
    return this.withRetry('checksum', () => this.disk.checksum!(path, algorithm));
  }

  override async deleteMany(paths: string[]): Promise<DeleteManyResult> {
    if (!this.disk.deleteMany) throw new Error('Disk does not support deleteMany()');
    return this.withRetry('deleteMany', () => this.disk.deleteMany!(paths));
  }

  // put, putFile, putFileAs, putFileMultipart — not retried (may have side effects)
}
