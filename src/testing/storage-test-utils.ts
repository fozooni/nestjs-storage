import { StorageService } from '../storage.service';
import { FakeDisk } from './fake-disk';

export interface FakeFileObject {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  filename?: string;
}

export class StorageTestUtils {
  /**
   * Replace a disk in StorageService with a FakeDisk.
   * Returns the FakeDisk instance for assertions.
   */
  static fake(storageService: StorageService, diskName: string): FakeDisk {
    const fakeDisk = new FakeDisk();
    storageService.setDisk(diskName, fakeDisk);
    return fakeDisk;
  }

  /**
   * Create a mock Multer-like file object for testing uploads.
   */
  static fakeFile(
    options: {
      name?: string;
      content?: string | Buffer;
      mimetype?: string;
      size?: number;
      fieldname?: string;
    } = {},
  ): FakeFileObject {
    const content = options.content
      ? typeof options.content === 'string'
        ? Buffer.from(options.content)
        : options.content
      : Buffer.from('fake file content');

    return {
      fieldname: options.fieldname || 'file',
      originalname: options.name || 'test-file.txt',
      encoding: '7bit',
      mimetype: options.mimetype || 'text/plain',
      buffer: content,
      size: options.size || content.length,
    };
  }

  /**
   * Create a mock Multer-like file with a specific size (filled with zeros).
   */
  static fakeFileWithSize(sizeInBytes: number, name?: string): FakeFileObject {
    return this.fakeFile({
      name: name || `test-${sizeInBytes}b.bin`,
      content: Buffer.alloc(sizeInBytes),
      mimetype: 'application/octet-stream',
    });
  }
}
