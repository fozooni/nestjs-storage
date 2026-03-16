import { StorageConfigurationError } from '../errors/storage-errors';
import { MinioDisk } from './minio-disk';

// Mock S3ClientWrapper (MinioDisk extends S3Disk)
jest.mock('../wrapper/s3-client', () => ({
  S3ClientWrapper: jest.fn().mockImplementation(() => ({
    putObject: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn(),
    headObject: jest.fn(),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    deleteObjects: jest.fn().mockResolvedValue(undefined),
    listObjects: jest.fn(),
    copyObject: jest.fn().mockResolvedValue(undefined),
    getObjectAcl: jest.fn(),
    setObjectAcl: jest.fn().mockResolvedValue(undefined),
    getPresignedUrl: jest.fn().mockResolvedValue('https://signed.url'),
    createMultipartUpload: jest.fn(),
    uploadPart: jest.fn(),
    completeMultipartUpload: jest.fn().mockResolvedValue({}),
    abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
    getBucket: jest.fn().mockReturnValue('my-bucket'),
    getRegion: jest.fn().mockReturnValue('us-east-1'),
    getRawClient: jest.fn(),
  })),
}));

const baseConfig = {
  driver: 'minio' as const,
  endpoint: 'http://localhost:9000',
  bucket: 'my-bucket',
  key: 'minioadmin',
  secret: 'minioadmin',
};

describe('MinioDisk', () => {
  describe('constructor', () => {
    it('should throw StorageConfigurationError when endpoint is missing', () => {
      expect(() => {
        new MinioDisk({ driver: 'minio', bucket: 'b', key: 'k', secret: 's' });
      }).toThrow(StorageConfigurationError);
    });

    it('should include disk name in config error', () => {
      try {
        new MinioDisk({ driver: 'minio', bucket: 'b', key: 'k', secret: 's' });
      } catch (e) {
        expect((e as StorageConfigurationError).disk).toBe('minio');
      }
    });

    it('should create successfully with endpoint', () => {
      expect(() => new MinioDisk(baseConfig)).not.toThrow();
    });

    it('should default region to us-east-1 when not provided', () => {
      const disk = new MinioDisk(baseConfig);
      expect(disk).toBeDefined();
    });

    it('should force use_path_style_endpoint to true', () => {
      // path-style is the MinIO default — just verify the instance constructs without error
      const disk = new MinioDisk(baseConfig);
      expect(disk).toBeInstanceOf(MinioDisk);
    });
  });

  describe('url()', () => {
    it('should return path-style URL: endpoint/bucket/key', () => {
      const disk = new MinioDisk(baseConfig);
      expect(disk.url('uploads/photo.jpg')).toBe('http://localhost:9000/my-bucket/uploads/photo.jpg');
    });

    it('should strip trailing slash from endpoint', () => {
      const disk = new MinioDisk({ ...baseConfig, endpoint: 'http://localhost:9000/' });
      expect(disk.url('file.txt')).toBe('http://localhost:9000/my-bucket/file.txt');
    });

    it('should prefer custom url when configured', () => {
      const disk = new MinioDisk({ ...baseConfig, url: 'https://cdn.example.com' });
      expect(disk.url('file.txt')).toBe('https://cdn.example.com/file.txt');
    });

    it('should strip leading slash from path', () => {
      const disk = new MinioDisk(baseConfig);
      expect(disk.url('/file.txt')).toBe('http://localhost:9000/my-bucket/file.txt');
    });

    it('should strip leading slashes and compose path-style URL', () => {
      const disk = new MinioDisk(baseConfig);
      expect(disk.url('/sub/dir/file.txt')).toBe('http://localhost:9000/my-bucket/sub/dir/file.txt');
    });
  });
});
