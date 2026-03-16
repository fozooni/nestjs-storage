import { FakeDisk } from '../testing/fake-disk';
import { ScopedDisk } from './scoped-disk';

describe('ScopedDisk', () => {
  let inner: FakeDisk;
  let scoped: ScopedDisk;

  beforeEach(() => {
    inner = new FakeDisk();
    scoped = new ScopedDisk(inner, 'users/123');
  });

  describe('put / get', () => {
    it('should prepend prefix to put path', async () => {
      await scoped.put('avatar.jpg', 'data');
      expect(inner.getStoredFiles()).toContain('users/123/avatar.jpg');
    });

    it('should prepend prefix to get path', async () => {
      await inner.put('users/123/avatar.jpg', 'hello');
      const content = await scoped.get('avatar.jpg', { responseType: 'string' });
      expect(content).toBe('hello');
    });
  });

  describe('exists / delete', () => {
    it('should resolve path for exists', async () => {
      await inner.put('users/123/file.txt', 'x');
      expect(await scoped.exists('file.txt')).toBe(true);
      expect(await scoped.exists('other.txt')).toBe(false);
    });

    it('should resolve path for delete', async () => {
      await inner.put('users/123/file.txt', 'x');
      await scoped.delete('file.txt');
      expect(inner.getStoredFiles()).not.toContain('users/123/file.txt');
    });
  });

  describe('files / directories', () => {
    it('should list files under scope and strip prefix', async () => {
      await inner.put('users/123/a.txt', '1');
      await inner.put('users/123/b.txt', '2');
      await inner.put('users/456/c.txt', '3'); // outside scope
      const files = await scoped.files();
      expect(files).toEqual(['a.txt', 'b.txt']);
    });

    it('should list files in subdirectory with prefix stripped', async () => {
      await inner.put('users/123/docs/report.pdf', 'x');
      const files = await scoped.allFiles();
      expect(files).toContain('docs/report.pdf');
    });
  });

  describe('putFile / putFileAs', () => {
    it('should return scoped path (without prefix) from putFile', async () => {
      const file = { buffer: Buffer.from('hello'), originalname: 'photo.jpg' };
      const path = await scoped.putFile('uploads', file);
      expect(path).toBe('uploads/photo.jpg');
      expect(inner.getStoredFiles()).toContain('users/123/uploads/photo.jpg');
    });

    it('should return scoped path from putFileAs', async () => {
      const path = await scoped.putFileAs('docs', Buffer.from('data'), 'readme.txt');
      expect(path).toBe('docs/readme.txt');
    });
  });

  describe('copy / move', () => {
    it('should resolve both paths for copy', async () => {
      await inner.put('users/123/src.txt', 'data');
      await scoped.copy('src.txt', 'dst.txt');
      expect(inner.getStoredFiles()).toContain('users/123/dst.txt');
    });

    it('should resolve both paths for move', async () => {
      await inner.put('users/123/src.txt', 'data');
      await scoped.move('src.txt', 'dst.txt');
      expect(inner.getStoredFiles()).not.toContain('users/123/src.txt');
      expect(inner.getStoredFiles()).toContain('users/123/dst.txt');
    });
  });

  describe('metadata', () => {
    it('should return metadata with stripped path', async () => {
      await inner.put('users/123/file.txt', 'content');
      const meta = await scoped.getMetadata('file.txt');
      expect(meta.path).toBe('file.txt');
    });

    it('should resolve path for size', async () => {
      await inner.put('users/123/file.txt', 'hello');
      expect(await scoped.size('file.txt')).toBe(5);
    });
  });

  describe('deleteMany', () => {
    it('should resolve and strip paths for deleteMany', async () => {
      await inner.put('users/123/a.txt', '1');
      await inner.put('users/123/b.txt', '2');
      const result = await scoped.deleteMany(['a.txt', 'b.txt']);
      expect(result.succeeded).toEqual(['a.txt', 'b.txt']);
      expect(result.failed).toEqual([]);
    });
  });

  describe('nested scope', () => {
    it('should chain prefixes for nested scope', async () => {
      const nested = scoped.scope('photos');
      await nested.put('avatar.jpg', 'img');
      expect(inner.getStoredFiles()).toContain('users/123/photos/avatar.jpg');
    });

    it('should chain scopes via disk.scope()', async () => {
      const inner2 = new FakeDisk();
      const s1 = inner2.scope('tenant/abc');
      const s2 = s1.scope!('user/1');
      await s2!.put('file.txt', 'x');
      expect(inner2.getStoredFiles()).toContain('tenant/abc/user/1/file.txt');
    });
  });

  describe('url', () => {
    it('should resolve path for url', () => {
      const url = scoped.url('file.jpg');
      expect(url).toContain('users/123/file.jpg');
    });
  });

  describe('missing / json / checksum', () => {
    it('should resolve path for missing', async () => {
      expect(await scoped.missing('nonexistent.txt')).toBe(true);
      await inner.put('users/123/exists.txt', 'x');
      expect(await scoped.missing('exists.txt')).toBe(false);
    });

    it('should resolve path for json', async () => {
      await inner.put('users/123/data.json', '{"key":"value"}');
      const result = await scoped.json<{ key: string }>('data.json');
      expect(result).toEqual({ key: 'value' });
    });

    it('should resolve path for checksum', async () => {
      await inner.put('users/123/file.txt', 'hello');
      const innerChecksum = await inner.checksum('users/123/file.txt');
      const scopedChecksum = await scoped.checksum('file.txt');
      expect(scopedChecksum).toBe(innerChecksum);
    });
  });
});
