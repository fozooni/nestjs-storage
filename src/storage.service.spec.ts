import { StreamableFile } from '@nestjs/common';
import { Readable } from 'stream';

import { StorageService } from './storage.service';
import { StorageEventsService } from './events/storage-events.service';
import type { DiskConfig, FilesystemContract } from './interfaces/storage.interface';

function createMockEventsService(): StorageEventsService {
  return new StorageEventsService();
}

// Create a mock FilesystemContract
function createMockDisk(overrides: Partial<FilesystemContract> = {}): FilesystemContract {
  return {
    exists: jest.fn().mockResolvedValue(true),
    get: jest.fn().mockResolvedValue(Buffer.from('data')),
    put: jest.fn().mockResolvedValue(true),
    putFile: jest.fn().mockResolvedValue('uploads/file.txt'),
    putFileAs: jest.fn().mockResolvedValue('uploads/custom.txt'),
    delete: jest.fn().mockResolvedValue(true),
    copy: jest.fn().mockResolvedValue(true),
    move: jest.fn().mockResolvedValue(true),
    size: jest.fn().mockResolvedValue(1024),
    lastModified: jest.fn().mockResolvedValue(Date.now()),
    files: jest.fn().mockResolvedValue(['file1.txt']),
    allFiles: jest.fn().mockResolvedValue(['file1.txt', 'sub/file2.txt']),
    directories: jest.fn().mockResolvedValue(['sub/']),
    allDirectories: jest.fn().mockResolvedValue(['sub/', 'sub/deep/']),
    makeDirectory: jest.fn().mockResolvedValue(true),
    deleteDirectory: jest.fn().mockResolvedValue(true),
    getVisibility: jest.fn().mockResolvedValue('private'),
    setVisibility: jest.fn().mockResolvedValue(true),
    url: jest.fn().mockReturnValue('https://example.com/file.txt'),
    temporaryUrl: jest.fn().mockResolvedValue('https://signed.url'),
    prepend: jest.fn().mockResolvedValue(true),
    append: jest.fn().mockResolvedValue(true),
    getMetadata: jest
      .fn()
      .mockResolvedValue({ path: 'file.txt', size: 100, lastModified: new Date() }),
    mimeType: jest.fn().mockResolvedValue('text/plain'),
    directorySize: jest.fn().mockResolvedValue(5000),
    initMultipartUpload: jest.fn().mockResolvedValue({ uploadId: 'mpu-1', key: 'file.txt' }),
    uploadPart: jest.fn().mockResolvedValue({ partNumber: 1, etag: 'e1', size: 100 }),
    completeMultipartUpload: jest.fn().mockResolvedValue(true),
    abortMultipartUpload: jest.fn().mockResolvedValue(true),
    putFileMultipart: jest.fn().mockResolvedValue('uploads/file.txt'),
    getBucket: jest.fn().mockReturnValue('test-bucket'),
    missing: jest.fn().mockResolvedValue(false),
    json: jest.fn().mockResolvedValue({ key: 'value' }),
    checksum: jest.fn().mockResolvedValue('d41d8cd98f00b204e9800998ecf8427e'),
    deleteMany: jest.fn().mockResolvedValue({ succeeded: ['file.txt'], failed: [] }),
    ...overrides,
  };
}

// Mock all disk constructors
const mockLocalDisk = createMockDisk({ getBucket: jest.fn().mockReturnValue(undefined) });
const mockS3Disk = createMockDisk({ getBucket: jest.fn().mockReturnValue('s3-bucket') });
const mockR2Disk = createMockDisk({ getBucket: jest.fn().mockReturnValue('r2-bucket') });
const mockGcsDisk = createMockDisk({ getBucket: jest.fn().mockReturnValue('gcs-bucket') });

jest.mock('./disk/local-disk', () => ({
  LocalDisk: jest.fn().mockImplementation(() => mockLocalDisk),
}));

