import { MagicBytesValidator } from './magic-bytes.validator';

// JPEG magic bytes: FF D8 FF
const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
// PNG magic bytes: 89 50 4E 47
const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// PDF magic bytes: 25 50 44 46
const PDF_BUFFER = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
// Text (no magic bytes match)
const TEXT_BUFFER = Buffer.from('Hello, world!');

function makeFile(buffer: Buffer, originalname = 'file.bin'): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    buffer,
    size: buffer.length,
  } as Express.Multer.File;
}

describe('MagicBytesValidator', () => {
  const imageValidator = new MagicBytesValidator({
    allowedTypes: ['image/jpeg', 'image/png'],
  });

  it('should accept JPEG file', () => {
    expect(imageValidator.isValid(makeFile(JPEG_BUFFER, 'photo.jpg'))).toBe(true);
  });

  it('should accept PNG file', () => {
    expect(imageValidator.isValid(makeFile(PNG_BUFFER, 'image.png'))).toBe(true);
  });

  it('should reject PDF file', () => {
    expect(imageValidator.isValid(makeFile(PDF_BUFFER, 'doc.pdf'))).toBe(false);
  });

  it('should reject plain text file', () => {
    expect(imageValidator.isValid(makeFile(TEXT_BUFFER, 'hello.txt'))).toBe(false);
  });

  it('should reject spoofed MIME type (txt file renamed to jpg)', () => {
    // Even if named .jpg, text content fails magic byte check
    expect(imageValidator.isValid(makeFile(TEXT_BUFFER, 'fake.jpg'))).toBe(false);
  });

  it('should return false for file without buffer', () => {
    const noBufferFile = { originalname: 'file.jpg' } as Express.Multer.File;
    expect(imageValidator.isValid(noBufferFile)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(imageValidator.isValid(undefined)).toBe(false);
  });

  it('should build descriptive error message for rejected file', () => {
    const msg = imageValidator.buildErrorMessage(makeFile(PDF_BUFFER, 'doc.pdf'));
    expect(msg).toContain('application/pdf');
    expect(msg).toContain('image/jpeg');
    expect(msg).toContain('image/png');
  });

  it('should accept PDF when PDF is allowed', () => {
    const pdfValidator = new MagicBytesValidator({ allowedTypes: ['application/pdf'] });
    expect(pdfValidator.isValid(makeFile(PDF_BUFFER, 'doc.pdf'))).toBe(true);
  });
});
