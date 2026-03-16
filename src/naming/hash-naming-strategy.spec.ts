import { HashNamingStrategy } from './hash-naming-strategy';

describe('HashNamingStrategy', () => {
  const strategy = new HashNamingStrategy();

  it('should return md5 hash with original extension', () => {
    const file = { buffer: Buffer.from('hello world') };
    const name = strategy.generate(file, 'test.txt');
    expect(name).toMatch(/^[0-9a-f]{32}\.txt$/);
  });

  it('should be deterministic for same content', () => {
    const file = { buffer: Buffer.from('same content') };
    const a = strategy.generate(file, 'a.jpg');
    const b = strategy.generate(file, 'b.jpg');
    expect(a.replace(/\.jpg$/, '')).toBe(b.replace(/\.jpg$/, ''));
  });

  it('should differ for different content', () => {
    const a = strategy.generate({ buffer: Buffer.from('content1') }, 'file.txt');
    const b = strategy.generate({ buffer: Buffer.from('content2') }, 'file.txt');
    expect(a).not.toBe(b);
  });

  it('should preserve extension', () => {
    const file = { buffer: Buffer.from('data') };
    expect(strategy.generate(file, 'photo.PNG')).toMatch(/\.PNG$/);
  });
});
