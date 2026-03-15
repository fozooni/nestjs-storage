import { StorageService } from '../storage.service';
import { FakeDisk } from './fake-disk';
import { StorageTestUtils } from './storage-test-utils';

describe('StorageTestUtils', () => {
  describe('fake', () => {
    it('should replace a disk with FakeDisk and return it', () => {
      const mockStorageService = {
        setDisk: jest.fn(),
      } as unknown as StorageService;

      const fakeDisk = StorageTestUtils.fake(mockStorageService, 's3');

      expect(fakeDisk).toBeInstanceOf(FakeDisk);
      expect(mockStorageService.setDisk).toHaveBeenCalledWith('s3', fakeDisk);
    });

    it('should return a working FakeDisk', async () => {
      const mockStorageService = {
        setDisk: jest.fn(),
      } as unknown as StorageService;

      const fakeDisk = StorageTestUtils.fake(mockStorageService, 'local');
      await fakeDisk.put('test.txt', 'hello');
      fakeDisk.assertExists('test.txt');
      fakeDisk.assertContentEquals('test.txt', 'hello');
    });
  });

  describe('fakeFile', () => {
    it('should create a default fake file', () => {
      const file = StorageTestUtils.fakeFile();

      expect(file.fieldname).toBe('file');
      expect(file.originalname).toBe('test-file.txt');
      expect(file.encoding).toBe('7bit');
      expect(file.mimetype).toBe('text/plain');
      expect(file.buffer).toBeInstanceOf(Buffer);
      expect(file.buffer.toString()).toBe('fake file content');
      expect(file.size).toBe(file.buffer.length);
    });

    it('should create a file with custom options', () => {
      const file = StorageTestUtils.fakeFile({
        name: 'photo.jpg',
        content: 'image data',
        mimetype: 'image/jpeg',
        fieldname: 'avatar',
      });

      expect(file.originalname).toBe('photo.jpg');
      expect(file.mimetype).toBe('image/jpeg');
      expect(file.fieldname).toBe('avatar');
      expect(file.buffer.toString()).toBe('image data');
    });

    it('should accept a Buffer as content', () => {
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const file = StorageTestUtils.fakeFile({ content: buf });

      expect(file.buffer).toBe(buf);
      expect(file.size).toBe(4);
    });

    it('should allow overriding size', () => {
      const file = StorageTestUtils.fakeFile({ size: 1024 });

      expect(file.size).toBe(1024);
    });
  });

  describe('fakeFileWithSize', () => {
    it('should create a file with specified size', () => {
      const file = StorageTestUtils.fakeFileWithSize(1024);

      expect(file.buffer.length).toBe(1024);
      expect(file.size).toBe(1024);
      expect(file.mimetype).toBe('application/octet-stream');
      expect(file.originalname).toBe('test-1024b.bin');
    });

    it('should accept a custom name', () => {
      const file = StorageTestUtils.fakeFileWithSize(512, 'data.bin');

      expect(file.originalname).toBe('data.bin');
      expect(file.buffer.length).toBe(512);
    });

    it('should create a zero-filled buffer', () => {
      const file = StorageTestUtils.fakeFileWithSize(10);

      expect(file.buffer.every((byte) => byte === 0)).toBe(true);
    });
  });
});
