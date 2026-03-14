import { Readable } from 'stream';

import { GcsDisk } from './gcs-disk';

// Mock GcsClientWrapper
const mockPutObject = jest.fn().mockResolvedValue(undefined);
const mockGetObject = jest.fn();
const mockHeadObject = jest.fn();
const mockDeleteObject = jest.fn().mockResolvedValue(undefined);
const mockDeleteObjects = jest.fn().mockResolvedValue(undefined);
const mockListObjects = jest.fn();
const mockCopyObject = jest.fn().mockResolvedValue(undefined);
const mockMoveObject = jest.fn().mockResolvedValue(undefined);
const mockMakePublic = jest.fn().mockResolvedValue(undefined);
const mockMakePrivate = jest.fn().mockResolvedValue(undefined);
const mockIsPublic = jest.fn();
const mockGetPresignedUrl = jest.fn().mockResolvedValue('https://signed.url');
const mockCompose = jest.fn().mockResolvedValue(undefined);
const mockExists = jest.fn();
const mockDeletePrefix = jest.fn().mockResolvedValue(undefined);
const mockGetBucket = jest.fn().mockReturnValue('gcs-bucket');

jest.mock('../wrapper/gcs-client', () => ({
  GcsClientWrapper: jest.fn().mockImplementation(() => ({
    putObject: mockPutObject,
    getObject: mockGetObject,
    headObject: mockHeadObject,
    deleteObject: mockDeleteObject,
    deleteObjects: mockDeleteObjects,
    listObjects: mockListObjects,
    copyObject: mockCopyObject,
    moveObject: mockMoveObject,
    makePublic: mockMakePublic,
    makePrivate: mockMakePrivate,
    isPublic: mockIsPublic,
    getPresignedUrl: mockGetPresignedUrl,
    compose: mockCompose,
    exists: mockExists,
    deletePrefix: mockDeletePrefix,
    getBucket: mockGetBucket,
  })),
}));

const baseConfig = {
  driver: 'gcs' as const,
  bucket: 'gcs-bucket',
  projectId: 'test-project',
};

