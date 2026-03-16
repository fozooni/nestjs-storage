import { FakeDisk } from '../testing/fake-disk';
import { byExtension, byMimeType, byPrefix, bySize, custom, RouterDisk } from './router-disk';

describe('RouterDisk', () => {
  let imageDisk: FakeDisk;
  let docDisk: FakeDisk;
  let defaultDisk: FakeDisk;
  let router: RouterDisk;

  beforeEach(() => {
    imageDisk = new FakeDisk();
    docDisk = new FakeDisk();
    defaultDisk = new FakeDisk();
    router = new RouterDisk(defaultDisk, [
      byExtension(['.jpg', '.png', '.webp'], imageDisk),
      byPrefix('docs/', docDisk),
    ]);
  });

  // ─── Write routing ────────────────────────────────────────────────────────

  it('routes .jpg files to imageDisk', async () => {
    await router.put('avatar.jpg', Buffer.from('image'));
    expect(await imageDisk.exists('avatar.jpg')).toBe(true);
    expect(await defaultDisk.exists('avatar.jpg')).toBe(false);
  });

  it('routes .png files to imageDisk', async () => {
    await router.put('photo.png', 'data');
    expect(await imageDisk.exists('photo.png')).toBe(true);
  });

  it('routes docs/ prefix to docDisk', async () => {
    await router.put('docs/report.pdf', 'pdf');
    expect(await docDisk.exists('docs/report.pdf')).toBe(true);
    expect(await defaultDisk.exists('docs/report.pdf')).toBe(false);
  });

  it('routes unknown files to defaultDisk', async () => {
    await router.put('data.json', '{}');
    expect(await defaultDisk.exists('data.json')).toBe(true);
    expect(await imageDisk.exists('data.json')).toBe(false);
    expect(await docDisk.exists('data.json')).toBe(false);
  });

  it('first matching route wins', async () => {
    // A file that could match both byExtension and byPrefix — byExtension is registered first
    const router2 = new RouterDisk(defaultDisk, [
      byExtension(['.jpg'], imageDisk),
      byPrefix('', docDisk), // catch-all prefix
    ]);
    await router2.put('photo.jpg', 'data');
    expect(await imageDisk.exists('photo.jpg')).toBe(true);
    expect(await docDisk.exists('photo.jpg')).toBe(false);
  });

  // ─── Read routing ─────────────────────────────────────────────────────────

  it('reads .jpg files from imageDisk', async () => {
    await imageDisk.put('avatar.jpg', 'image-data');
    const result = await router.get('avatar.jpg', { responseType: 'string' });
    expect(result).toBe('image-data');
  });

  it('reads docs/ files from docDisk', async () => {
    await docDisk.put('docs/readme.md', 'docs content');
    const result = await router.get('docs/readme.md', { responseType: 'string' });
    expect(result).toBe('docs content');
  });

  it('reads unknown files from defaultDisk', async () => {
    await defaultDisk.put('config.yaml', 'yaml content');
    const result = await router.get('config.yaml', { responseType: 'string' });
    expect(result).toBe('yaml content');
  });

  it('exists() queries the routed disk', async () => {
    await imageDisk.put('pic.png', 'data');
    expect(await router.exists('pic.png')).toBe(true);
    expect(await router.exists('pic.png')).toBe(true);
    // Should not find it on defaultDisk
    expect(await defaultDisk.exists('pic.png')).toBe(false);
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  it('deletes from the routed disk', async () => {
    await imageDisk.put('pic.jpg', 'data');
    await router.delete('pic.jpg');
    expect(await imageDisk.exists('pic.jpg')).toBe(false);
  });

  // ─── Route factory: byMimeType (write-time) ───────────────────────────────

  it('byMimeType routes writes based on mimetype option', async () => {
    const pdfDisk = new FakeDisk();
    const router2 = new RouterDisk(defaultDisk, [byMimeType(['application/pdf'], pdfDisk)]);
    await router2.put('file.bin', 'pdf-data', { mimetype: 'application/pdf' });
    expect(await pdfDisk.exists('file.bin')).toBe(true);
    expect(await defaultDisk.exists('file.bin')).toBe(false);
  });

  it('byMimeType falls back to default when mimetype does not match', async () => {
    const pdfDisk = new FakeDisk();
    const router2 = new RouterDisk(defaultDisk, [byMimeType(['application/pdf'], pdfDisk)]);
    await router2.put('file.txt', 'text', { mimetype: 'text/plain' });
    expect(await defaultDisk.exists('file.txt')).toBe(true);
    expect(await pdfDisk.exists('file.txt')).toBe(false);
  });

  it('byMimeType route is skipped at read time (falls back to default)', async () => {
    const pdfDisk = new FakeDisk();
    const router2 = new RouterDisk(defaultDisk, [byMimeType(['application/pdf'], pdfDisk)]);
    await defaultDisk.put('doc.pdf', 'content');
    const result = await router2.get('doc.pdf', { responseType: 'string' });
    expect(result).toBe('content');
  });

  // ─── Route factory: bySize (write-time) ──────────────────────────────────

  it('bySize routes small files to the specified disk', async () => {
    const smallDisk = new FakeDisk();
    const router2 = new RouterDisk(defaultDisk, [bySize(100, smallDisk)]);
    await router2.put('tiny.bin', Buffer.alloc(50));
    expect(await smallDisk.exists('tiny.bin')).toBe(true);
    expect(await defaultDisk.exists('tiny.bin')).toBe(false);
  });

  it('bySize falls back to default for large files', async () => {
    const smallDisk = new FakeDisk();
    const router2 = new RouterDisk(defaultDisk, [bySize(100, smallDisk)]);
    await router2.put('big.bin', Buffer.alloc(200));
    expect(await defaultDisk.exists('big.bin')).toBe(true);
    expect(await smallDisk.exists('big.bin')).toBe(false);
  });

  // ─── Route factory: custom ────────────────────────────────────────────────

  it('custom route uses the provided function', async () => {
    const privateDisk = new FakeDisk();
    const router2 = new RouterDisk(defaultDisk, [
      custom((path) => path.includes('/private/'), privateDisk),
    ]);
    await router2.put('user/private/secret.txt', 'secret');
    expect(await privateDisk.exists('user/private/secret.txt')).toBe(true);
    expect(await defaultDisk.exists('user/private/secret.txt')).toBe(false);
  });

  // ─── copy() and move() across disks ──────────────────────────────────────

  it('copy() within the same disk delegates normally', async () => {
    await imageDisk.put('src.jpg', 'image');
    await router.copy('src.jpg', 'dst.jpg');
    expect(await imageDisk.exists('dst.jpg')).toBe(true);
  });

  it('copy() across different disks reads from source and writes to destination', async () => {
    // Put a .jpg in imageDisk, copy to docs/ with a non-image extension so
    // byPrefix('docs/') matches before byExtension('.jpg').
    await imageDisk.put('photo.jpg', 'image-data');
    await router.copy('photo.jpg', 'docs/photo.pdf');
    expect(await docDisk.exists('docs/photo.pdf')).toBe(true);
  });

  it('move() across different disks copies then deletes source', async () => {
    await imageDisk.put('img.jpg', 'img-data');
    await router.move('img.jpg', 'docs/img.pdf');
    expect(await docDisk.exists('docs/img.pdf')).toBe(true);
    expect(await imageDisk.exists('img.jpg')).toBe(false);
  });

  // ─── url() ────────────────────────────────────────────────────────────────

  it('url() returns URL from the routed disk', () => {
    const url = router.url('photo.jpg');
    expect(typeof url).toBe('string');
  });
});
