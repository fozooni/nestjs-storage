import { Readable } from 'stream';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectAclCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ObjectCannedACL,
  PutObjectAclCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { DiskConfig } from '../interfaces/storage.interface';

export class S3ClientWrapper {
  private client: S3Client;
  private bucket: string;
  private region: string;

  constructor(config: DiskConfig) {
    if (!config.bucket) {
      throw new Error('S3 bucket is required');
    }

    if (!config.key || !config.secret) {
      throw new Error('S3 credentials (key and secret) are required');
    }

    this.bucket = config.bucket;
    this.region = config.region || 'us-east-1';

    const s3Config: any = {
      region: this.region,
      credentials: {
        accessKeyId: config.key,
        secretAccessKey: config.secret,
      },
    };

    if (config.endpoint) {
      s3Config.endpoint = config.endpoint;
      s3Config.forcePathStyle = config.use_path_style_endpoint || false;
    }

    this.client = new S3Client(s3Config);
  }

  /**
   * Put object to S3
   */
  async putObject(params: {
    Key: string;
    Body: Buffer | Uint8Array | string | Readable;
    ContentType?: string;
    ACL?: ObjectCannedACL;
    Metadata?: Record<string, string>;
    CacheControl?: string;
    ContentDisposition?: string;
    ContentEncoding?: string;
    ContentLanguage?: string;
    Expires?: Date;
    Bucket?: string;
  }): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: params.Bucket || this.bucket,
      ...params,
    });

    await this.client.send(command);
  }

  /**
   * Get object from S3
   */
  async getObject(
    key: string,
    bucket?: string,
  ): Promise<{
    body: NodeJS.ReadableStream;
    metadata?: Record<string, string>;
    contentType?: string;
    contentLength?: number;
    lastModified?: Date;
    etag?: string;
  }> {
    const command = new GetObjectCommand({
      Bucket: bucket || this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    return {
      body: response.Body as NodeJS.ReadableStream,
      metadata: response.Metadata,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
      etag: response.ETag,
    };
  }

  /**
   * Head object (get metadata without body)
   */
  async headObject(
    key: string,
    bucket?: string,
  ): Promise<{
    metadata?: Record<string, string>;
    contentType?: string;
    contentLength?: number;
    lastModified?: Date;
    etag?: string;
  }> {
    const command = new HeadObjectCommand({
      Bucket: bucket || this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    return {
      metadata: response.Metadata,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
      etag: response.ETag,
    };
  }

  /**
   * Delete object from S3
   */
  async deleteObject(key: string, bucket?: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucket || this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * Delete multiple objects
   */
  async deleteObjects(keys: string[], bucket?: string): Promise<void> {
    if (keys.length === 0) return;

    const command = new DeleteObjectsCommand({
      Bucket: bucket || this.bucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
      },
    });

    await this.client.send(command);
  }

  /**
   * List objects in S3
   */
  async listObjects(
    params: {
      prefix?: string;
      delimiter?: string;
      maxKeys?: number;
      continuationToken?: string;
      bucket?: string;
    } = {},
  ): Promise<{
    objects: Array<{
      key: string;
      size: number;
      lastModified: Date;
      etag?: string;
      storageClass?: string;
    }>;
    prefixes: string[];
    nextContinuationToken?: string;
    isTruncated: boolean;
  }> {
    const command = new ListObjectsV2Command({
      Bucket: params.bucket || this.bucket,
      Prefix: params.prefix,
      Delimiter: params.delimiter,
      MaxKeys: params.maxKeys,
      ContinuationToken: params.continuationToken,
    });

    const response = await this.client.send(command);

    return {
      objects: (response.Contents || []).map((item) => ({
        key: item.Key!,
        size: item.Size || 0,
        lastModified: item.LastModified!,
        etag: item.ETag,
        storageClass: item.StorageClass,
      })),
      prefixes: (response.CommonPrefixes || []).map((p) => p.Prefix!),
      nextContinuationToken: response.NextContinuationToken,
      isTruncated: response.IsTruncated || false,
    };
  }

  /**
   * Copy object
   */
  async copyObject(params: {
    sourceKey: string;
    destinationKey: string;
    sourceBucket?: string;
    destinationBucket?: string;
    metadata?: Record<string, string>;
    metadataDirective?: 'COPY' | 'REPLACE';
    acl?: ObjectCannedACL;
  }): Promise<void> {
    const copySource = `${params.sourceBucket || this.bucket}/${params.sourceKey}`;

    const command = new CopyObjectCommand({
      Bucket: params.destinationBucket || this.bucket,
      CopySource: copySource,
      Key: params.destinationKey,
      Metadata: params.metadata,
      MetadataDirective: params.metadataDirective,
      ACL: params.acl,
    });

    await this.client.send(command);
  }

  /**
   * Get object ACL
   */
  async getObjectAcl(key: string, bucket?: string): Promise<string> {
    const command = new GetObjectAclCommand({
      Bucket: bucket || this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    // Check if public-read
    const hasPublicRead = response.Grants?.some(
      (grant) =>
        grant.Grantee?.URI === 'http://acs.amazonaws.com/groups/global/AllUsers' &&
        (grant.Permission === 'READ' || grant.Permission === 'FULL_CONTROL'),
    );

    return hasPublicRead ? 'public-read' : 'private';
  }

  /**
   * Set object ACL
   */
  async setObjectAcl(key: string, acl: ObjectCannedACL, bucket?: string): Promise<void> {
    const command = new PutObjectAclCommand({
      Bucket: bucket || this.bucket,
      Key: key,
      ACL: acl,
    });

    await this.client.send(command);
  }

  /**
   * Generate presigned URL
   */
  async getPresignedUrl(params: {
    key: string;
    operation: 'getObject' | 'putObject';
    expiresIn?: number;
    bucket?: string;
    responseContentDisposition?: string;
    responseContentType?: string;
  }): Promise<string> {
    let command;

    if (params.operation === 'getObject') {
      command = new GetObjectCommand({
        Bucket: params.bucket || this.bucket,
        Key: params.key,
        ResponseContentDisposition: params.responseContentDisposition,
        ResponseContentType: params.responseContentType,
      });
    } else {
      command = new PutObjectCommand({
        Bucket: params.bucket || this.bucket,
        Key: params.key,
      });
    }

    return await getSignedUrl(this.client, command, {
      expiresIn: params.expiresIn || 3600,
    });
  }

  /**
   * Get bucket name
   */
  getBucket(): string {
    return this.bucket;
  }

  /**
   * Get region
   */
  getRegion(): string {
    return this.region;
  }

  /**
   * Initialize multipart upload
   */
  async createMultipartUpload(params: {
    key: string;
    contentType?: string;
    acl?: ObjectCannedACL;
    metadata?: Record<string, string>;
    bucket?: string;
  }): Promise<{ uploadId: string }> {
    const command = new CreateMultipartUploadCommand({
      Bucket: params.bucket || this.bucket,
      Key: params.key,
      ContentType: params.contentType,
      ACL: params.acl,
      Metadata: params.metadata,
    });

    const response = await this.client.send(command);

    if (!response.UploadId) {
      throw new Error('Failed to initialize multipart upload');
    }

    return { uploadId: response.UploadId };
  }

  /**
   * Upload part for multipart upload
   */
  async uploadPart(params: {
    uploadId: string;
    partNumber: number;
    body: Buffer | Uint8Array | Readable;
    key: string;
    bucket?: string;
  }): Promise<{ etag: string }> {
    const command = new UploadPartCommand({
      Bucket: params.bucket || this.bucket,
      Key: params.key,
      UploadId: params.uploadId,
      PartNumber: params.partNumber,
      Body: params.body,
    });

    const response = await this.client.send(command);

    if (!response.ETag) {
      throw new Error(`Failed to upload part ${params.partNumber}`);
    }

    return { etag: response.ETag };
  }

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(params: {
    uploadId: string;
    key: string;
    parts: Array<{ partNumber: number; etag: string }>;
    bucket?: string;
  }): Promise<{ location?: string; etag?: string }> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: params.bucket || this.bucket,
      Key: params.key,
      UploadId: params.uploadId,
      MultipartUpload: {
        Parts: params.parts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        })),
      },
    });

    const response = await this.client.send(command);

    return {
      location: response.Location,
      etag: response.ETag,
    };
  }

  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(params: {
    uploadId: string;
    key: string;
    bucket?: string;
  }): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: params.bucket || this.bucket,
      Key: params.key,
      UploadId: params.uploadId,
    });

    await this.client.send(command);
  }

  /**
   * Get raw S3 client for advanced operations
   */
  getRawClient(): S3Client {
    return this.client;
  }
}
