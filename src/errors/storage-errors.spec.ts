import {
  StorageConfigurationError,
  StorageError,
  StorageFileNotFoundError,
  StorageNetworkError,
  StoragePermissionError,
  StorageQuotaExceededError,
} from './storage-errors';

describe('StorageError hierarchy', () => {
  describe('StorageError (base)', () => {
    it('should set message, name, and prototype correctly', () => {
      const err = new StorageError('something went wrong');
      expect(err.message).toBe('something went wrong');
      expect(err.name).toBe('StorageError');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(StorageError);
    });

    it('should set optional disk and path fields', () => {
      const err = new StorageError('msg', 'local', 'uploads/file.txt');
      expect(err.disk).toBe('local');
      expect(err.path).toBe('uploads/file.txt');
    });

    it('should attach cause stack when cause is provided', () => {
      const cause = new Error('root cause');
      const err = new StorageError('wrapper', 'local', undefined, cause);
      expect(err.cause).toBe(cause);
      expect(err.stack).toContain('Caused by:');
    });

    it('should not append cause stack when cause has no stack', () => {
      const cause = new Error('no stack');
      delete cause.stack;
      const err = new StorageError('wrapper', undefined, undefined, cause);
      expect(err.stack).not.toContain('Caused by:');
    });

    it('instanceof check should work after transpilation (prototype fix)', () => {
      const err = new StorageError('test');
      expect(err instanceof StorageError).toBe(true);
      expect(err instanceof Error).toBe(true);
    });
  });

  describe('StorageFileNotFoundError', () => {
    it('should be instanceof StorageError and StorageFileNotFoundError', () => {
      const err = new StorageFileNotFoundError('not found', 's3', 'photos/a.jpg');
      expect(err).toBeInstanceOf(StorageError);
      expect(err).toBeInstanceOf(StorageFileNotFoundError);
      expect(err.name).toBe('StorageFileNotFoundError');
      expect(err.disk).toBe('s3');
      expect(err.path).toBe('photos/a.jpg');
    });

    it('should carry a cause', () => {
      const cause = new Error('S3 404');
      const err = new StorageFileNotFoundError('file missing', 's3', 'x.txt', cause);
      expect(err.cause).toBe(cause);
    });
  });

  describe('StoragePermissionError', () => {
    it('should have correct name and inheritance', () => {
      const err = new StoragePermissionError('access denied', 'r2');
      expect(err).toBeInstanceOf(StorageError);
      expect(err).toBeInstanceOf(StoragePermissionError);
      expect(err.name).toBe('StoragePermissionError');
      expect(err.disk).toBe('r2');
    });
  });

  describe('StorageNetworkError', () => {
    it('should have correct name and inheritance', () => {
      const err = new StorageNetworkError('timeout', 's3', 'large.bin');
      expect(err).toBeInstanceOf(StorageError);
      expect(err).toBeInstanceOf(StorageNetworkError);
      expect(err.name).toBe('StorageNetworkError');
      expect(err.disk).toBe('s3');
      expect(err.path).toBe('large.bin');
    });
  });

  describe('StorageConfigurationError', () => {
    it('should have correct name and inheritance', () => {
      const err = new StorageConfigurationError('missing bucket', 'minio');
      expect(err).toBeInstanceOf(StorageError);
      expect(err).toBeInstanceOf(StorageConfigurationError);
      expect(err.name).toBe('StorageConfigurationError');
      expect(err.disk).toBe('minio');
    });
  });

  describe('StorageQuotaExceededError', () => {
    it('should have correct name and inheritance', () => {
      const err = new StorageQuotaExceededError('quota exceeded', 'gcs', 'big-file.bin');
      expect(err).toBeInstanceOf(StorageError);
      expect(err).toBeInstanceOf(StorageQuotaExceededError);
      expect(err.name).toBe('StorageQuotaExceededError');
    });
  });

  describe('cross-type checks', () => {
    it('subclasses should not be instanceof each other', () => {
      const notFound = new StorageFileNotFoundError('not found');
      const permission = new StoragePermissionError('denied');
      expect(notFound instanceof StoragePermissionError).toBe(false);
      expect(permission instanceof StorageFileNotFoundError).toBe(false);
    });

    it('all subtypes should be catchable as StorageError', () => {
      const errors = [
        new StorageFileNotFoundError('e'),
        new StoragePermissionError('e'),
        new StorageNetworkError('e'),
        new StorageConfigurationError('e'),
        new StorageQuotaExceededError('e'),
      ];
      for (const err of errors) {
        expect(err instanceof StorageError).toBe(true);
      }
    });
  });
});
