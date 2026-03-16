import { FakeDisk } from '../testing/fake-disk';
import { RetryDisk } from './retry-disk';
import {
  StorageFileNotFoundError,
  StorageNetworkError,
  StoragePermissionError,
} from '../errors/storage-errors';

jest.useFakeTimers();

describe('RetryDisk', () => {
  let inner: FakeDisk;
  let retry: RetryDisk;

  beforeEach(async () => {
    inner = new FakeDisk();
    await inner.put('file.txt', 'hello');
    retry = new RetryDisk(inner, { maxRetries: 3, baseDelay: 10, jitter: false });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('passes through successful operations', async () => {
    const result = await retry.exists('file.txt');
    expect(result).toBe(true);
  });

  it('retries on StorageNetworkError', async () => {
    let calls = 0;
    jest.spyOn(inner, 'exists').mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new StorageNetworkError('timeout', 'disk');
      return true;
    });

    const p = retry.exists('file.txt');
    // advance timers to allow retries
    await jest.runAllTimersAsync();
    const result = await p;
    expect(result).toBe(true);
    expect(calls).toBe(3);
  });

  it('does NOT retry on StorageFileNotFoundError', async () => {
    let calls = 0;
    jest.spyOn(inner, 'exists').mockImplementation(async () => {
      calls++;
      throw new StorageFileNotFoundError('not found', 'disk', 'file.txt');
    });

    await expect(retry.exists('file.txt')).rejects.toBeInstanceOf(StorageFileNotFoundError);
    expect(calls).toBe(1);
  });

  it('does NOT retry on StoragePermissionError', async () => {
    let calls = 0;
    jest.spyOn(inner, 'get').mockImplementation(async () => {
      calls++;
      throw new StoragePermissionError('forbidden', 'disk');
    });

    await expect(retry.get('file.txt')).rejects.toBeInstanceOf(StoragePermissionError);
    expect(calls).toBe(1);
  });

  it('throws after maxRetries exhausted', async () => {
    jest.spyOn(inner, 'exists').mockImplementation(async () => {
      throw new StorageNetworkError('timeout', 'disk');
    });

    // Attach a rejection handler immediately to prevent unhandled rejection warnings
    // while timers are running (the catch converts rejection → resolution with the error)
    let capturedError: unknown;
    const p = retry.exists('file.txt').catch((e) => {
      capturedError = e;
    });

    await jest.runAllTimersAsync();
    await p; // p resolves after the catch handler runs
    expect(capturedError).toBeInstanceOf(StorageNetworkError);
  });

  it('respects custom retryOn predicate', async () => {
    let calls = 0;
    const customRetry = new RetryDisk(inner, {
      maxRetries: 2,
      baseDelay: 10,
      jitter: false,
      retryOn: (err) => err instanceof Error && err.message === 'retry-me',
    });

    jest.spyOn(inner, 'exists').mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error('retry-me');
      return true;
    });

    const p = customRetry.exists('file.txt');
    await jest.runAllTimersAsync();
    const result = await p;
    expect(result).toBe(true);
    expect(calls).toBe(3);
  });

  it('emits storage.retry event via StorageEventsService', async () => {
    const mockEvents = { emit: jest.fn() };
    let calls = 0;

    jest.spyOn(inner, 'exists').mockImplementation(async () => {
      calls++;
      if (calls < 2) throw new StorageNetworkError('timeout', 'disk');
      return true;
    });

    const retryWithEvents = new RetryDisk(
      inner,
      { maxRetries: 2, baseDelay: 10, jitter: false },
      mockEvents as any,
      'test-disk',
    );

    const p = retryWithEvents.exists('file.txt');
    await jest.runAllTimersAsync();
    await p;

    expect(mockEvents.emit).toHaveBeenCalledWith(
      'storage.retry',
      expect.objectContaining({ disk: 'test-disk', operation: 'exists' }),
    );
  });

  it('retries get()', async () => {
    let calls = 0;
    jest.spyOn(inner, 'get').mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new StorageNetworkError('timeout', 'disk');
      return Buffer.from('data');
    });

    const p = retry.get('file.txt');
    await jest.runAllTimersAsync();
    const result = await p;
    expect(result).toEqual(Buffer.from('data'));
  });

  it('retries delete()', async () => {
    let calls = 0;
    jest.spyOn(inner, 'delete').mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new StorageNetworkError('timeout', 'disk');
      return true;
    });

    const p = retry.delete('file.txt');
    await jest.runAllTimersAsync();
    await p;
    expect(calls).toBe(2);
  });
});
