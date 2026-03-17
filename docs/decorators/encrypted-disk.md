# EncryptedDisk

`EncryptedDisk` provides **transparent AES-256-GCM encryption** at rest. Every file written through an `EncryptedDisk` is automatically encrypted before being stored on the underlying disk, and every file read is automatically decrypted. Your application code works with plaintext; the storage layer handles all cryptography.

## When to Use

- **Compliance requirements**: PII, HIPAA, PCI-DSS, or GDPR regulated data
- **Sensitive uploads**: user documents, medical records, financial statements
- **Defense in depth**: encrypt even on already-encrypted cloud storage
- **Multi-tenant secrets**: per-tenant encryption keys for data isolation

## Factory Method

```typescript
storage.encrypted(diskName: string, options: EncryptionOptions): EncryptedDisk
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `diskName` | `string` | Yes | Name of the disk to wrap with encryption |
| `options.key` | `string \| Buffer` | Yes | AES-256 key: exactly 32 bytes as a Buffer, or 64-character hex string |

## Options

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `key` | `string \| Buffer` | Yes | -- | The encryption key. Must be exactly 32 bytes (256 bits). Pass as a `Buffer` or a 64-character hexadecimal string. |

## Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class SecureDocumentService {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.encrypted('s3', {
      key: process.env.STORAGE_ENCRYPTION_KEY!, // 64-char hex string
    });
  }

  async storeDocument(name: string, content: Buffer): Promise<void> {
    // Content is encrypted with AES-256-GCM before writing to S3
    await this.disk.put(`documents/${name}`, content);
  }

  async readDocument(name: string): Promise<Buffer> {
    // Content is automatically decrypted when reading
    return this.disk.get(`documents/${name}`);
  }
}
```

::: danger Key Management
**Never commit encryption keys to source control.** Always use environment variables, a secrets manager (AWS Secrets Manager, HashiCorp Vault), or a KMS provider.

```bash
# Generate a 256-bit key
openssl rand -hex 32
# Output: a1b2c3d4e5f6...  (64 hex characters = 32 bytes)
```
:::

## Stored Format

Every encrypted file is stored as a single blob with the following binary layout:

```
┌────────────────┬────────────────────┬─────────────────┐
│   IV (12 B)    │  Auth Tag (16 B)   │   Ciphertext    │
└────────────────┴────────────────────┘─────────────────┘
```

| Component | Size | Purpose |
|---|---|---|
| IV (Initialization Vector) | 12 bytes | Unique random nonce per encryption |
| Auth Tag | 16 bytes | GCM authentication tag for integrity verification |
| Ciphertext | Variable | The encrypted file content |

The total overhead per file is **28 bytes**. A 1 KB plaintext file becomes 1052 bytes on disk.

## Methods Overridden

`EncryptedDisk` overrides these methods to handle encryption/decryption:

| Method | Behavior |
|---|---|
| `put(path, content)` | Encrypts content, then writes |
| `get(path)` | Reads ciphertext, then decrypts |
| `copy(src, dest)` | Reads + decrypts source, re-encrypts to destination |
| `move(src, dest)` | Copy + delete (re-encryption on move) |
| `size(path)` | Returns plaintext size (stored size minus 28 bytes) |
| `prepend(path, content)` | Decrypts, prepends, re-encrypts full file |
| `append(path, content)` | Decrypts, appends, re-encrypts full file |
| `json(path)` | Decrypts then parses JSON |
| `getMetadata(path)` | Adjusts reported size for overhead |
| `uploadPart(...)` | Encrypts part content before upload |

## Advanced: Key Rotation

To rotate encryption keys, decrypt with the old key and re-encrypt with the new one:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class KeyRotationService {
  private readonly logger = new Logger(KeyRotationService.name);

  constructor(private readonly storage: StorageService) {}

  async rotateKeys(
    diskName: string,
    oldKey: string,
    newKey: string,
    directory: string = '',
  ): Promise<{ rotated: number; failed: string[] }> {
    const oldDisk = this.storage.encrypted(diskName, { key: oldKey });
    const newDisk = this.storage.encrypted(diskName, { key: newKey });

    const files = await oldDisk.allFiles(directory);
    const failed: string[] = [];
    let rotated = 0;

    for (const file of files) {
      try {
        // Decrypt with old key
        const plaintext = await oldDisk.get(file);
        // Re-encrypt with new key
        await newDisk.put(file, plaintext);
        rotated++;
        this.logger.log(`Rotated: ${file}`);
      } catch (error) {
        this.logger.error(`Failed to rotate: ${file}`, error);
        failed.push(file);
      }
    }

    return { rotated, failed };
  }
}
```

::: tip Atomic Key Rotation
For production key rotation, consider writing re-encrypted files to a temporary path first, then renaming. This prevents data loss if the process is interrupted.
:::

## Full Controller Example

```typescript
import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { StorageService } from '@fozooni/nestjs-storage';

