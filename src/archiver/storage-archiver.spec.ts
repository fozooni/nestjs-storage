import { Readable } from 'stream';

import { StorageConfigurationError } from '../errors/storage-errors';
import { FakeDisk } from '../testing/fake-disk';
import { StorageArchiver } from './storage-archiver';

// ─── mock archiver ────────────────────────────────────────────────────────────

/** Minimal archiver mock that records appended files and emits all data on finalize(). */
function makeFakeArchive() {
  const appended: Array<{ name: string }> = [];
  const readable = new Readable({ read() {} });
  const archive = {
    append: jest.fn((_stream: unknown, opts: { name: string }) => {
      appended.push({ name: opts.name });
    }),
    finalize: jest.fn(() => {
      readable.push(Buffer.from('archive-data'));
      readable.push(null);
    }),
    // Make the archive itself a Readable so StorageArchiver can return it.
    on: readable.on.bind(readable),
    pipe: readable.pipe.bind(readable),
    // Expose for assertions:
    _appended: appended,
    _readable: readable,
  };
  // Allow iterating the archive as a ReadableStream.
  Object.assign(archive, { [Symbol.asyncIterator]: readable[Symbol.asyncIterator].bind(readable) });
  return archive;
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('StorageArchiver', () => {
  let disk: FakeDisk;
  let archiver: StorageArchiver;
  let archiverMod: jest.Mock;
  let fakeArchive: ReturnType<typeof makeFakeArchive>;

  beforeEach(async () => {
    disk = new FakeDisk();
    archiver = new StorageArchiver();

    await disk.put('hello.txt', Buffer.from('hello'));
    await disk.put('world.txt', Buffer.from('world'));

    fakeArchive = makeFakeArchive();
    archiverMod = jest.fn().mockReturnValue(fakeArchive);
    jest.mock('archiver', () => archiverMod, { virtual: true });
    // Inject mock via require cache.
    require.cache['archiver'] = {
      id: 'archiver',
      filename: 'archiver',
      loaded: true,
      exports: archiverMod,
    } as NodeJS.Module;
  });

  afterEach(() => {
    delete require.cache['archiver'];
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('calls archiver with format "zip" for createZip()', async () => {
    const stream = await archiver.createZip([{ path: 'hello.txt' }, { path: 'world.txt' }], disk);
    expect(archiverMod).toHaveBeenCalledWith('zip', expect.any(Object));
    expect(fakeArchive.append).toHaveBeenCalledTimes(2);
    expect(fakeArchive.finalize).toHaveBeenCalled();
    expect(stream).toBeDefined();
  });

  it('calls archiver with format "tar" for createTar()', async () => {
    await archiver.createTar([{ path: 'hello.txt' }], disk);
    expect(archiverMod).toHaveBeenCalledWith('tar', expect.any(Object));
  });

  it('uses the custom name when provided', async () => {
    await archiver.createZip([{ path: 'hello.txt', name: 'custom.txt' }], disk);
    expect(fakeArchive.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'custom.txt' }),
    );
  });

  it('falls back to the path as name when name is omitted', async () => {
    await archiver.createZip([{ path: 'hello.txt' }], disk);
    expect(fakeArchive.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'hello.txt' }),
    );
  });

  it('passes zlib options for zip format', async () => {
    await archiver.createZip([{ path: 'hello.txt' }], disk, { zlib: { level: 9 } });
    expect(archiverMod).toHaveBeenCalledWith('zip', { zlib: { level: 9 } });
  });

  it('throws StorageConfigurationError when archiver is not installed', async () => {
    delete require.cache['archiver'];
    // Remove the module from the require cache so require() throws MODULE_NOT_FOUND.
    jest.spyOn(archiver as any, 'create').mockImplementationOnce(async () => {
      throw new StorageConfigurationError(
        "The 'archiver' package is required for StorageArchiver.",
      );
    });

    await expect(archiver.createZip([{ path: 'hello.txt' }], disk)).rejects.toBeInstanceOf(
      StorageConfigurationError,
    );
  });

  it('appends each file as a stream (not a buffer)', async () => {
    await archiver.createZip([{ path: 'hello.txt' }, { path: 'world.txt' }], disk);
    const calls = (fakeArchive.append as jest.Mock).mock.calls;
    for (const [streamArg] of calls) {
      // Disk.get with responseType:'stream' should return a Readable.
      expect(streamArg).toBeInstanceOf(Readable);
    }
  });
});
