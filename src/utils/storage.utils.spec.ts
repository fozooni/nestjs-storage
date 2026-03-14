import { Readable } from 'stream';

import {
  generateUniqueFilename,
  sanitizePath,
  getContentType,
  getFileExtension,
  normalizePath,
  joinPaths,
  getDirectory,
  getFilename,
  isDirectory,
  parseS3Url,
  encodeS3Key,
  buildS3Url,
  streamToBuffer,
  streamToString,
  isStream,
  formatFileSize,
  visibilityToAcl,
  aclToVisibility,
} from './storage.utils';

describe('storage.utils', () => {
  describe('generateUniqueFilename', () => {
    it('should generate a unique filename with timestamp and random string', () => {
      const result = generateUniqueFilename('photo.jpg');
      expect(result).toMatch(/^photo_\d+_[a-f0-9]{16}\.jpg$/);
    });

    it('should preserve extension', () => {
      const result = generateUniqueFilename('document.pdf');
      expect(result).toEndWith('.pdf');
    });

    it('should handle files without extension', () => {
      const result = generateUniqueFilename('README');
      expect(result).toMatch(/^README_\d+_[a-f0-9]{16}$/);
    });

    it('should generate different filenames each call', () => {
      const a = generateUniqueFilename('test.txt');
      const b = generateUniqueFilename('test.txt');
      expect(a).not.toBe(b);
    });
  });

  describe('sanitizePath', () => {
    it('should remove leading slashes', () => {
      expect(sanitizePath('/path/to/file.txt')).toBe('path/to/file.txt');
    });

    it('should remove multiple leading slashes', () => {
      expect(sanitizePath('///path/to/file.txt')).toBe('path/to/file.txt');
    });

    it('should leave paths without leading slashes unchanged', () => {
      expect(sanitizePath('path/to/file.txt')).toBe('path/to/file.txt');
    });

    it('should handle empty string', () => {
      expect(sanitizePath('')).toBe('');
    });
  });

  describe('getContentType', () => {
    it('should return correct MIME type for known extensions', () => {
      expect(getContentType('file.jpg')).toBe('image/jpeg');
      expect(getContentType('file.png')).toBe('image/png');
      expect(getContentType('file.pdf')).toBe('application/pdf');
      expect(getContentType('file.json')).toBe('application/json');
      expect(getContentType('file.html')).toBe('text/html');
    });

    it('should return application/octet-stream for unknown extensions', () => {
      expect(getContentType('file.xyz123')).toBe('application/octet-stream');
    });

    it('should handle files without extension', () => {
      expect(getContentType('README')).toBe('application/octet-stream');
    });
  });

  describe('getFileExtension', () => {
    it('should return extension without dot', () => {
      expect(getFileExtension('file.jpg')).toBe('jpg');
      expect(getFileExtension('file.tar.gz')).toBe('gz');
    });

    it('should return empty string for files without extension', () => {
      expect(getFileExtension('README')).toBe('');
    });
  });

  describe('normalizePath', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(normalizePath('path\\to\\file.txt')).toBe('path/to/file.txt');
    });

    it('should leave forward slashes unchanged', () => {
      expect(normalizePath('path/to/file.txt')).toBe('path/to/file.txt');
    });

    it('should handle mixed separators', () => {
      expect(normalizePath('path\\to/file.txt')).toBe('path/to/file.txt');
    });
  });

  describe('joinPaths', () => {
    it('should join paths with forward slash', () => {
      expect(joinPaths('uploads', 'images', 'photo.jpg')).toBe('uploads/images/photo.jpg');
    });

    it('should remove duplicate slashes', () => {
      expect(joinPaths('uploads/', '/images/', '/photo.jpg')).toBe('uploads/images/photo.jpg');
    });

    it('should filter out empty segments', () => {
      expect(joinPaths('uploads', '', 'photo.jpg')).toBe('uploads/photo.jpg');
    });

    it('should remove leading slashes', () => {
      expect(joinPaths('/uploads', 'photo.jpg')).toBe('uploads/photo.jpg');
    });
  });

  describe('getDirectory', () => {
    it('should return directory portion of path', () => {
      expect(getDirectory('uploads/images/photo.jpg')).toBe('uploads/images');
    });

    it('should return empty string for files without directory', () => {
      expect(getDirectory('photo.jpg')).toBe('');
    });

    it('should handle Windows-style paths', () => {
      expect(getDirectory('uploads\\images\\photo.jpg')).toBe('uploads/images');
    });
  });

  describe('getFilename', () => {
    it('should return filename from path', () => {
      expect(getFilename('uploads/images/photo.jpg')).toBe('photo.jpg');
    });

    it('should return the string itself for files without directory', () => {
      expect(getFilename('photo.jpg')).toBe('photo.jpg');
    });

    it('should handle Windows-style paths', () => {
      expect(getFilename('uploads\\images\\photo.jpg')).toBe('photo.jpg');
    });
  });

  describe('isDirectory', () => {
    it('should return true for paths ending with slash', () => {
      expect(isDirectory('uploads/')).toBe(true);
      expect(isDirectory('uploads/images/')).toBe(true);
    });

    it('should return false for file paths', () => {
      expect(isDirectory('uploads/photo.jpg')).toBe(false);
      expect(isDirectory('photo.jpg')).toBe(false);
    });
  });

  describe('parseS3Url', () => {
    it('should parse s3:// URLs', () => {
      const result = parseS3Url('s3://my-bucket/path/to/file.txt');
      expect(result).toEqual({ bucket: 'my-bucket', key: 'path/to/file.txt' });
    });

    it('should parse virtual-hosted-style URLs', () => {
      const result = parseS3Url('https://my-bucket.s3.amazonaws.com/path/to/file.txt');
      expect(result).toEqual({ bucket: 'my-bucket', key: 'path/to/file.txt' });
    });

    it('should parse virtual-hosted-style URLs with region', () => {
      const result = parseS3Url('https://my-bucket.s3.us-west-2.amazonaws.com/path/to/file.txt');
      expect(result).toEqual({ bucket: 'my-bucket', key: 'path/to/file.txt' });
    });

    it('should parse path-style URLs', () => {
      const result = parseS3Url('https://s3.amazonaws.com/my-bucket/path/to/file.txt');
      expect(result).toEqual({ bucket: 'my-bucket', key: 'path/to/file.txt' });
    });

    it('should return null for non-S3 URLs', () => {
      expect(parseS3Url('https://example.com/file.txt')).toBeNull();
    });
  });

  describe('encodeS3Key', () => {
    it('should encode special characters in each segment', () => {
      expect(encodeS3Key('path/to/file with spaces.txt')).toBe(
        'path/to/file%20with%20spaces.txt',
      );
    });

    it('should preserve forward slashes', () => {
      expect(encodeS3Key('a/b/c')).toBe('a/b/c');
    });

    it('should handle simple keys', () => {
      expect(encodeS3Key('file.txt')).toBe('file.txt');
    });
  });

  describe('buildS3Url', () => {
    it('should build URL for us-east-1 region', () => {
      expect(buildS3Url('my-bucket', 'path/file.txt')).toBe(
        'https://my-bucket.s3.amazonaws.com/path/file.txt',
      );
    });

    it('should build URL for non-us-east-1 region', () => {
      expect(buildS3Url('my-bucket', 'path/file.txt', 'eu-west-1')).toBe(
        'https://my-bucket.s3.eu-west-1.amazonaws.com/path/file.txt',
      );
    });

    it('should encode special characters in key', () => {
      expect(buildS3Url('my-bucket', 'path/file name.txt')).toBe(
        'https://my-bucket.s3.amazonaws.com/path/file%20name.txt',
      );
    });
  });

  describe('streamToBuffer', () => {
    it('should convert readable stream to buffer', async () => {
      const data = 'hello world';
      const stream = Readable.from([data]);
      const buffer = await streamToBuffer(stream);
      expect(buffer.toString()).toBe(data);
    });

    it('should handle empty streams', async () => {
      const stream = Readable.from([]);
      const buffer = await streamToBuffer(stream);
      expect(buffer.length).toBe(0);
    });

    it('should handle multi-chunk streams', async () => {
      const stream = Readable.from(['hello', ' ', 'world']);
      const buffer = await streamToBuffer(stream);
      expect(buffer.toString()).toBe('hello world');
    });
  });

  describe('streamToString', () => {
    it('should convert readable stream to UTF-8 string', async () => {
      const data = 'hello world';
      const stream = Readable.from([data]);
      const result = await streamToString(stream);
      expect(result).toBe(data);
    });
  });

  describe('isStream', () => {
    it('should return true for readable streams', () => {
      const stream = new Readable({ read() {} });
      expect(isStream(stream)).toBe(true);
    });

    it('should return false for buffers', () => {
      expect(isStream(Buffer.from('hello'))).toBe(false);
    });

    it('should return false for strings', () => {
      expect(isStream('hello')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isStream(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isStream(undefined)).toBe(false);
    });

    it('should return true for objects with pipe function', () => {
      expect(isStream({ pipe: () => {} })).toBe(true);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500.00 B');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.00 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1.00 MB');
    });

    it('should format gigabytes', () => {
      expect(formatFileSize(1073741824)).toBe('1.00 GB');
    });

    it('should format terabytes', () => {
      expect(formatFileSize(1099511627776)).toBe('1.00 TB');
    });

    it('should handle zero', () => {
      expect(formatFileSize(0)).toBe('0.00 B');
    });
  });

  describe('visibilityToAcl', () => {
    it('should convert public to public-read', () => {
      expect(visibilityToAcl('public')).toBe('public-read');
    });

    it('should convert private to private', () => {
      expect(visibilityToAcl('private')).toBe('private');
    });

    it('should default to private for undefined', () => {
      expect(visibilityToAcl(undefined)).toBe('private');
    });
  });

  describe('aclToVisibility', () => {
    it('should convert public-read to public', () => {
      expect(aclToVisibility('public-read')).toBe('public');
    });

    it('should convert private to private', () => {
      expect(aclToVisibility('private')).toBe('private');
    });

    it('should default to private for undefined', () => {
      expect(aclToVisibility(undefined)).toBe('private');
    });

    it('should default to private for unknown ACL', () => {
      expect(aclToVisibility('unknown')).toBe('private');
    });
  });
});

// Custom matcher helper
expect.extend({
  toEndWith(received: string, suffix: string) {
    const pass = received.endsWith(suffix);
    return {
      message: () => `expected "${received}" to end with "${suffix}"`,
      pass,
    };
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toEndWith(suffix: string): R;
    }
  }
}
