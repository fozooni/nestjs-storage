import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';

import { LocalDisk } from './local-disk';

describe('LocalDisk', () => {
  let disk: LocalDisk;
  let testRoot: string;

  beforeEach(async () => {
    testRoot = await fs.mkdtemp(join(tmpdir(), 'nestjs-storage-test-'));
    disk = new LocalDisk({ driver: 'local', root: testRoot });
    // Wait a tick for ensureDirectory to finish
    await new Promise((r) => setTimeout(r, 50));
  });

  afterEach(async () => {
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should throw if root is not provided', () => {
      expect(() => new LocalDisk({ driver: 'local' })).toThrow('Local disk root path is required');
    });

    it('should create with valid root', () => {
      expect(disk).toBeDefined();
    });
  });

  describe('put / exists / get', () => {
    it('should put and get string content', async () => {
      await disk.put('test.txt', 'hello world');
      expect(await disk.exists('test.txt')).toBe(true);
      const content = await disk.get('test.txt', { responseType: 'string' });
      expect(content).toBe('hello world');
    });

    it('should put and get buffer content', async () => {
      const buffer = Buffer.from('binary data');
      await disk.put('binary.bin', buffer);
      const result = await disk.get('binary.bin');
      expect(Buffer.isBuffer(result)).toBe(true);
      expect((result as Buffer).toString()).toBe('binary data');
    });

    it('should put and get stream content', async () => {
      const stream = Readable.from(['stream data']);
      await disk.put('stream.txt', stream);

      const readStream = await disk.get('stream.txt', { responseType: 'stream' });
      expect(readStream).toBeDefined();

      // Read stream to verify content
      const chunks: Buffer[] = [];
      for await (const chunk of readStream as AsyncIterable<Buffer>) {
        chunks.push(Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).toString()).toBe('stream data');
    });

    it('should create parent directories automatically', async () => {
      await disk.put('nested/deep/file.txt', 'content');
      expect(await disk.exists('nested/deep/file.txt')).toBe(true);
    });

    it('should return false for non-existent files', async () => {
      expect(await disk.exists('nonexistent.txt')).toBe(false);
    });

    it('should set private permissions by default', async () => {
      await disk.put('private.txt', 'secret');
      const stats = await fs.stat(join(testRoot, 'private.txt'));
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it('should set public permissions when requested', async () => {
      await disk.put('public.txt', 'hello', { visibility: 'public' });
      const stats = await fs.stat(join(testRoot, 'public.txt'));
      expect(stats.mode & 0o777).toBe(0o644);
    });

    it('should return false on error when throw is false', async () => {
      const noThrowDisk = new LocalDisk({ driver: 'local', root: testRoot, throw: false });
      // Try to get a non-existent file - put with a path that can't work
      const result = await noThrowDisk.put('/dev/null/impossible/path', 'data');
      expect(result).toBe(false);
    });
  });

  describe('path traversal protection', () => {
    it('should throw on path traversal', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => (disk as any).resolvePath('../../etc/passwd')).toThrow(
        'Path traversal detected',
      );
    });
  });

  describe('delete', () => {
    it('should delete an existing file', async () => {
      await disk.put('to-delete.txt', 'temp');
      expect(await disk.delete('to-delete.txt')).toBe(true);
      expect(await disk.exists('to-delete.txt')).toBe(false);
    });

    it('should return true when deleting non-existent file', async () => {
      expect(await disk.delete('nonexistent.txt')).toBe(true);
    });
  });

  describe('copy', () => {
    it('should copy a file', async () => {
      await disk.put('original.txt', 'content');
      expect(await disk.copy('original.txt', 'copied.txt')).toBe(true);
      expect(await disk.exists('copied.txt')).toBe(true);
      const content = await disk.get('copied.txt', { responseType: 'string' });
      expect(content).toBe('content');
    });

    it('should copy to nested directory', async () => {
      await disk.put('original.txt', 'content');
      expect(await disk.copy('original.txt', 'nested/copied.txt')).toBe(true);
      expect(await disk.exists('nested/copied.txt')).toBe(true);
    });

    it('should set visibility on copy', async () => {
      await disk.put('original.txt', 'content');
      await disk.copy('original.txt', 'public-copy.txt', { visibility: 'public' });
      const stats = await fs.stat(join(testRoot, 'public-copy.txt'));
      expect(stats.mode & 0o777).toBe(0o644);
    });
  });

  describe('move', () => {
    it('should move a file', async () => {
      await disk.put('source.txt', 'content');
      expect(await disk.move('source.txt', 'dest.txt')).toBe(true);
      expect(await disk.exists('source.txt')).toBe(false);
      expect(await disk.exists('dest.txt')).toBe(true);
    });

    it('should set visibility on move', async () => {
      await disk.put('source.txt', 'content');
      await disk.move('source.txt', 'public-dest.txt', { visibility: 'public' });
      const stats = await fs.stat(join(testRoot, 'public-dest.txt'));
      expect(stats.mode & 0o777).toBe(0o644);
    });
  });

  describe('size / lastModified', () => {
    it('should return file size', async () => {
      await disk.put('sized.txt', 'hello');
      const size = await disk.size('sized.txt');
      expect(size).toBe(5);
    });

    it('should return last modified timestamp', async () => {
      const before = Date.now();
      await disk.put('timed.txt', 'data');
      const modified = await disk.lastModified('timed.txt');
      expect(modified).toBeGreaterThanOrEqual(before - 1000);
      expect(modified).toBeLessThanOrEqual(Date.now() + 1000);
    });
  });

  describe('files / allFiles', () => {
    beforeEach(async () => {
      await disk.put('file1.txt', 'a');
      await disk.put('file2.txt', 'b');
      await disk.put('sub/file3.txt', 'c');
      await disk.put('sub/deep/file4.txt', 'd');
    });

    it('should list top-level files only (non-recursive)', async () => {
      const result = await disk.files('', false);
      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');
      expect(result).not.toContain('sub/file3.txt');
    });

    it('should list all files recursively', async () => {
      const result = await disk.allFiles();
      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');
      expect(result).toContain('sub/file3.txt');
      expect(result).toContain('sub/deep/file4.txt');
    });

    it('should list files in a subdirectory', async () => {
      const result = await disk.files('sub', false);
      expect(result).toContain('sub/file3.txt');
      expect(result).not.toContain('sub/deep/file4.txt');
    });
  });

  describe('directories / allDirectories', () => {
    beforeEach(async () => {
      await disk.put('sub/file.txt', 'a');
      await disk.put('sub/deep/file.txt', 'b');
      await disk.put('other/file.txt', 'c');
    });

    it('should list top-level directories', async () => {
      const result = await disk.directories('', false);
      expect(result).toContain('sub/');
      expect(result).toContain('other/');
    });

    it('should list all directories recursively', async () => {
      const result = await disk.allDirectories();
      expect(result).toContain('sub/');
      expect(result).toContain('sub/deep/');
      expect(result).toContain('other/');
    });
  });

  describe('makeDirectory / deleteDirectory', () => {
    it('should create a directory', async () => {
      expect(await disk.makeDirectory('new-dir')).toBe(true);
      const stat = await fs.stat(join(testRoot, 'new-dir'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('should delete a directory', async () => {
      await disk.put('to-delete-dir/file.txt', 'data');
      expect(await disk.deleteDirectory('to-delete-dir')).toBe(true);
      expect(await disk.exists('to-delete-dir/file.txt')).toBe(false);
    });
  });

  describe('getVisibility / setVisibility', () => {
    it('should get private visibility', async () => {
      await disk.put('private.txt', 'data');
      const vis = await disk.getVisibility('private.txt');
      expect(vis).toBe('private');
    });

    it('should set and get public visibility', async () => {
      await disk.put('file.txt', 'data');
      await disk.setVisibility('file.txt', 'public');
      const vis = await disk.getVisibility('file.txt');
      expect(vis).toBe('public');
    });

    it('should set and get private visibility', async () => {
      await disk.put('file.txt', 'data', { visibility: 'public' });
      await disk.setVisibility('file.txt', 'private');
      const vis = await disk.getVisibility('file.txt');
      expect(vis).toBe('private');
    });
  });

  describe('url', () => {
    it('should return encoded path URL', () => {
      expect(disk.url('uploads/photo.jpg')).toBe('/uploads/photo.jpg');
    });

    it('should encode special characters', () => {
      expect(disk.url('uploads/my file.jpg')).toBe('/uploads/my%20file.jpg');
    });
  });

  describe('temporaryUrl', () => {
    it('should return regular URL with warning when signSecret is not set', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const url = await disk.temporaryUrl('file.txt', 3600);
      expect(url).toBe('/file.txt');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('signSecret'));
      consoleSpy.mockRestore();
    });

    it('should generate HMAC-signed URL when signSecret is configured', async () => {
      const signedDisk = new LocalDisk({
        driver: 'local',
        root: testRoot,
        url: 'http://localhost:3000/files',
        signSecret: 'my-signing-secret',
      });
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const url = await signedDisk.temporaryUrl('photo.jpg', 3600);
      expect(url).toContain('?expires=');
      expect(url).toContain('&signature=');
      expect(url).toContain('photo.jpg');
      // Expiry should be roughly now + 3600
      const urlObj = new URL(url);
      expect(Number(urlObj.searchParams.get('expires'))).toBeGreaterThanOrEqual(expiresAt - 2);
    });

    it('should generate different signatures for different paths', async () => {
      const signedDisk = new LocalDisk({
        driver: 'local',
        root: testRoot,
        signSecret: 'key',
      });
      const url1 = await signedDisk.temporaryUrl('a.txt', 3600);
      const url2 = await signedDisk.temporaryUrl('b.txt', 3600);
      const sig1 = new URL(url1, 'http://localhost').searchParams.get('signature');
      const sig2 = new URL(url2, 'http://localhost').searchParams.get('signature');
      expect(sig1).not.toBe(sig2);
    });

    it('should accept a Date expiration', async () => {
      const signedDisk = new LocalDisk({
        driver: 'local',
        root: testRoot,
        signSecret: 'key',
      });
      const expires = new Date(Date.now() + 7200000);
      const url = await signedDisk.temporaryUrl('file.txt', expires);
      expect(url).toContain('?expires=');
      expect(url).toContain('&signature=');
    });
  });

  describe('prepend / append', () => {
    it('should prepend to existing file', async () => {
      await disk.put('file.txt', 'world');
      await disk.prepend('file.txt', 'hello ');
      const content = await disk.get('file.txt', { responseType: 'string' });
      expect(content).toBe('hello world');
    });

    it('should prepend to non-existent file (creates it)', async () => {
      await disk.prepend('new.txt', 'hello');
      const content = await disk.get('new.txt', { responseType: 'string' });
      expect(content).toBe('hello');
    });

    it('should append to existing file', async () => {
      await disk.put('file.txt', 'hello');
      await disk.append('file.txt', ' world');
      const content = await disk.get('file.txt', { responseType: 'string' });
      expect(content).toBe('hello world');
    });

    it('should append to non-existent file (creates it)', async () => {
      await disk.append('new.txt', 'hello');
      const content = await disk.get('new.txt', { responseType: 'string' });
      expect(content).toBe('hello');
    });
  });

  describe('getMetadata', () => {
    it('should return file metadata', async () => {
      await disk.put('meta.txt', 'hello');
      const metadata = await disk.getMetadata('meta.txt');
      expect(metadata.path).toBe('meta.txt');
      expect(metadata.size).toBe(5);
      expect(metadata.lastModified.getTime()).toBeGreaterThan(0);
      expect(metadata.type).toBe('file');
      expect(metadata.mimetype).toBe('text/plain');
      expect(metadata.visibility).toBe('private');
    });
  });

  describe('mimeType', () => {
    it('should return MIME type based on extension', async () => {
      expect(await disk.mimeType('photo.jpg')).toBe('image/jpeg');
      expect(await disk.mimeType('document.pdf')).toBe('application/pdf');
    });
  });

  describe('directorySize', () => {
    it('should calculate directory size', async () => {
      await disk.put('dir/a.txt', 'hello'); // 5 bytes
      await disk.put('dir/b.txt', 'world!'); // 6 bytes
      const size = await disk.directorySize('dir');
      expect(size).toBe(11);
    });

    it('should include nested files', async () => {
      await disk.put('dir/a.txt', 'abc'); // 3 bytes
      await disk.put('dir/sub/b.txt', 'de'); // 2 bytes
      const size = await disk.directorySize('dir');
      expect(size).toBe(5);
    });

    it('should return 0 for non-existent directory', async () => {
      const size = await disk.directorySize('nonexistent');
      expect(size).toBe(0);
    });

    it('should return size for a single file', async () => {
      await disk.put('single.txt', 'abc');
      const size = await disk.directorySize('single.txt');
      expect(size).toBe(3);
    });
  });

  describe('getBucket', () => {
    it('should return undefined', () => {
      expect(disk.getBucket()).toBeUndefined();
    });
  });

  describe('missing', () => {
    it('should return true when file does not exist', async () => {
      expect(await disk.missing('nonexistent.txt')).toBe(true);
    });

    it('should return false when file exists', async () => {
      await disk.put('exists.txt', 'data');
      expect(await disk.missing('exists.txt')).toBe(false);
    });
  });

  describe('json', () => {
    it('should read and parse JSON file', async () => {
      const data = { name: 'test', value: 42 };
      await disk.put('data.json', JSON.stringify(data));
      const result = await disk.json<{ name: string; value: number }>('data.json');
      expect(result).toEqual(data);
    });

    it('should throw on invalid JSON', async () => {
      await disk.put('bad.json', 'not json');
      await expect(disk.json('bad.json')).rejects.toThrow();
    });
  });

  describe('checksum', () => {
    it('should compute md5 checksum by default', async () => {
      await disk.put('hash.txt', 'hello');
      const result = await disk.checksum('hash.txt');
      // md5 of 'hello' = 5d41402abc4b2a76b9719d911017c592
      expect(result).toBe('5d41402abc4b2a76b9719d911017c592');
    });

    it('should compute sha256 checksum', async () => {
      await disk.put('hash.txt', 'hello');
      const result = await disk.checksum('hash.txt', 'sha256');
      // sha256 of 'hello' = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
      expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });
  });

  describe('deleteMany', () => {
    it('should delete multiple files', async () => {
      await disk.put('a.txt', 'a');
      await disk.put('b.txt', 'b');
      await disk.put('c.txt', 'c');

      const result = await disk.deleteMany(['a.txt', 'b.txt', 'c.txt']);
      expect(result.succeeded).toEqual(['a.txt', 'b.txt', 'c.txt']);
      expect(result.failed).toEqual([]);
      expect(await disk.exists('a.txt')).toBe(false);
    });

    it('should report non-existent files as succeeded (delete is idempotent)', async () => {
      const result = await disk.deleteMany(['nonexistent.txt']);
      expect(result.succeeded).toEqual(['nonexistent.txt']);
      expect(result.failed).toEqual([]);
    });
  });

  describe('putFile', () => {
    it('should put a multer-like file', async () => {
      const file = { buffer: Buffer.from('multer data'), originalname: 'upload.txt' };
      const result = await disk.putFile('uploads', file);
      expect(result).toBe('uploads/upload.txt');
      expect(await disk.exists('uploads/upload.txt')).toBe(true);
    });

    it('should put a file from path', async () => {
      // Create a source file
      const sourcePath = join(testRoot, 'source-putfile.txt');
      await fs.writeFile(sourcePath, 'file data');

      const file = { path: sourcePath };
      const result = await disk.putFile('uploads', file);
      expect(result).toBe('uploads/source-putfile.txt');
    });

    it('should put raw string data', async () => {
      const result = await disk.putFile('uploads', 'raw string content');
      expect(result).toBe('uploads/upload');
    });
  });

  describe('putFileAs', () => {
    it('should put a file with custom name', async () => {
      const result = await disk.putFileAs('uploads', Buffer.from('data'), 'custom.txt');
      expect(result).toBe('uploads/custom.txt');
      const content = await disk.get('uploads/custom.txt', { responseType: 'string' });
      expect(content).toBe('data');
    });

    it('should put a multer-like file with custom name', async () => {
      const file = { buffer: Buffer.from('multer') };
      const result = await disk.putFileAs('uploads', file, 'renamed.txt');
      expect(result).toBe('uploads/renamed.txt');
    });
  });

  describe('multipart upload', () => {
    it('should perform a full multipart upload cycle', async () => {
      const { uploadId, key } = await disk.initMultipartUpload('multipart/file.txt');
      expect(uploadId).toBeDefined();
      expect(key).toBe('multipart/file.txt');

      const part1 = await disk.uploadPart(uploadId, 1, Buffer.from('hello '), 'multipart/file.txt');
      expect(part1.partNumber).toBe(1);
      expect(part1.etag).toBeDefined();
      expect(part1.size).toBe(6);

      const part2 = await disk.uploadPart(uploadId, 2, Buffer.from('world'), 'multipart/file.txt');
      expect(part2.partNumber).toBe(2);

      const success = await disk.completeMultipartUpload(uploadId, 'multipart/file.txt', [
        part1,
        part2,
      ]);
      expect(success).toBe(true);

      const content = await disk.get('multipart/file.txt', { responseType: 'string' });
      expect(content).toBe('hello world');
    });

    it('should handle Uint8Array parts', async () => {
      const { uploadId } = await disk.initMultipartUpload('uint8.txt');
      const data = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
      const part = await disk.uploadPart(uploadId, 1, data, 'uint8.txt');
      expect(part.size).toBe(5);

      await disk.completeMultipartUpload(uploadId, 'uint8.txt', [part]);
      const content = await disk.get('uint8.txt', { responseType: 'string' });
      expect(content).toBe('hello');
    });

    it('should handle stream parts', async () => {
      const { uploadId } = await disk.initMultipartUpload('stream-part.txt');
      const stream = Readable.from(['stream data']);
      const part = await disk.uploadPart(uploadId, 1, stream, 'stream-part.txt');
      expect(part.size).toBe(11);

      await disk.completeMultipartUpload(uploadId, 'stream-part.txt', [part]);
      const content = await disk.get('stream-part.txt', { responseType: 'string' });
      expect(content).toBe('stream data');
    });

    it('should abort multipart upload and clean up', async () => {
      const { uploadId } = await disk.initMultipartUpload('abort-test.txt');
      await disk.uploadPart(uploadId, 1, Buffer.from('data'), 'abort-test.txt');

      const result = await disk.abortMultipartUpload(uploadId, 'abort-test.txt');
      expect(result).toBe(true);
      expect(await disk.exists('abort-test.txt')).toBe(false);
    });

    it('should handle parts in correct order during complete', async () => {
      const { uploadId } = await disk.initMultipartUpload('order.txt');

      // Upload parts out of order
      const part3 = await disk.uploadPart(uploadId, 3, Buffer.from('C'), 'order.txt');
      const part1 = await disk.uploadPart(uploadId, 1, Buffer.from('A'), 'order.txt');
      const part2 = await disk.uploadPart(uploadId, 2, Buffer.from('B'), 'order.txt');

      await disk.completeMultipartUpload(uploadId, 'order.txt', [part3, part1, part2]);
      const content = await disk.get('order.txt', { responseType: 'string' });
      expect(content).toBe('ABC');
    });
  });

  describe('putFileMultipart', () => {
    it('should use putFileAs for small files', async () => {
      const file = { buffer: Buffer.alloc(100, 'a'), originalname: 'small.bin' };
      const result = await disk.putFileMultipart('uploads', file);
      expect(result).toBe('uploads/small.bin');
    });

    it('should handle multer-like files', async () => {
      const file = { buffer: Buffer.alloc(100, 'x'), originalname: 'small.txt' };
      const result = await disk.putFileMultipart('uploads', file);
      expect(result).toBe('uploads/small.txt');
    });
  });
});
