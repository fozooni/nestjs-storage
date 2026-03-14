import { Readable } from 'stream';

import { S3ClientWrapper } from './s3-client';

// Mock AWS SDK
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'put' })),
    GetObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'get' })),
    HeadObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'head' })),
    DeleteObjectCommand: jest
      .fn()
      .mockImplementation((params) => ({ ...params, _type: 'delete' })),
    DeleteObjectsCommand: jest
      .fn()
      .mockImplementation((params) => ({ ...params, _type: 'deleteMany' })),
    ListObjectsV2Command: jest
      .fn()
      .mockImplementation((params) => ({ ...params, _type: 'list' })),
    CopyObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, _type: 'copy' })),
    GetObjectAclCommand: jest
      .fn()
      .mockImplementation((params) => ({ ...params, _type: 'getAcl' })),
    PutObjectAclCommand: jest
      .fn()
      .mockImplementation((params) => ({ ...params, _type: 'putAcl' })),
    CreateMultipartUploadCommand: jest
      .fn()
      .mockImplementation((params) => ({ ...params, _type: 'createMultipart' })),
    UploadPartCommand: jest
      .fn()
      .mockImplementation((params) => ({ ...params, _type: 'uploadPart' })),
    CompleteMultipartUploadCommand: jest
      .fn()
      .mockImplementation((params) => ({ ...params, _type: 'completeMultipart' })),
    AbortMultipartUploadCommand: jest
      .fn()
      .mockImplementation((params) => ({ ...params, _type: 'abortMultipart' })),
    ObjectCannedACL: {
      private: 'private',
      public_read: 'public-read',
    },
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.example.com'),
}));

const baseConfig = {
  driver: 's3' as const,
  bucket: 'test-bucket',
  region: 'us-east-1',
  key: 'test-key',
  secret: 'test-secret',
};

