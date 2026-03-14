import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { Readable } from 'stream';

import {
  CopyOptions,
  DiskConfig,
  FileMetadata,
  FilesystemContract,
  GetOptions,
  MoveOptions,
  MultipartUploadInit,
  MultipartUploadOptions,
  MultipartUploadPart,
  PutOptions,
  TemporaryUrlOptions,
} from '../interfaces/storage.interface';
import {
  getContentType,
  getFilename,
  isStream,
  joinPaths,
  sanitizePath,
  streamToBuffer,
  streamToString,
} from '../utils/storage.utils';
import { GcsClientWrapper } from '../wrapper/gcs-client';

export class GcsDisk implements FilesystemContract {
  private client: GcsClientWrapper;
  protected config: DiskConfig;
  private multipartUploads: Map<string, { targetPath: string; options?: MultipartUploadOptions }> =
    new Map();

  constructor(config: DiskConfig) {
    this.config = config;
    this.validateConfig();
    this.client = new GcsClientWrapper(config);
  }

  private validateConfig(): void {
    if (!this.config.bucket) {
      throw new Error('GCS configuration requires bucket');
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      const key = sanitizePath(path);
      return await this.client.exists(key);
    } catch {
      return false;
    }
  }

  async get(path: string, options?: GetOptions): Promise<Buffer | NodeJS.ReadableStream | string> {
    const key = sanitizePath(path);
    const response = await this.client.getObject(key);

    if (!response.body) {
      throw new Error('No body returned from GCS');
    }

    const responseType = options?.responseType || 'buffer';

    if (responseType === 'stream') {
      return response.body;
    } else if (responseType === 'string') {
      return await streamToString(response.body);
    } else {
      return await streamToBuffer(response.body);
    }
  }

  async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    const key = sanitizePath(path);

