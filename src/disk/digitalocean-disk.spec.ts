import { DigitalOceanDisk } from './digitalocean-disk';

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
    getBucket: jest.fn().mockReturnValue('my-space'),
    getRegion: jest.fn().mockReturnValue('nyc3'),
    getRawClient: jest.fn(),
  })),
}));

const baseConfig = {
  driver: 'digitalocean' as const,
  bucket: 'my-space',
  region: 'nyc3',
  key: 'accessKey',
  secret: 'secretKey',
};

describe('DigitalOceanDisk', () => {
  describe('constructor', () => {
    it('should create without error', () => {
      expect(() => new DigitalOceanDisk(baseConfig)).not.toThrow();
    });

    it('should accept a custom endpoint override', () => {
      const disk = new DigitalOceanDisk({
        ...baseConfig,
        endpoint: 'https://custom.digitalocean.example.com',
      });
      expect(disk).toBeDefined();
    });
  });

  describe('url()', () => {
    it('should return virtual-hosted-style URL: bucket.region.digitaloceanspaces.com/key', () => {
      const disk = new DigitalOceanDisk(baseConfig);
      expect(disk.url('uploads/photo.jpg')).toBe(
        'https://my-space.nyc3.digitaloceanspaces.com/uploads/photo.jpg',
      );
    });

    it('should prefer custom url when set', () => {
      const disk = new DigitalOceanDisk({ ...baseConfig, url: 'https://cdn.example.com' });
      expect(disk.url('image.png')).toBe('https://cdn.example.com/image.png');
    });

    it('should strip leading slash from path', () => {
      const disk = new DigitalOceanDisk(baseConfig);
      expect(disk.url('/file.txt')).toBe('https://my-space.nyc3.digitaloceanspaces.com/file.txt');
    });

    it('should handle nested paths correctly', () => {
      const disk = new DigitalOceanDisk(baseConfig);
      expect(disk.url('sub/dir/file.txt')).toBe(
        'https://my-space.nyc3.digitaloceanspaces.com/sub/dir/file.txt',
      );
    });
  });
});
