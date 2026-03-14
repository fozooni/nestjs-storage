import { Readable } from 'stream';

import { S3Disk } from './s3-disk';

// Mock S3ClientWrapper
const mockPutObject = jest.fn().mockResolvedValue(undefined);
const mockGetObject = jest.fn();
const mockHeadObject = jest.fn();
const mockDeleteObject = jest.fn().mockResolvedValue(undefined);
const mockDeleteObjects = jest.fn().mockResolvedValue(undefined);
const mockListObjects = jest.fn();
const mockCopyObject = jest.fn().mockResolvedValue(undefined);
const mockGetObjectAcl = jest.fn();
const mockSetObjectAcl = jest.fn().mockResolvedValue(undefined);
const mockGetPresignedUrl = jest.fn().mockResolvedValue('https://signed.url');
const mockCreateMultipartUpload = jest.fn();
const mockUploadPart = jest.fn();
const mockCompleteMultipartUpload = jest.fn().mockResolvedValue({});
const mockAbortMultipartUpload = jest.fn().mockResolvedValue(undefined);
const mockGetBucket = jest.fn().mockReturnValue('test-bucket');
const mockGetRegion = jest.fn().mockReturnValue('us-east-1');

jest.mock('../wrapper/s3-client', () => ({
  S3ClientWrapper: jest.fn().mockImplementation(() => ({
    putObject: mockPutObject,
    getObject: mockGetObject,
    headObject: mockHeadObject,
    deleteObject: mockDeleteObject,
    deleteObjects: mockDeleteObjects,
    listObjects: mockListObjects,
    copyObject: mockCopyObject,
    getObjectAcl: mockGetObjectAcl,
    setObjectAcl: mockSetObjectAcl,
    getPresignedUrl: mockGetPresignedUrl,
    createMultipartUpload: mockCreateMultipartUpload,
    uploadPart: mockUploadPart,
    completeMultipartUpload: mockCompleteMultipartUpload,
    abortMultipartUpload: mockAbortMultipartUpload,
    getBucket: mockGetBucket,
    getRegion: mockGetRegion,
  })),
}));

const baseConfig = {
  driver: 's3' as const,
  bucket: 'test-bucket',
  region: 'us-east-1',
  key: 'access-key',
  secret: 'secret-key',
};

