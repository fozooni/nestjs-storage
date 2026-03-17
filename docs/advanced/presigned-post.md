---
title: Presigned POST
description: Browser-to-cloud direct uploads bypassing your server for S3-compatible drivers
---

# Presigned POST

Presigned POST enables browser clients to upload files directly to cloud storage (S3, R2, MinIO, B2, DigitalOcean Spaces, Wasabi) without proxying through your NestJS server. Your server generates a signed form payload, the client POSTs directly to the cloud, and no upload bandwidth flows through your application.

## How It Works

```
1. Client → Server:  "I want to upload profile.jpg (2MB, image/jpeg)"
2. Server → Client:  { url, fields }  (signed POST data, valid for N seconds)
3. Client → Cloud:   POST multipart/form-data with signed fields + file
4. Client → Server:  "Upload complete, verify it"
5. Server → Cloud:   exists('uploads/profile.jpg') → true
```

## Supported Drivers

| Driver | `presignedPost()` |
|--------|:-----------------:|
| S3Disk | Yes |
| R2Disk | Yes |
| MinIODisk | Yes |
| B2Disk | Yes |
| DigitalOceanDisk | Yes |
| WasabiDisk | Yes |
| LocalDisk | No |
| GcsDisk | No |
| AzureDisk | No |

## Core API

### `presignedPost(path, options?)`

Generates a presigned POST payload for a given file path.

```ts
const disk = storage.disk('uploads');
const postData = await disk.presignedPost('user-avatars/photo.jpg', {
  expires: 300,
  maxSize: 5 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
});
```

### `PresignedPostOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `expires` | `number` | `3600` | Seconds until the signed payload expires |
| `maxSize` | `number` | — | Maximum file size in bytes. Enforced by the cloud provider |
| `allowedMimeTypes` | `string[]` | — | Allowed MIME types. Enforced via policy conditions |

### `PresignedPostData`

| Property | Type | Description |
|----------|------|-------------|
| `url` | `string` | The cloud endpoint URL to POST to |
| `fields` | `Record<string, string>` | Key-value pairs to include as form fields |

## Backend Endpoint

```ts
import {
  Controller,
  Post,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectStorage, StorageService } from '@fozooni/nestjs-storage';

interface RequestUploadDto {
  filename: string;
  mimetype: string;
  size: number;
}

@Controller('uploads')
export class UploadController {
  private readonly MAX_SIZE = 50 * 1024 * 1024; // 50 MB
  private readonly ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ];

  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  @Post('presign')
  @HttpCode(HttpStatus.OK)
  async requestUpload(@Body() dto: RequestUploadDto) {
    // Validate on the server side first
    if (!this.ALLOWED_TYPES.includes(dto.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${dto.mimetype}`,
      );
    }
    if (dto.size > this.MAX_SIZE) {
      throw new BadRequestException(
        `File too large: ${dto.size} bytes (max ${this.MAX_SIZE})`,
      );
    }

    const uniquePath = `user-uploads/${Date.now()}-${dto.filename}`;

    const postData = await this.storage.disk('s3').presignedPost(uniquePath, {
      expires: 300, // 5 minutes
      maxSize: this.MAX_SIZE,
      allowedMimeTypes: this.ALLOWED_TYPES,
    });

    return {
      ...postData,
      path: uniquePath, // Client sends this back for verification
    };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyUpload(@Body() body: { path: string }) {
    const exists = await this.storage.disk('s3').exists(body.path);

    if (!exists) {
      throw new BadRequestException('File not found — upload may have failed');
    }

    const metadata = await this.storage.disk('s3').getMetadata(body.path);

    return {
      verified: true,
      size: metadata.size,
      mimetype: metadata.mimetype,
      url: await this.storage.disk('s3').url(body.path),
    };
  }
}
```

## Frontend Examples

### HTML Form

The simplest approach — a standard HTML form with hidden fields:

```html
<form id="upload-form" method="POST" enctype="multipart/form-data">
  <!-- Hidden fields are populated by JavaScript from the presigned response -->
  <div id="presigned-fields"></div>

  <input type="file" name="file" accept="image/*,.pdf" />
  <button type="submit">Upload</button>