    try {
      const stringifiedMetadata = options?.metadata
        ? Object.fromEntries(
            Object.entries(options.metadata).map(([k, value]) => [k, String(value)]),
          )
        : undefined;

      let body: string | Buffer | Readable = contents as string | Buffer | Readable;
      if (contents instanceof ArrayBuffer) {
        body = Buffer.from(contents);
      }

      await this.client.putObject({
        key,
        body,
        contentType: options?.mimetype || getContentType(path),
        metadata: stringifiedMetadata,
        cacheControl: options?.CacheControl,
        contentDisposition: options?.ContentDisposition,
        contentEncoding: options?.ContentEncoding,
      });

      if (options?.visibility === 'public') {
        await this.client.makePublic(key);
      }

      return true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (this.config.throw !== false) {
        throw new Error(`GCS upload failed for key "${key}": ${error.message}`);
      }
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async putFile(path: string, file: any, options?: PutOptions): Promise<string | false> {
    let contents: Buffer | NodeJS.ReadableStream;
    let filename: string;

    if (file.buffer) {
      contents = file.buffer;
      filename = file.originalname || file.filename;
    } else if (file.path) {
      contents = createReadStream(file.path);
      filename = getFilename(file.path);
    } else if (isStream(file)) {
      contents = file;
      filename = options?.filename || 'upload';
    } else {
      contents = Buffer.from(file);
      filename = options?.filename || 'upload';
    }

    const fullPath = joinPaths(path, filename);
    const success = await this.put(fullPath, contents, options);

    return success ? fullPath : false;
  }

  async putFileAs(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    try {
      const key = sanitizePath(path);
      await this.client.deleteObject(key);
      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async copy(from: string, to: string, _options?: CopyOptions): Promise<boolean> {
    try {
      const sourceKey = sanitizePath(from);
      const destinationKey = sanitizePath(to);
      await this.client.copyObject({ sourceKey, destinationKey });
      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async move(from: string, to: string, _options?: MoveOptions): Promise<boolean> {
    try {
      const sourceKey = sanitizePath(from);
      const destinationKey = sanitizePath(to);
      await this.client.moveObject(sourceKey, destinationKey);
      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async size(path: string): Promise<number> {
    const key = sanitizePath(path);
    const response = await this.client.headObject(key);
    return response.contentLength || 0;
  }

  async lastModified(path: string): Promise<number> {
    const key = sanitizePath(path);
    const response = await this.client.headObject(key);
    return response.lastModified ? response.lastModified.getTime() : 0;
  }

  async files(directory?: string, recursive?: boolean): Promise<string[]> {
    const prefix = directory ? sanitizePath(directory) + '/' : '';
    const delimiter = recursive ? undefined : '/';

    const files: string[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.client.listObjects({
        prefix,
        delimiter,
        pageToken,
      });

      for (const object of response.objects) {
        if (!object.key.endsWith('/')) {
          files.push(object.key);
        }
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    return files;
  }

  async allFiles(directory?: string): Promise<string[]> {
    return this.files(directory, true);
  }

  async directories(directory?: string, recursive?: boolean): Promise<string[]> {
    const prefix = directory ? sanitizePath(directory) + '/' : '';
    const delimiter = recursive ? undefined : '/';

    const directories: string[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.client.listObjects({
        prefix,
        delimiter,
        pageToken,
      });

      if (!recursive && response.prefixes) {
        directories.push(...response.prefixes);
      }

      if (recursive) {
        for (const object of response.objects) {
          if (object.key.endsWith('/')) {
            directories.push(object.key);
          }
        }
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    return directories;
  }

  async allDirectories(directory?: string): Promise<string[]> {
    return this.directories(directory, true);
  }

  async makeDirectory(path: string): Promise<boolean> {
    const key = sanitizePath(path);
    const directoryKey = key.endsWith('/') ? key : key + '/';

    return await this.put(directoryKey, '', {
      mimetype: 'application/x-directory',
    });
  }

  async deleteDirectory(directory: string): Promise<boolean> {
    try {
      const prefix = sanitizePath(directory);
      const directoryPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
      await this.client.deletePrefix(directoryPrefix);
      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async getVisibility(path: string): Promise<'private' | 'public'> {
    const key = sanitizePath(path);
    const isPublic = await this.client.isPublic(key);
    return isPublic ? 'public' : 'private';
  }

  async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    try {
      const key = sanitizePath(path);
      if (visibility === 'public') {
        await this.client.makePublic(key);
      } else {
        await this.client.makePrivate(key);
      }
      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  url(path: string): string {
    const key = sanitizePath(path);

    if (this.config.url) {
      return `${this.config.url}/${key}`;
    }

    return `https://storage.googleapis.com/${this.client.getBucket()}/${key}`;
  }

  async temporaryUrl(
    path: string,
    expiration: Date | number,
    options?: TemporaryUrlOptions,
  ): Promise<string> {
    const key = sanitizePath(path);
    const expiresIn =
      expiration instanceof Date
        ? Math.floor((expiration.getTime() - Date.now()) / 1000)
        : expiration;

    const action =
      options?.method === 'PUT' ? 'write' : options?.method === 'DELETE' ? 'delete' : 'read';

    return await this.client.getPresignedUrl({
      key,
      action,
      expiresIn,
      responseDisposition: options?.responseDisposition,
      responseType: options?.responseType,
    });
  }

  async prepend(path: string, data: string): Promise<boolean> {
    try {
      const existing = (await this.get(path, { responseType: 'string' })) as string;
      return await this.put(path, data + existing);
    } catch {
      return await this.put(path, data);
    }
  }

  async append(path: string, data: string): Promise<boolean> {
    try {
      const existing = (await this.get(path, { responseType: 'string' })) as string;
      return await this.put(path, existing + data);
    } catch {
      return await this.put(path, data);
    }
  }

  async getMetadata(path: string): Promise<FileMetadata> {
    const key = sanitizePath(path);
    const response = await this.client.headObject(key);

    return {
      path: key,
      size: response.contentLength || 0,
      lastModified: response.lastModified || new Date(),
      type: response.contentType,
      mimetype: response.contentType,
      extension: path.split('.').pop() || response.contentType?.split('/')[1] || '',
      visibility: await this.getVisibility(path),
      gcs_bucket: this.client.getBucket(),
      ...response.metadata,
    };
  }

  async mimeType(path: string): Promise<string> {
    const metadata = await this.getMetadata(path);
    return metadata.mimetype || getContentType(path);
  }

  async directorySize(directory?: string): Promise<number> {
    const prefix = directory ? sanitizePath(directory) + '/' : '';
    let totalSize = 0;
    let pageToken: string | undefined;

    do {
      const response = await this.client.listObjects({
        prefix,
        pageToken,
      });

      for (const object of response.objects) {
        if (!object.key.endsWith('/')) {
          totalSize += object.size;
        }
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    return totalSize;
  }

  // Multipart upload via GCS compose API
  async initMultipartUpload(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    const key = sanitizePath(path);
    const uploadId = randomUUID();

    this.multipartUploads.set(uploadId, { targetPath: key, options });

    return {
      uploadId,
      key,
      bucket: this.client.getBucket(),
    };
  }

  async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    path: string,
  ): Promise<MultipartUploadPart> {
    const key = sanitizePath(path);
    const tempKey = `${key}.__multipart/${uploadId}/part-${String(partNumber).padStart(6, '0')}`;

    let buffer: Buffer;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (data instanceof Uint8Array) {
      buffer = Buffer.from(data);
    } else {
      buffer = await streamToBuffer(data);
    }

    await this.client.putObject({
      key: tempKey,
      body: buffer,
      contentType: 'application/octet-stream',
    });

    const etag = createHash('md5').update(buffer).digest('hex');

    return {
      partNumber,
      etag,
      size: buffer.length,
    };
  }

  async completeMultipartUpload(
    uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean> {
    try {
      const key = sanitizePath(path);
      const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);

      const partKeys = sortedParts.map(
        (part) => `${key}.__multipart/${uploadId}/part-${String(part.partNumber).padStart(6, '0')}`,
      );

      // GCS compose limit is 32 objects at a time
      const MAX_COMPOSE = 32;

      if (partKeys.length <= MAX_COMPOSE) {
        await this.client.compose(partKeys, key);
      } else {
        // Batch compose: reduce in rounds
        let currentKeys = [...partKeys];
        let round = 0;

        while (currentKeys.length > MAX_COMPOSE) {
          const nextKeys: string[] = [];

          for (let i = 0; i < currentKeys.length; i += MAX_COMPOSE) {
            const batch = currentKeys.slice(i, i + MAX_COMPOSE);
            if (batch.length === 1) {
              nextKeys.push(batch[0]);
            } else {
              const tempKey = `${key}.__multipart/${uploadId}/compose-round-${round}-batch-${i}`;
              await this.client.compose(batch, tempKey);
              nextKeys.push(tempKey);
            }
          }

          // Clean up previous round temp files (not original parts)
          if (round > 0) {
            for (const k of currentKeys) {
              if (k.includes(`compose-round-${round - 1}`)) {
                await this.client.deleteObject(k);
              }
            }
          }

          currentKeys = nextKeys;
          round++;
        }

        await this.client.compose(currentKeys, key);

        // Clean up last round temp files
        for (const k of currentKeys) {
          if (k.includes('compose-round-')) {
            await this.client.deleteObject(k);
          }
        }
      }

      // Clean up part objects
      await this.client.deletePrefix(`${key}.__multipart/${uploadId}/`);
      this.multipartUploads.delete(uploadId);

      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async abortMultipartUpload(uploadId: string, path: string): Promise<boolean> {
    try {
      const key = sanitizePath(path);
      await this.client.deletePrefix(`${key}.__multipart/${uploadId}/`);
      this.multipartUploads.delete(uploadId);
      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async putFileMultipart(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    options?: MultipartUploadOptions,
  ): Promise<string | false> {
    try {
      let contents: Buffer;
      let filename: string;

      if (file.buffer) {
        contents = file.buffer;
        filename = file.originalname || file.filename;
      } else if (file.path) {
        contents = await import('fs').then((fs) => fs.promises.readFile(file.path));
        filename = getFilename(file.path);
      } else if (Buffer.isBuffer(file)) {
        contents = file;
        filename = 'upload';
      } else {
        contents = Buffer.from(file);
        filename = 'upload';
      }

      const fullPath = joinPaths(path, filename);

      const MIN_CHUNK_SIZE = 5 * 1024 * 1024;
      const MIN_MULTIPART_SIZE = 10 * 1024 * 1024;

      let chunkSize = options?.chunkSize || MIN_CHUNK_SIZE;
      if (chunkSize < MIN_CHUNK_SIZE) {
        chunkSize = MIN_CHUNK_SIZE;
      }

      const totalSize = contents.length;

      if (totalSize < MIN_MULTIPART_SIZE || Math.ceil(totalSize / chunkSize) === 1) {
        return await this.putFileAs(path, file, filename, options);
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

          if (options?.onProgress) {
            options.onProgress(uploadedBytes, totalSize);
          }
        }

        const success = await this.completeMultipartUpload(uploadId, fullPath, parts);
        return success ? fullPath : false;
      } catch (error) {
        await this.abortMultipartUpload(uploadId, fullPath);
        throw error;
      }
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  getBucket(): string {
    return this.client.getBucket();
  }
}
