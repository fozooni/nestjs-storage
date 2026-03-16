import { Readable } from 'stream';

import { StorageConfigurationError, StoragePermissionError } from '../errors/storage-errors';
import { AzureDisk } from './azure-disk';

// ─── Mock @azure/storage-blob ────────────────────────────────────────────────

const mockExists = jest.fn();
const mockDownload = jest.fn();
const mockUpload = jest.fn().mockResolvedValue(undefined);
const mockDeleteIfExists = jest.fn().mockResolvedValue(undefined);
const mockGetProperties = jest.fn();
const mockBeginCopyFromURL = jest.fn().mockResolvedValue(undefined);
const mockStageBlock = jest.fn().mockResolvedValue(undefined);
const mockCommitBlockList = jest.fn().mockResolvedValue(undefined);

// Blob client — returned by getBlobClient / getBlockBlobClient
const mockBlobClient = {
  exists: mockExists,
  download: mockDownload,
  deleteIfExists: mockDeleteIfExists,
  getProperties: mockGetProperties,
  beginCopyFromURL: mockBeginCopyFromURL,
  url: 'https://account.blob.core.windows.net/uploads/file.txt',
};

const mockBlockBlobClient = {
  ...mockBlobClient,
  upload: mockUpload,
  stageBlock: mockStageBlock,
  commitBlockList: mockCommitBlockList,
};

// async generator helper
function asyncItems<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const item of items) yield item;
    },
  };
}

const mockListBlobsFlat = jest.fn();
const mockListBlobsByHierarchy = jest.fn();

const mockContainerClient = {
  getBlobClient: jest.fn().mockReturnValue(mockBlobClient),
  getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
  listBlobsFlat: mockListBlobsFlat,
  listBlobsByHierarchy: mockListBlobsByHierarchy,
};

const mockGetContainerClient = jest.fn().mockReturnValue(mockContainerClient);

const mockBlobServiceClient = {
  getContainerClient: mockGetContainerClient,
};

const mockGenerateBlobSASQueryParameters = jest.fn().mockReturnValue({
  toString: () => 'sv=2021&sr=b&sig=abc&se=2099',
});

jest.mock('@azure/storage-blob', () => ({
  StorageSharedKeyCredential: jest.fn().mockImplementation(() => ({})),
  BlobServiceClient: jest.fn().mockImplementation(() => mockBlobServiceClient),
  BlobSASPermissions: {
    parse: jest.fn().mockReturnValue({}),
  },
  generateBlobSASQueryParameters: mockGenerateBlobSASQueryParameters,
}));

// ─── Config ───────────────────────────────────────────────────────────────────

const baseConfig = {
  driver: 'azure' as const,
  accountName: 'myaccount',
  accountKey: 'base64key==',
  containerName: 'uploads',
};