</form>

<script>
  const form = document.getElementById('upload-form');
  const fileInput = form.querySelector('input[type="file"]');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];

    // 1. Request presigned data from your server
    const res = await fetch('/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        mimetype: file.type,
        size: file.size,
      }),
    });
    const { url, fields, path } = await res.json();

    // 2. Set form action and populate hidden fields
    form.action = url;
    const container = document.getElementById('presigned-fields');
    container.innerHTML = '';

    for (const [key, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      container.appendChild(input);
    }
  });
</script>
```

### JavaScript Upload with Progress

```ts
async function uploadWithProgress(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ url: string }> {
  // 1. Get presigned data
  const presignRes = await fetch('/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimetype: file.type,
      size: file.size,
    }),
  });

  if (!presignRes.ok) {
    throw new Error(`Presign failed: ${presignRes.statusText}`);
  }

  const { url, fields, path } = await presignRes.json();

  // 2. Build FormData with signed fields + file
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value as string);
  }
  formData.append('file', file); // File MUST be the last field

  // 3. Upload with XMLHttpRequest for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // 4. Verify upload on your server
        const verifyRes = await fetch('/uploads/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });
        const result = await verifyRes.json();
        resolve(result);
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.open('POST', url);
    xhr.send(formData);
  });
}
```

### React Upload Component

```tsx
import { useState, useCallback } from 'react';

interface UploadResult {
  verified: boolean;
  size: number;
  mimetype: string;
  url: string;
}

export function FileUpload() {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      setError(null);
      setProgress(0);

      try {
        const uploadResult = await uploadWithProgress(file, setProgress);
        setResult(uploadResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  return (
    <div>
      <input
        type="file"
        onChange={handleUpload}
        disabled={uploading}
        accept="image/*,.pdf"
      />

      {uploading && (
        <div>
          <progress value={progress} max={100} />
          <span>{progress}%</span>
        </div>
      )}

      {result && (
        <div>
          Upload complete: <a href={result.url}>{result.url}</a>
        </div>
      )}

      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
}
```

## Security Considerations

### Size Enforcement

The `maxSize` option creates an S3 policy condition that rejects uploads exceeding the limit at the cloud level. The upload will fail with a `403 Forbidden` response if the file is too large.

```ts
const postData = await disk.presignedPost('path/to/file.pdf', {
  maxSize: 10 * 1024 * 1024, // 10 MB — enforced by S3
});
```

### MIME Type Restrictions

```ts
const postData = await disk.presignedPost('path/to/file', {
  allowedMimeTypes: ['image/jpeg', 'image/png'],
  // S3 will reject any Content-Type not in this list
});
```

### Short Expiration

Keep the `expires` value as short as your use case allows:

```ts
const postData = await disk.presignedPost('path/to/file', {
  expires: 120, // 2 minutes — plenty for a single upload
});
```

::: warning CORS Configuration Required
Your cloud storage bucket must have a CORS policy that allows `POST` requests from your frontend origin. Example S3 CORS configuration:

```json
[
  {
    "AllowedOrigins": ["https://your-app.com"],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

Without this, browser uploads will fail with a CORS error even though the presigned data is valid.
:::

::: danger EncryptedDisk + Presigned POST
`presignedPost()` is **NOT supported** when using `EncryptedDisk`. Since encryption happens server-side, direct browser-to-cloud uploads bypass the encryption layer. Calling `presignedPost()` on an `EncryptedDisk` will throw an error.

If you need both encryption and direct uploads, upload to a non-encrypted disk first, then copy to the encrypted disk server-side:

```ts
// Direct upload to unencrypted staging disk
const postData = await storage.disk('staging').presignedPost(path, opts);

// After upload, copy to encrypted disk
await storage.disk('staging').copy(path, path); // triggers encrypt on write
```
:::

::: tip Post-Upload Verification
Always verify the upload on your server after the client reports completion. The presigned POST guarantees the upload is authorized, but you should still confirm the file exists and matches expected metadata:

```ts
const exists = await disk.exists(uploadedPath);
const metadata = await disk.getMetadata(uploadedPath);
// Validate size, mimetype, etc.
```
:::