@Controller('secure-files')
export class SecureFileController {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.encrypted('s3', {
      key: process.env.STORAGE_ENCRYPTION_KEY!,
    });
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    const path = `uploads/${Date.now()}-${file.originalname}`;
    await this.disk.put(path, file.buffer);

    return {
      path,
      size: file.buffer.length,
      encrypted: true,
    };
  }

  @Get(':path(*)')
  async download(@Param('path') path: string, @Res() res: Response) {
    const content = await this.disk.get(path);
    const mime = await this.disk.mimeType(path);

    res.set('Content-Type', mime);
    res.set('Content-Length', content.length.toString());
    res.send(content);
  }
}
```

## Per-Tenant Encryption Keys

Combine `EncryptedDisk` with `ScopedDisk` for per-tenant encryption:

```typescript
@Injectable()
export class TenantCryptoService {
  constructor(
    private readonly storage: StorageService,
    private readonly keyStore: TenantKeyStore,
  ) {}

  async getDisk(tenantId: string): Promise<FilesystemContract> {
    const key = await this.keyStore.getKey(tenantId);

    // Encrypt first, then scope — encryption wraps the scoped disk
    const scoped = this.storage.scope(`tenants/${tenantId}`, 's3');
    return this.storage.encrypted(scoped, { key });
  }
}
```

## Size Reporting

`EncryptedDisk` adjusts size reporting to reflect the **plaintext** size, not the stored ciphertext size:

```typescript
const encrypted = storage.encrypted('local', { key });

await encrypted.put('secret.txt', 'Hello World'); // 11 bytes plaintext

const reportedSize = await encrypted.size('secret.txt');
// reportedSize === 11 (not 39, which is 11 + 28 overhead)
```

## How It Works Under the Hood

1. **Encryption (write path)**:
   - Generate a random 12-byte IV using `crypto.randomBytes(12)`
   - Create an AES-256-GCM cipher with the key and IV
   - Encrypt the plaintext content
   - Extract the 16-byte authentication tag
   - Concatenate: `IV + AuthTag + Ciphertext`
   - Write the concatenated buffer to the inner disk

2. **Decryption (read path)**:
   - Read the raw buffer from the inner disk
   - Extract the first 12 bytes as IV
   - Extract the next 16 bytes as the authentication tag
   - Extract the remaining bytes as ciphertext
   - Create an AES-256-GCM decipher with the key, IV, and auth tag
   - Decrypt and return the plaintext

3. **Integrity**: GCM mode provides authenticated encryption. If the ciphertext is tampered with, decryption will throw an error.

## Gotchas

::: warning presignedPost() and presignedUrl() for Uploads
`presignedPost()` throws a `StorageConfigurationError` on `EncryptedDisk`. Pre-signed uploads send data directly to the cloud provider, bypassing the decorator — making encryption impossible. Use server-side uploads through the `put()` method instead.

```typescript
// This will throw!
await encryptedDisk.presignedPost('upload.txt');
// StorageConfigurationError: presignedPost is not supported on EncryptedDisk
```
:::

::: warning prepend() and append() Performance
Since AES-GCM cannot partially encrypt, `prepend()` and `append()` must decrypt the entire file, modify it, and re-encrypt. For large files, this is expensive. Consider using a different storage pattern for append-heavy workloads.
:::

::: info Stream Operations
Stream reads (`readStream()`) decrypt the entire file into memory first, then return a readable stream from the buffer. For very large files, this may cause memory pressure. Consider chunked encryption for files over 100 MB.
:::

## Cross-References

- [Decorator Pattern Overview](./index) -- how decorators compose
- [ScopedDisk](./scoped-disk) -- combine with per-tenant encryption keys
- [CachedDisk](./cached-disk) -- cache metadata to avoid repeated cloud calls
- [RetryDisk](./retry-disk) -- retry failed encryption operations
