import { Readable } from 'stream';

import { StoragePermissionError } from '../errors/storage-errors';
import { FakeDisk } from '../testing/fake-disk';
import { EncryptedDisk } from './encrypted-disk';

const KEY_32 = Buffer.alloc(32, 0xab); // 32-byte test key

describe('EncryptedDisk', () => {
  let inner: FakeDisk;
  let enc: EncryptedDisk;

  beforeEach(() => {
    inner = new FakeDisk();
    enc = new EncryptedDisk(inner, KEY_32);
  });

  // ─── constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should throw if key is not 32 bytes', () => {
      expect(() => new EncryptedDisk(inner, Buffer.alloc(16))).toThrow(
        'key must be 32 bytes for AES-256-GCM',
      );
    });

    it('should create with exactly 32-byte key', () => {
      expect(() => new EncryptedDisk(inner, Buffer.alloc(32))).not.toThrow();
    });
  });

  // ─── put / get round-trip ─────────────────────────────────────────────────

  describe('put() / get() encryption round-trip', () => {
    it('should encrypt on put and decrypt on get (string)', async () => {
      await enc.put('secret.txt', 'sensitive data');

      // The raw stored bytes should NOT be the plaintext
      const raw = (await inner.get('secret.txt')) as Buffer;
      expect(raw.toString()).not.toBe('sensitive data');

      // But reading through the encrypted disk should return plaintext
      const plain = await enc.get('secret.txt', { responseType: 'string' });
      expect(plain).toBe('sensitive data');
    });

    it('should encrypt on put and decrypt on get (buffer)', async () => {
      const originalBuf = Buffer.from('binary content');
      await enc.put('file.bin', originalBuf);

      const decrypted = (await enc.get('file.bin')) as Buffer;
      expect(Buffer.isBuffer(decrypted)).toBe(true);
      expect(decrypted.toString()).toBe('binary content');
    });

    it('should encrypt on put and decrypt on get (stream)', async () => {
      const stream = Readable.from(['stream content']);
      await enc.put('stream.txt', stream);

      const result = await enc.get('stream.txt', { responseType: 'stream' });
      expect(result).toBeInstanceOf(Readable);

      const chunks: Buffer[] = [];
      for await (const chunk of result as Readable) {
        chunks.push(Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).toString()).toBe('stream content');
    });

    it('each write produces a different ciphertext (random IV)', async () => {
      await enc.put('file1.txt', 'same plaintext');
      await enc.put('file2.txt', 'same plaintext');

      const raw1 = (await inner.get('file1.txt')) as Buffer;
      const raw2 = (await inner.get('file2.txt')) as Buffer;

      // Different IVs → different ciphertext even for same plaintext
      expect(raw1.equals(raw2)).toBe(false);
    });

    it('should store ciphertext that is longer than plaintext', async () => {
      const plaintext = 'hello';
      await enc.put('sized.txt', plaintext);
      const raw = (await inner.get('sized.txt')) as Buffer;
      // 12 bytes IV + 16 bytes auth tag + plaintext length
      expect(raw.length).toBe(12 + 16 + plaintext.length);
    });
  });

  // ─── putFile ─────────────────────────────────────────────────────────────

  describe('putFile()', () => {
    it('should encrypt multer-like file before storing', async () => {
      const file = { buffer: Buffer.from('file content'), originalname: 'upload.txt' };
      const result = await enc.putFile('uploads', file);
      expect(result).toBe('uploads/upload.txt');

      const raw = (await inner.get('uploads/upload.txt')) as Buffer;
      expect(raw.toString()).not.toBe('file content');

      const plain = await enc.get('uploads/upload.txt', { responseType: 'string' });
      expect(plain).toBe('file content');
    });
  });

  // ─── putFileAs ───────────────────────────────────────────────────────────

  describe('putFileAs()', () => {
    it('should encrypt and store with custom name', async () => {
      const result = await enc.putFileAs('uploads', Buffer.from('data'), 'custom.txt');
      expect(result).toBe('uploads/custom.txt');

      const plain = await enc.get('uploads/custom.txt', { responseType: 'string' });
      expect(plain).toBe('data');
    });
  });

  // ─── size ─────────────────────────────────────────────────────────────────

  describe('size()', () => {
    it('should return plaintext size (not ciphertext size)', async () => {
      await enc.put('file.txt', 'hello');
      const size = await enc.size('file.txt');
      expect(size).toBe(5); // 'hello'.length
    });
  });

  // ─── copy / move ─────────────────────────────────────────────────────────

  describe('copy()', () => {
    it('should decrypt source and re-encrypt at destination', async () => {
      await enc.put('a.txt', 'original');
      await enc.copy('a.txt', 'b.txt');

      // Both files should decrypt to same plaintext
      const a = await enc.get('a.txt', { responseType: 'string' });
      const b = await enc.get('b.txt', { responseType: 'string' });
      expect(a).toBe('original');
      expect(b).toBe('original');
    });
  });

  describe('move()', () => {
    it('should copy to destination then delete source', async () => {
      await enc.put('src.txt', 'to move');
      await enc.move('src.txt', 'dst.txt');

      expect(await enc.exists('src.txt')).toBe(false);
      const dst = await enc.get('dst.txt', { responseType: 'string' });
      expect(dst).toBe('to move');
    });
  });

  // ─── presignedPost ────────────────────────────────────────────────────────

  describe('presignedPost()', () => {
    it('should throw StoragePermissionError (unsupported by design)', async () => {
      await expect(enc.presignedPost()).rejects.toBeInstanceOf(StoragePermissionError);
    });

    it('should mention "bypass encryption" in error message', async () => {
      await expect(enc.presignedPost()).rejects.toThrow('bypass encryption');
    });
  });

  // ─── passthrough methods ─────────────────────────────────────────────────

  describe('passthrough methods', () => {
    it('exists() delegates to inner disk', async () => {
      await inner.put('file.txt', 'data');
      expect(await enc.exists('file.txt')).toBe(true);
      expect(await enc.exists('nope.txt')).toBe(false);
    });

    it('delete() delegates to inner disk', async () => {
      await enc.put('del.txt', 'bye');
      expect(await enc.delete('del.txt')).toBe(true);
      expect(await inner.exists('del.txt')).toBe(false);
    });

    it('files() delegates to inner disk', async () => {
      await enc.put('dir/a.txt', 'a');
      await enc.put('dir/b.txt', 'b');
      const list = await enc.files('dir');
      expect(list).toContain('dir/a.txt');
    });

    it('url() delegates to inner disk', () => {
      expect(enc.url('photo.jpg')).toBe('/fake-storage/photo.jpg');
    });

    it('mimeType() delegates to inner disk', async () => {
      await enc.put('photo.jpg', 'data');
      expect(await enc.mimeType('photo.jpg')).toBe('image/jpeg');
    });

    it('getBucket() delegates to inner disk', () => {
      expect(enc.getBucket()).toBeUndefined();
    });

    it('missing() delegates to inner disk', async () => {
      expect(await enc.missing('nope.txt')).toBe(true);
    });
  });

  // ─── json convenience ─────────────────────────────────────────────────────

  describe('json()', () => {
    it('should decrypt and parse JSON', async () => {
      await enc.put('data.json', JSON.stringify({ value: 42 }));
      const result = await enc.json<{ value: number }>('data.json');
      expect(result).toEqual({ value: 42 });
    });
  });

  // ─── getMetadata ─────────────────────────────────────────────────────────

  describe('getMetadata()', () => {
    it('should adjust reported size to plaintext size', async () => {
      await enc.put('file.txt', 'hello');
      const meta = await enc.getMetadata('file.txt');
      expect(meta.size).toBe(5);
    });
  });

  // ─── uploadPart encryption ────────────────────────────────────────────────

  describe('uploadPart()', () => {
    it('should encrypt each part before staging', async () => {
      const { uploadId } = await enc.initMultipartUpload('large.bin');
      const part = await enc.uploadPart(uploadId, 1, Buffer.from('chunk'), 'large.bin');
      expect(part.partNumber).toBe(1);
      // The stored chunk is larger than 'chunk' due to IV + auth tag overhead
      expect(part.size).toBeGreaterThan('chunk'.length);
    });

    it('should handle Uint8Array parts', async () => {
      const { uploadId } = await enc.initMultipartUpload('uint8.bin');
      const data = new Uint8Array([104, 101, 108, 108, 111]); // 'hello'
      const part = await enc.uploadPart(uploadId, 1, data, 'uint8.bin');
      expect(part.size).toBeGreaterThan(5);
    });
  });
});
