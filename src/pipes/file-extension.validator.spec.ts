import { FileExtensionValidator } from './file-extension.validator';

function makeFile(originalname: string): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    buffer: Buffer.from('data'),
    size: 4,
  } as Express.Multer.File;
}

describe('FileExtensionValidator', () => {
  const validator = new FileExtensionValidator({ allowedExtensions: ['.jpg', '.jpeg', '.png'] });

  it('should allow files with allowed extensions', () => {
    expect(validator.isValid(makeFile('photo.jpg'))).toBe(true);
    expect(validator.isValid(makeFile('photo.JPEG'))).toBe(true);
    expect(validator.isValid(makeFile('image.png'))).toBe(true);
  });

  it('should reject files with disallowed extensions', () => {
    expect(validator.isValid(makeFile('script.exe'))).toBe(false);
    expect(validator.isValid(makeFile('file.pdf'))).toBe(false);
    expect(validator.isValid(makeFile('archive.zip'))).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(validator.isValid(makeFile('photo.JPG'))).toBe(true);
    expect(validator.isValid(makeFile('photo.PNG'))).toBe(true);
  });

  it('should handle extensions with or without leading dot', () => {
    const v = new FileExtensionValidator({ allowedExtensions: ['jpg', 'png'] });
    expect(v.isValid(makeFile('photo.jpg'))).toBe(true);
    expect(v.isValid(makeFile('image.gif'))).toBe(false);
  });

  it('should return false for undefined file', () => {
    expect(validator.isValid(undefined)).toBe(false);
  });

  it('should build a descriptive error message', () => {
    const msg = validator.buildErrorMessage(makeFile('malware.exe'));
    expect(msg).toContain('.exe');
    expect(msg).toContain('.jpg');
  });
});
