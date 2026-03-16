import { StorageEventsService } from './storage-events.service';
import { StorageEvents } from './storage-events.constants';

describe('StorageEventsService', () => {
  let service: StorageEventsService;

  beforeEach(() => {
    service = new StorageEventsService();
  });

  it('should emit and receive events via on()', (done) => {
    service.on(StorageEvents.PUT, (payload) => {
      expect(payload.path).toBe('test.txt');
      expect(payload.disk).toBe('local');
      done();
    });

    service.emit(StorageEvents.PUT, { path: 'test.txt', disk: 'local', timestamp: new Date() });
  });

  it('should remove listener via off()', () => {
    const handler = jest.fn();
    service.on(StorageEvents.DELETE, handler);
    service.off(StorageEvents.DELETE, handler);
    service.emit(StorageEvents.DELETE, { path: 'file.txt', disk: 'local', timestamp: new Date() });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should call handler only once via once()', () => {
    const handler = jest.fn();
    service.once(StorageEvents.COPY, handler);

    const payload = { from: 'a.txt', to: 'b.txt', disk: 'local', timestamp: new Date() };
    service.emit(StorageEvents.COPY, payload);
    service.emit(StorageEvents.COPY, payload);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should return `this` from on/off/once for chaining', () => {
    const handler = jest.fn();
    const result = service.on(StorageEvents.PUT, handler);
    expect(result).toBe(service);

    const off = service.off(StorageEvents.PUT, handler);
    expect(off).toBe(service);
  });

  it('should also emit to EventEmitter2 when provided', () => {
    const mockEmitter2 = { emit: jest.fn() };
    const serviceWithEmitter2 = new StorageEventsService(mockEmitter2 as any);

    serviceWithEmitter2.emit(StorageEvents.PUT, {
      path: 'x.txt',
      disk: 's3',
      timestamp: new Date(),
    });

    expect(mockEmitter2.emit).toHaveBeenCalledWith(
      StorageEvents.PUT,
      expect.objectContaining({ path: 'x.txt', disk: 's3' }),
    );
  });

  it('should work without EventEmitter2 (optional)', () => {
    const handler = jest.fn();
    service.on(StorageEvents.MOVE, handler);
    service.emit(StorageEvents.MOVE, {
      from: 'a.txt',
      to: 'b.txt',
      disk: 'local',
      timestamp: new Date(),
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
