import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { Readable } from 'stream';

import {
  ChecksumAlgorithm,
  CopyOptions,
  DeleteManyResult,
  DiskConfig,
  FileMetadata,
  FilesystemContract,
  GetOptions,
  MoveOptions,
  MultipartUploadInit,
  MultipartUploadOptions,
  MultipartUploadPart,
  PresignedPostData,
  PresignedPostOptions,
  PutOptions,
  TemporaryUrlOptions,
} from '../interfaces/storage.interface';
import {
  StorageConfigurationError,
  StorageFileNotFoundError,
  StorageNetworkError,
  StoragePermissionError,
} from '../errors/storage-errors';
import {
  getContentType,
  getFilename,
  isStream,
  joinPaths,
  sanitizePath,
  streamToBuffer,
  streamToString,
} from '../utils/storage.utils';
import { ScopedDisk } from './scoped-disk';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AzureSDK = Record<string, any>;

function loadAzureSdk(): AzureSDK {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@azure/storage-blob');
  } catch {
    throw new StorageConfigurationError(
      'Install @azure/storage-blob to use AzureDisk: npm install @azure/storage-blob',
      'azure',
    );
  }
}

function mapAzureError(error: unknown, diskName: string, path?: string): never {
  const err = error as { statusCode?: number; code?: string; message?: string; stack?: string };
  const cause = error instanceof Error ? error : undefined;
  const msg = err?.message ?? 'Unknown Azure error';

  if (
    err?.statusCode === 404 ||
    err?.code === 'BlobNotFound' ||
    err?.code === 'ContainerNotFound'
  ) {
    throw new StorageFileNotFoundError(msg, diskName, path, cause);
  }
  if (err?.statusCode === 403 || err?.statusCode === 401) {
    throw new StoragePermissionError(msg, diskName, path, cause);
  }
  throw new StorageNetworkError(msg, diskName, path, cause);
}

/**
 * Azure Blob Storage driver implementing the full `FilesystemContract`.
 *
 * Requires `@azure/storage-blob` as an optional peer dependency.
 *
 * Authentication: supply either `accountKey` (shared-key) or `sasToken` (SAS).
 * The container is identified by `config.containerName` (falls back to `config.bucket`).
 *
 * @example
 * ```ts
 * StorageModule.forRoot({
 *   default: 'azure',
 *   disks: {
 *     azure: {
 *       driver: 'azure',
 *       accountName: 'myaccount',
 *       accountKey: 'base64-key==',
 *       containerName: 'uploads',
 *     },
 *   },
 * });
 * ```
 */
export class AzureDisk implements FilesystemContract {
  protected config: DiskConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private containerClient: any;
  private readonly diskName = 'azure';

  constructor(config: DiskConfig) {
    this.config = config;
    this.validateConfig();

    const sdk = loadAzureSdk();
    const container = config.containerName ?? config.bucket;

    if (config.accountKey) {
      const credential = new sdk.StorageSharedKeyCredential(config.accountName, config.accountKey);
      const serviceUrl = `https://${config.accountName}.blob.core.windows.net`;
      const serviceClient = new sdk.BlobServiceClient(serviceUrl, credential);
      this.containerClient = serviceClient.getContainerClient(container);
    } else {
      // SAS token — append to service URL
      const sasUrl = `https://${config.accountName}.blob.core.windows.net?${config.sasToken}`;
      const serviceClient = new sdk.BlobServiceClient(sasUrl);
      this.containerClient = serviceClient.getContainerClient(container);
    }
  }

  private validateConfig(): void {
    const missing: string[] = [];
    if (!this.config.accountName) missing.push('accountName');
    if (!this.config.accountKey && !this.config.sasToken) missing.push('accountKey or sasToken');
    const container = this.config.containerName ?? this.config.bucket;
    if (!container) missing.push('containerName');

    if (missing.length > 0) {
      throw new StorageConfigurationError(
        `Azure configuration missing required fields: ${missing.join(', ')}`,
        this.diskName,
      );
    }
  }

  // ─── Core Operations ────────────────────────────────────────────────────────

  async exists(path: string): Promise<boolean> {
    try {
      const key = sanitizePath(path);
      const blobClient = this.containerClient.getBlobClient(key);
      return await blobClient.exists();
    } catch {
      return false;
    }
  }

