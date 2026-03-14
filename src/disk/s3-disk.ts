import { Readable } from 'stream';

import { ObjectCannedACL } from '@aws-sdk/client-s3';

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
  aclToVisibility,
  buildS3Url,
  encodeS3Key,
  getContentType,
  getFilename,
  isStream,
  joinPaths,
  sanitizePath,
  streamToBuffer,
  streamToString,
  visibilityToAcl,
} from '../utils/storage.utils';
import { S3ClientWrapper } from '../wrapper/s3-client';

export class S3Disk implements FilesystemContract {
  private client: S3ClientWrapper;
  protected config: DiskConfig;

  constructor(config: DiskConfig) {
    this.config = config;
    this.validateConfig();
    this.client = new S3ClientWrapper(config);
  }

  private validateConfig(): void {
    const required = ['bucket', 'region'];
    const missing = required.filter((key) => !this.config[key as keyof DiskConfig]);

    if (missing.length > 0) {
      throw new Error(
        `S3 configuration missing required fields: ${missing.join(', ')}. ` +
          `Current config: ${JSON.stringify(this.config, null, 2)}`,
      );
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      const key = sanitizePath(path);
      await this.client.headObject(key);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async get(path: string, options?: GetOptions): Promise<Buffer | NodeJS.ReadableStream | string> {
    const key = sanitizePath(path);
    const response = await this.client.getObject(key);

    if (!response.body) {
      throw new Error('No body returned from S3');
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
      // Ensure all metadata values are strings (AWS S3 requirement)
      const stringifiedMetadata = options?.metadata
        ? Object.fromEntries(
            Object.entries(options.metadata).map(([key, value]) => [key, String(value)]),
          )
        : undefined;

      // Ensure contents is a proper Buffer if it's supposed to be binary data
      let body: string | Buffer | Readable = contents as string | Buffer | Readable;
      if (contents instanceof ArrayBuffer) {
        body = Buffer.from(contents);
      }

      const putObjectParams = {
        Key: key,
        Body: body,
        ContentType: options?.mimetype || getContentType(path),
        // ACL: visibilityToAcl(options?.visibility) as ObjectCannedACL,
        Metadata: stringifiedMetadata,
        CacheControl: options?.CacheControl,
        ContentDisposition: options?.ContentDisposition,
        ContentEncoding: options?.ContentEncoding,
        ContentLanguage: options?.ContentLanguage,
        Expires: options?.Expires,
      };

      await this.client.putObject(putObjectParams);

      return true;
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      const errorCode = error?.name || error?.code || 'Unknown';
      const statusCode = error?.$metadata?.httpStatusCode || 'Unknown';

      if (this.config.throw !== false) {
        throw new Error(
          `S3 upload failed for key "${key}": ${errorCode} - ${errorMessage} (HTTP ${statusCode})`,
        );
      }
      return false;
    }
  }

  async putFile(path: string, file: any, options?: PutOptions): Promise<string | false> {
    // Handle file upload based on file type
    let contents: Buffer | NodeJS.ReadableStream;
    let filename: string;

    if (file.buffer) {
      // Express multer file
      contents = file.buffer;
      filename = file.originalname || file.filename;
    } else if (file.path) {
      // File path
      const fs = await import('fs');
      contents = fs.createReadStream(file.path);
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
    file: any,
    name: string,
    options?: PutOptions,
  ): Promise<string | false> {
    // Handle file upload with custom name
    let contents: Buffer | NodeJS.ReadableStream;

    if (Buffer.isBuffer(file)) {
      contents = file;
    } else if (file.buffer) {
      contents = file.buffer;
    } else if (file.path) {
      const fs = await import('fs');
      contents = fs.createReadStream(file.path);
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

      await this.client.copyObject({
        sourceKey,
        destinationKey,
        // acl: visibilityToAcl(options?.visibility) as ObjectCannedACL,
      });

      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    const copied = await this.copy(from, to, options);
    if (copied) {
      return await this.delete(from);
    }
    return false;
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
    let continuationToken: string | undefined;

    do {
      const response = await this.client.listObjects({
        prefix,
        delimiter,
        continuationToken,
      });

      for (const object of response.objects) {
        if (!object.key.endsWith('/')) {
          files.push(object.key);
        }
      }

      continuationToken = response.nextContinuationToken;
    } while (continuationToken);

    return files;
  }

  async allFiles(directory?: string): Promise<string[]> {
    return this.files(directory, true);
  }

  async directories(directory?: string, recursive?: boolean): Promise<string[]> {
    const prefix = directory ? sanitizePath(directory) + '/' : '';
    const delimiter = recursive ? undefined : '/';

    const directories: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.listObjects({
        prefix,
        delimiter,
        continuationToken,
      });

      // Add common prefixes (directories) when using delimiter
      if (!recursive && response.prefixes) {
        directories.push(...response.prefixes);
      }

      // Add directories from objects when recursive
      if (recursive) {
        for (const object of response.objects) {
          if (object.key.endsWith('/')) {
            directories.push(object.key);
          }
        }
      }

      continuationToken = response.nextContinuationToken;
    } while (continuationToken);

    return directories;
  }

  async allDirectories(directory?: string): Promise<string[]> {
    return this.directories(directory, true);
  }

  async makeDirectory(path: string): Promise<boolean> {
    // S3 doesn't have real directories, but we can create a marker
    const key = sanitizePath(path);
    const directoryKey = key.endsWith('/') ? key : key + '/';

    return await this.put(directoryKey, '', {
      mimetype: 'application/x-directory',
    });
  }

  async deleteDirectory(directory: string): Promise<boolean> {
    try {
      const prefix = sanitizePath(directory);
      const files = await this.allFiles(directory);

      if (files.length > 0) {
        await this.client.deleteObjects(files);
      }

      // Also delete the directory marker if it exists
      const directoryKey = prefix.endsWith('/') ? prefix : prefix + '/';
      if (await this.exists(directoryKey)) {
        await this.delete(directoryKey);
      }

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
    const acl = await this.client.getObjectAcl(key);
    return aclToVisibility(acl);
  }

  async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    try {
      const key = sanitizePath(path);
      const acl = visibilityToAcl(visibility) as ObjectCannedACL;
      await this.client.setObjectAcl(key, acl);
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
      return `${this.config.url}/${encodeS3Key(key)}`;
    }

    return buildS3Url(this.client.getBucket(), key, this.client.getRegion());
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

    const responseContentDisposition =
      options?.responseDisposition ||
      (options?.method === 'GET' && path.includes('.')
        ? `attachment; filename="${getFilename(path)}"`
        : undefined);

    return await this.client.getPresignedUrl({
      key,
      operation: options?.method === 'PUT' ? 'putObject' : 'getObject',
      expiresIn,
      responseContentDisposition,
      responseContentType: options?.responseType,
    });
  }

  async prepend(path: string, data: string): Promise<boolean> {
    try {
      const existing = (await this.get(path, {
        responseType: 'string',
      })) as string;
      return await this.put(path, data + existing);
    } catch {
      // File doesn't exist, create it
      return await this.put(path, data);
    }
  }

  async append(path: string, data: string): Promise<boolean> {
    try {
      const existing = (await this.get(path, {
        responseType: 'string',
      })) as string;
      return await this.put(path, existing + data);
    } catch {
      // File doesn't exist, create it
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
      s3_bucket: this.client.getBucket(),
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
    let continuationToken: string | undefined;

    do {
      const response = await this.client.listObjects({
        prefix,
        continuationToken,
      });

      for (const object of response.objects) {
        if (!object.key.endsWith('/')) {
          totalSize += object.size;
        }
      }

      continuationToken = response.nextContinuationToken;
    } while (continuationToken);

    return totalSize;
  }

  /**
   * Initialize multipart upload
   */
  async initMultipartUpload(
    path: string,
    options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    const key = sanitizePath(path);

    // Ensure all metadata values are strings (AWS S3 requirement)
    const stringifiedMetadata = options?.metadata
      ? Object.fromEntries(
          Object.entries(options.metadata).map(([key, value]) => [key, String(value)]),
        )
      : undefined;

    const { uploadId } = await this.client.createMultipartUpload({
      key,
      contentType: options?.mimetype || getContentType(path),
      // acl: visibilityToAcl(options?.visibility) as ObjectCannedACL,
      metadata: stringifiedMetadata,
    });

    return {
      uploadId,
      key,
      bucket: this.client.getBucket(),
    };
  }

  /**
   * Upload a part for multipart upload
   */
  async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    path: string,
  ): Promise<MultipartUploadPart> {
    const key = sanitizePath(path);

    const body: Buffer | Uint8Array | Readable = data as Buffer | Uint8Array | Readable;
    let size: number;

    if (Buffer.isBuffer(data)) {
      size = data.length;
    } else if (data instanceof Uint8Array) {
      size = data.length;
    } else {
      // For streams, we need to calculate size if possible
      size = 0; // Will be set by S3
    }

    const { etag } = await this.client.uploadPart({
      uploadId,
      partNumber,
      body,
      key,
    });

    return {
      partNumber,
      etag,
      size,
    };
  }

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(
    uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean> {
    try {
      const key = sanitizePath(path);

      // Sort parts by part number to ensure correct order
      const sortedParts = parts.sort((a, b) => a.partNumber - b.partNumber);

      await this.client.completeMultipartUpload({
        uploadId,
        key,
        parts: sortedParts.map((part) => ({
          partNumber: part.partNumber,
          etag: part.etag,
        })),
      });

      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(uploadId: string, path: string): Promise<boolean> {
    try {
      const key = sanitizePath(path);

      await this.client.abortMultipartUpload({
        uploadId,
        key,
      });

      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  /**
   * Upload a file using multipart upload for large files
   */
  async putFileMultipart(
    path: string,
    file: any,
    options?: MultipartUploadOptions,
  ): Promise<string | false> {
    try {
      let contents: Buffer;
      let filename: string;

      if (file.buffer) {
        // Express multer file
        contents = file.buffer;
        filename = file.originalname || file.filename;
      } else if (file.path) {
        // File path
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

      // Initialize multipart upload
      const { uploadId } = await this.initMultipartUpload(fullPath, options);
      const parts: MultipartUploadPart[] = [];
      let uploadedBytes = 0;

      try {
        // Upload parts
        const totalParts = Math.ceil(totalSize / chunkSize);

        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
          const start = (partNumber - 1) * chunkSize;
          const end = Math.min(start + chunkSize, totalSize);
          const chunk = contents.subarray(start, end);

          const part = await this.uploadPart(uploadId, partNumber, chunk, fullPath);
          parts.push(part);

          uploadedBytes += chunk.length;

          // Call progress callback if provided
          if (options?.onProgress) {
            options.onProgress(uploadedBytes, totalSize);
          }
        }

        // Complete multipart upload
        const success = await this.completeMultipartUpload(uploadId, fullPath, parts);

        return success ? fullPath : false;
      } catch (error) {
        // Abort multipart upload on error
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

  /**
   * Get the bucket name for this S3 disk
   */
  getBucket(): string {
    return this.client.getBucket();
  }
}
