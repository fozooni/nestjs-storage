import { FakeDisk } from '../testing/fake-disk';
import { CdnDisk } from './cdn-disk';

describe('CdnDisk', () => {
  let inner: FakeDisk;

  beforeEach(async () => {
    inner = new FakeDisk();
    await inner.put('images/photo.jpg', Buffer.alloc(10));
  });

  describe('url()', () => {
    it('returns CDN URL for generic provider', () => {
      const disk = new CdnDisk(inner, { baseUrl: 'https://cdn.example.com', provider: 'generic' });
      expect(disk.url('images/photo.jpg')).toBe('https://cdn.example.com/images/photo.jpg');
    });

    it('strips trailing slash from baseUrl', () => {
      const disk = new CdnDisk(inner, { baseUrl: 'https://cdn.example.com/' });
      expect(disk.url('file.txt')).toBe('https://cdn.example.com/file.txt');
    });

    it('strips leading slash from path', () => {
      const disk = new CdnDisk(inner, { baseUrl: 'https://cdn.example.com' });
      expect(disk.url('/file.txt')).toBe('https://cdn.example.com/file.txt');
    });
  });

  describe('temporaryUrl()', () => {
    it('returns plain CDN URL when provider is generic', async () => {
      const disk = new CdnDisk(inner, { baseUrl: 'https://cdn.example.com', provider: 'generic' });
      const url = await disk.temporaryUrl('images/photo.jpg', 3600);
      expect(url).toBe('https://cdn.example.com/images/photo.jpg');
    });

    it('returns plain CDN URL when provider is cloudfront but no signingKeyId', async () => {
      const disk = new CdnDisk(inner, {
        baseUrl: 'https://d111.cloudfront.net',
        provider: 'cloudfront',
        // no signingKeyId
      });
      const url = await disk.temporaryUrl('file.txt', 3600);
      expect(url).toBe('https://d111.cloudfront.net/file.txt');
    });

    it('throws when cloudfront signer not installed', async () => {
      // @aws-sdk/cloudfront-signer is an optional peer that is NOT installed in devDependencies.
      // CdnDisk catches the require() error and re-throws with a helpful message.
      const disk = new CdnDisk(inner, {
        baseUrl: 'https://d111.cloudfront.net',
        provider: 'cloudfront',
        signingKeyId: 'K2JCJMDEHXQW5F',
        signingKey: 'fake-key',
      });

      await expect(disk.temporaryUrl('file.txt', 3600)).rejects.toThrow(
        '@aws-sdk/cloudfront-signer',
      );
    });
  });

  describe('invalidateCdn()', () => {
    it('resolves without error (placeholder implementation)', async () => {
      const disk = new CdnDisk(inner, { baseUrl: 'https://cdn.example.com' });
      await expect(disk.invalidateCdn(['path1', 'path2'])).resolves.toBeUndefined();
    });
  });

  describe('passthrough', () => {
    it('passes get() to inner disk', async () => {
      const disk = new CdnDisk(inner, { baseUrl: 'https://cdn.example.com' });
      const result = await disk.get('images/photo.jpg');
      expect(result).toBeInstanceOf(Buffer);
    });

    it('passes put() to inner disk', async () => {
      const disk = new CdnDisk(inner, { baseUrl: 'https://cdn.example.com' });
      await disk.put('new.txt', 'content');
      expect(await inner.exists('new.txt')).toBe(true);
    });

    it('exposes cdnConfiguration getter', () => {
      const config = { baseUrl: 'https://cdn.example.com', provider: 'generic' as const };
      const disk = new CdnDisk(inner, config);
      expect(disk.cdnConfiguration.baseUrl).toBe('https://cdn.example.com');
    });
  });
});
