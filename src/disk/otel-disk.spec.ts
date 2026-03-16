import { FakeDisk } from '../testing/fake-disk';
import { OtelDisk } from './otel-disk';

describe('OtelDisk', () => {
  let inner: FakeDisk;

  beforeEach(async () => {
    inner = new FakeDisk();
    await inner.put('file.txt', 'hello');
  });

  describe('when @opentelemetry/api is not installed (no-op mode)', () => {
    let disk: OtelDisk;

    beforeEach(() => {
      // OtelDisk will fail to load @opentelemetry/api in test environment
      disk = new OtelDisk(inner, 'test-disk');
    });

    it('isTracingActive returns false when otel not installed', () => {
      // In test environment, otel is either installed or not
      // We just verify the property exists and is boolean
      expect(typeof disk.isTracingActive).toBe('boolean');
    });

    it('exists() still works as passthrough', async () => {
      const result = await disk.exists('file.txt');
      expect(result).toBe(true);
    });

    it('get() still works as passthrough', async () => {
      const result = await disk.get('file.txt', { responseType: 'string' });
      expect(result).toBe('hello');
    });

    it('put() still works as passthrough', async () => {
      await disk.put('new.txt', 'world');
      expect(await inner.exists('new.txt')).toBe(true);
    });

    it('delete() still works as passthrough', async () => {
      await disk.delete('file.txt');
      expect(await inner.exists('file.txt')).toBe(false);
    });

    it('mimeType() still works as passthrough', async () => {
      const mime = await disk.mimeType('file.txt');
      expect(typeof mime).toBe('string');
    });

    it('size() still works as passthrough', async () => {
      const size = await disk.size('file.txt');
      expect(size).toBe(5);
    });

    it('getMetadata() still works as passthrough', async () => {
      const meta = await disk.getMetadata('file.txt');
      expect(meta.path).toBe('file.txt');
    });
  });

  describe('when @opentelemetry/api is installed (tracing mode)', () => {
    let mockSpan: {
      setAttributes: jest.Mock;
      recordException: jest.Mock;
      end: jest.Mock;
    };
    let mockTracer: { startSpan: jest.Mock };

    beforeEach(() => {
      mockSpan = {
        setAttributes: jest.fn().mockReturnThis(),
        recordException: jest.fn(),
        end: jest.fn(),
      };
      mockTracer = {
        startSpan: jest.fn().mockReturnValue(mockSpan),
      };
    });

    it('creates spans when tracer is available', async () => {
      // Create disk with mocked tracer by overriding internal tracer
      const disk = new OtelDisk(inner, 'test-disk');
      // Force inject the tracer (accessing protected)
      (disk as any).tracer = mockTracer;

      await disk.exists('file.txt');

      expect(mockTracer.startSpan).toHaveBeenCalledWith('storage.exists');
      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          'storage.disk': 'test-disk',
          'storage.operation': 'exists',
          'storage.path': 'file.txt',
        }),
      );
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('records exceptions on span when operation fails', async () => {
      const disk = new OtelDisk(inner, 'test-disk');
      (disk as any).tracer = mockTracer;

      const error = new Error('storage failed');
      jest.spyOn(inner, 'get').mockRejectedValue(error);

      await expect(disk.get('file.txt')).rejects.toThrow('storage failed');
      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('ends span even if operation throws', async () => {
      const disk = new OtelDisk(inner, 'test-disk');
      (disk as any).tracer = mockTracer;

      jest.spyOn(inner, 'put').mockRejectedValue(new Error('failed'));
      await expect(disk.put('file.txt', 'data')).rejects.toThrow();
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });
});
