import { GcsClientWrapper } from './gcs-client';

// Create mock functions
const mockSave = jest.fn().mockResolvedValue(undefined);
const mockGetMetadata = jest.fn();
const mockCreateReadStream = jest.fn();
const mockDelete = jest.fn().mockResolvedValue(undefined);
const mockCopy = jest.fn().mockResolvedValue(undefined);
const mockMove = jest.fn().mockResolvedValue(undefined);
const mockMakePublic = jest.fn().mockResolvedValue(undefined);
const mockMakePrivate = jest.fn().mockResolvedValue(undefined);
const mockAclGet = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockCompose = jest.fn().mockResolvedValue(undefined);
const mockExists = jest.fn();
const mockGetFiles = jest.fn();
const mockDeleteFiles = jest.fn().mockResolvedValue(undefined);

const mockFile = jest.fn().mockImplementation(() => ({
  save: mockSave,
  getMetadata: mockGetMetadata,
  createReadStream: mockCreateReadStream,
  delete: mockDelete,
  copy: mockCopy,
  move: mockMove,
  makePublic: mockMakePublic,
  makePrivate: mockMakePrivate,
  acl: { get: mockAclGet },
  getSignedUrl: mockGetSignedUrl,
  compose: mockCompose,
  exists: mockExists,
}));

const mockBucket = jest.fn().mockImplementation(() => ({
  file: mockFile,
  getFiles: mockGetFiles,
  deleteFiles: mockDeleteFiles,
}));

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    bucket: mockBucket,
  })),
}));

const baseConfig = {
  driver: 'gcs' as const,
  bucket: 'test-bucket',
  projectId: 'test-project',
};