  async get(path: string, options?: GetOptions): Promise<Buffer | NodeJS.ReadableStream | string> {
    const key = sanitizePath(path);
    try {
      const blobClient = this.containerClient.getBlobClient(key);
      const downloadResponse = await blobClient.download();

      const responseType = options?.responseType ?? 'buffer';

      if (responseType === 'stream') {
        return downloadResponse.readableStreamBody as NodeJS.ReadableStream;
      } else if (responseType === 'string') {
        return await streamToString(downloadResponse.readableStreamBody);
      } else {
        return await streamToBuffer(downloadResponse.readableStreamBody);
      }
    } catch (e) {
      mapAzureError(e, this.diskName, path);
    }
  }

  async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    const key = sanitizePath(path);
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(key);

      let buffer: Buffer;
      if (typeof contents === 'string') {
        buffer = Buffer.from(contents, 'utf-8');
      } else if (Buffer.isBuffer(contents)) {
        buffer = contents;
      } else {
        buffer = await streamToBuffer(contents as Readable);
      }

      const blobHTTPHeaders = {
        blobContentType: options?.mimetype ?? getContentType(path),
        blobCacheControl: options?.CacheControl,
        blobContentDisposition: options?.ContentDisposition,
        blobContentEncoding: options?.ContentEncoding,
        blobContentLanguage: options?.ContentLanguage,
      };

      const metadata = options?.metadata
        ? Object.fromEntries(Object.entries(options.metadata).map(([k, v]) => [k, String(v)]))
        : undefined;

