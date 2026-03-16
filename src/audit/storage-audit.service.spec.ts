import { AuditEntry, AuditSink } from './audit.interface';
import { StorageAuditService } from './storage-audit.service';

describe('StorageAuditService', () => {
  let service: StorageAuditService;

  beforeEach(() => {
    service = new StorageAuditService();
  });

  const successEntry: AuditEntry = {
    operation: 'put',
    disk: 'local',
    path: 'uploads/file.txt',
    timestamp: new Date(),
    success: true,
  };

  const failureEntry: AuditEntry = {
    operation: 'delete',
    disk: 's3',
    path: 'data/file.bin',
    timestamp: new Date(),
    success: false,
    error: 'Access denied',
  };

  // ─── default logger sink ─────────────────────────────────────────────────

  describe('default logger sink', () => {
    it('should call logger.log() for successful operations', () => {
      const logSpy = jest
        .spyOn((service as unknown as { logger: { log: jest.Mock } }).logger, 'log')
        .mockImplementation();
      service.log(successEntry);
      expect(logSpy).toHaveBeenCalled();
      const msg: string = logSpy.mock.calls[0][0] as string;
      expect(msg).toContain('[OK]');
      expect(msg).toContain('put');
      expect(msg).toContain('local');
      logSpy.mockRestore();
    });

    it('should call logger.warn() for failed operations', () => {
      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
        .mockImplementation();
      service.log(failureEntry);
      expect(warnSpy).toHaveBeenCalled();
      const msg: string = warnSpy.mock.calls[0][0] as string;
      expect(msg).toContain('[FAIL]');
      expect(msg).toContain('delete');
      warnSpy.mockRestore();
    });

    it('should include userId in log when present', () => {
      const logSpy = jest
        .spyOn((service as unknown as { logger: { log: jest.Mock } }).logger, 'log')
        .mockImplementation();
      service.log({ ...successEntry, userId: 'user-123' });
      expect(logSpy.mock.calls[0][0]).toContain('user=user-123');
      logSpy.mockRestore();
    });

    it('should include ip in log when present', () => {
      const logSpy = jest
        .spyOn((service as unknown as { logger: { log: jest.Mock } }).logger, 'log')
        .mockImplementation();
      service.log({ ...successEntry, ip: '192.168.1.1' });
      expect(logSpy.mock.calls[0][0]).toContain('ip=192.168.1.1');
      logSpy.mockRestore();
    });
  });

  // ─── addSink / custom sinks ───────────────────────────────────────────────

  describe('addSink()', () => {
    it('should call custom sink on log()', () => {
      const customSink: AuditSink = { log: jest.fn() };
      service.addSink(customSink);
      service.log(successEntry);
      expect(customSink.log).toHaveBeenCalledWith(successEntry);
    });

    it('should call multiple sinks', () => {
      const sink1: AuditSink = { log: jest.fn() };
      const sink2: AuditSink = { log: jest.fn() };
      service.addSink(sink1);
      service.addSink(sink2);
      service.log(successEntry);
      expect(sink1.log).toHaveBeenCalledTimes(1);
      expect(sink2.log).toHaveBeenCalledTimes(1);
    });

    it('should pass entry with all fields to custom sink', () => {
      const received: AuditEntry[] = [];
      service.addSink({ log: (e) => received.push(e) });
      service.log(failureEntry);
      expect(received[0]).toMatchObject({
        operation: 'delete',
        disk: 's3',
        path: 'data/file.bin',
        success: false,
        error: 'Access denied',
      });
    });
  });

  // ─── error resilience ────────────────────────────────────────────────────

  describe('error resilience', () => {
    it('should not throw when a sink throws', () => {
      const throwingSink: AuditSink = {
        log: () => {
          throw new Error('sink failed');
        },
      };
      service.addSink(throwingSink);
      expect(() => service.log(successEntry)).not.toThrow();
    });

    it('should continue calling remaining sinks after one throws', () => {
      const throwingSink: AuditSink = {
        log: () => {
          throw new Error('first sink failed');
        },
      };
      const goodSink: AuditSink = { log: jest.fn() };
      service.addSink(throwingSink);
      service.addSink(goodSink);
      service.log(successEntry);
      expect(goodSink.log).toHaveBeenCalled();
    });
  });

  // ─── log with optional fields ─────────────────────────────────────────────

  describe('log() with minimal entry', () => {
    it('should handle entry without path', () => {
      const received: AuditEntry[] = [];
      service.addSink({ log: (e) => received.push(e) });
      service.log({ operation: 'deleteMany', disk: 'local', timestamp: new Date(), success: true });
      expect(received[0].path).toBeUndefined();
    });

    it('should handle entry with error string', () => {
      const received: AuditEntry[] = [];
      service.addSink({ log: (e) => received.push(e) });
      service.log({
        operation: 'get',
        disk: 's3',
        path: 'missing.txt',
        timestamp: new Date(),
        success: false,
        error: 'StorageFileNotFoundError: missing.txt not found',
      });
      expect(received[0].error).toContain('StorageFileNotFoundError');
    });
  });
});
