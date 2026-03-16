import { DatePathNamingStrategy } from './date-path-naming-strategy';

describe('DatePathNamingStrategy', () => {
  it('should generate a YYYY/MM/DD/uuid.ext path', () => {
    const strategy = new DatePathNamingStrategy();
    const name = strategy.generate({}, 'photo.jpg');
    expect(name).toMatch(/^\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
  });

  it('should use original name when useUuid is false', () => {
    const strategy = new DatePathNamingStrategy({ useUuid: false });
    const name = strategy.generate({}, 'my-photo.png');
    expect(name).toMatch(/^\d{4}\/\d{2}\/\d{2}\/my-photo\.png$/);
  });

  it('should include current date in path', () => {
    const strategy = new DatePathNamingStrategy();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const name = strategy.generate({}, 'file.txt');
    expect(name.startsWith(`${year}/${month}/${day}/`)).toBe(true);
  });
});