jest.mock('./disk/s3-disk', () => ({
  S3Disk: jest.fn().mockImplementation(() => mockS3Disk),
}));

jest.mock('./disk/r2-disk', () => ({
  R2Disk: jest.fn().mockImplementation(() => mockR2Disk),
}));

jest.mock('./disk/gcs-disk', () => ({
  GcsDisk: jest.fn().mockImplementation(() => mockGcsDisk),
}));

const defaultConfig = {
  default: 'local',
  disks: {
    local: { driver: 'local' as const, root: '/tmp/storage' },
    s3: { driver: 's3' as const, bucket: 's3-bucket', region: 'us-east-1', key: 'k', secret: 's' },
    r2: {
      driver: 'r2' as const,
      bucket: 'r2-bucket',
      region: 'auto',
      key: 'k',
      secret: 's',
      accountId: 'acc',
    },
    gcs: { driver: 'gcs' as const, bucket: 'gcs-bucket', projectId: 'p' },
  },
};

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StorageService(defaultConfig, createMockEventsService());
  });

  describe('disk', () => {
    it('should return default disk when no name provided', () => {
      const disk = service.disk();
      expect(disk).toBe(mockLocalDisk);
    });

    it('should return named disk', () => {
      const disk = service.disk('s3');
      expect(disk).toBe(mockS3Disk);
    });

    it('should cache disk instances', () => {
      const disk1 = service.disk('s3');
      const disk2 = service.disk('s3');
      expect(disk1).toBe(disk2);
    });

    it('should throw for unconfigured disk', () => {
      expect(() => service.disk('nonexistent')).toThrow('Disk [nonexistent] not configured');
    });

    it('should throw for unsupported driver', () => {
      const config = {
        default: 'custom',
        disks: { custom: { driver: 'unknown' as const } },
      };
      const svc = new StorageService(config, createMockEventsService());
      expect(() => svc.disk('custom')).toThrow('Driver [unknown] not supported');
    });
  });

  describe('diskByBucket', () => {
    it('should find disk by bucket name from config', () => {
      const disk = service.diskByBucket('s3-bucket');
      expect(disk).toBe(mockS3Disk);
    });

    it('should find cached disk by bucket name', () => {
      // Initialize the disk first (caches it)
      service.disk('gcs');
      const disk = service.diskByBucket('gcs-bucket');
      expect(disk).toBe(mockGcsDisk);
    });

    it('should throw if no disk matches bucket', () => {
      expect(() => service.diskByBucket('unknown-bucket')).toThrow(
        'No configured disk found for bucket [unknown-bucket]',
      );
    });
  });

  describe('cloud', () => {
    it('should return disk named "main"', () => {
      const config = {
        default: 'local',
        disks: {
          main: {
            driver: 's3' as const,
            bucket: 'main',
            region: 'us-east-1',
            key: 'k',
            secret: 's',
          },
          local: { driver: 'local' as const, root: '/tmp' },
        },
      };
      const svc = new StorageService(config, createMockEventsService());
      const disk = svc.cloud();
      expect(disk).toBe(mockS3Disk);
    });
  });

  describe('build', () => {
    it('should build disk from config without caching', () => {
      const config: DiskConfig = { driver: 'local', root: '/tmp/test' };
      const disk = service.build(config);
      expect(disk).toBe(mockLocalDisk);
    });

    it('should throw for unsupported driver', () => {
      expect(() => service.build({ driver: 'unknown' })).toThrow('Driver [unknown] not supported');
    });
  });

  describe('extend', () => {
    it('should register custom driver', () => {
      const customDisk = createMockDisk();
      service.extend('custom', () => customDisk);

      const config = {
        default: 'custom-disk',
        disks: { 'custom-disk': { driver: 'custom' } },
      };
      const svc = new StorageService(config, createMockEventsService());
      svc.extend('custom', () => customDisk);
      const disk = svc.disk('custom-disk');
      expect(disk).toBe(customDisk);
    });
  });

  describe('proxy methods to default disk', () => {
    it('should proxy exists', async () => {
      await service.exists('file.txt');
      expect(mockLocalDisk.exists).toHaveBeenCalledWith('file.txt');
    });

    it('should proxy get', async () => {
      await service.get('file.txt', { responseType: 'string' });
      expect(mockLocalDisk.get).toHaveBeenCalledWith('file.txt', { responseType: 'string' });
    });

    it('should proxy put', async () => {
      await service.put('file.txt', 'data', { visibility: 'public' });
      expect(mockLocalDisk.put).toHaveBeenCalledWith('file.txt', 'data', { visibility: 'public' });
    });

    it('should proxy putFile', async () => {
      const file = { buffer: Buffer.from('data') };
      await service.putFile('uploads', file);
      expect(mockLocalDisk.putFile).toHaveBeenCalledWith('uploads', file, undefined);
    });

    it('should proxy putFileAs', async () => {
      await service.putFileAs('uploads', Buffer.from('data'), 'name.txt');
      expect(mockLocalDisk.putFileAs).toHaveBeenCalledWith(
        'uploads',
        Buffer.from('data'),
        'name.txt',
        undefined,
      );
    });

    it('should proxy delete', async () => {
      await service.delete('file.txt');
      expect(mockLocalDisk.delete).toHaveBeenCalledWith('file.txt');
    });

    it('should proxy copy', async () => {
      await service.copy('from.txt', 'to.txt');
      expect(mockLocalDisk.copy).toHaveBeenCalledWith('from.txt', 'to.txt', undefined);
    });

    it('should proxy move', async () => {
      await service.move('from.txt', 'to.txt');
      expect(mockLocalDisk.move).toHaveBeenCalledWith('from.txt', 'to.txt', undefined);
    });

    it('should proxy size', async () => {
      await service.size('file.txt');
      expect(mockLocalDisk.size).toHaveBeenCalledWith('file.txt');
    });

    it('should proxy lastModified', async () => {
      await service.lastModified('file.txt');
      expect(mockLocalDisk.lastModified).toHaveBeenCalledWith('file.txt');
    });

    it('should proxy files', async () => {
      await service.files('dir', true);
      expect(mockLocalDisk.files).toHaveBeenCalledWith('dir', true);
    });

    it('should proxy allFiles', async () => {
      await service.allFiles('dir');
      expect(mockLocalDisk.allFiles).toHaveBeenCalledWith('dir');
    });

    it('should proxy directories', async () => {
      await service.directories('dir', true);
      expect(mockLocalDisk.directories).toHaveBeenCalledWith('dir', true);
    });

    it('should proxy allDirectories', async () => {
      await service.allDirectories('dir');
      expect(mockLocalDisk.allDirectories).toHaveBeenCalledWith('dir');
    });

    it('should proxy makeDirectory', async () => {
      await service.makeDirectory('new-dir');
      expect(mockLocalDisk.makeDirectory).toHaveBeenCalledWith('new-dir');
    });

    it('should proxy deleteDirectory', async () => {
      await service.deleteDirectory('dir');
      expect(mockLocalDisk.deleteDirectory).toHaveBeenCalledWith('dir');
    });

    it('should proxy getVisibility', async () => {
      await service.getVisibility('file.txt');
      expect(mockLocalDisk.getVisibility).toHaveBeenCalledWith('file.txt');
    });

    it('should proxy setVisibility', async () => {
      await service.setVisibility('file.txt', 'public');
      expect(mockLocalDisk.setVisibility).toHaveBeenCalledWith('file.txt', 'public');
    });

    it('should proxy url', () => {
      service.url('file.txt');
      expect(mockLocalDisk.url).toHaveBeenCalledWith('file.txt');
    });

    it('should proxy temporaryUrl', async () => {
      const expiration = new Date();
      await service.temporaryUrl('file.txt', expiration, { method: 'GET' });
      expect(mockLocalDisk.temporaryUrl).toHaveBeenCalledWith('file.txt', expiration, {
        method: 'GET',
      });
    });

    it('should proxy prepend', async () => {
      await service.prepend('file.txt', 'prefix');
      expect(mockLocalDisk.prepend).toHaveBeenCalledWith('file.txt', 'prefix');
    });

    it('should proxy append', async () => {
      await service.append('file.txt', 'suffix');
      expect(mockLocalDisk.append).toHaveBeenCalledWith('file.txt', 'suffix');
    });

    it('should proxy getMetadata', async () => {
      await service.getMetadata('file.txt');
      expect(mockLocalDisk.getMetadata).toHaveBeenCalledWith('file.txt');
    });

    it('should proxy mimeType', async () => {
      await service.mimeType('file.txt');
      expect(mockLocalDisk.mimeType).toHaveBeenCalledWith('file.txt');
    });

    it('should proxy directorySize', async () => {
      await service.directorySize('dir');
      expect(mockLocalDisk.directorySize).toHaveBeenCalledWith('dir');
    });
  });

  describe('convenience method proxies', () => {
    it('should proxy missing', async () => {
      await service.missing('file.txt');
      expect(mockLocalDisk.missing).toHaveBeenCalledWith('file.txt');
    });

    it('should proxy json', async () => {
      await service.json('data.json');
      expect(mockLocalDisk.json).toHaveBeenCalledWith('data.json', undefined);
    });

    it('should proxy checksum', async () => {
      await service.checksum('file.txt', 'sha256');
      expect(mockLocalDisk.checksum).toHaveBeenCalledWith('file.txt', 'sha256');
    });

    it('should proxy deleteMany', async () => {
      await service.deleteMany(['a.txt', 'b.txt']);
      expect(mockLocalDisk.deleteMany).toHaveBeenCalledWith(['a.txt', 'b.txt']);
    });

    it('should throw if disk does not support missing', async () => {
      const noMissingDisk = createMockDisk({ missing: undefined });
      (service as any).disks.set('local', noMissingDisk);
      await expect(service.missing('file.txt')).rejects.toThrow('Disk does not support missing()');
    });
  });

  describe('setDisk', () => {
    it('should replace a cached disk', () => {
      const newDisk = createMockDisk();
      service.setDisk('local', newDisk);
      expect(service.disk('local')).toBe(newDisk);
    });
  });

  describe('multipart proxy methods', () => {
    it('should proxy initMultipartUpload', async () => {
      await service.initMultipartUpload('file.txt');
      expect(mockLocalDisk.initMultipartUpload).toHaveBeenCalledWith('file.txt', undefined);
    });

    it('should proxy uploadPart', async () => {
      const data = Buffer.from('chunk');
      await service.uploadPart('mpu-1', 1, data, 'file.txt');
      expect(mockLocalDisk.uploadPart).toHaveBeenCalledWith('mpu-1', 1, data, 'file.txt');
    });

    it('should proxy completeMultipartUpload', async () => {
      const parts = [{ partNumber: 1, etag: 'e1', size: 100 }];
      await service.completeMultipartUpload('mpu-1', 'file.txt', parts);
      expect(mockLocalDisk.completeMultipartUpload).toHaveBeenCalledWith(
        'mpu-1',
        'file.txt',
        parts,
      );
    });

    it('should proxy abortMultipartUpload', async () => {
      await service.abortMultipartUpload('mpu-1', 'file.txt');
      expect(mockLocalDisk.abortMultipartUpload).toHaveBeenCalledWith('mpu-1', 'file.txt');
    });

    it('should proxy putFileMultipart', async () => {
      const file = Buffer.from('large');
      await service.putFileMultipart('uploads', file);
      expect(mockLocalDisk.putFileMultipart).toHaveBeenCalledWith('uploads', file, undefined);
    });

    it('should throw if disk does not support multipart', async () => {
      const noMultipartDisk = createMockDisk({
        initMultipartUpload: undefined,
        uploadPart: undefined,
        completeMultipartUpload: undefined,
        abortMultipartUpload: undefined,
        putFileMultipart: undefined,
      });

      jest.resetModules();
      const config = {
        default: 'limited',
        disks: { limited: { driver: 'local', root: '/tmp' } },
      };

      // Access a service with a disk that doesn't support multipart
      const svc = new StorageService(config, createMockEventsService());

      // Manually set the disk to our no-multipart disk
      (svc as any).disks.set('limited', noMultipartDisk);

      await expect(svc.initMultipartUpload('file.txt')).rejects.toThrow(
        'Disk does not support multipart upload',
      );
      await expect(svc.uploadPart('id', 1, Buffer.from(''), 'file.txt')).rejects.toThrow(
        'Disk does not support multipart upload',
      );
      await expect(svc.completeMultipartUpload('id', 'file.txt', [])).rejects.toThrow(
        'Disk does not support multipart upload',
      );
      await expect(svc.abortMultipartUpload('id', 'file.txt')).rejects.toThrow(
        'Disk does not support multipart upload',
      );
      await expect(svc.putFileMultipart('uploads', Buffer.from(''))).rejects.toThrow(
        'Disk does not support multipart upload',
      );
    });
  });

  describe('getStreamableFile', () => {
    it('should return a StreamableFile with correct options', async () => {
      const mockStream = Readable.from(['file content']);
      (mockLocalDisk.get as jest.Mock).mockResolvedValue(mockStream);
      (mockLocalDisk.mimeType as jest.Mock).mockResolvedValue('application/pdf');
      (mockLocalDisk.size as jest.Mock).mockResolvedValue(12345);

      const result = await service.getStreamableFile('documents/report.pdf');

      expect(result).toBeInstanceOf(StreamableFile);
      expect(result.getHeaders().type).toBe('application/pdf');
      expect(result.getHeaders().length).toBe(12345);
      expect(result.getHeaders().disposition).toBe('attachment; filename="report.pdf"');
    });

    it('should use inline disposition when specified', async () => {
      const mockStream = Readable.from(['data']);
      (mockLocalDisk.get as jest.Mock).mockResolvedValue(mockStream);
      (mockLocalDisk.mimeType as jest.Mock).mockResolvedValue('image/jpeg');
      (mockLocalDisk.size as jest.Mock).mockResolvedValue(500);

      const result = await service.getStreamableFile('photos/image.jpg', {
        disposition: 'inline',
      });

      expect(result.getHeaders().disposition).toBe('inline; filename="image.jpg"');
    });

    it('should use custom filename when provided', async () => {
      const mockStream = Readable.from(['data']);
      (mockLocalDisk.get as jest.Mock).mockResolvedValue(mockStream);
      (mockLocalDisk.mimeType as jest.Mock).mockResolvedValue('text/plain');
      (mockLocalDisk.size as jest.Mock).mockResolvedValue(100);

      const result = await service.getStreamableFile('uploads/abc123.txt', {
        filename: 'my-document.txt',
      });

      expect(result.getHeaders().disposition).toBe('attachment; filename="my-document.txt"');
    });

    it('should call get with stream responseType', async () => {
      const mockStream = Readable.from(['data']);
      (mockLocalDisk.get as jest.Mock).mockResolvedValue(mockStream);
      (mockLocalDisk.mimeType as jest.Mock).mockResolvedValue('text/plain');
      (mockLocalDisk.size as jest.Mock).mockResolvedValue(4);

      await service.getStreamableFile('file.txt');

      expect(mockLocalDisk.get).toHaveBeenCalledWith('file.txt', { responseType: 'stream' });
    });
  });
});
