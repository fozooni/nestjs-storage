# File Uploads

`@fozooni/nestjs-storage` provides NestJS interceptors that handle file uploads and automatically store them to a disk, plus validation pipes for robust file type checking.

::: warning
File upload interceptors require `multer` as a peer dependency. Install it before using `StorageFileInterceptor` or `StorageFilesInterceptor`:
```bash
pnpm add multer
pnpm add -D @types/multer
```
:::

## Single File Upload

### StorageFileInterceptor

`StorageFileInterceptor` is a factory function that creates an interceptor for handling a single file upload. It receives the file from the request, stores it on the configured disk, and attaches a `StoredFile` object to the request.

```typescript
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  StorageFileInterceptor,
  StoredFile,
} from '@fozooni/nestjs-storage';

@Controller('uploads')
export class UploadsController {
  @Post('avatar')
  @UseInterceptors(
    StorageFileInterceptor('avatar', {
      disk: 'local',
      path: 'avatars',
    }),
  )
  uploadAvatar(@UploadedFile() file: StoredFile) {
    return {
      message: 'Avatar uploaded successfully',
      path: file.path,
      url: file.url,
      size: file.size,
    };
  }
}
```

### StorageFileInterceptor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `disk` | `string` | Default disk | Which disk to store the file on. |
| `path` | `string` | `''` | Directory prefix within the disk. |
| `namingStrategy` | `NamingStrategy` | Disk default | How to generate the stored filename. |
| `fileFilter` | `(req, file, cb) => void` | Accept all | Multer file filter function. |
| `limits` | `MulterLimits` | `undefined` | Multer limits (fileSize, files, etc.). |

### StoredFile Interface

The `StoredFile` object returned after successful upload contains:

| Property | Type | Description |
|----------|------|-------------|
| `path` | `string` | Full path within the disk (e.g., `'avatars/550e8400.jpg'`). |
| `url` | `string` | Public URL of the stored file. |
| `size` | `number` | File size in bytes. |
| `mimetype` | `string` | Detected MIME type (e.g., `'image/jpeg'`). |
| `originalname` | `string` | Original filename from the client. |
| `disk` | `string` | Name of the disk the file was stored on. |

## Multi-File Upload

### StorageFilesInterceptor

For endpoints that accept multiple files:

```typescript
import {
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  StorageFilesInterceptor,
  StoredFile,
} from '@fozooni/nestjs-storage';

@Controller('gallery')
export class GalleryController {
  @Post('photos')
  @UseInterceptors(
    StorageFilesInterceptor('photos', 10, {
      disk: 's3',
      path: 'gallery',
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
    }),
  )
  uploadPhotos(@UploadedFiles() files: StoredFile[]) {
    return {
      message: `${files.length} photos uploaded`,
      photos: files.map((f) => ({
        path: f.path,
        url: f.url,
        size: f.size,
        originalname: f.originalname,
      })),
    };
  }
}
```

The second argument to `StorageFilesInterceptor` is `maxCount` -- the maximum number of files the endpoint will accept. If the client sends more, the request will be rejected.

## File Validation

### ParseFilePipe with Custom Validators

Use NestJS's `ParseFilePipe` combined with the built-in validators for robust file type checking:

```typescript
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
} from '@nestjs/common';
import {
  StorageFileInterceptor,
  StoredFile,
  FileExtensionValidator,
  MagicBytesValidator,
} from '@fozooni/nestjs-storage';

@Controller('documents')
export class DocumentsController {
  @Post('upload')
  @UseInterceptors(
    StorageFileInterceptor('document', {
      disk: 's3',
      path: 'documents',
    }),
  )
  upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileExtensionValidator({
            allowedExtensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx'],
          }),
          new MagicBytesValidator({
            allowedTypes: ['pdf'],
          }),
        ],
      }),
    )
    file: StoredFile,
  ) {
    return {
      path: file.path,
      url: file.url,
      mimetype: file.mimetype,
    };
  }
}
```

### FileExtensionValidator

Validates the file extension against an allow list:

```typescript
new FileExtensionValidator({
  allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
})
```

::: warning
Extension validation alone is **not secure** -- a malicious user can rename any file to have a `.jpg` extension. Always combine it with `MagicBytesValidator` for production use.
:::

### MagicBytesValidator

Validates the actual file content by inspecting the file's magic bytes (file signature). This is the most reliable way to verify file types:

```typescript
new MagicBytesValidator({
  allowedTypes: ['jpeg', 'png', 'gif', 'pdf'],
})
```

#### Supported Magic Byte Types

