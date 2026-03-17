# Naming Strategies

Naming strategies control how files are named when stored using `putFile()` or through the `StorageFileInterceptor`. Instead of using the original client filename (which may contain unsafe characters, duplicates, or predictable names), a naming strategy generates a safe, unique filename automatically.

## NamingStrategy Interface

Every naming strategy implements this interface:

```typescript
interface NamingStrategy {
  generate(
    file: { originalname: string; buffer?: Buffer; mimetype?: string },
    originalName: string,
  ): string | Promise<string>;
}
```

The `generate` method receives the file object and the original filename, and returns the new filename (with extension).

## Built-In Strategies

### UuidNamingStrategy

Generates a random UUID v4 filename, preserving the original extension:

```typescript
import { UuidNamingStrategy } from '@fozooni/nestjs-storage';

const strategy = new UuidNamingStrategy();
// 'photo.jpg' → '550e8400-e29b-41d4-a716-446655440000.jpg'
// 'document.pdf' → 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf'
```

**When to use:** Default choice for most applications. Guarantees uniqueness with no possibility of collisions or filename conflicts.

```typescript
// In disk config
{
  driver: 's3',
  bucket: 'my-bucket',
  namingStrategy: new UuidNamingStrategy(),
}

// In interceptor
StorageFileInterceptor('file', {
  namingStrategy: new UuidNamingStrategy(),
})

// Per-call
await disk.putFile('uploads', file, {
  namingStrategy: new UuidNamingStrategy(),
});
```

### HashNamingStrategy

Generates a content-addressable filename using an MD5 hash of the file content:

```typescript
import { HashNamingStrategy } from '@fozooni/nestjs-storage';

const strategy = new HashNamingStrategy();
// 'photo.jpg' (content hash) → '5d41402abc4b2a76b9719d911017c592.jpg'
```

**When to use:** Content-addressable storage where identical files should map to the same path. Uploading the same file twice produces the same hash, enabling automatic deduplication.

```typescript
// Use hash naming for a media library (automatic dedup)
await disk.putFile('media', file, {
  namingStrategy: new HashNamingStrategy(),
});
```

::: tip
`HashNamingStrategy` enables natural deduplication -- if two users upload the same image, it is stored only once. This can significantly reduce storage costs for applications with lots of shared content (avatars from default sets, stock images, etc.).
:::

### DatePathNamingStrategy

Organizes files into a `YYYY/MM/DD/` directory structure with a UUID filename:

```typescript
import { DatePathNamingStrategy } from '@fozooni/nestjs-storage';

const strategy = new DatePathNamingStrategy();
// 'photo.jpg' → '2026/03/17/550e8400-e29b-41d4-a716-446655440000.jpg'

// With useUuid disabled (uses original name)
const strategy = new DatePathNamingStrategy({ useUuid: false });
// 'photo.jpg' → '2026/03/17/photo.jpg'
```

**When to use:** When you want files organized chronologically. The date prefix creates a natural hierarchy that is easy to browse in S3 consoles and improves performance for drivers that benefit from key distribution (like S3).

```typescript
// Organize uploads by date
@UseInterceptors(
  StorageFileInterceptor('photo', {
    disk: 's3',
    path: 'photos',
    namingStrategy: new DatePathNamingStrategy(),
  }),
)
// Result: photos/2026/03/17/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg
```

#### DatePathNamingStrategy Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useUuid` | `boolean` | `true` | When `true`, uses a UUID for the filename. When `false`, keeps the original filename. |

### OriginalNamingStrategy

Keeps the original filename as-is:

```typescript
import { OriginalNamingStrategy } from '@fozooni/nestjs-storage';

const strategy = new OriginalNamingStrategy();
// 'my-photo.jpg' → 'my-photo.jpg'
// 'Document (1).pdf' → 'Document (1).pdf'
```

**When to use:** When the original filename is meaningful and must be preserved (e.g., user-facing file managers where users expect to see their original filenames).

::: warning
Using `OriginalNamingStrategy` risks filename collisions -- if two users upload files with the same name, the second upload will overwrite the first. Consider combining it with a unique directory prefix (e.g., per-user directories).
:::

## Comparison Table

