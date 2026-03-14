import { R2Disk } from './r2-disk';

// Mock S3ClientWrapper
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
    getBucket: jest.fn().mockReturnValue('r2-bucket'),
    getRegion: jest.fn().mockReturnValue('auto'),
  })),
}));

const baseConfig = {
  driver: 'r2' as const,
  bucket: 'r2-bucket',
  region: 'auto',
  key: 'access-key',
  secret: 'secret-key',
  accountId: 'test-account-id',
};

describe('R2Disk', () => {
  describe('constructor', () => {
    it('should throw if accountId is missing', () => {
      expect(
        () =>
          new R2Disk({
            driver: 'r2',
            bucket: 'b',
            region: 'auto',
            key: 'k',
            secret: 's',
          }),
      ).toThrow('R2 configuration requires accountId');
    });

    it('should create with valid config', () => {
      const disk = new R2Disk(baseConfig);
      expect(disk).toBeDefined();
    });

    it('should set default endpoint from accountId', () => {
      // Verify the S3ClientWrapper is called with the correct endpoint
      const { S3ClientWrapper } = require('../wrapper/s3-client');
      new R2Disk(baseConfig);
      expect(S3ClientWrapper).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: `https://${baseConfig.accountId}.r2.cloudflarestorage.com`,
          region: 'auto',
          use_path_style_endpoint: false,
        }),
      );
    });

    it('should use custom endpoint if provided', () => {
      const { S3ClientWrapper } = require('../wrapper/s3-client');
      new R2Disk({ ...baseConfig, endpoint: 'https://custom.r2.endpoint' });
      expect(S3ClientWrapper).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://custom.r2.endpoint',
        }),
      );
    });

    it('should use custom region if provided', () => {
      const { S3ClientWrapper } = require('../wrapper/s3-client');
      new R2Disk({ ...baseConfig, region: 'wnam' });
      expect(S3ClientWrapper).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'wnam',
        }),
      );
    });
  });

  describe('getVisibility', () => {
    it('should always return private', async () => {
      const disk = new R2Disk(baseConfig);
      expect(await disk.getVisibility('any-file.txt')).toBe('private');
    });
  });

  describe('setVisibility', () => {
    it('should throw an error', async () => {
      const disk = new R2Disk(baseConfig);
      await expect(disk.setVisibility('file.txt', 'public')).rejects.toThrow(
        'Cloudflare R2 does not support per-object ACLs',
      );
    });
  });

  describe('url', () => {
    it('should throw if no custom URL configured', () => {
      const disk = new R2Disk(baseConfig);
      expect(() => disk.url('file.txt')).toThrow('R2 does not provide default public URLs');
    });

    it('should return custom URL when configured', () => {
      const disk = new R2Disk({ ...baseConfig, url: 'https://cdn.example.com' });
      expect(disk.url('path/file.txt')).toBe('https://cdn.example.com/path/file.txt');
    });

    it('should sanitize leading slashes', () => {
      const disk = new R2Disk({ ...baseConfig, url: 'https://cdn.example.com' });
      expect(disk.url('/path/file.txt')).toBe('https://cdn.example.com/path/file.txt');
    });
  });
});
