import { UuidNamingStrategy } from './uuid-naming-strategy';

describe('UuidNamingStrategy', () => {
  const strategy = new UuidNamingStrategy();

  it('should return a UUID with the original extension', () => {
    const name = strategy.generate({}, 'photo.jpg');
    expect(name).toMatch(/^[0-9a-f-]{36}\.jpg$/);
  });

  it('should preserve different extensions', () => {
    expect(strategy.generate({}, 'document.pdf')).toMatch(/\.pdf$/);
    expect(strategy.generate({}, 'archive.tar.gz')).toMatch(/\.gz$/);
  });

  it('should generate unique names', () => {
    const a = strategy.generate({}, 'file.png');
    const b = strategy.generate({}, 'file.png');
    expect(a).not.toBe(b);
  });

  it('should work with no extension', () => {
    const name = strategy.generate({}, 'Makefile');
    expect(name).toMatch(/^[0-9a-f-]{36}$/);
  });
});
