import { WasabiDisk } from './wasabi-disk';

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
  driver: 'wasabi' as const,
  bucket: 'my-bucket',
  region: 'us-east-1',
  key: 'accessKey',
  secret: 'secretKey',
};

describe('WasabiDisk', () => {
  describe('constructor', () => {
    it('should create without error', () => {
      expect(() => new WasabiDisk(baseConfig)).not.toThrow();
    });

    it('should accept a custom endpoint override', () => {
      const disk = new WasabiDisk({
        ...baseConfig,
        endpoint: 'https://custom.wasabi.example.com',
      });
      expect(disk).toBeDefined();
    });
  });

  describe('url()', () => {
    it('should return path-style Wasabi URL: s3.region.wasabisys.com/bucket/key', () => {
      const disk = new WasabiDisk(baseConfig);
      expect(disk.url('uploads/photo.jpg')).toBe(
        'https://s3.us-east-1.wasabisys.com/my-bucket/uploads/photo.jpg',
      );
    });

    it('should prefer custom url when set', () => {
      const disk = new WasabiDisk({ ...baseConfig, url: 'https://cdn.example.com' });
      expect(disk.url('image.png')).toBe('https://cdn.example.com/image.png');
    });

    it('should strip leading slash from path', () => {
      const disk = new WasabiDisk(baseConfig);
      expect(disk.url('/file.txt')).toBe('https://s3.us-east-1.wasabisys.com/my-bucket/file.txt');
    });

    it('should handle nested paths correctly', () => {
      const disk = new WasabiDisk(baseConfig);
      expect(disk.url('sub/dir/file.txt')).toBe(
        'https://s3.us-east-1.wasabisys.com/my-bucket/sub/dir/file.txt',
      );
    });
  });
});
