import { Readable } from 'stream';

import { DiskConfig } from '../interfaces/storage.interface';
import { streamToBuffer } from '../utils/storage.utils';

let GcsStorage: any;

function loadGcsStorage(): any {
  if (!GcsStorage) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      GcsStorage = require('@google-cloud/storage').Storage;
    } catch {
      throw new Error(
        '@google-cloud/storage is required for the GCS driver. ' +
          'Install it: pnpm add @google-cloud/storage',
      );
    }
  }
  return GcsStorage;
}

export class GcsClientWrapper {
  private storage: any;
  private bucket: any;
  private bucketName: string;

  constructor(config: DiskConfig) {
    if (!config.bucket) {
      throw new Error('GCS bucket is required');
    }

    this.bucketName = config.bucket;

    const Storage = loadGcsStorage();

    const gcsOptions: any = {};

    if (config.projectId) {
      gcsOptions.projectId = config.projectId;
    }

    if (config.keyFilename) {
      gcsOptions.keyFilename = config.keyFilename;
    } else if (config.credentials) {
      gcsOptions.credentials = config.credentials;
    }

    this.storage = new Storage(gcsOptions);
    this.bucket = this.storage.bucket(this.bucketName);
  }

  async putObject(params: {
    key: string;
    body: Buffer | Uint8Array | string | Readable;
    contentType?: string;
    metadata?: Record<string, string>;
    cacheControl?: string;
    contentDisposition?: string;
    contentEncoding?: string;
  }): Promise<void> {
    const file = this.bucket.file(params.key);
    const options: any = {
      resumable: false,
      metadata: {
        contentType: params.contentType,
        cacheControl: params.cacheControl,
        contentDisposition: params.contentDisposition,
        contentEncoding: params.contentEncoding,
        metadata: params.metadata,
      },
    };

    if (
      params.body instanceof Readable ||
      (params.body && typeof (params.body as any).pipe === 'function')
    ) {
      const buffer = await streamToBuffer(params.body as NodeJS.ReadableStream);
      await file.save(buffer, options);
    } else {
      await file.save(params.body, options);
    }
  }

  async getObject(key: string): Promise<{
    body: NodeJS.ReadableStream;
    metadata?: Record<string, string>;
    contentType?: string;
    contentLength?: number;
    lastModified?: Date;
    etag?: string;
  }> {
    const file = this.bucket.file(key);
    const [metadata] = await file.getMetadata();
    const stream = file.createReadStream();

    return {
      body: stream,
      metadata: metadata.metadata,
      contentType: metadata.contentType,
      contentLength: parseInt(metadata.size, 10) || 0,
      lastModified: metadata.updated ? new Date(metadata.updated) : undefined,
      etag: metadata.etag,
    };
  }

  async headObject(key: string): Promise<{
    metadata?: Record<string, string>;
    contentType?: string;
    contentLength?: number;
    lastModified?: Date;
    etag?: string;
  }> {
    const file = this.bucket.file(key);
    const [metadata] = await file.getMetadata();

    return {
      metadata: metadata.metadata,
      contentType: metadata.contentType,
      contentLength: parseInt(metadata.size, 10) || 0,
      lastModified: metadata.updated ? new Date(metadata.updated) : undefined,
      etag: metadata.etag,
    };
  }

  async deleteObject(key: string): Promise<void> {
    const file = this.bucket.file(key);
    await file.delete({ ignoreNotFound: true });
  }

  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await Promise.all(keys.map((key) => this.deleteObject(key)));
  }

  async listObjects(params: {
    prefix?: string;
    delimiter?: string;
    maxKeys?: number;
    pageToken?: string;
  }): Promise<{
    objects: Array<{
      key: string;
      size: number;
      lastModified: Date;
      etag?: string;
    }>;
    prefixes: string[];
    nextPageToken?: string;
    isTruncated: boolean;
  }> {
    const options: any = {
      prefix: params.prefix,
      delimiter: params.delimiter,
      maxResults: params.maxKeys,
      pageToken: params.pageToken,
      autoPaginate: false,
    };

    const [files, query, apiResponse] = await this.bucket.getFiles(options);

    const objects = files.map((file: any) => ({
      key: file.name,
      size: parseInt(file.metadata.size, 10) || 0,
      lastModified: file.metadata.updated ? new Date(file.metadata.updated) : new Date(),
      etag: file.metadata.etag,
    }));

    const prefixes = apiResponse?.prefixes || [];
    const nextPageToken = query?.pageToken;

    return {
      objects,
      prefixes,
      nextPageToken,
      isTruncated: !!nextPageToken,
    };
  }

  async copyObject(params: {
    sourceKey: string;
    destinationKey: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    const sourceFile = this.bucket.file(params.sourceKey);
    const destFile = this.bucket.file(params.destinationKey);

    const options: any = {};
    if (params.metadata) {
      options.metadata = { metadata: params.metadata };
    }

    await sourceFile.copy(destFile, options);
  }

  async moveObject(sourceKey: string, destinationKey: string): Promise<void> {
    const sourceFile = this.bucket.file(sourceKey);
    const destFile = this.bucket.file(destinationKey);
    await sourceFile.move(destFile);
  }

  async makePublic(key: string): Promise<void> {
    const file = this.bucket.file(key);
    await file.makePublic();
  }

  async makePrivate(key: string): Promise<void> {
    const file = this.bucket.file(key);
    await file.makePrivate();
  }

  async isPublic(key: string): Promise<boolean> {
    const file = this.bucket.file(key);
    try {
      const [acl] = await file.acl.get({ entity: 'allUsers' });
      return !!acl;
    } catch {
      return false;
    }
  }

  async getPresignedUrl(params: {
    key: string;
    action: 'read' | 'write' | 'delete';
    expiresIn?: number;
    contentType?: string;
    responseDisposition?: string;
    responseType?: string;
  }): Promise<string> {
    const file = this.bucket.file(params.key);
    const options: any = {
      action: params.action,
      expires: Date.now() + (params.expiresIn || 3600) * 1000,
    };

    if (params.contentType) {
      options.contentType = params.contentType;
    }

    if (params.responseDisposition) {
      options.responseDisposition = params.responseDisposition;
    }

    if (params.responseType) {
      options.responseType = params.responseType;
    }

    const [url] = await file.getSignedUrl(options);
    return url;
  }

  async compose(sourceKeys: string[], destinationKey: string): Promise<void> {
    const sources = sourceKeys.map((key) => this.bucket.file(key));
    const destination = this.bucket.file(destinationKey);
    await destination.compose(sources);
  }

  async exists(key: string): Promise<boolean> {
    const file = this.bucket.file(key);
    const [exists] = await file.exists();
    return exists;
  }

  async deletePrefix(prefix: string): Promise<void> {
    await this.bucket.deleteFiles({ prefix, force: true });
  }

  getBucket(): string {
    return this.bucketName;
  }
}