describe('S3ClientWrapper', () => {
  let client: S3ClientWrapper;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new S3ClientWrapper(baseConfig);
  });

  describe('constructor', () => {
    it('should throw if bucket is missing', () => {
      expect(
        () =>
          new S3ClientWrapper({
            driver: 's3',
            key: 'k',
            secret: 's',
          }),
      ).toThrow('S3 bucket is required');
    });

    it('should throw if key or secret is missing', () => {
      expect(
        () =>
          new S3ClientWrapper({
            driver: 's3',
            bucket: 'b',
          }),
      ).toThrow('S3 credentials (key and secret) are required');
    });

    it('should default region to us-east-1', () => {
      const c = new S3ClientWrapper({
        driver: 's3',
        bucket: 'b',
        key: 'k',
        secret: 's',
      });
      expect(c.getRegion()).toBe('us-east-1');
    });

    it('should configure endpoint and forcePathStyle', () => {
      const c = new S3ClientWrapper({
        ...baseConfig,
        endpoint: 'https://custom.endpoint.com',
        use_path_style_endpoint: true,
      });
      expect(c).toBeDefined();
    });
  });

  describe('putObject', () => {
    it('should put an object', async () => {
      mockSend.mockResolvedValue({});
      await client.putObject({ Key: 'file.txt', Body: Buffer.from('data') });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('getObject', () => {
    it('should get an object', async () => {
      const mockBody = new Readable({ read() {} });
      mockSend.mockResolvedValue({
        Body: mockBody,
        Metadata: { key: 'value' },
        ContentType: 'text/plain',
        ContentLength: 100,
        LastModified: new Date('2024-01-01'),
        ETag: '"abc123"',
      });

      const result = await client.getObject('file.txt');
      expect(result.body).toBe(mockBody);
      expect(result.metadata).toEqual({ key: 'value' });
      expect(result.contentType).toBe('text/plain');
      expect(result.contentLength).toBe(100);
      expect(result.lastModified).toEqual(new Date('2024-01-01'));
      expect(result.etag).toBe('"abc123"');
    });

    it('should use custom bucket', async () => {
      mockSend.mockResolvedValue({ Body: new Readable({ read() {} }) });
      await client.getObject('file.txt', 'other-bucket');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('headObject', () => {
    it('should get metadata without body', async () => {
      mockSend.mockResolvedValue({
        Metadata: { key: 'value' },
        ContentType: 'text/plain',
        ContentLength: 50,
        LastModified: new Date('2024-01-01'),
        ETag: '"etag"',
      });

      const result = await client.headObject('file.txt');
      expect(result.contentType).toBe('text/plain');
      expect(result.contentLength).toBe(50);
    });
  });

  describe('deleteObject', () => {
    it('should delete an object', async () => {
      mockSend.mockResolvedValue({});
      await client.deleteObject('file.txt');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteObjects', () => {
    it('should delete multiple objects', async () => {
      mockSend.mockResolvedValue({});
      await client.deleteObjects(['file1.txt', 'file2.txt']);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should skip if keys array is empty', async () => {
      await client.deleteObjects([]);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('listObjects', () => {
    it('should list objects with prefix', async () => {
      mockSend.mockResolvedValue({
        Contents: [
          { Key: 'dir/file1.txt', Size: 100, LastModified: new Date(), ETag: '"e1"', StorageClass: 'STANDARD' },
          { Key: 'dir/file2.txt', Size: 200, LastModified: new Date(), ETag: '"e2"', StorageClass: 'STANDARD' },
        ],
        CommonPrefixes: [{ Prefix: 'dir/sub/' }],
        NextContinuationToken: undefined,
        IsTruncated: false,
      });

      const result = await client.listObjects({ prefix: 'dir/' });
      expect(result.objects).toHaveLength(2);
      expect(result.objects[0].key).toBe('dir/file1.txt');
      expect(result.prefixes).toEqual(['dir/sub/']);
      expect(result.isTruncated).toBe(false);
    });

    it('should handle empty results', async () => {
      mockSend.mockResolvedValue({});
      const result = await client.listObjects();
      expect(result.objects).toHaveLength(0);
      expect(result.prefixes).toHaveLength(0);
      expect(result.isTruncated).toBe(false);
    });
  });

  describe('copyObject', () => {
    it('should copy an object', async () => {
      mockSend.mockResolvedValue({});
      await client.copyObject({
        sourceKey: 'source.txt',
        destinationKey: 'dest.txt',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should copy with metadata replacement', async () => {
      mockSend.mockResolvedValue({});
      await client.copyObject({
        sourceKey: 'source.txt',
        destinationKey: 'dest.txt',
        metadata: { key: 'value' },
        metadataDirective: 'REPLACE',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('getObjectAcl', () => {
    it('should return public-read when AllUsers has READ', async () => {
      mockSend.mockResolvedValue({
        Grants: [
          {
            Grantee: { URI: 'http://acs.amazonaws.com/groups/global/AllUsers' },
            Permission: 'READ',
          },
        ],
      });

      const result = await client.getObjectAcl('file.txt');
      expect(result).toBe('public-read');
    });

    it('should return private when no public grants', async () => {
      mockSend.mockResolvedValue({
        Grants: [
          {
            Grantee: { URI: 'http://acs.amazonaws.com/groups/global/AuthenticatedUsers' },
            Permission: 'READ',
          },
        ],
      });

      const result = await client.getObjectAcl('file.txt');
      expect(result).toBe('private');
    });

    it('should return public-read when AllUsers has FULL_CONTROL', async () => {
      mockSend.mockResolvedValue({
        Grants: [
          {
            Grantee: { URI: 'http://acs.amazonaws.com/groups/global/AllUsers' },
            Permission: 'FULL_CONTROL',
          },
        ],
      });

      const result = await client.getObjectAcl('file.txt');
      expect(result).toBe('public-read');
    });
  });

  describe('setObjectAcl', () => {
    it('should set object ACL', async () => {
      mockSend.mockResolvedValue({});
      await client.setObjectAcl('file.txt', 'public-read' as any);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPresignedUrl', () => {
    it('should generate presigned URL for getObject', async () => {
      const url = await client.getPresignedUrl({
        key: 'file.txt',
        operation: 'getObject',
        expiresIn: 3600,
      });
      expect(url).toBe('https://signed-url.example.com');
    });

    it('should generate presigned URL for putObject', async () => {
      const url = await client.getPresignedUrl({
        key: 'file.txt',
        operation: 'putObject',
      });
      expect(url).toBe('https://signed-url.example.com');
    });
  });

  describe('getBucket / getRegion', () => {
    it('should return bucket name', () => {
      expect(client.getBucket()).toBe('test-bucket');
    });

    it('should return region', () => {
      expect(client.getRegion()).toBe('us-east-1');
    });
  });

  describe('multipart upload', () => {
    it('should create multipart upload', async () => {
      mockSend.mockResolvedValue({ UploadId: 'upload-123' });
      const result = await client.createMultipartUpload({
        key: 'file.txt',
        contentType: 'text/plain',
      });
      expect(result.uploadId).toBe('upload-123');
    });

    it('should throw if UploadId is not returned', async () => {
      mockSend.mockResolvedValue({});
      await expect(
        client.createMultipartUpload({ key: 'file.txt' }),
      ).rejects.toThrow('Failed to initialize multipart upload');
    });

    it('should upload part', async () => {
      mockSend.mockResolvedValue({ ETag: '"part-etag"' });
      const result = await client.uploadPart({
        uploadId: 'upload-123',
        partNumber: 1,
        body: Buffer.from('data'),
        key: 'file.txt',
      });
      expect(result.etag).toBe('"part-etag"');
    });

    it('should throw if ETag is not returned for part', async () => {
      mockSend.mockResolvedValue({});
      await expect(
        client.uploadPart({
          uploadId: 'upload-123',
          partNumber: 1,
          body: Buffer.from('data'),
          key: 'file.txt',
        }),
      ).rejects.toThrow('Failed to upload part 1');
    });

    it('should complete multipart upload', async () => {
      mockSend.mockResolvedValue({
        Location: 'https://bucket.s3.amazonaws.com/file.txt',
        ETag: '"final-etag"',
      });

      const result = await client.completeMultipartUpload({
        uploadId: 'upload-123',
        key: 'file.txt',
        parts: [
          { partNumber: 1, etag: '"e1"' },
          { partNumber: 2, etag: '"e2"' },
        ],
      });

      expect(result.location).toBe('https://bucket.s3.amazonaws.com/file.txt');
      expect(result.etag).toBe('"final-etag"');
    });

    it('should abort multipart upload', async () => {
      mockSend.mockResolvedValue({});
      await client.abortMultipartUpload({
        uploadId: 'upload-123',
        key: 'file.txt',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRawClient', () => {
    it('should return the underlying S3Client', () => {
      const raw = client.getRawClient();
      expect(raw).toBeDefined();
      expect(typeof raw.send).toBe('function');
    });
  });
});
