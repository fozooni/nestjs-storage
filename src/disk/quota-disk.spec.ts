import { FakeDisk } from '../testing/fake-disk';
import { MemoryQuotaStore, QuotaDisk } from './quota-disk';
import { StorageQuotaExceededError } from '../errors/storage-errors';

describe('MemoryQuotaStore', () => {
  let store: MemoryQuotaStore;

  beforeEach(() => {
    store = new MemoryQuotaStore();
  });

  it('starts at 0 usage', async () => {
    expect(await store.getUsage()).toBe(0);
  });

  it('tracks added usage', async () => {
    await store.addUsage(undefined, 100);
    expect(await store.getUsage()).toBe(100);
    await store.addUsage(undefined, 50);
    expect(await store.getUsage()).toBe(150);
  });

  it('tracks removed usage', async () => {
    await store.addUsage(undefined, 200);
    await store.removeUsage(undefined, 50);
    expect(await store.getUsage()).toBe(150);
  });

  it('does not go below 0', async () => {
    await store.removeUsage(undefined, 100);
    expect(await store.getUsage()).toBe(0);
  });

  it('tracks usage per prefix', async () => {
    await store.addUsage('user1', 100);
    await store.addUsage('user2', 200);
    expect(await store.getUsage('user1')).toBe(100);
    expect(await store.getUsage('user2')).toBe(200);
  });

  it('reset() clears all usage', async () => {
    await store.addUsage(undefined, 500);
    store.reset();
    expect(await store.getUsage()).toBe(0);
  });
});

describe('QuotaDisk', () => {
  let inner: FakeDisk;
  let quotaStore: MemoryQuotaStore;

  beforeEach(() => {
    inner = new FakeDisk();
    quotaStore = new MemoryQuotaStore();
  });

  it('allows writes within quota', async () => {
    const disk = new QuotaDisk(inner, quotaStore, { maxBytes: 1000 });
    await expect(disk.put('file.txt', Buffer.alloc(500))).resolves.toBe(true);
  });

  it('throws StorageQuotaExceededError when quota exceeded', async () => {
    const disk = new QuotaDisk(inner, quotaStore, { maxBytes: 100 });
    await expect(disk.put('file.txt', Buffer.alloc(200))).rejects.toBeInstanceOf(
      StorageQuotaExceededError,
    );
  });

  it('tracks usage after successful put', async () => {
    const disk = new QuotaDisk(inner, quotaStore, { maxBytes: 1000 });
    await disk.put('file.txt', Buffer.alloc(300));
    const { used } = await disk.getUsage();
    expect(used).toBe(300);
  });

  it('throws when cumulative usage would exceed quota', async () => {
    const disk = new QuotaDisk(inner, quotaStore, { maxBytes: 500 });
    await disk.put('file1.txt', Buffer.alloc(300));
    await expect(disk.put('file2.txt', Buffer.alloc(300))).rejects.toBeInstanceOf(
      StorageQuotaExceededError,
    );
  });

  it('releases usage on delete', async () => {
    const disk = new QuotaDisk(inner, quotaStore, { maxBytes: 1000 });
    await disk.put('file.txt', Buffer.alloc(400));
    await disk.delete('file.txt');
    const { used } = await disk.getUsage();
    expect(used).toBe(0);
  });

  it('getUsage() returns used, limit, percent', async () => {
    const disk = new QuotaDisk(inner, quotaStore, { maxBytes: 1000 });
    await disk.put('file.txt', Buffer.alloc(500));
    const usage = await disk.getUsage();
    expect(usage.used).toBe(500);
    expect(usage.limit).toBe(1000);
    expect(usage.percent).toBe(50);
  });

  it('works with string content', async () => {
    const disk = new QuotaDisk(inner, quotaStore, { maxBytes: 1000 });
    await disk.put('text.txt', 'hello world'); // 11 bytes UTF-8
    const { used } = await disk.getUsage();
    expect(used).toBe(11);
  });

  it('scopes quota by prefix', async () => {
    const disk1 = new QuotaDisk(inner, quotaStore, { maxBytes: 500, prefix: 'user1' });
    const disk2 = new QuotaDisk(inner, quotaStore, { maxBytes: 500, prefix: 'user2' });

    await disk1.put('user1/file.txt', Buffer.alloc(400));
    // user2 should have its own quota
    await expect(disk2.put('user2/file.txt', Buffer.alloc(400))).resolves.toBe(true);
  });

  it('does not allow writes exceeding scoped quota', async () => {
    const disk = new QuotaDisk(inner, quotaStore, { maxBytes: 100, prefix: 'user1' });
    await expect(disk.put('file.txt', Buffer.alloc(200))).rejects.toBeInstanceOf(
      StorageQuotaExceededError,
    );
  });
});
