---
title: Interceptors & Validation Pipes
description: File upload interceptors, extension validators, and magic-byte validation for NestJS
---

# Interceptors & Validation Pipes

`@fozooni/nestjs-storage` provides NestJS interceptors for handling file uploads and validation pipes for verifying file types by extension and magic bytes.

## StorageFileInterceptor

Intercepts a single file upload, stores it on a disk, and attaches a `StoredFile` object to the request.

```ts
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  StorageFileInterceptor,
  StoredFile,
} from '@fozooni/nestjs-storage';

@Controller('avatars')
export class AvatarController {
  @Post()
  @UseInterceptors(
    StorageFileInterceptor('avatar', {
      disk: 's3',
      path: 'user-avatars',
      namingStrategy: 'uuid',
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadAvatar(@UploadedFile() file: StoredFile) {
    return {
      message: 'Avatar uploaded',
      path: file.path,
      url: file.url,
      size: file.size,
    };
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `disk` | `string` | Default disk | Storage disk to write to |
| `path` | `string` | `''` | Directory prefix on the disk |
| `namingStrategy` | `NamingStrategy \| string` | Original name | How to name the stored file (`'uuid'`, `'timestamp'`, or custom) |
| `fileFilter` | `(req, file, cb) => void` | — | Multer file filter function |
| `limits` | `MulterLimits` | — | Multer limits (fileSize, files, fields, etc.) |

### `StoredFile`

The object attached to the request after a successful upload:

| Property | Type | Description |
|----------|------|-------------|
| `path` | `string` | Full path on the storage disk |
| `url` | `string` | Public URL of the stored file |
| `size` | `number` | File size in bytes |
| `mimetype` | `string` | MIME type of the uploaded file |
| `originalname` | `string` | Original filename from the client |
| `disk` | `string` | Name of the disk the file was stored on |

## StorageFilesInterceptor

Intercepts multiple file uploads from the same form field.

```ts
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import {
  StorageFilesInterceptor,
  StoredFile,
} from '@fozooni/nestjs-storage';

@Controller('gallery')
export class GalleryController {
  @Post()
  @UseInterceptors(
    StorageFilesInterceptor('photos', 10, {
      disk: 's3',
      path: 'gallery/photos',
      namingStrategy: 'uuid',
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadPhotos(@UploadedFiles() files: StoredFile[]) {
    return {
      message: `${files.length} photos uploaded`,
      files: files.map((f) => ({
        path: f.path,
        url: f.url,
        size: f.size,
      })),
    };
  }
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fieldName` | `string` | Form field name for the files |
| `maxCount` | `number` | Maximum number of files to accept |
| `options` | Same as `StorageFileInterceptor` | Storage and upload options |

## FileExtensionValidator

Validates uploaded files by their extension. Auto-normalizes extensions with or without leading dots.

```ts
import { ParseFilePipe } from '@nestjs/common';
import { FileExtensionValidator } from '@fozooni/nestjs-storage';

@Post()
@UseInterceptors(StorageFileInterceptor('document'))
uploadDocument(
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        new FileExtensionValidator({
          allowedExtensions: ['.pdf', '.doc', '.docx', 'txt'],
          // Leading dot is optional — both '.pdf' and 'pdf' work
        }),
      ],
    }),
  )
  file: StoredFile,
) {
  return { path: file.path };
}
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `allowedExtensions` | `string[]` | List of allowed file extensions. Leading dot is auto-normalized |

```ts
// These are all equivalent:
new FileExtensionValidator({ allowedExtensions: ['.pdf'] });
new FileExtensionValidator({ allowedExtensions: ['pdf'] });
new FileExtensionValidator({ allowedExtensions: ['.PDF'] }); // Case-insensitive
```

## MagicBytesValidator

Validates uploaded files by reading their actual file header bytes (magic bytes), not just the extension. This prevents users from renaming a `.exe` to `.jpg` to bypass extension checks.

```ts
import { ParseFilePipe } from '@nestjs/common';
import { MagicBytesValidator } from '@fozooni/nestjs-storage';

@Post()
@UseInterceptors(StorageFileInterceptor('image'))
uploadImage(
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        new MagicBytesValidator({
          allowedTypes: ['jpeg', 'png', 'gif', 'webp'],
        }),
      ],
    }),
  )
  file: StoredFile,
) {
  return { path: file.path };
}
```

### Supported Types

| Type | Magic Bytes | File Extensions |
|------|-------------|-----------------|
| `jpeg` | `FF D8 FF` | `.jpg`, `.jpeg` |
| `png` | `89 50 4E 47` | `.png` |
| `gif` | `47 49 46 38` | `.gif` |
| `bmp` | `42 4D` | `.bmp` |
| `tiff` | `49 49 2A 00` or `4D 4D 00 2A` | `.tiff`, `.tif` |
| `psd` | `38 42 50 53` | `.psd` |
| `pdf` | `25 50 44 46` | `.pdf` |
| `zip` | `50 4B 03 04` | `.zip` |
| `7z` | `37 7A BC AF` | `.7z` |
| `gzip` | `1F 8B` | `.gz` |
| `bzip2` | `42 5A 68` | `.bz2` |
| `wav` | `52 49 46 46` | `.wav` |
| `mp3` | `FF FB`, `FF F3`, `FF F2`, or `49 44 33` | `.mp3` |
| `ogg` | `4F 67 67 53` | `.ogg` |
| `webm` | `1A 45 DF A3` | `.webm` |
| `mp4` | `66 74 79 70` (at offset 4) | `.mp4`, `.m4a` |

### Options