describe('AzureDisk', () => {
  let disk: AzureDisk;

  beforeEach(() => {
    jest.clearAllMocks();
    mockListBlobsFlat.mockReturnValue(asyncItems([]));
    mockListBlobsByHierarchy.mockReturnValue(asyncItems([]));
    disk = new AzureDisk(baseConfig);
  });

  // ─── constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create with accountKey auth', () => {
      expect(disk).toBeInstanceOf(AzureDisk);
    });

    it('should create with sasToken auth', () => {
      const d = new AzureDisk({
        driver: 'azure',
        accountName: 'acc',
        sasToken: 'sv=2021&sig=abc',
        containerName: 'uploads',
      });
      expect(d).toBeDefined();
    });

    it('should throw StorageConfigurationError when accountName is missing', () => {
      expect(() => new AzureDisk({ driver: 'azure', accountKey: 'k', containerName: 'c' })).toThrow(
        StorageConfigurationError,
      );
    });

    it('should throw StorageConfigurationError when both accountKey and sasToken are missing', () => {
      expect(
        () => new AzureDisk({ driver: 'azure', accountName: 'a', containerName: 'c' }),
      ).toThrow(StorageConfigurationError);
    });

    it('should throw StorageConfigurationError when containerName/bucket are missing', () => {
      expect(() => new AzureDisk({ driver: 'azure', accountName: 'a', accountKey: 'k' })).toThrow(
        StorageConfigurationError,
      );
    });

    it('should fall back to config.bucket when containerName is absent', () => {
      const d = new AzureDisk({
        driver: 'azure',
        accountName: 'acc',
        accountKey: 'k',
        bucket: 'fallback-container',
      });
      expect(d).toBeDefined();
    });
  });

  // ─── exists ───────────────────────────────────────────────────────────────

  describe('exists()', () => {
    it('should return true when blob exists', async () => {
      mockExists.mockResolvedValue(true);
      expect(await disk.exists('file.txt')).toBe(true);
    });

    it('should return false when blob does not exist', async () => {
      mockExists.mockResolvedValue(false);
      expect(await disk.exists('missing.txt')).toBe(false);
    });

    it('should return false on error', async () => {
      mockExists.mockRejectedValue(new Error('network'));
      expect(await disk.exists('file.txt')).toBe(false);
    });
  });

  // ─── get ─────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('should return buffer by default', async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: Readable.from(['hello']),
      });
      const result = await disk.get('file.txt');
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should return string when responseType is string', async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: Readable.from(['world']),
      });
      const result = await disk.get('file.txt', { responseType: 'string' });
      expect(result).toBe('world');
    });

    it('should return stream when responseType is stream', async () => {
      const stream = Readable.from(['data']);
      mockDownload.mockResolvedValue({ readableStreamBody: stream });
      const result = await disk.get('file.txt', { responseType: 'stream' });
      expect(result).toBe(stream);
    });

    it('should throw on Azure 404', async () => {
      mockDownload.mockRejectedValue({ statusCode: 404, message: 'BlobNotFound' });
      const { StorageFileNotFoundError } = await import('../errors/storage-errors');
      await expect(disk.get('missing.txt')).rejects.toBeInstanceOf(StorageFileNotFoundError);
    });
  });

  // ─── put ─────────────────────────────────────────────────────────────────

  describe('put()', () => {
    it('should upload string content', async () => {
      const result = await disk.put('file.txt', 'hello');
      expect(result).toBe(true);
      expect(mockUpload).toHaveBeenCalled();
    });

    it('should upload buffer content', async () => {
      const result = await disk.put('file.bin', Buffer.from('binary'));
      expect(result).toBe(true);
    });

    it('should upload stream content', async () => {
      const stream = Readable.from(['stream data']);
      const result = await disk.put('stream.txt', stream);
      expect(result).toBe(true);
    });

    it('should pass content type in headers', async () => {
      await disk.put('file.json', '{}', { mimetype: 'application/json' });
      expect(mockUpload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Number),
        expect.objectContaining({
          blobHTTPHeaders: expect.objectContaining({ blobContentType: 'application/json' }),
        }),
      );
    });

    it('should return false on error when throw is false', async () => {
      mockUpload.mockRejectedValueOnce(new Error('upload failed'));
      const noThrowDisk = new AzureDisk({ ...baseConfig, throw: false });
      const result = await noThrowDisk.put('file.txt', 'data');
      expect(result).toBe(false);
    });
  });

  // ─── putFile ─────────────────────────────────────────────────────────────

  describe('putFile()', () => {
    it('should upload a multer-like file', async () => {
      const file = { buffer: Buffer.from('data'), originalname: 'upload.txt' };
      const result = await disk.putFile('uploads', file);
      expect(result).toBe('uploads/upload.txt');
    });

    it('should upload raw string data', async () => {
      const result = await disk.putFile('uploads', 'raw content');
      expect(result).toBe('uploads/upload');
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('should delete successfully', async () => {
      expect(await disk.delete('file.txt')).toBe(true);
      expect(mockDeleteIfExists).toHaveBeenCalled();
    });

    it('should return false on error when throw is false', async () => {
      mockDeleteIfExists.mockRejectedValueOnce(new Error('delete failed'));
      const noThrowDisk = new AzureDisk({ ...baseConfig, throw: false });
      expect(await noThrowDisk.delete('file.txt')).toBe(false);
    });
  });

  // ─── copy / move ─────────────────────────────────────────────────────────

  describe('copy()', () => {
    it('should copy a blob', async () => {
      expect(await disk.copy('source.txt', 'dest.txt')).toBe(true);
      expect(mockBeginCopyFromURL).toHaveBeenCalled();
    });
  });

  describe('move()', () => {
    it('should copy then delete the source', async () => {
      expect(await disk.move('source.txt', 'dest.txt')).toBe(true);
      expect(mockBeginCopyFromURL).toHaveBeenCalled();
      expect(mockDeleteIfExists).toHaveBeenCalled();
    });
  });

  // ─── size / lastModified ──────────────────────────────────────────────────

  describe('size()', () => {
    it('should return contentLength from properties', async () => {
      mockGetProperties.mockResolvedValue({ contentLength: 1024 });
      expect(await disk.size('file.txt')).toBe(1024);
    });

    it('should return 0 when contentLength is absent', async () => {
      mockGetProperties.mockResolvedValue({});
      expect(await disk.size('file.txt')).toBe(0);
    });
  });

  describe('lastModified()', () => {
    it('should return timestamp', async () => {
      const date = new Date('2024-01-15');
      mockGetProperties.mockResolvedValue({ lastModified: date.toISOString() });
      const ts = await disk.lastModified('file.txt');
      expect(ts).toBe(date.getTime());
    });

    it('should return 0 when lastModified is absent', async () => {
      mockGetProperties.mockResolvedValue({});
      expect(await disk.lastModified('file.txt')).toBe(0);
    });
  });

  // ─── files / directories ─────────────────────────────────────────────────

  describe('files()', () => {
    it('should list flat files recursively', async () => {
      mockListBlobsFlat.mockReturnValue(
        asyncItems([{ name: 'dir/a.txt' }, { name: 'dir/b.txt' }, { name: 'dir/' }]),
      );
      const result = await disk.files('dir', true);
      expect(result).toEqual(['dir/a.txt', 'dir/b.txt']);
    });

    it('should list non-recursive using hierarchy', async () => {
      mockListBlobsByHierarchy.mockReturnValue(
        asyncItems([
          { kind: 'blob', name: 'dir/a.txt' },
          { kind: 'prefix', name: 'dir/sub/' },
        ]),
      );
      const result = await disk.files('dir', false);
      expect(result).toEqual(['dir/a.txt']);
    });
  });

  describe('directories()', () => {
    it('should list directory prefixes (non-recursive)', async () => {
      mockListBlobsByHierarchy.mockReturnValue(
        asyncItems([
          { kind: 'prefix', name: 'dir/sub/' },
          { kind: 'blob', name: 'dir/file.txt' },
        ]),
      );
      const result = await disk.directories('dir', false);
      expect(result).toContain('dir/sub/');
    });

    it('should list directories recursively', async () => {
      mockListBlobsFlat.mockReturnValue(
        asyncItems([{ name: 'dir/sub/file.txt' }, { name: 'dir/other/file.txt' }]),
      );
      const result = await disk.directories('dir', true);
      expect(result).toContain('dir/');
      expect(result).toContain('dir/sub/');
      expect(result).toContain('dir/other/');
    });
  });

  describe('makeDirectory()', () => {
    it('should always return true (no-op on Azure)', async () => {
      expect(await disk.makeDirectory('new-dir')).toBe(true);
    });
  });

  describe('deleteDirectory()', () => {
    it('should delete all blobs with the directory prefix', async () => {
      mockListBlobsFlat.mockReturnValue(asyncItems([{ name: 'dir/a.txt' }, { name: 'dir/b.txt' }]));
      expect(await disk.deleteDirectory('dir')).toBe(true);
      expect(mockDeleteIfExists).toHaveBeenCalledTimes(2);
    });
  });

  // ─── visibility ──────────────────────────────────────────────────────────

  describe('getVisibility()', () => {
    it('should always return private (Azure is container-level)', async () => {
      expect(await disk.getVisibility('file.txt')).toBe('private');
    });
  });

  describe('setVisibility()', () => {
    it('should throw StoragePermissionError', async () => {
      await expect(disk.setVisibility('file.txt', 'public')).rejects.toBeInstanceOf(
        StoragePermissionError,
      );
    });
  });

  // ─── url / temporaryUrl ───────────────────────────────────────────────────

  describe('url()', () => {
    it('should build blob service URL', () => {
      expect(disk.url('uploads/photo.jpg')).toBe(
        'https://myaccount.blob.core.windows.net/uploads/uploads/photo.jpg',
      );
    });

    it('should prefer custom url when configured', () => {
      const d = new AzureDisk({ ...baseConfig, url: 'https://cdn.example.com' });
      expect(d.url('photo.jpg')).toBe('https://cdn.example.com/photo.jpg');
    });
  });

  describe('temporaryUrl()', () => {
    it('should generate a SAS URL', async () => {
      const url = await disk.temporaryUrl('file.txt', 3600);
      expect(url).toContain('sv=2021');
      expect(mockGenerateBlobSASQueryParameters).toHaveBeenCalled();
    });

    it('should accept a Date expiration', async () => {
      const url = await disk.temporaryUrl('file.txt', new Date(Date.now() + 86400000));
      expect(url).toBeDefined();
    });

    it('should throw when sasToken auth is used (no accountKey)', async () => {
      const sasDisk = new AzureDisk({
        driver: 'azure',
        accountName: 'acc',
        sasToken: 'sv=2021',
        containerName: 'uploads',
      });
      await expect(sasDisk.temporaryUrl('file.txt', 3600)).rejects.toBeInstanceOf(
        StorageConfigurationError,
      );
    });
  });

  // ─── prepend / append ────────────────────────────────────────────────────

  describe('prepend() / append()', () => {
    it('should prepend to existing content', async () => {
      mockDownload.mockResolvedValue({ readableStreamBody: Readable.from(['world']) });
      await disk.prepend('file.txt', 'hello ');
      expect(mockUpload).toHaveBeenCalledWith(Buffer.from('hello world'), 11, expect.anything());
    });

    it('should create file if prepend target missing', async () => {
      mockDownload.mockRejectedValue({ statusCode: 404 });
      await disk.prepend('new.txt', 'data');
      expect(mockUpload).toHaveBeenCalledWith(Buffer.from('data'), 4, expect.anything());
    });

    it('should append to existing content', async () => {
      mockDownload.mockResolvedValue({ readableStreamBody: Readable.from(['hello']) });
      await disk.append('file.txt', ' world');
      expect(mockUpload).toHaveBeenCalledWith(Buffer.from('hello world'), 11, expect.anything());
    });
  });

  // ─── getMetadata ─────────────────────────────────────────────────────────

  describe('getMetadata()', () => {
    it('should return file metadata', async () => {
      const date = new Date('2024-06-01');
      mockGetProperties.mockResolvedValue({
        contentType: 'image/jpeg',
        contentLength: 2048,
        lastModified: date.toISOString(),
        metadata: { author: 'alice' },
      });
      const meta = await disk.getMetadata('photo.jpg');
      expect(meta.path).toBe('photo.jpg');
      expect(meta.size).toBe(2048);
      expect(meta.mimetype).toBe('image/jpeg');
      expect(meta.azure_container).toBe('uploads');
    });
  });

  // ─── multipart ────────────────────────────────────────────────────────────

  describe('multipart upload', () => {
    it('should init, upload parts, and complete', async () => {
      const { uploadId, key } = await disk.initMultipartUpload('large.bin');
      expect(uploadId).toBeDefined();
      expect(key).toBe('large.bin');

      const part = await disk.uploadPart(uploadId, 1, Buffer.from('chunk'), 'large.bin');
      expect(part.partNumber).toBe(1);
      expect(part.size).toBe(5);
      expect(mockStageBlock).toHaveBeenCalled();

      const ok = await disk.completeMultipartUpload(uploadId, 'large.bin', [part]);
      expect(ok).toBe(true);
      expect(mockCommitBlockList).toHaveBeenCalledWith([part.etag]);
    });

    it('should abort (no-op, returns true)', async () => {
      const { uploadId } = await disk.initMultipartUpload('file.bin');
      expect(await disk.abortMultipartUpload(uploadId, 'file.bin')).toBe(true);
    });

    it('should handle Uint8Array parts', async () => {
      const { uploadId } = await disk.initMultipartUpload('uint8.bin');
      const data = new Uint8Array([1, 2, 3]);
      const part = await disk.uploadPart(uploadId, 1, data, 'uint8.bin');
      expect(part.size).toBe(3);
    });

    it('should handle stream parts', async () => {
      const { uploadId } = await disk.initMultipartUpload('stream.bin');
      const stream = Readable.from(['abc']);
      const part = await disk.uploadPart(uploadId, 1, stream, 'stream.bin');
      expect(part.size).toBe(3);
    });
  });

  // ─── getBucket ────────────────────────────────────────────────────────────

  describe('getBucket()', () => {
    it('should return the container name', () => {
      expect(disk.getBucket()).toBe('uploads');
    });

    it('should fall back to bucket config', () => {
      const d = new AzureDisk({
        driver: 'azure',
        accountName: 'acc',
        accountKey: 'k',
        bucket: 'my-container',
      });
      expect(d.getBucket()).toBe('my-container');
    });
  });

  // ─── deleteMany ───────────────────────────────────────────────────────────

  describe('deleteMany()', () => {
    it('should delete all paths and report succeeded/failed', async () => {
      const result = await disk.deleteMany(['a.txt', 'b.txt']);
      expect(result.succeeded).toEqual(['a.txt', 'b.txt']);
      expect(result.failed).toEqual([]);
    });
  });

  // ─── missing / json ───────────────────────────────────────────────────────

  describe('missing()', () => {
    it('should return true when file does not exist', async () => {
      mockExists.mockResolvedValue(false);
      expect(await disk.missing('nope.txt')).toBe(true);
    });

    it('should return false when file exists', async () => {
      mockExists.mockResolvedValue(true);
      expect(await disk.missing('file.txt')).toBe(false);
    });
  });

  describe('json()', () => {
    it('should read and parse JSON', async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: Readable.from([JSON.stringify({ key: 'value' })]),
      });
      const result = await disk.json<{ key: string }>('data.json');
      expect(result).toEqual({ key: 'value' });
    });
  });

  // ─── directorySize ────────────────────────────────────────────────────────

  describe('directorySize()', () => {
    it('should sum blob sizes', async () => {
      mockListBlobsFlat.mockReturnValue(
        asyncItems([
          { name: 'dir/a.txt', properties: { contentLength: 100 } },
          { name: 'dir/b.txt', properties: { contentLength: 200 } },
          { name: 'dir/', properties: { contentLength: 0 } },
        ]),
      );
      expect(await disk.directorySize('dir')).toBe(300);
    });
  });
});