describe('GcsDisk', () => {
  let disk: GcsDisk;

  beforeEach(() => {
    jest.clearAllMocks();
    disk = new GcsDisk(baseConfig);
  });

  describe('constructor', () => {
    it('should throw if bucket is missing', () => {
      expect(() => new GcsDisk({ driver: 'gcs' })).toThrow('GCS configuration requires bucket');
    });

    it('should create with valid config', () => {
      expect(disk).toBeDefined();
    });
  });

  describe('exists', () => {
    it('should return true when file exists', async () => {
      mockExists.mockResolvedValue(true);
      expect(await disk.exists('file.txt')).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      mockExists.mockResolvedValue(false);
      expect(await disk.exists('missing.txt')).toBe(false);
    });

    it('should return false on error', async () => {
      mockExists.mockRejectedValue(new Error('Network error'));
      expect(await disk.exists('file.txt')).toBe(false);
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
      await expect(disk.get('file.txt')).rejects.toThrow('No body returned from GCS');
    });
  });

  describe('put', () => {
    it('should put string content', async () => {
      expect(await disk.put('file.txt', 'hello')).toBe(true);
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'file.txt',
          body: 'hello',
        }),
      );
    });

    it('should put buffer content', async () => {
      expect(await disk.put('file.bin', Buffer.from('binary'))).toBe(true);
    });

    it('should make file public when visibility is public', async () => {
      await disk.put('file.txt', 'data', { visibility: 'public' });
      expect(mockMakePublic).toHaveBeenCalledWith('file.txt');
    });

    it('should not make file public when visibility is private', async () => {
      await disk.put('file.txt', 'data', { visibility: 'private' });
      expect(mockMakePublic).not.toHaveBeenCalled();
    });

    it('should pass metadata and content type options', async () => {
      await disk.put('file.txt', 'data', {
        mimetype: 'application/json',
        metadata: { key: 'value' },
        CacheControl: 'max-age=3600',
      });
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'application/json',
          metadata: { key: 'value' },
          cacheControl: 'max-age=3600',
        }),
      );
    });

    it('should return false on error when throw is false', async () => {
      mockPutObject.mockRejectedValueOnce(new Error('Upload failed'));
      const noThrowDisk = new GcsDisk({ ...baseConfig, throw: false });
      expect(await noThrowDisk.put('file.txt', 'data')).toBe(false);
    });

    it('should throw on error when throw is not false', async () => {
      mockPutObject.mockRejectedValueOnce(new Error('Upload failed'));
      await expect(disk.put('file.txt', 'data')).rejects.toThrow('GCS upload failed');
    });
  });

  describe('putFile', () => {
    it('should upload multer-like file', async () => {
      const file = { buffer: Buffer.from('data'), originalname: 'upload.txt' };
      const result = await disk.putFile('uploads', file);
      expect(result).toBe('uploads/upload.txt');
    });

    it('should upload raw data', async () => {
      const result = await disk.putFile('uploads', 'string data');
      expect(result).toBe('uploads/upload');
    });
  });

  describe('putFileAs', () => {
    it('should upload with custom name', async () => {
      const result = await disk.putFileAs('uploads', Buffer.from('data'), 'custom.txt');
      expect(result).toBe('uploads/custom.txt');
    });
  });

  describe('delete', () => {
    it('should delete successfully', async () => {
      expect(await disk.delete('file.txt')).toBe(true);
      expect(mockDeleteObject).toHaveBeenCalledWith('file.txt');
    });

    it('should return false on error when throw is false', async () => {
      mockDeleteObject.mockRejectedValueOnce(new Error('Delete failed'));
      const noThrowDisk = new GcsDisk({ ...baseConfig, throw: false });
      expect(await noThrowDisk.delete('file.txt')).toBe(false);
    });
  });

  describe('copy', () => {
    it('should copy a file', async () => {
      expect(await disk.copy('source.txt', 'dest.txt')).toBe(true);
      expect(mockCopyObject).toHaveBeenCalledWith({
        sourceKey: 'source.txt',
        destinationKey: 'dest.txt',
      });
    });
  });

  describe('move', () => {
    it('should move a file', async () => {
      expect(await disk.move('source.txt', 'dest.txt')).toBe(true);
      expect(mockMoveObject).toHaveBeenCalledWith('source.txt', 'dest.txt');
    });
  });

  describe('size', () => {
    it('should return content length', async () => {
      mockHeadObject.mockResolvedValue({ contentLength: 1024 });
      expect(await disk.size('file.txt')).toBe(1024);
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
    it('should list files', async () => {
      mockListObjects.mockResolvedValue({
        objects: [
          { key: 'dir/file1.txt', size: 100 },
          { key: 'dir/file2.txt', size: 200 },
        ],
        prefixes: [],
        nextPageToken: undefined,
      });

      const result = await disk.files('dir');
      expect(result).toEqual(['dir/file1.txt', 'dir/file2.txt']);
    });

    it('should paginate through results', async () => {
      mockListObjects
        .mockResolvedValueOnce({
          objects: [{ key: 'file1.txt', size: 100 }],
          prefixes: [],
          nextPageToken: 'next',
        })
        .mockResolvedValueOnce({
          objects: [{ key: 'file2.txt', size: 200 }],
          prefixes: [],
          nextPageToken: undefined,
        });

      const result = await disk.allFiles();
      expect(result).toEqual(['file1.txt', 'file2.txt']);
    });
  });

  describe('directories', () => {
    it('should return prefixes for non-recursive', async () => {
      mockListObjects.mockResolvedValue({
        objects: [],
        prefixes: ['dir1/', 'dir2/'],
        nextPageToken: undefined,
      });

      const result = await disk.directories();
      expect(result).toEqual(['dir1/', 'dir2/']);
    });
  });

  describe('makeDirectory', () => {
    it('should create directory marker', async () => {
      await disk.makeDirectory('new-dir');
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'new-dir/',
          contentType: 'application/x-directory',
        }),
      );
    });
  });

  describe('deleteDirectory', () => {
    it('should delete all files with prefix', async () => {
      await disk.deleteDirectory('dir');
      expect(mockDeletePrefix).toHaveBeenCalledWith('dir/');
    });

    it('should handle trailing slash', async () => {
      await disk.deleteDirectory('dir/');
      expect(mockDeletePrefix).toHaveBeenCalledWith('dir/');
    });
  });

  describe('getVisibility / setVisibility', () => {
    it('should return public when file is public', async () => {
      mockIsPublic.mockResolvedValue(true);
      expect(await disk.getVisibility('file.txt')).toBe('public');
    });

    it('should return private when file is private', async () => {
      mockIsPublic.mockResolvedValue(false);
      expect(await disk.getVisibility('file.txt')).toBe('private');
    });

    it('should set visibility to public', async () => {
      expect(await disk.setVisibility('file.txt', 'public')).toBe(true);
      expect(mockMakePublic).toHaveBeenCalledWith('file.txt');
    });

    it('should set visibility to private', async () => {
      expect(await disk.setVisibility('file.txt', 'private')).toBe(true);
      expect(mockMakePrivate).toHaveBeenCalledWith('file.txt');
    });
  });

  describe('url', () => {
    it('should build GCS public URL', () => {
      expect(disk.url('path/file.txt')).toBe(
        'https://storage.googleapis.com/gcs-bucket/path/file.txt',
      );
    });

    it('should use custom URL if configured', () => {
      const customUrlDisk = new GcsDisk({ ...baseConfig, url: 'https://cdn.example.com' });
      expect(customUrlDisk.url('path/file.txt')).toBe('https://cdn.example.com/path/file.txt');
    });
  });

  describe('temporaryUrl', () => {
    it('should generate presigned URL with expiration seconds', async () => {
      const url = await disk.temporaryUrl('file.txt', 3600);
      expect(url).toBe('https://signed.url');
      expect(mockGetPresignedUrl).toHaveBeenCalledWith(expect.objectContaining({ action: 'read' }));
    });

    it('should generate presigned URL with expiration date', async () => {
      await disk.temporaryUrl('file.txt', new Date(Date.now() + 3600000));
      expect(mockGetPresignedUrl).toHaveBeenCalled();
    });

    it('should use write action for PUT method', async () => {
      await disk.temporaryUrl('file.txt', 3600, { method: 'PUT' });
      expect(mockGetPresignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'write' }),
      );
    });

    it('should use delete action for DELETE method', async () => {
      await disk.temporaryUrl('file.txt', 3600, { method: 'DELETE' });
      expect(mockGetPresignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'delete' }),
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
          key: 'file.txt',
          body: 'prefix existing',
        }),
      );
    });

    it('should create file if prepend target does not exist', async () => {
      mockGetObject.mockRejectedValue(new Error('NotFound'));

      await disk.prepend('new.txt', 'data');
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'new.txt', body: 'data' }),
      );
    });

    it('should append to existing file', async () => {
      const mockStream = Readable.from(['existing']);
      mockGetObject.mockResolvedValue({ body: mockStream });

      await disk.append('file.txt', ' suffix');
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'file.txt',
          body: 'existing suffix',
        }),
      );
    });
  });

  describe('getMetadata', () => {
    it('should return metadata', async () => {
      mockHeadObject.mockResolvedValue({
        contentType: 'text/plain',
        contentLength: 100,
        lastModified: new Date('2024-01-01'),
        metadata: { custom: 'value' },
      });
      mockIsPublic.mockResolvedValue(false);

      const metadata = await disk.getMetadata('file.txt');
      expect(metadata.path).toBe('file.txt');
      expect(metadata.size).toBe(100);
      expect(metadata.mimetype).toBe('text/plain');
      expect(metadata.gcs_bucket).toBe('gcs-bucket');
      expect(metadata.custom).toBe('value');
    });
  });

  describe('mimeType', () => {
    it('should return mime type from metadata', async () => {
      mockHeadObject.mockResolvedValue({ contentType: 'image/png' });
      mockIsPublic.mockResolvedValue(false);

      expect(await disk.mimeType('image.png')).toBe('image/png');
    });
  });

  describe('directorySize', () => {
    it('should sum file sizes', async () => {
      mockListObjects.mockResolvedValue({
        objects: [
          { key: 'dir/file1.txt', size: 100 },
          { key: 'dir/file2.txt', size: 200 },
          { key: 'dir/', size: 0 },
        ],
        nextPageToken: undefined,
      });

      expect(await disk.directorySize('dir')).toBe(300);
    });
  });

  describe('getBucket', () => {
    it('should return bucket name', () => {
      expect(disk.getBucket()).toBe('gcs-bucket');
    });
  });

  describe('multipart upload', () => {
    it('should initialize multipart upload', async () => {
      const result = await disk.initMultipartUpload('file.txt');
      expect(result.uploadId).toBeDefined();
      expect(result.key).toBe('file.txt');
      expect(result.bucket).toBe('gcs-bucket');
    });

    it('should upload part as temp object', async () => {
      const { uploadId } = await disk.initMultipartUpload('file.txt');
      const result = await disk.uploadPart(uploadId, 1, Buffer.from('data'), 'file.txt');

      expect(result.partNumber).toBe(1);
      expect(result.etag).toBeDefined();
      expect(result.size).toBe(4);
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          key: expect.stringContaining('.__multipart/'),
          contentType: 'application/octet-stream',
        }),
      );
    });

    it('should handle Uint8Array parts', async () => {
      const { uploadId } = await disk.initMultipartUpload('file.txt');
      const data = new Uint8Array([1, 2, 3]);
      const result = await disk.uploadPart(uploadId, 1, data, 'file.txt');
      expect(result.size).toBe(3);
    });

    it('should handle stream parts', async () => {
      const { uploadId } = await disk.initMultipartUpload('file.txt');
      const stream = Readable.from(['stream data']);
      const result = await disk.uploadPart(uploadId, 1, stream, 'file.txt');
      expect(result.size).toBe(11);
    });

    it('should complete multipart upload with compose', async () => {
      const { uploadId } = await disk.initMultipartUpload('file.txt');

      const parts = [
        { partNumber: 1, etag: 'e1', size: 100 },
        { partNumber: 2, etag: 'e2', size: 100 },
      ];

      expect(await disk.completeMultipartUpload(uploadId, 'file.txt', parts)).toBe(true);
      expect(mockCompose).toHaveBeenCalled();
      expect(mockDeletePrefix).toHaveBeenCalled();
    });

    it('should abort multipart upload', async () => {
      const { uploadId } = await disk.initMultipartUpload('file.txt');

      expect(await disk.abortMultipartUpload(uploadId, 'file.txt')).toBe(true);
      expect(mockDeletePrefix).toHaveBeenCalledWith(expect.stringContaining('.__multipart/'));
    });
  });

  describe('putFileMultipart', () => {
    it('should use putFileAs for small files', async () => {
      const file = { buffer: Buffer.alloc(100, 'a'), originalname: 'small.bin' };
      const result = await disk.putFileMultipart('uploads', file);
      expect(result).toBe('uploads/small.bin');
    });

    it('should handle multer file', async () => {
      const file = { buffer: Buffer.alloc(100, 'x'), originalname: 'small.txt' };
      const result = await disk.putFileMultipart('uploads', file);
      expect(result).toBe('uploads/small.txt');
    });
  });
});
