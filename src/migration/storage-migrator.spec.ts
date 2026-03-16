import { FakeDisk } from '../testing/fake-disk';
import { StorageMigrator } from './storage-migrator';

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) items.push(item);
  return items;
}

describe('StorageMigrator', () => {
  let source: FakeDisk;
  let target: FakeDisk;
  let migrator: StorageMigrator;

  beforeEach(async () => {
    source = new FakeDisk();
    target = new FakeDisk();
    migrator = new StorageMigrator();

    await source.put('a.txt', Buffer.from('alpha'));
    await source.put('b.txt', Buffer.from('bravo'));
    await source.put('c.txt', Buffer.from('charlie'));
  });

  it('migrates all files from source to target', async () => {
    const events = await collect(migrator.migrate(source, target));

    const copied = events.filter((e) => e.status === 'copied');
    expect(copied).toHaveLength(3);
    expect(await target.exists('a.txt')).toBe(true);
    expect(await target.exists('b.txt')).toBe(true);
    expect(await target.exists('c.txt')).toBe(true);
    expect(await target.get('a.txt')).toEqual(Buffer.from('alpha'));
  });

  it('yields pending events before copied events', async () => {
    const events = await collect(migrator.migrate(source, target, { concurrency: 2 }));
    const pendingPaths = events.filter((e) => e.status === 'pending').map((e) => e.path);
    const copiedPaths = events.filter((e) => e.status === 'copied').map((e) => e.path);
    expect(pendingPaths).toHaveLength(3);
    expect(copiedPaths).toHaveLength(3);
  });

  it('respects prefix option', async () => {
    await source.put('images/hero.png', Buffer.from('png-data'));
    const events = await collect(migrator.migrate(source, target, { prefix: 'images' }));
    const copied = events.filter((e) => e.status === 'copied');
    expect(copied).toHaveLength(1);
    expect(copied[0].path).toBe('images/hero.png');
  });

  it('deletes source files when deleteSource is true', async () => {
    await collect(migrator.migrate(source, target, { deleteSource: true }));
    expect(await source.exists('a.txt')).toBe(false);
    expect(await source.exists('b.txt')).toBe(false);
    expect(await source.exists('c.txt')).toBe(false);
  });

  it('does not delete source files when deleteSource is false (default)', async () => {
    await collect(migrator.migrate(source, target));
    expect(await source.exists('a.txt')).toBe(true);
  });

  it('does not copy files in dryRun mode', async () => {
    const events = await collect(migrator.migrate(source, target, { dryRun: true }));
    const copied = events.filter((e) => e.status === 'copied');
    expect(copied).toHaveLength(3);
    // No actual writes happened.
    expect(await target.exists('a.txt')).toBe(false);
  });

  it('reports bytesTransferred for copied files', async () => {
    const events = await collect(migrator.migrate(source, target));
    const aEvent = events.find((e) => e.status === 'copied' && e.path === 'a.txt');
    expect(aEvent?.bytesTransferred).toBe(5); // 'alpha' = 5 bytes
  });

  it('skips failed files by default (onError: skip)', async () => {
    // Make target.put throw for one file.
    const originalPut = target.put.bind(target);
    let callCount = 0;
    jest.spyOn(target, 'put').mockImplementation(async (path, content, opts) => {
      if (path === 'b.txt' && callCount++ === 0) throw new Error('put failed');
      return originalPut(path, content, opts);
    });

    const events = await collect(migrator.migrate(source, target, { concurrency: 1 }));
    const failed = events.filter((e) => e.status === 'failed');
    const copied = events.filter((e) => e.status === 'copied');

    expect(failed).toHaveLength(1);
    expect(failed[0].path).toBe('b.txt');
    expect(failed[0].error?.message).toBe('put failed');
    expect(copied).toHaveLength(2);
  });

  it('aborts on first failure when onError is "abort"', async () => {
    jest.spyOn(target, 'put').mockRejectedValueOnce(new Error('boom'));

    await expect(
      collect(migrator.migrate(source, target, { concurrency: 1, onError: 'abort' })),
    ).rejects.toThrow('boom');
  });

  it('verifies checksums when verify is true', async () => {
    // FakeDisk has checksum support; same data → matching checksums → no error.
    const events = await collect(migrator.migrate(source, target, { verify: true }));
    const failed = events.filter((e) => e.status === 'failed');
    expect(failed).toHaveLength(0);
  });

  it('reports failure when checksum mismatch occurs', async () => {
    // Force a checksum mismatch by returning different data on target.
    jest.spyOn(target, 'checksum').mockResolvedValue('deadbeef');

    const events = await collect(
      migrator.migrate(source, target, { verify: true, concurrency: 1, onError: 'skip' }),
    );
    const failed = events.filter((e) => e.status === 'failed');
    expect(failed).toHaveLength(3);
    expect(failed[0].error?.message).toMatch(/checksum mismatch/i);
  });

  it('handles empty source gracefully', async () => {
    const emptySource = new FakeDisk();
    const events = await collect(migrator.migrate(emptySource, target));
    expect(events).toHaveLength(0);
  });
});