| Strategy | Example Output | Unique? | Dedup? | Use Case |
|----------|---------------|---------|--------|----------|
| `UuidNamingStrategy` | `550e8400-...-.jpg` | Yes | No | General-purpose uploads |
| `HashNamingStrategy` | `5d41402a...c592.jpg` | Content-based | Yes | Media libraries, CDN assets |
| `DatePathNamingStrategy` | `2026/03/17/a1b2...jpg` | Yes | No | Chronological archives, logs |
| `OriginalNamingStrategy` | `my-photo.jpg` | No | No | User-facing file managers |

## Creating a Custom Strategy

Implement the `NamingStrategy` interface to create your own:

```typescript
import { NamingStrategy } from '@fozooni/nestjs-storage';
import { extname } from 'path';

/**
 * Generates a slug-based filename from the original name,
 * prefixed with a short random ID to prevent collisions.
 *
 * Example: 'My Vacation Photo.jpg' → 'x7k2-my-vacation-photo.jpg'
 */
export class SlugNamingStrategy implements NamingStrategy {
  generate(
    file: { originalname: string },
    originalName: string,
  ): string {
    const ext = extname(originalName);
    const nameWithoutExt = originalName.replace(ext, '');

    // Create a URL-safe slug
    const slug = nameWithoutExt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Add a short random prefix for uniqueness
    const prefix = Math.random().toString(36).substring(2, 6);

    return `${prefix}-${slug}${ext}`;
  }
}
```

### Async Custom Strategy

Naming strategies can also be asynchronous -- useful if you need to check for existing files or query a database:

```typescript
import { NamingStrategy } from '@fozooni/nestjs-storage';
import { extname } from 'path';

/**
 * Checks if the filename already exists and appends a counter if needed.
 * Example: 'report.pdf' → 'report.pdf'
 *          'report.pdf' (again) → 'report-2.pdf'
 */
export class IncrementalNamingStrategy implements NamingStrategy {
  constructor(private readonly disk: FilesystemContract) {}

  async generate(
    file: { originalname: string },
    originalName: string,
  ): Promise<string> {
    const ext = extname(originalName);
    const base = originalName.replace(ext, '');
    let candidate = originalName;
    let counter = 1;

    while (await this.disk.exists(candidate)) {
      counter++;
      candidate = `${base}-${counter}${ext}`;
    }

    return candidate;
  }
}
```

### Using in Disk Config

Set a default naming strategy for all `putFile()` calls on a disk:

```typescript
import { UuidNamingStrategy } from '@fozooni/nestjs-storage';

StorageModule.forRoot({
  default: 'uploads',
  disks: {
    uploads: {
      driver: 's3',
      bucket: 'my-uploads',
      region: 'us-east-1',
      namingStrategy: new UuidNamingStrategy(),
    },
  },
})
```

### Using Per-Call

Override the disk default for a specific operation:

```typescript
import {
  DatePathNamingStrategy,
  HashNamingStrategy,
} from '@fozooni/nestjs-storage';

// Use date paths for this particular upload
const path = await disk.putFile('archives', file, {
  namingStrategy: new DatePathNamingStrategy(),
});

// Use hash naming for dedup
const path = await disk.putFile('media', file, {
  namingStrategy: new HashNamingStrategy(),
});
```

### Using in Interceptors

```typescript
import { DatePathNamingStrategy } from '@fozooni/nestjs-storage';

@Post('upload')
@UseInterceptors(
  StorageFileInterceptor('file', {
    disk: 's3',
    path: 'documents',
    namingStrategy: new DatePathNamingStrategy(),
  }),
)
async upload(@UploadedFile() file: StoredFile) {
  // file.path is already 'documents/2026/03/17/a1b2c3d4.pdf'
  return { path: file.path };
}
```

::: info Priority Order
When multiple naming strategies are configured, the **most specific** one wins:
1. Per-call option (`putFile(..., { namingStrategy })`) -- highest priority
2. Interceptor option (`StorageFileInterceptor('file', { namingStrategy })`)
3. Disk config default (`disks.myDisk.namingStrategy`)
4. `OriginalNamingStrategy` -- fallback if nothing is configured
:::

## Next Steps

Learn how to handle storage failures gracefully with [Error Handling](./error-handling) -- exception hierarchy, filters, and retry classification.
