import { DiskConfigValidator } from './disk-config-validator';
import { StorageConfigurationError } from '../errors/storage-errors';

describe('DiskConfigValidator', () => {
  describe('local driver', () => {
    it('passes with no required fields', () => {
      expect(() => DiskConfigValidator.validate('local', { driver: 'local' })).not.toThrow();
    });

    it('passes with root set', () => {
      expect(() =>
        DiskConfigValidator.validate('local', { driver: 'local', root: '/tmp' }),
      ).not.toThrow();
    });
  });

  describe('s3 driver', () => {
    it('throws when bucket is missing', () => {
      expect(() =>
        DiskConfigValidator.validate('s3-disk', { driver: 's3', region: 'us-east-1' }),
      ).toThrow(StorageConfigurationError);
    });

    it('throws when region is missing', () => {
      expect(() =>
        DiskConfigValidator.validate('s3-disk', { driver: 's3', bucket: 'my-bucket' }),
      ).toThrow(StorageConfigurationError);
    });

    it('passes when bucket and region are set', () => {
      expect(() =>
        DiskConfigValidator.validate('s3-disk', {
          driver: 's3',
          bucket: 'my-bucket',
          region: 'us-east-1',
        }),
      ).not.toThrow();
    });

    it('error message mentions missing fields', () => {
      try {
        DiskConfigValidator.validate('my-s3', { driver: 's3' });
        fail('expected to throw');
      } catch (e) {
        expect((e as Error).message).toContain('bucket');
        expect((e as Error).message).toContain('region');
        expect((e as Error).message).toContain('my-s3');
      }
    });
  });

  describe('r2 driver', () => {
    it('throws when accountId is missing', () => {
      expect(() =>
        DiskConfigValidator.validate('r2-disk', { driver: 'r2', bucket: 'my-bucket' }),
      ).toThrow(StorageConfigurationError);
    });

    it('passes with bucket and accountId', () => {
      expect(() =>
        DiskConfigValidator.validate('r2-disk', {
          driver: 'r2',
          bucket: 'my-bucket',
          accountId: 'acc123',
        }),
      ).not.toThrow();
    });
  });

  describe('gcs driver', () => {
    it('throws when bucket is missing', () => {
      expect(() => DiskConfigValidator.validate('gcs-disk', { driver: 'gcs' })).toThrow(
        StorageConfigurationError,
      );
    });

    it('passes with bucket', () => {
      expect(() =>
        DiskConfigValidator.validate('gcs-disk', { driver: 'gcs', bucket: 'my-bucket' }),
      ).not.toThrow();
    });
  });

  describe('minio driver', () => {
    it('throws when endpoint is missing', () => {
      expect(() =>
        DiskConfigValidator.validate('minio-disk', { driver: 'minio', bucket: 'b' }),
      ).toThrow(StorageConfigurationError);
    });

    it('passes with bucket and endpoint', () => {
      expect(() =>
        DiskConfigValidator.validate('minio-disk', {
          driver: 'minio',
          bucket: 'b',
          endpoint: 'http://localhost:9000',
        }),
      ).not.toThrow();
    });
  });

  describe('azure driver', () => {
    it('throws when containerName is missing', () => {
      expect(() =>
        DiskConfigValidator.validate('az', { driver: 'azure', accountKey: 'key' }),
      ).toThrow(StorageConfigurationError);
    });

    it('throws when neither accountKey nor sasToken is present', () => {
      expect(() =>
        DiskConfigValidator.validate('az', { driver: 'azure', containerName: 'c' }),
      ).toThrow(StorageConfigurationError);
    });

    it('passes with containerName and accountKey', () => {
      expect(() =>
        DiskConfigValidator.validate('az', {
          driver: 'azure',
          containerName: 'my-container',
          accountKey: 'key',
        }),
      ).not.toThrow();
    });

    it('passes with containerName and sasToken', () => {
      expect(() =>
        DiskConfigValidator.validate('az', {
          driver: 'azure',
          containerName: 'my-container',
          sasToken: 'token',
        }),
      ).not.toThrow();
    });
  });

  describe('CDN config validation', () => {
    it('throws when cdn.baseUrl is missing', () => {
      expect(() =>
        DiskConfigValidator.validate('s3', {
          driver: 's3',
          bucket: 'b',
          region: 'us-east-1',
          cdn: {} as any,
        }),
      ).toThrow(StorageConfigurationError);
    });

    it('throws when cloudfront provider missing signingKeyId', () => {
      expect(() =>
        DiskConfigValidator.validate('s3', {
          driver: 's3',
          bucket: 'b',
          region: 'us-east-1',
          cdn: {
            baseUrl: 'https://cdn.example.com',
            provider: 'cloudfront',
            signingKey: 'key',
            // missing signingKeyId
          },
        }),
      ).toThrow(StorageConfigurationError);
    });

    it('passes with valid cloudfront cdn config', () => {
      expect(() =>
        DiskConfigValidator.validate('s3', {
          driver: 's3',
          bucket: 'b',
          region: 'us-east-1',
          cdn: {
            baseUrl: 'https://cdn.example.com',
            provider: 'cloudfront',
            signingKeyId: 'KEY_ID',
            signingKey: 'PRIVATE_KEY',
          },
        }),
      ).not.toThrow();
    });

    it('passes with generic cdn config', () => {
      expect(() =>
        DiskConfigValidator.validate('s3', {
          driver: 's3',
          bucket: 'b',
          region: 'us-east-1',
          cdn: { baseUrl: 'https://cdn.example.com', provider: 'generic' },
        }),
      ).not.toThrow();
    });
  });

  describe('custom drivers', () => {
    it('passes without throwing for unknown drivers', () => {
      expect(() =>
        DiskConfigValidator.validate('custom', { driver: 'my-custom-driver' }),
      ).not.toThrow();
    });
  });
});
