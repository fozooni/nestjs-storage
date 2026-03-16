import { FileValidator } from '@nestjs/common';

const MAGIC_SIGNATURES: Record<string, string> = {
  ffd8ff: 'image/jpeg',
  '89504e47': 'image/png',
  '47494638': 'image/gif',
  '25504446': 'application/pdf',
  '504b0304': 'application/zip',
  '504b0506': 'application/zip',
  '504b0708': 'application/zip',
  d0cf11e0: 'application/msword',
  '52494646': 'audio/wav', // RIFF header (WAV/WebP; WebP has 'WEBP' at offset 8)
  '494433': 'audio/mpeg',
  fffb: 'audio/mpeg',
  fff3: 'audio/mpeg',
  fff2: 'audio/mpeg',
  '4f676753': 'audio/ogg',
  '1a45dfa3': 'video/webm',
  '000000': 'video/mp4',
  '66747970': 'video/mp4',
  '377abcaf': 'application/x-7z-compressed',
  '1f8b': 'application/gzip',
  '425a68': 'application/x-bzip2',
  '424d': 'image/bmp',
  '49492a00': 'image/tiff',
  '4d4d002a': 'image/tiff',
  '38425053': 'image/vnd.adobe.photoshop',
};

export interface MagicBytesValidatorOptions {
  allowedTypes: string[];
}

export class MagicBytesValidator extends FileValidator<MagicBytesValidatorOptions> {
  isValid(file?: Express.Multer.File): boolean {
    if (!file?.buffer || file.buffer.length === 0) return false;
    const detected = this.detectMimeType(file.buffer);
    if (!detected) return false;
    return this.validationOptions.allowedTypes.includes(detected);
  }

  buildErrorMessage(file: Express.Multer.File): string {
    const detected = file?.buffer ? (this.detectMimeType(file.buffer) ?? 'unknown') : 'unknown';
    return `File type [${detected}] is not allowed. Allowed types: ${this.validationOptions.allowedTypes.join(', ')}`;
  }

  private detectMimeType(buffer: Buffer): string | undefined {
    const hex = buffer.slice(0, 8).toString('hex').toLowerCase();

    for (const [signature, mimeType] of Object.entries(MAGIC_SIGNATURES)) {
      if (hex.startsWith(signature)) {
        return mimeType;
      }
    }

    // Special check for MP4 (ftyp box at offset 4)
    if (buffer.length >= 8) {
      const ftypHex = buffer.slice(4, 8).toString('hex');
      if (ftypHex === '66747970') return 'video/mp4';
    }

    return undefined;
  }
}
