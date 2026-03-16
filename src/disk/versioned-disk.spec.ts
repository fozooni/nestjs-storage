import { FakeDisk } from '../testing/fake-disk';
import { VersionedDisk } from './versioned-disk';

describe('VersionedDisk', () => {
  let inner: FakeDisk;
  let disk: VersionedDisk;

  beforeEach(() => {
    inner = new FakeDisk();
    disk = new VersionedDisk(inner);
  });

  // ─── Basic write behaviour ───────────────────────────────────────────────

  it('writes to the original path', async () => {
    await disk.put('file.txt', 'v1');
    expect(await inner.exists('file.txt')).toBe(true);
    expect(await inner.get('file.txt', { responseType: 'string' })).toBe('v1');
  });

  it('does not create any version entry on the first write (nothing to snapshot)', async () => {
    await disk.put('file.txt', 'v1');
    const versions = await disk.listVersions('file.txt');
    expect(versions).toHaveLength(0);
  });

  it('creates one version snapshot when overwriting an existing file', async () => {
    await disk.put('file.txt', 'v1');
    await disk.put('file.txt', 'v2');
    const versions = await disk.listVersions('file.txt');
    expect(versions).toHaveLength(1);
  });

  it('creates multiple version entries across multiple overwrites', async () => {
    await disk.put('file.txt', 'v1');
    await disk.put('file.txt', 'v2');
    await disk.put('file.txt', 'v3');
    const versions = await disk.listVersions('file.txt');
    expect(versions).toHaveLength(2);
  });

  it('returns the latest content at the original path after overwrites', async () => {
    await disk.put('file.txt', 'v1');
    await disk.put('file.txt', 'v2');
    expect(await inner.get('file.txt', { responseType: 'string' })).toBe('v2');
  });

  // ─── listVersions ────────────────────────────────────────────────────────

  it('marks only the most recent version as isLatest', async () => {
    await disk.put('file.txt', 'v1');
    await disk.put('file.txt', 'v2');
    await disk.put('file.txt', 'v3');
    const versions = await disk.listVersions('file.txt');
    expect(versions.filter((v) => v.isLatest)).toHaveLength(1);
    expect(versions[0].isLatest).toBe(true);
  });

  it('returns versions sorted most-recent-first', async () => {
    await disk.put('file.txt', 'v1');
    await new Promise((r) => setTimeout(r, 5)); // ensure distinct timestamps
    await disk.put('file.txt', 'v2');
    const versions = await disk.listVersions('file.txt');
    expect(versions[0].lastModified.getTime()).toBeGreaterThanOrEqual(
      versions[versions.length - 1].lastModified.getTime(),
    );
  });

  it('returns an empty array when no prior versions exist', async () => {
    expect(await disk.listVersions('never-written.txt')).toEqual([]);
  });

  it('returns an empty array for a file that was only written once', async () => {
    await disk.put('once.txt', 'data');
    expect(await disk.listVersions('once.txt')).toEqual([]);
  });

  it('includes size metadata in version entries', async () => {
    await disk.put('file.txt', 'hello-v1'); // 8 bytes
    await disk.put('file.txt', 'v2');
    const versions = await disk.listVersions('file.txt');
    expect(versions[0].size).toBe(8);
  });

  it('each version has a non-empty versionId string', async () => {
    await disk.put('file.txt', 'v1');
    await disk.put('file.txt', 'v2');
    const versions = await disk.listVersions('file.txt');
    expect(versions[0].versionId).toBeTruthy();
  });

  // ─── getVersion ──────────────────────────────────────────────────────────

  it('getVersion() returns the correct historical content', async () => {
    await disk.put('file.txt', 'v1');
    await disk.put('file.txt', 'v2');
    const versions = await disk.listVersions('file.txt');
    // The most recent version stores the content BEFORE 'v2' was written, i.e. 'v1'
    const content = await disk.getVersion('file.txt', versions[0].versionId);
    expect(content.toString()).toBe('v1');
  });

  it('getVersion() returns a Buffer', async () => {
    await disk.put('file.txt', 'v1');
    await disk.put('file.txt', 'v2');
    const versions = await disk.listVersions('file.txt');
    const result = await disk.getVersion('file.txt', versions[0].versionId);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  // ─── restoreVersion ──────────────────────────────────────────────────────

  it('restoreVersion() copies the version back to the original path', async () => {
    await disk.put('file.txt', 'v1');
    await disk.put('file.txt', 'v2');
    const versions = await disk.listVersions('file.txt');
    await disk.restoreVersion('file.txt', versions[0].versionId);
    expect(await inner.get('file.txt', { responseType: 'string' })).toBe('v1');
  });

  it('restoreVersion() returns true on success', async () => {
    await disk.put('file.txt', 'v1');
    await disk.put('file.txt', 'v2');
    const versions = await disk.listVersions('file.txt');
    const result = await disk.restoreVersion('file.txt', versions[0].versionId);
    expect(result).toBe(true);
  });

  // ─── deleteVersion ───────────────────────────────────────────────────────

  it('deleteVersion() removes the specific version entry', async () => {
    await disk.put('file.txt', 'v1');
    await disk.put('file.txt', 'v2');
    const versionsBefore = await disk.listVersions('file.txt');
    await disk.deleteVersion('file.txt', versionsBefore[0].versionId);
    const versionsAfter = await disk.listVersions('file.txt');
    expect(versionsAfter).toHaveLength(0);
  });

  it('deleteVersion() returns true on success', async () => {
    await disk.put('file.txt', 'v1');
    await disk.put('file.txt', 'v2');
    const versions = await disk.listVersions('file.txt');
    const result = await disk.deleteVersion('file.txt', versions[0].versionId);
    expect(result).toBe(true);
  });

  // ─── Delegates non-versioning operations to inner disk ───────────────────

  it('delegates exists() to the inner disk', async () => {
    await disk.put('file.txt', 'data');
    expect(await disk.exists('file.txt')).toBe(true);
    expect(await disk.exists('missing.txt')).toBe(false);
  });

  it('delegates get() to the inner disk', async () => {
    await disk.put('file.txt', 'content');
    expect(await disk.get('file.txt', { responseType: 'string' })).toBe('content');
  });

  it('delegates delete() to the inner disk', async () => {
    await disk.put('file.txt', 'data');
    await disk.delete('file.txt');
    expect(await inner.exists('file.txt')).toBe(false);
  });
});