describe('GcsClientWrapper', () => {
  let client: GcsClientWrapper;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new GcsClientWrapper(baseConfig);
  });

  describe('constructor', () => {
    it('should throw if bucket is missing', () => {
      expect(
        () => new GcsClientWrapper({ driver: 'gcs' }),
      ).toThrow('GCS bucket is required');
    });

    it('should create with valid config', () => {
      expect(client).toBeDefined();
    });

    it('should accept keyFilename config', () => {
      const c = new GcsClientWrapper({
        ...baseConfig,
        keyFilename: '/path/to/key.json',
      });
      expect(c).toBeDefined();
    });

    it('should accept credentials config', () => {
      const c = new GcsClientWrapper({
        ...baseConfig,
        credentials: { client_email: 'test@test.iam.gserviceaccount.com', private_key: 'key' },
      });
      expect(c).toBeDefined();
    });
  });

  describe('putObject', () => {
    it('should save buffer data', async () => {
      await client.putObject({
        key: 'file.txt',
        body: Buffer.from('data'),
        contentType: 'text/plain',
      });
      expect(mockFile).toHaveBeenCalledWith('file.txt');
      expect(mockSave).toHaveBeenCalled();
    });

    it('should save string data', async () => {
      await client.putObject({
        key: 'file.txt',
        body: 'string data',
        contentType: 'text/plain',
      });
      expect(mockSave).toHaveBeenCalled();
    });
  });

  describe('getObject', () => {
    it('should get object with metadata', async () => {
      const mockStream = { pipe: jest.fn() };
      mockGetMetadata.mockResolvedValue([{
        metadata: { custom: 'value' },
        contentType: 'text/plain',
        size: '100',
        updated: '2024-01-01T00:00:00Z',
        etag: '"etag"',
      }]);
      mockCreateReadStream.mockReturnValue(mockStream);

      const result = await client.getObject('file.txt');
      expect(result.body).toBe(mockStream);
      expect(result.metadata).toEqual({ custom: 'value' });
      expect(result.contentType).toBe('text/plain');
      expect(result.contentLength).toBe(100);
      expect(result.etag).toBe('"etag"');
    });
  });

  describe('headObject', () => {
    it('should return metadata without body', async () => {
      mockGetMetadata.mockResolvedValue([{
        metadata: { custom: 'value' },
        contentType: 'application/pdf',
        size: '5000',
        updated: '2024-06-15T12:00:00Z',
        etag: '"head-etag"',
      }]);

      const result = await client.headObject('doc.pdf');
      expect(result.contentType).toBe('application/pdf');
      expect(result.contentLength).toBe(5000);
      expect(result.lastModified).toEqual(new Date('2024-06-15T12:00:00Z'));
    });

    it('should handle missing updated field', async () => {
      mockGetMetadata.mockResolvedValue([{
        size: '0',
      }]);

      const result = await client.headObject('file.txt');
      expect(result.lastModified).toBeUndefined();
    });
  });

  describe('deleteObject', () => {
    it('should delete with ignoreNotFound', async () => {
      await client.deleteObject('file.txt');
      expect(mockDelete).toHaveBeenCalledWith({ ignoreNotFound: true });
    });
  });

  describe('deleteObjects', () => {
    it('should delete multiple objects', async () => {
      await client.deleteObjects(['file1.txt', 'file2.txt']);
      expect(mockDelete).toHaveBeenCalledTimes(2);
    });

    it('should skip empty array', async () => {
      await client.deleteObjects([]);
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('listObjects', () => {
    it('should list objects', async () => {
      mockGetFiles.mockResolvedValue([
        [
          { name: 'file1.txt', metadata: { size: '100', updated: '2024-01-01T00:00:00Z', etag: '"e1"' } },
          { name: 'file2.txt', metadata: { size: '200', updated: '2024-01-02T00:00:00Z', etag: '"e2"' } },
        ],
        null,
        { prefixes: ['dir/'] },
      ]);

      const result = await client.listObjects({ prefix: '' });
      expect(result.objects).toHaveLength(2);
      expect(result.objects[0].key).toBe('file1.txt');
      expect(result.objects[0].size).toBe(100);
      expect(result.prefixes).toEqual(['dir/']);
    });

    it('should handle pagination', async () => {
      mockGetFiles.mockResolvedValue([
        [{ name: 'file.txt', metadata: { size: '100', updated: '2024-01-01T00:00:00Z' } }],
        { pageToken: 'next-page' },
        {},
      ]);

      const result = await client.listObjects({ prefix: '' });
      expect(result.nextPageToken).toBe('next-page');
      expect(result.isTruncated).toBe(true);
    });
  });

  describe('copyObject', () => {
    it('should copy a file', async () => {
      await client.copyObject({
        sourceKey: 'source.txt',
        destinationKey: 'dest.txt',
      });
      expect(mockCopy).toHaveBeenCalled();
    });

    it('should copy with metadata', async () => {
      await client.copyObject({
        sourceKey: 'source.txt',
        destinationKey: 'dest.txt',
        metadata: { key: 'value' },
      });
      expect(mockCopy).toHaveBeenCalled();
    });
  });

  describe('moveObject', () => {
    it('should move a file', async () => {
      await client.moveObject('source.txt', 'dest.txt');
      expect(mockMove).toHaveBeenCalled();
    });
  });

  describe('makePublic / makePrivate / isPublic', () => {
    it('should make file public', async () => {
      await client.makePublic('file.txt');
      expect(mockMakePublic).toHaveBeenCalled();
    });

    it('should make file private', async () => {
      await client.makePrivate('file.txt');
      expect(mockMakePrivate).toHaveBeenCalled();
    });

    it('should return true when file is public', async () => {
      mockAclGet.mockResolvedValue([{ entity: 'allUsers', role: 'READER' }]);
      const result = await client.isPublic('file.txt');
      expect(result).toBe(true);
    });

    it('should return false when file is not public', async () => {
      mockAclGet.mockRejectedValue(new Error('Not found'));
      const result = await client.isPublic('file.txt');
      expect(result).toBe(false);
    });
  });

  describe('getPresignedUrl', () => {
    it('should generate signed URL for read', async () => {
      mockGetSignedUrl.mockResolvedValue(['https://signed-url.example.com']);

      const url = await client.getPresignedUrl({
        key: 'file.txt',
        action: 'read',
        expiresIn: 3600,
      });
      expect(url).toBe('https://signed-url.example.com');
    });

    it('should pass contentType for write', async () => {
      mockGetSignedUrl.mockResolvedValue(['https://write-url.example.com']);

      const url = await client.getPresignedUrl({
        key: 'file.txt',
        action: 'write',
        contentType: 'text/plain',
      });
      expect(url).toBe('https://write-url.example.com');
    });
  });

  describe('compose', () => {
    it('should compose multiple files', async () => {
      await client.compose(['part1.txt', 'part2.txt'], 'combined.txt');
      expect(mockCompose).toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it('should return true when file exists', async () => {
      mockExists.mockResolvedValue([true]);
      const result = await client.exists('file.txt');
      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      mockExists.mockResolvedValue([false]);
      const result = await client.exists('nonexistent.txt');
      expect(result).toBe(false);
    });
  });

  describe('deletePrefix', () => {
    it('should delete all files with prefix', async () => {
      await client.deletePrefix('dir/');
      expect(mockDeleteFiles).toHaveBeenCalledWith({ prefix: 'dir/', force: true });
    });
  });

  describe('getBucket', () => {
    it('should return bucket name', () => {
      expect(client.getBucket()).toBe('test-bucket');
    });
  });
});
