import { Readable } from 'stream';
import { FakeDisk } from './fake-disk';

describe('FakeDisk', () => {
  let disk: FakeDisk;

  beforeEach(() => {
    disk = new FakeDisk();
  });

  describe('put and get', () => {
    it('should put and get a string', async () => {
      await disk.put('file.txt', 'hello');
      const result = await disk.get('file.txt', { responseType: 'string' });
      expect(result).toBe('hello');
    });

    it('should put and get a buffer', async () => {
      const buf = Buffer.from('binary data');
      await disk.put('file.bin', buf);
      const result = await disk.get('file.bin');
      expect(Buffer.isBuffer(result)).toBe(true);
      expect((result as Buffer).toString()).toBe('binary data');
    });

    it('should put and get a stream', async () => {
      await disk.put('file.txt', 'stream data');
      const stream = await disk.get('file.txt', { responseType: 'stream' });
      expect(stream).toBeInstanceOf(Readable);

      const chunks: Buffer[] = [];
      for await (const chunk of stream as Readable) {
        chunks.push(Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).toString()).toBe('stream data');
    });

    it('should put a stream', async () => {
      const stream = Readable.from(['hello ', 'world']);
      await disk.put('streamed.txt', stream as any);
      const result = await disk.get('streamed.txt', { responseType: 'string' });
      expect(result).toBe('hello world');
    });

    it('should throw on get for non-existent file', async () => {
      await expect(disk.get('nope.txt')).rejects.toThrow('File not found');
    });
  });

  describe('exists and missing', () => {
    it('should return false for non-existent file', async () => {
      expect(await disk.exists('nope.txt')).toBe(false);
    });

    it('should return true for existing file', async () => {
      await disk.put('file.txt', 'data');
      expect(await disk.exists('file.txt')).toBe(true);
    });

    it('missing should be inverse of exists', async () => {
      expect(await disk.missing('nope.txt')).toBe(true);
      await disk.put('file.txt', 'data');
      expect(await disk.missing('file.txt')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete a file', async () => {
      await disk.put('file.txt', 'data');
      await disk.delete('file.txt');
      expect(await disk.exists('file.txt')).toBe(false);
    });

    it('should return true even if file does not exist', async () => {
      expect(await disk.delete('nope.txt')).toBe(true);
    });
  });

  describe('copy and move', () => {
    it('should copy a file', async () => {
      await disk.put('a.txt', 'content');
      await disk.copy('a.txt', 'b.txt');
      expect(await disk.get('b.txt', { responseType: 'string' })).toBe('content');
      expect(await disk.exists('a.txt')).toBe(true);
    });

    it('should move a file', async () => {
      await disk.put('a.txt', 'content');
      await disk.move('a.txt', 'b.txt');
      expect(await disk.get('b.txt', { responseType: 'string' })).toBe('content');
      expect(await disk.exists('a.txt')).toBe(false);
    });
  });

  describe('size and lastModified', () => {
    it('should return file size', async () => {
      await disk.put('file.txt', 'hello');
      expect(await disk.size('file.txt')).toBe(5);
    });

    it('should return last modified time', async () => {
      const before = Date.now();
      await disk.put('file.txt', 'data');
      const modified = await disk.lastModified('file.txt');
      expect(modified).toBeGreaterThanOrEqual(before);
    });
  });

  describe('directory operations', () => {
    beforeEach(async () => {
      await disk.put('root.txt', 'r');
      await disk.put('sub/a.txt', 'a');
      await disk.put('sub/b.txt', 'b');
      await disk.put('sub/deep/c.txt', 'c');
    });

    it('should list files non-recursively', async () => {
      const result = await disk.files();
      expect(result).toEqual(['root.txt']);
    });

    it('should list files recursively', async () => {
      const result = await disk.allFiles();
      expect(result).toEqual(['root.txt', 'sub/a.txt', 'sub/b.txt', 'sub/deep/c.txt']);
    });

    it('should list files in a directory', async () => {
      const result = await disk.files('sub');
      expect(result).toEqual(['sub/a.txt', 'sub/b.txt']);
    });

    it('should list directories', async () => {
      const dirs = await disk.directories();
      expect(dirs).toContain('sub/');
    });

    it('should make and delete directory', async () => {
      await disk.makeDirectory('new-dir');
      await disk.put('new-dir/file.txt', 'data');
      await disk.deleteDirectory('new-dir');
      expect(await disk.exists('new-dir/file.txt')).toBe(false);
    });

    it('should get directory size', async () => {
      const size = await disk.directorySize('sub');
      expect(size).toBe(3); // a + b + c = 1 + 1 + 1
    });
  });

  describe('visibility', () => {
    it('should default to private', async () => {
      await disk.put('file.txt', 'data');
      expect(await disk.getVisibility('file.txt')).toBe('private');
    });

    it('should set visibility on put', async () => {
      await disk.put('file.txt', 'data', { visibility: 'public' });
      expect(await disk.getVisibility('file.txt')).toBe('public');
    });

    it('should change visibility', async () => {
      await disk.put('file.txt', 'data');
      await disk.setVisibility('file.txt', 'public');
      expect(await disk.getVisibility('file.txt')).toBe('public');
    });
  });

  describe('url operations', () => {
    it('should return a fake url', () => {
      expect(disk.url('photos/img.jpg')).toBe('/fake-storage/photos/img.jpg');
    });

    it('should return a fake temporary url', async () => {
      const url = await disk.temporaryUrl('file.txt', new Date());
      expect(url).toContain('signed=true');
    });
  });

  describe('prepend and append', () => {
    it('should append to a file', async () => {
      await disk.put('log.txt', 'line1\n');
      await disk.append('log.txt', 'line2\n');
      expect(await disk.get('log.txt', { responseType: 'string' })).toBe('line1\nline2\n');
    });

    it('should prepend to a file', async () => {
      await disk.put('log.txt', 'line2\n');
      await disk.prepend('log.txt', 'line1\n');
      expect(await disk.get('log.txt', { responseType: 'string' })).toBe('line1\nline2\n');
    });
  });

  describe('metadata and mimeType', () => {
    it('should return file metadata', async () => {
      await disk.put('photo.jpg', Buffer.alloc(100));
      const meta = await disk.getMetadata('photo.jpg');
      expect(meta.path).toBe('photo.jpg');
      expect(meta.size).toBe(100);
      expect(meta.mimetype).toBe('image/jpeg');
    });

    it('should return mime type', async () => {
      expect(await disk.mimeType('file.json')).toBe('application/json');
    });
  });

  describe('json', () => {
    it('should read and parse JSON', async () => {
      await disk.put('data.json', JSON.stringify({ foo: 'bar' }));
      const result = await disk.json<{ foo: string }>('data.json');
      expect(result).toEqual({ foo: 'bar' });
    });
  });

  describe('checksum', () => {
    it('should compute md5 hash', async () => {
      await disk.put('file.txt', 'hello');
      const hash = await disk.checksum('file.txt');
      expect(hash).toBe('5d41402abc4b2a76b9719d911017c592');
    });
  });

  describe('deleteMany', () => {
    it('should delete multiple files', async () => {
      await disk.put('a.txt', 'a');
      await disk.put('b.txt', 'b');
      const result = await disk.deleteMany(['a.txt', 'b.txt']);
      expect(result.succeeded).toEqual(['a.txt', 'b.txt']);
      expect(result.failed).toEqual([]);
    });
  });

  describe('putFile and putFileAs', () => {
    it('should put a multer-like file', async () => {
      const file = { buffer: Buffer.from('data'), originalname: 'upload.txt' };
      const path = await disk.putFile('uploads', file);
      expect(path).toBe('uploads/upload.txt');
      disk.assertExists('uploads/upload.txt');
    });

    it('should put file with custom name', async () => {
      const path = await disk.putFileAs('uploads', Buffer.from('data'), 'custom.txt');
      expect(path).toBe('uploads/custom.txt');
    });
  });

  describe('multipart uploads', () => {
    it('should complete a multipart upload', async () => {
      const { uploadId } = await disk.initMultipartUpload('large.bin');
      const part1 = await disk.uploadPart(uploadId, 1, Buffer.from('aaa'), 'large.bin');
      const part2 = await disk.uploadPart(uploadId, 2, Buffer.from('bbb'), 'large.bin');
      await disk.completeMultipartUpload(uploadId, 'large.bin', [part1, part2]);

      const content = await disk.get('large.bin', { responseType: 'string' });
      expect(content).toBe('aaabbb');
    });

    it('should abort a multipart upload', async () => {
      const { uploadId } = await disk.initMultipartUpload('file.bin');
      await disk.abortMultipartUpload(uploadId, 'file.bin');
      expect(await disk.exists('file.bin')).toBe(false);
    });
  });

  // --- Assertion methods ---

  describe('assertion methods', () => {
    it('assertExists should pass for existing file', async () => {
      await disk.put('file.txt', 'data');
      expect(() => disk.assertExists('file.txt')).not.toThrow();
    });

    it('assertExists should throw for missing file', () => {
      expect(() => disk.assertExists('nope.txt')).toThrow('Expected file [nope.txt] to exist');
    });

    it('assertMissing should pass for missing file', () => {
      expect(() => disk.assertMissing('nope.txt')).not.toThrow();
    });

    it('assertMissing should throw for existing file', async () => {
      await disk.put('file.txt', 'data');
      expect(() => disk.assertMissing('file.txt')).toThrow(
        'Expected file [file.txt] to be missing',
      );
    });

    it('assertCount should verify file count', async () => {
      await disk.put('a.txt', 'a');
      await disk.put('b.txt', 'b');
      expect(() => disk.assertCount(2)).not.toThrow();
      expect(() => disk.assertCount(1)).toThrow('Expected 1 file(s), but found 2');
    });

    it('assertCount should verify file count in directory', async () => {
      await disk.put('dir/a.txt', 'a');
      await disk.put('dir/b.txt', 'b');
      await disk.put('other.txt', 'o');
      expect(() => disk.assertCount(2, 'dir')).not.toThrow();
    });

    it('assertDirectoryEmpty should pass for empty directory', () => {
      expect(() => disk.assertDirectoryEmpty('empty')).not.toThrow();
    });

    it('assertContentEquals should verify content', async () => {
      await disk.put('file.txt', 'hello');
      expect(() => disk.assertContentEquals('file.txt', 'hello')).not.toThrow();
      expect(() => disk.assertContentEquals('file.txt', 'wrong')).toThrow(
        'does not match expected value',
      );
    });

    it('getStoredFiles should return all paths', async () => {
      await disk.put('a.txt', 'a');
      await disk.put('b.txt', 'b');
      expect(disk.getStoredFiles()).toEqual(['a.txt', 'b.txt']);
    });

    it('getStoredFile should return file data', async () => {
      await disk.put('file.txt', 'data');
      const file = disk.getStoredFile('file.txt');
      expect(file).toBeDefined();
      expect(file!.content.toString()).toBe('data');
    });

    it('reset should clear all data', async () => {
      await disk.put('file.txt', 'data');
      disk.reset();
      expect(disk.getStoredFiles()).toEqual([]);
    });
  });
});