| Option | Type | Description |
|--------|------|-------------|
| `allowedTypes` | `string[]` | List of allowed type identifiers from the table above |

## Composing Validators with `ParseFilePipe`

Combine multiple validators for defense-in-depth:

```ts
import { ParseFilePipe, MaxFileSizeValidator } from '@nestjs/common';
import {
  FileExtensionValidator,
  MagicBytesValidator,
} from '@fozooni/nestjs-storage';

@Post('upload')
@UseInterceptors(StorageFileInterceptor('file'))
upload(
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        // 1. Check file size
        new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),

        // 2. Check extension
        new FileExtensionValidator({
          allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
        }),

        // 3. Check actual file bytes
        new MagicBytesValidator({
          allowedTypes: ['jpeg', 'png', 'pdf'],
        }),
      ],
      errorHttpStatusCode: 422,
      fileIsRequired: true,
    }),
  )
  file: StoredFile,
) {
  return {
    message: 'File uploaded and validated',
    path: file.path,
    mimetype: file.mimetype,
  };
}
```

## Complete Upload-Validate-Store Pipeline

A production-ready file upload endpoint with full validation:

```ts
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  BadRequestException,
} from '@nestjs/common';
import {
  StorageFileInterceptor,
  StoredFile,
  FileExtensionValidator,
  MagicBytesValidator,
  InjectStorage,
  StorageService,
} from '@fozooni/nestjs-storage';

@Controller('documents')
export class DocumentUploadController {
  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    StorageFileInterceptor('document', {
      disk: 's3',
      path: 'documents',
      namingStrategy: 'uuid',
      limits: {
        fileSize: 25 * 1024 * 1024, // 25 MB hard limit at multer level
      },
      fileFilter: (_req, file, cb) => {
        // Quick pre-filter before reading bytes
        const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Unsupported file type'), false);
        }
      },
    }),
  )
  async uploadDocument(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: 25 * 1024 * 1024,
          }),
          new FileExtensionValidator({
            allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
          }),
          new MagicBytesValidator({
            allowedTypes: ['pdf', 'jpeg', 'png'],
          }),
        ],
        fileIsRequired: true,
      }),
    )
    file: StoredFile,
  ) {
    // File is now stored on S3 and fully validated
    const metadata = await this.storage
      .disk('s3')
      .getMetadata(file.path);

    return {
      id: file.path.split('/').pop()?.replace(/\.[^.]+$/, ''),
      path: file.path,
      url: file.url,
      size: metadata.size,
      mimetype: metadata.mimetype,
      uploadedAt: new Date().toISOString(),
    };
  }
}
```

## Multi-File Upload with Validation

```ts
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import {
  StorageFilesInterceptor,
  StoredFile,
  FileExtensionValidator,
  MagicBytesValidator,
} from '@fozooni/nestjs-storage';

@Controller('portfolio')
export class PortfolioController {
  @Post('images')
  @UseInterceptors(
    StorageFilesInterceptor('images', 20, {
      disk: 's3',
      path: 'portfolio/images',
      namingStrategy: 'uuid',
      limits: {
        fileSize: 15 * 1024 * 1024,
        files: 20,
      },
    }),
  )
  async uploadImages(
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 15 * 1024 * 1024 }),
          new FileExtensionValidator({
            allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
          }),
          new MagicBytesValidator({
            allowedTypes: ['jpeg', 'png', 'gif'],
          }),
        ],
      }),
    )
    files: StoredFile[],
  ) {
    return {
      count: files.length,
      images: files.map((f) => ({
        path: f.path,
        url: f.url,
        size: f.size,
        originalname: f.originalname,
      })),
    };
  }
}
```

## Custom Naming Strategies

```ts
import { NamingStrategy } from '@fozooni/nestjs-storage';

// Custom naming strategy
const timestampHash: NamingStrategy = {
  generate(_file, originalName) {
    const ext = originalName.split('.').pop();
    const hash = Date.now().toString(36);
    return `${hash}-${Math.random().toString(36).slice(2)}.${ext}`;
  },
};

@Post()
@UseInterceptors(
  StorageFileInterceptor('file', {
    disk: 's3',
    path: 'uploads',
    namingStrategy: timestampHash,
  }),
)
upload(@UploadedFile() file: StoredFile) {
  return { path: file.path };
}
```

::: warning Multer is an Optional Peer Dependency
`StorageFileInterceptor` and `StorageFilesInterceptor` require `multer` and `@types/multer`:

```bash
pnpm add multer
pnpm add -D @types/multer
```

The interceptors will throw a clear error if multer is not installed.
:::

::: danger Do Not Rely Only on Extension Validation
Extensions can be trivially spoofed. A user can rename `malware.exe` to `malware.jpg` and bypass extension-only checks. Always combine `FileExtensionValidator` with `MagicBytesValidator` for secure file validation:

```ts
// INSECURE — extension only:
new FileExtensionValidator({ allowedExtensions: ['jpg'] });

// SECURE — extension + magic bytes:
[
  new FileExtensionValidator({ allowedExtensions: ['jpg'] }),
  new MagicBytesValidator({ allowedTypes: ['jpeg'] }),
]
```
:::

::: tip File Filter vs. Validators
- **`fileFilter`** (in interceptor options) runs at the multer level, _before_ the file is read or stored. Use it for quick MIME type pre-filtering.
- **`ParseFilePipe` validators** run _after_ the file is uploaded to memory/disk. Use them for thorough validation including magic byte checking.

For maximum security, use both: a quick `fileFilter` pre-check and thorough `ParseFilePipe` validators.
:::
