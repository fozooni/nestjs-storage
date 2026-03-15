import { StorageService } from '../storage.service';
import { StorageHealthIndicator } from './storage.health';

describe('StorageHealthIndicator', () => {
  let indicator: StorageHealthIndicator;
  let mockDisk: any;
  let mockStorage: jest.Mocked<StorageService>;

  beforeEach(() => {
    mockDisk = {
      put: jest.fn().mockResolvedValue(true),
      get: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
    };

    mockStorage = {
      disk: jest.fn().mockReturnValue(mockDisk),
    } as any;

    indicator = new StorageHealthIndicator(mockStorage);
  });

  describe('check', () => {
    it('should return healthy status when write/read/delete succeeds', async () => {
      mockDisk.get.mockImplementation(async (_path: string, opts: any) => {
        if (opts?.responseType === 'string') {
          // Return what was written
          const writeCall = mockDisk.put.mock.calls[0];
          return writeCall[1];
        }
      });

      const result = await indicator.check('storage', 's3');

      expect(result.storage.status).toBe('up');
      expect(result.storage.disk).toBe('s3');
      expect(mockDisk.put).toHaveBeenCalledWith(
        '.storage-health-check',
        expect.stringContaining('health-check-'),
      );
      expect(mockDisk.delete).toHaveBeenCalledWith('.storage-health-check');
    });

    it('should return unhealthy status when write fails', async () => {
      mockDisk.put.mockRejectedValue(new Error('Write permission denied'));

      const result = await indicator.check('storage', 's3');

      expect(result.storage.status).toBe('down');
      expect(result.storage.message).toBe('Write permission denied');
    });

    it('should return unhealthy when read content does not match', async () => {
      mockDisk.get.mockResolvedValue('wrong content');

      const result = await indicator.check('storage', 's3');

      expect(result.storage.status).toBe('down');
      expect(result.storage.message).toBe('Read content does not match written content');
    });

    it('should use default disk when no diskName provided', async () => {
      mockDisk.get.mockImplementation(async (_path: string, opts: any) => {
        if (opts?.responseType === 'string') {
          return mockDisk.put.mock.calls[0][1];
        }
      });

      const result = await indicator.check('storage');

      expect(result.storage.status).toBe('up');
      expect(result.storage.disk).toBe('default');
      expect(mockStorage.disk).toHaveBeenCalledWith();
    });

    it('should use custom health check file path', async () => {
      mockDisk.get.mockImplementation(async (_path: string, opts: any) => {
        if (opts?.responseType === 'string') {
          return mockDisk.put.mock.calls[0][1];
        }
      });

      await indicator.check('storage', 's3', { healthCheckFile: '.custom-check' });

      expect(mockDisk.put).toHaveBeenCalledWith('.custom-check', expect.any(String));
    });

    it('should timeout after specified duration', async () => {
      let pendingResolve: (() => void) | undefined;
      mockDisk.put.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            pendingResolve = resolve;
          }),
      );

      const promise = indicator.check('storage', 's3', { timeout: 50 });
      const result = await promise;

      expect(result.storage.status).toBe('down');
      expect(result.storage.message).toContain('timed out');

      // Resolve pending promise to avoid open handle
      pendingResolve?.();
    });
  });

  describe('checkDisks', () => {
    it('should check multiple disks and return combined result', async () => {
      mockDisk.get.mockImplementation(async (_path: string, opts: any) => {
        if (opts?.responseType === 'string') {
          return mockDisk.put.mock.calls[mockDisk.put.mock.calls.length - 1][1];
        }
      });

      const result = await indicator.checkDisks('storage', ['s3', 'local']);

      expect(result.storage.status).toBe('up');
      expect(result.storage.disks).toEqual({ s3: 'up', local: 'up' });
    });

    it('should return unhealthy if any disk fails', async () => {
      mockStorage.disk.mockImplementation((name?: string) => {
        if (name === 'broken') {
          return {
            ...mockDisk,
            put: jest.fn().mockRejectedValue(new Error('Disk failure')),
          };
        }
        const healthyDisk = {
          ...mockDisk,
          put: jest.fn().mockResolvedValue(true),
          get: jest.fn().mockImplementation(async (_path: string, opts: any) => {
            if (opts?.responseType === 'string') {
              return healthyDisk.put.mock.calls[0][1];
            }
          }),
          delete: jest.fn().mockResolvedValue(true),
        };
        return healthyDisk;
      });

      const result = await indicator.checkDisks('storage', ['s3', 'broken']);

      expect(result.storage.status).toBe('down');
      expect(result.storage.disks).toEqual({ s3: 'up', broken: 'down' });
    });
  });
});
