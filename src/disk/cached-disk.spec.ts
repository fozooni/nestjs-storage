import { FakeDisk } from '../testing/fake-disk';
import { CachedDisk, MemoryCacheBackend } from './cached-disk';

describe('MemoryCacheBackend', () => {
  let cache: MemoryCacheBackend;

  beforeEach(() => {
    cache = new MemoryCacheBackend();
  });

  it('stores and retrieves values', () => {
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('returns undefined for missing keys', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('expires entries after ttl', async () => {
    cache.set('key', 'value', 10);
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get('key')).toBeUndefined();
  });

  it('does not expire entries without ttl', async () => {
    cache.set('key', 'value');
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get('key')).toBe('value');
  });

  it('deletes entries by path suffix', () => {
    cache.set('exists:file.txt', true);
    cache.set('size:file.txt', 100);
    cache.del('file.txt');
    expect(cache.get('exists:file.txt')).toBeUndefined();
    expect(cache.get('size:file.txt')).toBeUndefined();
  });

  it('clears all entries', () => {
    cache.set('key1', 'v1');
    cache.set('key2', 'v2');
    cache.clear();
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBeUndefined();
  });
});

describe('CachedDisk', () => {
  let inner: FakeDisk;
  let cached: CachedDisk;
  let existsSpy: jest.SpyInstance;
  let sizeSpy: jest.SpyInstance;

  beforeEach(async () => {
    inner = new FakeDisk();
    await inner.put('file.txt', 'hello world');
    cached = new CachedDisk(inner);
    existsSpy = jest.spyOn(inner, 'exists');
    sizeSpy = jest.spyOn(inner, 'size');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('caches exists() on second call', async () => {
    await cached.exists('file.txt');
    await cached.exists('file.txt');
    expect(existsSpy).toHaveBeenCalledTimes(1);
  });

  it('caches size() on second call', async () => {
    await cached.size('file.txt');
    await cached.size('file.txt');
    expect(sizeSpy).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache on put()', async () => {
    await cached.exists('file.txt');
    await cached.put('file.txt', 'new content');
    await cached.exists('file.txt');
    expect(existsSpy).toHaveBeenCalledTimes(2);
  });

  it('invalidates cache on delete()', async () => {
    await cached.exists('file.txt');
    await cached.delete('file.txt');
    await cached.exists('file.txt');
    expect(existsSpy).toHaveBeenCalledTimes(2);
  });

  it('invalidates destination on copy()', async () => {
    await inner.put('dest.txt', 'old');
    await cached.exists('dest.txt'); // cache 'dest.txt'
    await cached.copy('file.txt', 'dest.txt');
    existsSpy.mockClear(); // reset call count after invalidation
    await cached.exists('dest.txt'); // should re-fetch
    expect(existsSpy).toHaveBeenCalledTimes(1);
  });

  it('invalidates both paths on move()', async () => {
    await inner.put('src.txt', 'data');
    await cached.exists('src.txt');
    await cached.exists('file.txt');
    await cached.move('src.txt', 'file.txt');
    existsSpy.mockClear(); // reset call count after invalidation
    await cached.exists('src.txt');
    await cached.exists('file.txt');
    expect(existsSpy).toHaveBeenCalledTimes(2);
  });

  it('clears entire cache on deleteDirectory()', async () => {
    await cached.exists('file.txt');
    await cached.deleteDirectory('some-dir');
    existsSpy.mockClear(); // reset call count after cache cleared
    await cached.exists('file.txt');
    expect(existsSpy).toHaveBeenCalledTimes(1);
  });

  it('uses custom backend', async () => {
    const backend = new MemoryCacheBackend();
    const customCached = new CachedDisk(inner, { backend });
    await customCached.exists('file.txt');
    expect(backend.get('exists:file.txt')).toBe(true);
  });

  it('respects per-method TTL', async () => {
    const fastExpiryCached = new CachedDisk(inner, { ttlByMethod: { exists: 10 } });
    await fastExpiryCached.exists('file.txt');
    await new Promise((r) => setTimeout(r, 20));
    existsSpy.mockClear(); // reset after TTL expiry wait
    await fastExpiryCached.exists('file.txt');
    expect(existsSpy).toHaveBeenCalledTimes(1);
  });

  it('caches getMetadata()', async () => {
    const metaSpy = jest.spyOn(inner, 'getMetadata');
    await cached.getMetadata('file.txt');
    await cached.getMetadata('file.txt');
    expect(metaSpy).toHaveBeenCalledTimes(1);
  });

  it('caches mimeType()', async () => {
    const mimeSpy = jest.spyOn(inner, 'mimeType');
    await cached.mimeType('file.txt');
    await cached.mimeType('file.txt');
    expect(mimeSpy).toHaveBeenCalledTimes(1);
  });

  it('clearCache() clears the backend', async () => {
    await cached.exists('file.txt');
    cached.clearCache();
    existsSpy.mockClear(); // reset after cache cleared
    await cached.exists('file.txt');
    expect(existsSpy).toHaveBeenCalledTimes(1);
  });

  it('exposes cacheBackend getter', () => {
    expect(cached.cacheBackend).toBeDefined();
  });
});