      await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders,
        metadata,
      });

      return true;
    } catch (e) {
      if (this.config.throw !== false) {
        mapAzureError(e, this.diskName, path);
      }
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async putFile(path: string, file: any, options?: PutOptions): Promise<string | false> {
    let contents: Buffer | NodeJS.ReadableStream;
    let originalName: string;

    if (file.buffer) {
      contents = file.buffer;
      originalName = file.originalname ?? file.filename ?? 'upload';
    } else if (file.path) {
      contents = createReadStream(file.path);
      originalName = getFilename(file.path) ?? 'upload';
    } else if (isStream(file)) {
      contents = file;
      originalName = options?.filename ?? 'upload';
    } else {
      contents = Buffer.from(file);
      originalName = options?.filename ?? 'upload';
    }

    const strategy = options?.namingStrategy ?? this.config.namingStrategy;
    const filename = strategy ? await strategy.generate(file, originalName) : originalName;

    const fullPath = joinPaths(path, filename);
    const success = await this.put(fullPath, contents, options);
    return success ? fullPath : false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async putFileAs(
    path: string,
    file: any,
    name: string,
    options?: PutOptions,
  ): Promise<string | false> {
    let contents: Buffer | NodeJS.ReadableStream;

    if (Buffer.isBuffer(file)) {
      contents = file;
    } else if (file.buffer) {
      contents = file.buffer;
    } else if (file.path) {
      contents = createReadStream(file.path);
    } else if (isStream(file)) {
      contents = file;
    } else {
      contents = Buffer.from(file);
    }

    const fullPath = joinPaths(path, name);
    const success = await this.put(fullPath, contents, options);
    return success ? fullPath : false;
  }

  async delete(path: string): Promise<boolean> {
    const key = sanitizePath(path);
    try {
      const blobClient = this.containerClient.getBlobClient(key);
      await blobClient.deleteIfExists();
      return true;
    } catch (e) {
      if (this.config.throw !== false) {
        mapAzureError(e, this.diskName, path);
      }
      return false;
    }
  }

  async copy(from: string, to: string, _options?: CopyOptions): Promise<boolean> {
    try {
      const sourceKey = sanitizePath(from);
      const destKey = sanitizePath(to);
      const sourceClient = this.containerClient.getBlobClient(sourceKey);
      const destClient = this.containerClient.getBlobClient(destKey);
      await destClient.beginCopyFromURL(sourceClient.url);
      return true;
    } catch (e) {
      if (this.config.throw !== false) {
        mapAzureError(e, this.diskName, from);
      }
      return false;
    }
  }

  async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    const copied = await this.copy(from, to, options);
    if (copied) return this.delete(from);
    return false;
  }

  async size(path: string): Promise<number> {
    const key = sanitizePath(path);
    try {
      const props = await this.containerClient.getBlobClient(key).getProperties();
      return props.contentLength ?? 0;
    } catch (e) {
      mapAzureError(e, this.diskName, path);
    }
  }

  async lastModified(path: string): Promise<number> {
    const key = sanitizePath(path);
    try {
      const props = await this.containerClient.getBlobClient(key).getProperties();
      return props.lastModified ? new Date(props.lastModified).getTime() : 0;
    } catch (e) {
      mapAzureError(e, this.diskName, path);
    }
  }

  // ─── Directory Operations ────────────────────────────────────────────────────

  async files(directory?: string, recursive?: boolean): Promise<string[]> {
    const prefix = directory ? sanitizePath(directory) + '/' : '';
    const result: string[] = [];

    if (recursive) {
      for await (const item of this.containerClient.listBlobsFlat({ prefix })) {
        if (!item.name.endsWith('/')) result.push(item.name);
      }
    } else {
      for await (const item of this.containerClient.listBlobsByHierarchy('/', { prefix })) {
        if (item.kind === 'blob' && !item.name.endsWith('/')) result.push(item.name);
      }
    }

    return result;
  }

  async allFiles(directory?: string): Promise<string[]> {
    return this.files(directory, true);
  }

  async directories(directory?: string, recursive?: boolean): Promise<string[]> {
    const prefix = directory ? sanitizePath(directory) + '/' : '';
    const result: string[] = [];

    if (recursive) {
      const seen = new Set<string>();
      for await (const item of this.containerClient.listBlobsFlat({ prefix })) {
        const parts = item.name.split('/');
        for (let i = 1; i < parts.length; i++) {
          const dir = parts.slice(0, i).join('/') + '/';
          if (!seen.has(dir)) {
            seen.add(dir);
            result.push(dir);
          }
        }
      }
    } else {
      for await (const item of this.containerClient.listBlobsByHierarchy('/', { prefix })) {
        if (item.kind === 'prefix') result.push(item.name);
      }
    }

    return result;
  }

  async allDirectories(directory?: string): Promise<string[]> {
    return this.directories(directory, true);
  }

  async makeDirectory(_path: string): Promise<boolean> {
    // Azure Blob Storage has no real directories — they are implied by blob name prefixes
    return true;
  }

  async deleteDirectory(directory: string): Promise<boolean> {
    try {
      const prefix = sanitizePath(directory);
      const dirPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
      const toDelete: string[] = [];

      for await (const blob of this.containerClient.listBlobsFlat({ prefix: dirPrefix })) {
        toDelete.push(blob.name);
      }

      for (const name of toDelete) {
        await this.containerClient.getBlobClient(name).deleteIfExists();
      }

      return true;
    } catch (e) {
      if (this.config.throw !== false) {
        mapAzureError(e, this.diskName, directory);
      }
      return false;
    }
  }

  // ─── Visibility ─────────────────────────────────────────────────────────────

  async getVisibility(_path: string): Promise<'private' | 'public'> {
    // Azure controls visibility at the container level, not per-blob
    return 'private';
  }

  async setVisibility(_path: string, _visibility: 'private' | 'public'): Promise<boolean> {
    throw new StoragePermissionError(
      'Azure Blob Storage does not support per-blob visibility. ' +
        'Change the container access level in the Azure portal.',
      this.diskName,
    );
  }

  // ─── URLs ────────────────────────────────────────────────────────────────────

  url(path: string): string {
    const key = sanitizePath(path);

    if (this.config.url) {
      return `${this.config.url}/${key}`;
    }

    const container = this.config.containerName ?? this.config.bucket;
    return `https://${this.config.accountName}.blob.core.windows.net/${container}/${key}`;
  }

  async temporaryUrl(
    path: string,
    expiration: Date | number,
    _options?: TemporaryUrlOptions,
  ): Promise<string> {
    const key = sanitizePath(path);
    try {
      const sdk = loadAzureSdk();
      const expiresOn =
        expiration instanceof Date ? expiration : new Date(Date.now() + expiration * 1000);

      const blobClient = this.containerClient.getBlobClient(key);

      // SAS generation requires StorageSharedKeyCredential (not available with sasToken auth)
      if (!this.config.accountKey) {
        throw new StorageConfigurationError(
          'temporaryUrl() requires accountKey authentication (not supported with sasToken)',
          this.diskName,
          path,
        );
      }

      const sasOptions = {
        containerName: this.config.containerName ?? this.config.bucket,
        blobName: key,
        permissions: sdk.BlobSASPermissions.parse('r'),
        expiresOn,
      };

      const credential = new sdk.StorageSharedKeyCredential(
        this.config.accountName,
        this.config.accountKey,
      );
      const sasToken = sdk.generateBlobSASQueryParameters(sasOptions, credential).toString();
      return `${blobClient.url}?${sasToken}`;
    } catch (e) {
      if (e instanceof StorageConfigurationError) throw e;
      mapAzureError(e, this.diskName, path);
    }
  }

  // ─── Content Operations ──────────────────────────────────────────────────────

  async prepend(path: string, data: string): Promise<boolean> {
    try {
      const existing = (await this.get(path, { responseType: 'string' })) as string;
      return this.put(path, data + existing);
    } catch {
      return this.put(path, data);
    }
  }

  async append(path: string, data: string): Promise<boolean> {
    try {
      const existing = (await this.get(path, { responseType: 'string' })) as string;
      return this.put(path, existing + data);
    } catch {
      return this.put(path, data);
    }
  }

  // ─── Metadata ────────────────────────────────────────────────────────────────

  async getMetadata(path: string): Promise<FileMetadata> {
    const key = sanitizePath(path);
    try {
      const props = await this.containerClient.getBlobClient(key).getProperties();
      return {
        path: key,
        size: props.contentLength ?? 0,
        lastModified: props.lastModified ? new Date(props.lastModified) : new Date(),
        type: 'file',
        mimetype: props.contentType ?? getContentType(path),
        extension: path.split('.').pop() ?? '',
        visibility: 'private',
        azure_container: this.config.containerName ?? this.config.bucket,
        ...props.metadata,
      };
    } catch (e) {
      mapAzureError(e, this.diskName, path);
    }
  }

  async mimeType(path: string): Promise<string> {
    const meta = await this.getMetadata(path);
    return meta.mimetype ?? getContentType(path);
  }

  async directorySize(directory?: string): Promise<number> {
    const prefix = directory ? sanitizePath(directory) + '/' : '';
    let total = 0;

    for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
      if (!blob.name.endsWith('/')) {
        total += blob.properties?.contentLength ?? 0;
      }
    }

    return total;
  }

  // ─── Multipart Uploads (Block Blob API) ──────────────────────────────────────

  async initMultipartUpload(
    path: string,
    _options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    const key = sanitizePath(path);
    // Azure staged blocks are identified per-blob; uploadId is a client-side correlation ID
    const uploadId = randomUUID();
    return { uploadId, key };
  }

  async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    path: string,
  ): Promise<MultipartUploadPart> {
    const key = sanitizePath(path);
    // Block IDs must be the same length; base64-encode zero-padded part numbers
    const blockId = Buffer.from(`${uploadId}-${String(partNumber).padStart(8, '0')}`).toString(
      'base64',
    );

    let buffer: Buffer;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (data instanceof Uint8Array) {
      buffer = Buffer.from(data);
    } else {
      buffer = await streamToBuffer(data as Readable);
    }

    const blockBlobClient = this.containerClient.getBlockBlobClient(key);
    await blockBlobClient.stageBlock(blockId, buffer, buffer.length);

    return {
      partNumber,
      etag: blockId, // reuse etag field to carry blockId for completeMultipartUpload
      size: buffer.length,
    };
  }

  async completeMultipartUpload(
    _uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean> {
    try {
      const key = sanitizePath(path);
      const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
      const blockIds = sortedParts.map((p) => p.etag); // etag carries blockId

      const blockBlobClient = this.containerClient.getBlockBlobClient(key);
      await blockBlobClient.commitBlockList(blockIds);
      return true;
    } catch (e) {
      if (this.config.throw !== false) {
        mapAzureError(e, this.diskName, path);
      }
      return false;
    }
  }

  async abortMultipartUpload(_uploadId: string, _path: string): Promise<boolean> {
    // Azure staged blocks expire automatically after 7 days; nothing to do explicitly
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async putFileMultipart(
    path: string,
    file: any,
    options?: MultipartUploadOptions,
  ): Promise<string | false> {
    try {
      let contents: Buffer;
      let filename: string;

      if (file.buffer) {
        contents = file.buffer;
        filename = file.originalname ?? file.filename ?? 'upload';
      } else if (file.path) {
        contents = await import('fs').then((fs) => fs.promises.readFile(file.path));
        filename = getFilename(file.path) ?? 'upload';
      } else if (Buffer.isBuffer(file)) {
        contents = file;
        filename = 'upload';
      } else {
        contents = Buffer.from(file);
        filename = 'upload';
      }

      const fullPath = joinPaths(path, filename);

      const MIN_CHUNK_SIZE = 4 * 1024 * 1024; // Azure minimum block size is 1 byte, recommended ≥4 MB
      const MIN_MULTIPART_SIZE = 10 * 1024 * 1024;

      let chunkSize = options?.chunkSize ?? MIN_CHUNK_SIZE;
      if (chunkSize < MIN_CHUNK_SIZE) chunkSize = MIN_CHUNK_SIZE;

      const totalSize = contents.length;

      if (totalSize < MIN_MULTIPART_SIZE || Math.ceil(totalSize / chunkSize) === 1) {
        return this.putFileAs(path, file, filename, options);
      }

      const { uploadId } = await this.initMultipartUpload(fullPath, options);
      const parts: MultipartUploadPart[] = [];
      let uploadedBytes = 0;

      try {
        const totalParts = Math.ceil(totalSize / chunkSize);
        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
          const start = (partNumber - 1) * chunkSize;
          const end = Math.min(start + chunkSize, totalSize);
          const chunk = contents.subarray(start, end);

          const part = await this.uploadPart(uploadId, partNumber, chunk, fullPath);
          parts.push(part);

          uploadedBytes += chunk.length;
          options?.onProgress?.(uploadedBytes, totalSize);
        }

        const success = await this.completeMultipartUpload(uploadId, fullPath, parts);
        return success ? fullPath : false;
      } catch (error) {
        await this.abortMultipartUpload(uploadId, fullPath);
        throw error;
      }
    } catch (e) {
      if (this.config.throw !== false) throw e;
      return false;
    }
  }

  // ─── Presigned POST ──────────────────────────────────────────────────────────

  async presignedPost(path: string, options?: PresignedPostOptions): Promise<PresignedPostData> {
    if (!this.config.accountKey) {
      throw new StorageConfigurationError(
        'presignedPost() requires accountKey authentication',
        this.diskName,
        path,
      );
    }

    const key = sanitizePath(path);
    const sdk = loadAzureSdk();
    const expiresOn = new Date(Date.now() + (options?.expires ?? 3600) * 1000);

    const sasOptions = {
      containerName: this.config.containerName ?? this.config.bucket,
      blobName: key,
      permissions: sdk.BlobSASPermissions.parse('cw'),
      expiresOn,
    };

    const credential = new sdk.StorageSharedKeyCredential(
      this.config.accountName,
      this.config.accountKey,
    );
    const sasToken = sdk.generateBlobSASQueryParameters(sasOptions, credential).toString();
    const container = this.config.containerName ?? this.config.bucket;
    const uploadUrl = `https://${this.config.accountName}.blob.core.windows.net/${container}/${key}?${sasToken}`;

    // Azure uses PUT for direct blob uploads, not POST; we expose the SAS URL + required headers
    return {
      url: uploadUrl,
      fields: {
        'x-ms-blob-type': 'BlockBlob',
        ...(options?.allowedMimeTypes?.length
          ? { 'Content-Type': options.allowedMimeTypes[0] }
          : {}),
      },
    };
  }

  // ─── Convenience Methods ─────────────────────────────────────────────────────

  getBucket(): string | undefined {
    return this.config.containerName ?? this.config.bucket;
  }

  scope(prefix: string): FilesystemContract {
    return new ScopedDisk(this, prefix);
  }

  async missing(path: string): Promise<boolean> {
    return !(await this.exists(path));
  }

  async json<T = unknown>(path: string): Promise<T> {
    const content = await this.get(path, { responseType: 'string' });
    return JSON.parse(content as string);
  }

  async checksum(path: string, algorithm: ChecksumAlgorithm = 'md5'): Promise<string> {
    const content = await this.get(path);
    const hash = createHash(algorithm);
    hash.update(content as Buffer);
    return hash.digest('hex');
  }

  async deleteMany(paths: string[]): Promise<DeleteManyResult> {
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const p of paths) {
      try {
        const ok = await this.delete(p);
        if (ok) succeeded.push(p);
        else failed.push(p);
      } catch {
        failed.push(p);
      }
    }

    return { succeeded, failed };
  }
}