| Type | File Signatures | MIME Types |
|------|----------------|------------|
| `jpeg` / `jpg` | `FF D8 FF` | `image/jpeg` |
| `png` | `89 50 4E 47` | `image/png` |
| `gif` | `47 49 46 38` | `image/gif` |
| `webp` | `52 49 46 46...57 45 42 50` | `image/webp` |
| `pdf` | `25 50 44 46` | `application/pdf` |
| `zip` | `50 4B 03 04` | `application/zip` |
| `wav` | `52 49 46 46...57 41 56 45` | `audio/wav` |
| `mp3` | `FF FB` / `49 44 33` | `audio/mpeg` |
| `ogg` | `4F 67 67 53` | `audio/ogg` |
| `webm` | `1A 45 DF A3` | `video/webm` |
| `mp4` | `66 74 79 70` (offset 4) | `video/mp4` |
| `svg` | `3C 73 76 67` / `3C 3F 78 6D` | `image/svg+xml` |

## Complete Upload + Validate + Respond

Here is a comprehensive example combining interceptors, validation, naming strategies, and a full service layer:

```typescript
// uploads.controller.ts
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  BadRequestException,
} from '@nestjs/common';
import {
  StorageFileInterceptor,
  StoredFile,
  FileExtensionValidator,
  MagicBytesValidator,
  DatePathNamingStrategy,
} from '@fozooni/nestjs-storage';
import { UploadsService } from './uploads.service';

@Controller('api/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('image')
  @UseInterceptors(
    StorageFileInterceptor('image', {
      disk: 's3',
      path: 'images',
      namingStrategy: new DatePathNamingStrategy(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
      },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('Only image files are allowed'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileExtensionValidator({
            allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
          }),
          new MagicBytesValidator({
            allowedTypes: ['jpeg', 'png', 'gif', 'webp'],
          }),
        ],
      }),
    )
    file: StoredFile,
  ) {
    const record = await this.uploadsService.recordUpload(file);

    return {
      id: record.id,
      url: file.url,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype,
      originalname: file.originalname,
    };
  }
}
```

```typescript
// uploads.service.ts
import { Injectable } from '@nestjs/common';
import { StoredFile, StorageService } from '@fozooni/nestjs-storage';

interface UploadRecord {
  id: string;
  path: string;
  url: string;
  size: number;
  mimetype: string;
  originalname: string;
  uploadedAt: Date;
}

@Injectable()
export class UploadsService {
  private uploads: Map<string, UploadRecord> = new Map();

  constructor(private readonly storage: StorageService) {}

  async recordUpload(file: StoredFile): Promise<UploadRecord> {
    const id = crypto.randomUUID();
    const record: UploadRecord = {
      id,
      path: file.path,
      url: file.url,
      size: file.size,
      mimetype: file.mimetype,
      originalname: file.originalname,
      uploadedAt: new Date(),
    };

    this.uploads.set(id, record);
    return record;
  }

  async deleteUpload(id: string): Promise<void> {
    const record = this.uploads.get(id);
    if (record) {
      await this.storage.disk('s3').delete(record.path);
      this.uploads.delete(id);
    }
  }
}
```

::: tip Naming Strategies in Interceptors
When you set a `namingStrategy` in the interceptor options, the file is renamed **before** being stored. This means `file.path` in your controller already reflects the final name. For example, with `DatePathNamingStrategy`, an uploaded `photo.jpg` might have a path of `images/2026/03/17/a1b2c3d4.jpg`.

See [Naming Strategies](./naming-strategies) for all available strategies and how to create your own.
:::

## Upload with Custom Metadata

You can attach metadata to uploaded files by combining the interceptor with a service call:

```typescript
@Post('document')
@UseInterceptors(
  StorageFileInterceptor('file', {
    disk: 's3',
    path: 'documents',
  }),
)
async uploadDocument(
  @UploadedFile() file: StoredFile,
  @Body('title') title: string,
  @Body('category') category: string,
) {
  // Re-write the file with metadata attached
  const content = await this.storage.disk('s3').get(file.path, {
    responseType: 'buffer',
  });

  await this.storage.disk('s3').put(file.path, content, {
    metadata: {
      title,
      category,
      uploadedAt: new Date().toISOString(),
    },
  });

  return { path: file.path, title, category };
}
```

## Frontend Integration

### HTML Form

```html
<form action="/api/uploads/image" method="POST" enctype="multipart/form-data">
  <input type="file" name="image" accept="image/*" />
  <button type="submit">Upload</button>
</form>
```

### Fetch API

```typescript
const formData = new FormData();
formData.append('image', fileInput.files[0]);

const response = await fetch('/api/uploads/image', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
console.log('Uploaded to:', result.url);
```

### Axios

```typescript
const formData = new FormData();
formData.append('image', file);

const { data } = await axios.post('/api/uploads/image', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: (event) => {
    const progress = Math.round((event.loaded * 100) / event.total);
    console.log(`Upload progress: ${progress}%`);
  },
});
```

## Next Steps

Learn how to generate [URLs & Downloads](./urls-and-downloads) for your uploaded files -- public URLs, presigned URLs, CDN URLs, and streaming downloads.
