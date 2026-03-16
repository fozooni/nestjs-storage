import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import { StorageTempCleanupService } from './storage-temp.service';
import { LocalDisk } from '../disk/local-disk';
import { FakeDisk } from '../testing/fake-disk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nestjs-storage-test-'));
}

function makeMockStorage(disk: any): any {
  return { disk: jest.fn().mockReturnValue(disk) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StorageTempCleanupService', () => {
  describe('non-LocalDisk early return', () => {
    it('returns { deleted: 0, errors: 0 } for FakeDisk (not a LocalDisk)', async () => {
      const fake = new FakeDisk();
      const service = new StorageTempCleanupService(makeMockStorage(fake) as any);

      const result = await service.runOnce('any');

      expect(result).toEqual({ deleted: 0, errors: 0 });
    });
  });

  describe('with LocalDisk', () => {
    let root: string;
    let disk: LocalDisk;
    let service: StorageTempCleanupService;

    beforeEach(() => {
      root = makeTempDir();
      disk = new LocalDisk({ driver: 'local', root });
      service = new StorageTempCleanupService(makeMockStorage(disk) as any);
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('deletes expired file and its .ttl sidecar', async () => {
      // Write an expired temp file manually
      const filePath = 'uploads/temp.txt';
      await disk.put(filePath, 'hello');

      const sidecarPath = filePath + '.ttl';
      const pastTime = Date.now() - 1000; // expired 1 second ago
      await disk.put(sidecarPath, JSON.stringify({ expiresAt: pastTime }));

      const result = await service.runOnce('disk');

      expect(result.deleted).toBe(1);
      expect(result.errors).toBe(0);

      const stillExists = await disk.exists(filePath);
      const sidecarExists = await disk.exists(sidecarPath);
      expect(stillExists).toBe(false);
      expect(sidecarExists).toBe(false);
    });

    it('keeps non-expired temp files', async () => {
      const filePath = 'uploads/active.txt';
      await disk.put(filePath, 'active content');

      const sidecarPath = filePath + '.ttl';
      const futureTime = Date.now() + 60_000; // expires in 1 minute
      await disk.put(sidecarPath, JSON.stringify({ expiresAt: futureTime }));

      const result = await service.runOnce('disk');

      expect(result.deleted).toBe(0);
      expect(result.errors).toBe(0);

      expect(await disk.exists(filePath)).toBe(true);
      expect(await disk.exists(sidecarPath)).toBe(true);
    });

    it('handles missing original file gracefully (sidecar without original)', async () => {
      // Write only a .ttl sidecar with no original file
      const sidecarPath = 'orphan.txt.ttl';
      const pastTime = Date.now() - 500;
      await disk.put(sidecarPath, JSON.stringify({ expiresAt: pastTime }));

      const result = await service.runOnce('disk');

      // The original delete will fail silently; sidecar is still deleted
      expect(result.deleted).toBe(1);
      expect(result.errors).toBe(0);
      expect(await disk.exists(sidecarPath)).toBe(false);
    });

    it('handles multiple expired and non-expired files correctly', async () => {
      const expired = ['exp1.txt', 'exp2.txt'];
      const active = ['active1.txt'];

      for (const f of expired) {
        await disk.put(f, 'data');
        await disk.put(f + '.ttl', JSON.stringify({ expiresAt: Date.now() - 1000 }));
      }

      for (const f of active) {
        await disk.put(f, 'data');
        await disk.put(f + '.ttl', JSON.stringify({ expiresAt: Date.now() + 60_000 }));
      }

      const result = await service.runOnce('disk');

      expect(result.deleted).toBe(2);
      expect(result.errors).toBe(0);

      for (const f of expired) {
        expect(await disk.exists(f)).toBe(false);
        expect(await disk.exists(f + '.ttl')).toBe(false);
      }

      for (const f of active) {
        expect(await disk.exists(f)).toBe(true);
        expect(await disk.exists(f + '.ttl')).toBe(true);
      }
    });

    it('returns { deleted: 0, errors: 0 } when disk has no .ttl files', async () => {
      await disk.put('regular.txt', 'hello');
      await disk.put('another.jpg', 'data');

      const result = await service.runOnce('disk');

      expect(result).toEqual({ deleted: 0, errors: 0 });
    });

    it('counts errors for malformed .ttl sidecar JSON', async () => {
      await disk.put('bad.txt.ttl', 'not-valid-json{{{');

      const result = await service.runOnce('disk');

      expect(result.deleted).toBe(0);
      expect(result.errors).toBe(1);
    });

    it('passes diskName to storage.disk()', async () => {
      const mockStorage = makeMockStorage(disk);
      const s = new StorageTempCleanupService(mockStorage as any);

      await s.runOnce('my-local-disk');

      expect(mockStorage.disk).toHaveBeenCalledWith('my-local-disk');
    });

    it('uses default disk when no diskName is provided', async () => {
      const mockStorage = makeMockStorage(disk);
      const s = new StorageTempCleanupService(mockStorage as any);

      await s.runOnce();

      expect(mockStorage.disk).toHaveBeenCalledWith(undefined);
    });
  });

  describe('integration: putTemp + runOnce', () => {
    let root: string;
    let disk: LocalDisk;
    let service: StorageTempCleanupService;

    beforeEach(() => {
      root = makeTempDir();
      disk = new LocalDisk({ driver: 'local', root });
      service = new StorageTempCleanupService(makeMockStorage(disk) as any);
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('cleans up files written via putTemp() after they expire', async () => {
      // Write a temp file with 0 second TTL (immediately expired for our purposes)
      await disk.putTemp('session/token.txt', 'abc123', 0);

      // Small delay so expiresAt is truly in the past
      await new Promise((r) => setTimeout(r, 10));

      const result = await service.runOnce('disk');

      expect(result.deleted).toBe(1);
      expect(result.errors).toBe(0);
      expect(await disk.exists('session/token.txt')).toBe(false);
    });

    it('does NOT clean up files with a future TTL', async () => {
      await disk.putTemp('session/active.txt', 'secret', 3600); // 1 hour

      const result = await service.runOnce('disk');

      expect(result.deleted).toBe(0);
      expect(await disk.exists('session/active.txt')).toBe(true);
    });
  });
});
