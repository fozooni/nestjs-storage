import { FakeDisk } from '../testing/fake-disk';
import { DiskDecorator } from './disk-decorator';
import { FilesystemContract } from '../interfaces/storage.interface';

/** Minimal concrete subclass that doesn't override anything */
class PassthroughDisk extends DiskDecorator {
  constructor(disk: FilesystemContract) {
    super(disk);
  }
}

/** Subclass that overrides only `put` */
class UppercasePutDisk extends DiskDecorator {
  constructor(disk: FilesystemContract) {
    super(disk);
  }

  override async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
  ): Promise<boolean> {
    const upper = typeof contents === 'string' ? contents.toUpperCase() : contents;
    return super.put(path, upper);
  }
}

describe('DiskDecorator', () => {
  let inner: FakeDisk;
  let passthrough: PassthroughDisk;

  beforeEach(() => {
    inner = new FakeDisk();
    passthrough = new PassthroughDisk(inner);
  });

  it('delegates put to inner disk', async () => {
    await passthrough.put('file.txt', 'hello');
    expect(await inner.get('file.txt', { responseType: 'string' })).toBe('hello');
  });

  it('delegates get to inner disk', async () => {
    await inner.put('file.txt', 'world');
    const result = await passthrough.get('file.txt', { responseType: 'string' });
    expect(result).toBe('world');
  });

  it('delegates exists to inner disk', async () => {
    expect(await passthrough.exists('nonexistent.txt')).toBe(false);
    await inner.put('exists.txt', 'data');
    expect(await passthrough.exists('exists.txt')).toBe(true);
  });

  it('delegates delete to inner disk', async () => {
    await inner.put('del.txt', 'data');
    await passthrough.delete('del.txt');
    expect(await inner.exists('del.txt')).toBe(false);
  });

  it('delegates size to inner disk', async () => {
    await inner.put('size.txt', 'hello');
    expect(await passthrough.size('size.txt')).toBe(5);
  });

  it('delegates files/allFiles to inner disk', async () => {
    await inner.put('a.txt', 'a');
    await inner.put('b.txt', 'b');
    const files = await passthrough.allFiles();
    expect(files).toContain('a.txt');
    expect(files).toContain('b.txt');
  });

  it('delegates json to inner disk with schema', async () => {
    await inner.put('data.json', JSON.stringify({ value: 42 }));
    const result = await passthrough.json<{ value: number }>('data.json');
    expect(result.value).toBe(42);
  });

  it('delegates json with Zod-like schema', async () => {
    await inner.put('data.json', JSON.stringify({ name: 'test' }));
    const mockSchema = { parse: (v: unknown) => v as { name: string } };
    const result = await passthrough.json('data.json', mockSchema);
    expect((result as { name: string }).name).toBe('test');
  });

  it('delegates scope to create ScopedDisk', () => {
    const scoped = passthrough.scope('users/123');
    expect(scoped).toBeDefined();
  });

  it('throws on initMultipartUpload when inner disk does not support it', async () => {
    const limited = new FakeDisk();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (limited as any).initMultipartUpload = undefined;
    const p = new PassthroughDisk(limited);
    await expect(p.initMultipartUpload('file.txt')).rejects.toThrow(
      'Disk does not support multipart upload',
    );
  });

  it('throws on checksum when inner disk does not support it', async () => {
    const limited = new FakeDisk();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (limited as any).checksum = undefined;
    const p = new PassthroughDisk(limited);
    await expect(p.checksum('file.txt')).rejects.toThrow('Disk does not support checksum()');
  });

  it('allows subclass to override a single method', async () => {
    const upperDisk = new UppercasePutDisk(inner);
    await upperDisk.put('file.txt', 'hello world');
    const stored = await inner.get('file.txt', { responseType: 'string' });
    expect(stored).toBe('HELLO WORLD');
  });

  it('delegates putTemp to inner disk if supported', async () => {
    const path = await passthrough.putTemp('temp.txt', 'temp data', 60);
    expect(path).toBe('temp.txt');
  });

  it('delegates invalidateCdn as no-op when inner does not support it', async () => {
    await expect(passthrough.invalidateCdn(['path1', 'path2'])).resolves.toBeUndefined();
  });

  it('delegates missing to inner disk', async () => {
    expect(await passthrough.missing('nonexistent.txt')).toBe(true);
    await inner.put('present.txt', 'data');
    expect(await passthrough.missing('present.txt')).toBe(false);
  });

  it('delegates getBucket to inner disk', () => {
    expect(passthrough.getBucket()).toBeUndefined();
  });

  it('delegates getMetadata to inner disk', async () => {
    await inner.put('meta.txt', 'content');
    const meta = await passthrough.getMetadata('meta.txt');
    expect(meta.path).toBe('meta.txt');
    expect(meta.size).toBe(7);
  });
});
