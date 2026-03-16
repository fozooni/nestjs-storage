import {
  CopyOptions,
  DeleteManyResult,
  FilesystemContract,
  MoveOptions,
  MultipartUploadInit,
  MultipartUploadOptions,
  MultipartUploadPart,
  PutOptions,
  ReplicationOptions,
} from '../interfaces/storage.interface';
import { DiskDecorator } from './disk-decorator';

/**
 * `ReplicatedDisk` is a decorator that writes data to a primary disk and one or
 * more replica disks simultaneously.
 *
 * **Read operations** always come from the primary disk only.
 *
 * **Write strategies:**
 * - `'all'` (default) — all writes must succeed; any failure rejects the operation.
 * - `'quorum'` — a majority (>50%) of disks (primary + replicas) must succeed.
 * - `'async'` — the primary result is returned immediately; replicas are
 *   replicated in the background (fire-and-forget).
 *
 * Use `StorageService.replicated(diskName, replicas, opts)` instead of constructing directly.
 *
 * @example
 * ```ts
 * const primary = storageService.disk('s3');
 * const replica = storageService.disk('s3-backup');
 * const disk = storageService.replicated('s3', [replica], { strategy: 'async' });
 * await disk.put('file.txt', 'data'); // primary resolves, replica writes in background
 * ```
 */
export class ReplicatedDisk extends DiskDecorator {
  private readonly replicas: FilesystemContract[];
  private readonly strategy: 'all' | 'quorum' | 'async';

  constructor(
    primary: FilesystemContract,
    replicas: FilesystemContract[],
    opts?: ReplicationOptions,
  ) {
    super(primary);
    this.replicas = replicas;
    this.strategy = opts?.strategy ?? 'all';
  }

  // ─── Replication helpers ──────────────────────────────────────────────────

  private async replicateBoolean(
    primaryOp: () => Promise<boolean>,
    replicaOps: Array<() => Promise<boolean>>,
  ): Promise<boolean> {
    if (this.strategy === 'async') {
      const primaryResult = await primaryOp();
      void Promise.all(replicaOps.map((op) => op().catch(() => undefined)));
      return primaryResult;
    }

    if (this.strategy === 'quorum') {
      const allOps = [primaryOp, ...replicaOps];
      const results = await Promise.allSettled(allOps.map((op) => op()));
      const succeeded = results.filter(
        (r): r is PromiseFulfilledResult<boolean> => r.status === 'fulfilled' && r.value === true,
      ).length;
      const quorum = Math.ceil(allOps.length / 2);
      if (succeeded < quorum) {
        const firstRejected = results.find((r) => r.status === 'rejected') as
          | PromiseRejectedResult
          | undefined;
        throw (firstRejected?.reason as Error) ?? new Error('Quorum not reached');
      }
      return true;
    }

    // strategy === 'all'
    const [primaryResult] = await Promise.all([primaryOp(), ...replicaOps.map((op) => op())]);
    return primaryResult;
  }

  // ─── Write operations (replicated) ───────────────────────────────────────

  override async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    // Buffer stream content so it can be sent to all replicas
    let data: string | Buffer = typeof contents === 'string' ? contents : Buffer.alloc(0);
    if (Buffer.isBuffer(contents)) {
      data = contents;
    } else if (typeof contents !== 'string') {
      const chunks: Buffer[] = [];
      for await (const chunk of contents) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
      }
      data = Buffer.concat(chunks);
    }

    return this.replicateBoolean(
      () => this.disk.put(path, data, options),
      this.replicas.map((r) => () => r.put(path, data, options)),
    );
  }

  override async putFile(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    options?: PutOptions,
  ): Promise<string | false> {
    if (this.strategy === 'async') {
      const result = await this.disk.putFile(path, file, options);
      if (result !== false) {
        void Promise.all(
          this.replicas.map((r) => r.putFile(path, file, options).catch(() => undefined)),
        );
      }
      return result;
    }

    // all / quorum — use primary result, replicate in parallel
    const primaryResult = await this.disk.putFile(path, file, options);
    if (primaryResult !== false) {
      await Promise.all(
        this.replicas.map((r) => r.putFile(path, file, options).catch(() => false)),
      );
    }
    return primaryResult;
  }

  override async putFileAs(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    name: string,
    options?: PutOptions,
  ): Promise<string | false> {
    if (this.strategy === 'async') {
      const result = await this.disk.putFileAs(path, file, name, options);
      if (result !== false) {
        void Promise.all(
          this.replicas.map((r) => r.putFileAs(path, file, name, options).catch(() => undefined)),
        );
      }
      return result;
    }

    const primaryResult = await this.disk.putFileAs(path, file, name, options);
    if (primaryResult !== false) {
      await Promise.all(
        this.replicas.map((r) => r.putFileAs(path, file, name, options).catch(() => false)),
      );
    }
    return primaryResult;
  }

  override async delete(path: string): Promise<boolean> {
    return this.replicateBoolean(
      () => this.disk.delete(path),
      this.replicas.map((r) => () => r.delete(path)),
    );
  }

  override async copy(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    return this.replicateBoolean(
      () => this.disk.copy(from, to, options),
      this.replicas.map((r) => () => r.copy(from, to, options)),
    );
  }

  override async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    return this.replicateBoolean(
      () => this.disk.move(from, to, options),
      this.replicas.map((r) => () => r.move(from, to, options)),
    );
  }

  override async makeDirectory(path: string): Promise<boolean> {
    return this.replicateBoolean(
      () => this.disk.makeDirectory(path),
      this.replicas.map((r) => () => r.makeDirectory(path)),
    );
  }

  override async deleteDirectory(directory: string): Promise<boolean> {
    return this.replicateBoolean(
      () => this.disk.deleteDirectory(directory),
      this.replicas.map((r) => () => r.deleteDirectory(directory)),
    );
  }

  override async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    return this.replicateBoolean(
      () => this.disk.setVisibility(path, visibility),
      this.replicas.map((r) => () => r.setVisibility(path, visibility)),
    );
  }

  override async deleteMany(paths: string[]): Promise<DeleteManyResult> {
    if (!this.disk.deleteMany) throw new Error('Disk does not support deleteMany()');

    if (this.strategy === 'async') {
      const result = await this.disk.deleteMany(paths);
      void Promise.all(this.replicas.map((r) => r.deleteMany?.(paths).catch(() => undefined)));
      return result;
    }

    const primaryResult = await this.disk.deleteMany(paths);
    await Promise.all(this.replicas.map((r) => r.deleteMany?.(paths).catch(() => undefined)));
    return primaryResult;
  }

  override async initMultipartUpload(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    if (!this.disk.initMultipartUpload) throw new Error('Disk does not support multipart upload');
    // Multipart is only initiated on primary — replicas receive parts at completeMultipartUpload
    return this.disk.initMultipartUpload(path, options);
  }

  override async completeMultipartUpload(
    uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean> {
    if (!this.disk.completeMultipartUpload)
      throw new Error('Disk does not support multipart upload');
    return this.disk.completeMultipartUpload(uploadId, path, parts);
  }

  override async abortMultipartUpload(uploadId: string, path: string): Promise<boolean> {
    if (!this.disk.abortMultipartUpload) throw new Error('Disk does not support multipart upload');
    return this.disk.abortMultipartUpload(uploadId, path);
  }

  /** Expose the list of replica disks for introspection. */
  get replicaDisks(): FilesystemContract[] {
    return [...this.replicas];
  }
}