describe('S3Disk', () => {
  let disk: S3Disk;

  beforeEach(() => {
    jest.clearAllMocks();
    disk = new S3Disk(baseConfig);
  });

  describe('constructor', () => {
    it('should throw if bucket is missing', () => {
      expect(
        () => new S3Disk({ driver: 's3', region: 'us-east-1', key: 'k', secret: 's' }),
      ).toThrow('S3 configuration missing required fields: bucket');
    });

    it('should throw if region is missing', () => {
      expect(() => new S3Disk({ driver: 's3', bucket: 'b', key: 'k', secret: 's' })).toThrow(
        'S3 configuration missing required fields: region',
      );
    });
  });

  describe('exists', () => {
    it('should return true when object exists', async () => {
      mockHeadObject.mockResolvedValue({});
      expect(await disk.exists('file.txt')).toBe(true);
    });

    it('should return false for NotFound', async () => {
      mockHeadObject.mockRejectedValue({ name: 'NotFound' });
      expect(await disk.exists('missing.txt')).toBe(false);
    });

    it('should return false for 404', async () => {
      mockHeadObject.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });
      expect(await disk.exists('missing.txt')).toBe(false);
    });

    it('should rethrow other errors', async () => {
      mockHeadObject.mockRejectedValue(new Error('Network error'));
      await expect(disk.exists('file.txt')).rejects.toThrow('Network error');
    });
  });

  describe('get', () => {
    it('should return buffer by default', async () => {
      const mockStream = Readable.from(['hello']);
      mockGetObject.mockResolvedValue({ body: mockStream });

      const result = await disk.get('file.txt');
      expect(Buffer.isBuffer(result)).toBe(true);
      expect((result as Buffer).toString()).toBe('hello');
    });

    it('should return string when requested', async () => {
      const mockStream = Readable.from(['hello']);
      mockGetObject.mockResolvedValue({ body: mockStream });

      const result = await disk.get('file.txt', { responseType: 'string' });
      expect(result).toBe('hello');
    });

    it('should return stream when requested', async () => {
      const mockStream = Readable.from(['hello']);
      mockGetObject.mockResolvedValue({ body: mockStream });

      const result = await disk.get('file.txt', { responseType: 'stream' });
      expect(result).toBe(mockStream);
    });

    it('should throw if no body returned', async () => {
      mockGetObject.mockResolvedValue({});
      await expect(disk.get('file.txt')).rejects.toThrow('No body returned from S3');
    });
  });

  describe('put', () => {
    it('should put string content', async () => {
      const result = await disk.put('file.txt', 'hello');
      expect(result).toBe(true);
      expect(mockPutObject).toHaveBeenCalledWith(expect.objectContaining({ Key: 'file.txt' }));
    });

    it('should put buffer content', async () => {
      const result = await disk.put('file.bin', Buffer.from('binary'));
      expect(result).toBe(true);
    });

    it('should pass metadata with string values', async () => {
      await disk.put('file.txt', 'data', {
        metadata: { count: 42 as any },
      });
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          Metadata: { count: '42' },
        }),
      );
    });

    it('should pass content type options', async () => {
      await disk.put('file.txt', 'data', {
        mimetype: 'application/json',
        CacheControl: 'max-age=3600',
        ContentDisposition: 'attachment',
      });
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'application/json',
          CacheControl: 'max-age=3600',
          ContentDisposition: 'attachment',
        }),
      );
    });

    it('should return false on error when throw is false', async () => {
      mockPutObject.mockRejectedValueOnce(new Error('Upload failed'));
      const noThrowDisk = new S3Disk({ ...baseConfig, throw: false });
      const result = await noThrowDisk.put('file.txt', 'data');
      expect(result).toBe(false);
    });

    it('should throw error when throw is not false', async () => {
      mockPutObject.mockRejectedValueOnce(new Error('Upload failed'));
      await expect(disk.put('file.txt', 'data')).rejects.toThrow('S3 upload failed');
    });

    it('should sanitize leading slashes from path', async () => {
      await disk.put('/file.txt', 'data');
      expect(mockPutObject).toHaveBeenCalledWith(expect.objectContaining({ Key: 'file.txt' }));
    });
  });

  describe('putFile', () => {
    it('should upload multer-like file', async () => {
      const file = { buffer: Buffer.from('data'), originalname: 'upload.txt' };
      const result = await disk.putFile('uploads', file);
      expect(result).toBe('uploads/upload.txt');
    });

    it('should upload with stream file', async () => {
      const stream = Readable.from(['data']);
      const result = await disk.putFile('uploads', stream, { filename: 'custom.txt' });
      expect(result).toBe('uploads/custom.txt');
    });

    it('should upload raw data', async () => {
      const result = await disk.putFile('uploads', 'raw string');
      expect(result).toBe('uploads/upload');
    });
  });

  describe('putFileAs', () => {
    it('should upload with custom name', async () => {
      const result = await disk.putFileAs('uploads', Buffer.from('data'), 'custom.txt');
      expect(result).toBe('uploads/custom.txt');
    });

    it('should handle multer-like file', async () => {
      const file = { buffer: Buffer.from('data') };
      const result = await disk.putFileAs('uploads', file, 'named.txt');
      expect(result).toBe('uploads/named.txt');
    });
  });

  describe('delete', () => {
    it('should delete successfully', async () => {
      expect(await disk.delete('file.txt')).toBe(true);
      expect(mockDeleteObject).toHaveBeenCalledWith('file.txt');
    });

    it('should return false on error when throw is false', async () => {
      mockDeleteObject.mockRejectedValueOnce(new Error('Delete failed'));
      const noThrowDisk = new S3Disk({ ...baseConfig, throw: false });
      expect(await noThrowDisk.delete('file.txt')).toBe(false);
    });
  });

  describe('copy', () => {
    it('should copy a file', async () => {
      expect(await disk.copy('source.txt', 'dest.txt')).toBe(true);
      expect(mockCopyObject).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceKey: 'source.txt',
          destinationKey: 'dest.txt',
        }),
      );
    });
  });

  describe('move', () => {
    it('should copy then delete', async () => {
      expect(await disk.move('source.txt', 'dest.txt')).toBe(true);
      expect(mockCopyObject).toHaveBeenCalled();
      expect(mockDeleteObject).toHaveBeenCalledWith('source.txt');
    });

    it('should not delete if copy fails', async () => {
      mockCopyObject.mockRejectedValueOnce(new Error('Copy failed'));
      const noThrowDisk = new S3Disk({ ...baseConfig, throw: false });
      expect(await noThrowDisk.move('source.txt', 'dest.txt')).toBe(false);
      expect(mockDeleteObject).not.toHaveBeenCalled();
    });
  });

  describe('size', () => {
    it('should return content length', async () => {
      mockHeadObject.mockResolvedValue({ contentLength: 1024 });
      expect(await disk.size('file.txt')).toBe(1024);
    });

    it('should return 0 when no content length', async () => {
      mockHeadObject.mockResolvedValue({});
      expect(await disk.size('file.txt')).toBe(0);
    });
  });

  describe('lastModified', () => {
    it('should return timestamp', async () => {
      const date = new Date('2024-01-01');
      mockHeadObject.mockResolvedValue({ lastModified: date });
      expect(await disk.lastModified('file.txt')).toBe(date.getTime());
    });

    it('should return 0 when no last modified', async () => {
      mockHeadObject.mockResolvedValue({});
      expect(await disk.lastModified('file.txt')).toBe(0);
    });
  });

  describe('files / allFiles', () => {
    it('should list files with prefix', async () => {
      mockListObjects.mockResolvedValue({
        objects: [
          { key: 'dir/file1.txt', size: 100 },
          { key: 'dir/file2.txt', size: 200 },
        ],
        prefixes: [],
        nextContinuationToken: undefined,
      });

      const result = await disk.files('dir');
      expect(result).toEqual(['dir/file1.txt', 'dir/file2.txt']);
    });

    it('should exclude directory markers', async () => {
      mockListObjects.mockResolvedValue({
        objects: [
          { key: 'dir/', size: 0 },
          { key: 'dir/file.txt', size: 100 },
        ],
        prefixes: [],
        nextContinuationToken: undefined,
      });

      const result = await disk.files('dir', true);
      expect(result).toEqual(['dir/file.txt']);
    });

    it('should paginate through results', async () => {
      mockListObjects
        .mockResolvedValueOnce({
          objects: [{ key: 'file1.txt', size: 100 }],
          prefixes: [],
          nextContinuationToken: 'token',
        })
        .mockResolvedValueOnce({
          objects: [{ key: 'file2.txt', size: 200 }],
          prefixes: [],
          nextContinuationToken: undefined,
        });

      const result = await disk.allFiles();
      expect(result).toEqual(['file1.txt', 'file2.txt']);
      expect(mockListObjects).toHaveBeenCalledTimes(2);
    });
  });

  describe('directories', () => {
    it('should return prefixes for non-recursive', async () => {
      mockListObjects.mockResolvedValue({
        objects: [],
        prefixes: ['dir1/', 'dir2/'],
        nextContinuationToken: undefined,
      });

      const result = await disk.directories();
      expect(result).toEqual(['dir1/', 'dir2/']);
    });

    it('should return directory objects for recursive', async () => {
      mockListObjects.mockResolvedValue({
        objects: [
          { key: 'dir1/', size: 0 },
          { key: 'dir1/sub/', size: 0 },
          { key: 'dir1/file.txt', size: 100 },
        ],
        prefixes: [],
        nextContinuationToken: undefined,
      });

      const result = await disk.allDirectories();
      expect(result).toEqual(['dir1/', 'dir1/sub/']);
    });
  });

  describe('makeDirectory', () => {
    it('should create directory marker', async () => {
      await disk.makeDirectory('new-dir');
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'new-dir/',
          ContentType: 'application/x-directory',
        }),
      );
    });
  });

  describe('deleteDirectory', () => {
    it('should delete all files in directory', async () => {
      mockListObjects.mockResolvedValue({
        objects: [
          { key: 'dir/file1.txt', size: 100 },
          { key: 'dir/file2.txt', size: 200 },
        ],
        prefixes: [],
        nextContinuationToken: undefined,
      });
      mockHeadObject.mockResolvedValue({});

      await disk.deleteDirectory('dir');
      expect(mockDeleteObjects).toHaveBeenCalledWith(['dir/file1.txt', 'dir/file2.txt']);
    });
  });

  describe('getVisibility / setVisibility', () => {
    it('should get public visibility', async () => {
      mockGetObjectAcl.mockResolvedValue('public-read');
      expect(await disk.getVisibility('file.txt')).toBe('public');
    });

    it('should get private visibility', async () => {
      mockGetObjectAcl.mockResolvedValue('private');
      expect(await disk.getVisibility('file.txt')).toBe('private');
    });

    it('should set visibility', async () => {
      expect(await disk.setVisibility('file.txt', 'public')).toBe(true);
      expect(mockSetObjectAcl).toHaveBeenCalledWith('file.txt', 'public-read');
    });
  });

  describe('url', () => {
    it('should build S3 URL', () => {
      const url = disk.url('path/file.txt');
      expect(url).toBe('https://test-bucket.s3.amazonaws.com/path/file.txt');
    });

    it('should use custom URL if configured', () => {
      const customUrlDisk = new S3Disk({ ...baseConfig, url: 'https://cdn.example.com' });
      const url = customUrlDisk.url('path/file.txt');
      expect(url).toBe('https://cdn.example.com/path/file.txt');
    });

    it('should encode special characters', () => {
      const url = disk.url('path/file name.txt');
      expect(url).toContain('file%20name.txt');
    });
  });

  describe('temporaryUrl', () => {
    it('should generate presigned URL with expiration date', async () => {
      const url = await disk.temporaryUrl('file.txt', new Date(Date.now() + 3600000));
      expect(url).toBe('https://signed.url');
    });

    it('should generate presigned URL with expiration seconds', async () => {
      const url = await disk.temporaryUrl('file.txt', 3600);
      expect(url).toBe('https://signed.url');
    });

    it('should use PUT operation for PUT method', async () => {
      await disk.temporaryUrl('file.txt', 3600, { method: 'PUT' });
      expect(mockGetPresignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'putObject' }),
      );
    });
  });

  describe('prepend / append', () => {
    it('should prepend to existing file', async () => {
      const mockStream = Readable.from(['existing']);
      mockGetObject.mockResolvedValue({ body: mockStream });

      await disk.prepend('file.txt', 'prefix ');
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'file.txt',
          Body: 'prefix existing',
        }),
      );
    });

    it('should create file if prepend target does not exist', async () => {
      mockGetObject.mockRejectedValue(new Error('NotFound'));

      await disk.prepend('new.txt', 'data');
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({ Key: 'new.txt', Body: 'data' }),
      );
    });

    it('should append to existing file', async () => {
      const mockStream = Readable.from(['existing']);
      mockGetObject.mockResolvedValue({ body: mockStream });

      await disk.append('file.txt', ' suffix');
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'file.txt',
          Body: 'existing suffix',
        }),
      );
    });
  });

  describe('getMetadata', () => {
    it('should return file metadata', async () => {
      mockHeadObject.mockResolvedValue({
        contentType: 'text/plain',
        contentLength: 100,
        lastModified: new Date('2024-01-01'),
        metadata: { custom: 'value' },
      });
      mockGetObjectAcl.mockResolvedValue('private');

      const metadata = await disk.getMetadata('file.txt');
      expect(metadata.path).toBe('file.txt');
      expect(metadata.size).toBe(100);
      expect(metadata.mimetype).toBe('text/plain');
      expect(metadata.s3_bucket).toBe('test-bucket');
    });
  });

  describe('mimeType', () => {
    it('should return mime type from metadata', async () => {
      mockHeadObject.mockResolvedValue({ contentType: 'image/jpeg' });
      mockGetObjectAcl.mockResolvedValue('private');

      expect(await disk.mimeType('photo.jpg')).toBe('image/jpeg');
    });
  });

  describe('directorySize', () => {
    it('should sum file sizes in directory', async () => {
      mockListObjects.mockResolvedValue({
        objects: [
          { key: 'dir/file1.txt', size: 100 },
          { key: 'dir/file2.txt', size: 200 },
          { key: 'dir/', size: 0 },
        ],
        nextContinuationToken: undefined,
      });

      expect(await disk.directorySize('dir')).toBe(300);
    });
  });

  describe('getBucket', () => {
    it('should return bucket name', () => {
      expect(disk.getBucket()).toBe('test-bucket');
    });
  });

  describe('multipart upload', () => {
    it('should initialize multipart upload', async () => {
      mockCreateMultipartUpload.mockResolvedValue({ uploadId: 'mpu-123' });

      const result = await disk.initMultipartUpload('file.txt');
      expect(result.uploadId).toBe('mpu-123');
      expect(result.key).toBe('file.txt');
      expect(result.bucket).toBe('test-bucket');
    });

    it('should upload part', async () => {
      mockUploadPart.mockResolvedValue({ etag: '"part-etag"' });

      const result = await disk.uploadPart('mpu-123', 1, Buffer.from('data'), 'file.txt');
      expect(result.partNumber).toBe(1);
      expect(result.etag).toBe('"part-etag"');
      expect(result.size).toBe(4);
    });

    it('should complete multipart upload', async () => {
      const parts = [
        { partNumber: 2, etag: '"e2"', size: 100 },
        { partNumber: 1, etag: '"e1"', size: 100 },
      ];
      expect(await disk.completeMultipartUpload('mpu-123', 'file.txt', parts)).toBe(true);
      // Verify parts are sorted
      expect(mockCompleteMultipartUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          parts: [
            { partNumber: 1, etag: '"e1"' },
            { partNumber: 2, etag: '"e2"' },
          ],
        }),
      );
    });

    it('should abort multipart upload', async () => {
      expect(await disk.abortMultipartUpload('mpu-123', 'file.txt')).toBe(true);
      expect(mockAbortMultipartUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadId: 'mpu-123',
          key: 'file.txt',
        }),
      );
    });
  });

  describe('putFileMultipart', () => {
    it('should use putFileAs for small files', async () => {
      const file = { buffer: Buffer.alloc(100, 'a'), originalname: 'small.bin' };
      const result = await disk.putFileMultipart('uploads', file);
      expect(result).toBe('uploads/small.bin');
      expect(mockCreateMultipartUpload).not.toHaveBeenCalled();
    });

    it('should use multipart for large files', async () => {
      const file = {
        buffer: Buffer.alloc(11 * 1024 * 1024, 'x'),
        originalname: 'large.bin',
      };
      mockCreateMultipartUpload.mockResolvedValue({ uploadId: 'mpu-large' });
      mockUploadPart.mockResolvedValue({ etag: '"part-etag"' });
      mockCompleteMultipartUpload.mockResolvedValue({});

      const result = await disk.putFileMultipart('uploads', file);
      expect(result).toBe('uploads/large.bin');
      expect(mockCreateMultipartUpload).toHaveBeenCalled();
    });

    it('should call onProgress callback', async () => {
      const file = {
        buffer: Buffer.alloc(11 * 1024 * 1024, 'x'),
        originalname: 'progress.bin',
      };
      mockCreateMultipartUpload.mockResolvedValue({ uploadId: 'mpu-prog' });
      mockUploadPart.mockResolvedValue({ etag: '"etag"' });
      mockCompleteMultipartUpload.mockResolvedValue({});

      const onProgress = jest.fn();
      await disk.putFileMultipart('uploads', file, { onProgress });
      expect(onProgress).toHaveBeenCalled();
    });

    it('should abort on error', async () => {
      const file = {
        buffer: Buffer.alloc(11 * 1024 * 1024, 'x'),
        originalname: 'fail.bin',
      };
      mockCreateMultipartUpload.mockResolvedValue({ uploadId: 'mpu-err' });
      mockUploadPart.mockRejectedValueOnce(new Error('Part failed'));

      const noThrowDisk = new S3Disk({ ...baseConfig, throw: false });
      const result = await noThrowDisk.putFileMultipart('uploads', file);
      expect(result).toBe(false);
      expect(mockAbortMultipartUpload).toHaveBeenCalled();
    });
  });
});
