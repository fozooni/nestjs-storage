import { extname } from 'path';

import { FileValidator } from '@nestjs/common';

export interface FileExtensionValidatorOptions {
  allowedExtensions: string[];
}

export class FileExtensionValidator extends FileValidator<FileExtensionValidatorOptions> {
  isValid(file?: Express.Multer.File): boolean {
    if (!file) return false;
    const ext = extname(file.originalname).toLowerCase();
    const allowed = this.validationOptions.allowedExtensions.map((e) =>
      e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`,
    );
    return allowed.includes(ext);
  }

  buildErrorMessage(file: Express.Multer.File): string {
    const ext = extname(file?.originalname ?? '').toLowerCase();
    return `File extension [${ext}] is not allowed. Allowed extensions: ${this.validationOptions.allowedExtensions.join(', ')}`;
  }
}
