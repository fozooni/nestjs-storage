# RouterDisk

`RouterDisk` provides **content-aware routing**, directing files to different underlying disks based on rules like file extension, path prefix, MIME type, file size, or custom predicates. It acts as an intelligent dispatcher that sends images to one disk, videos to another, and documents to a third -- all through a single unified interface.

## When to Use

- **Media separation**: route images to S3, videos to R2/B2, documents to GCS
- **Tiered storage**: small files to fast storage, large files to cheap storage
- **Hot/cold separation**: recent files to SSD-backed storage, archives to glacier
- **Provider optimization**: use each cloud provider for what it does best
- **Cost optimization**: route large video files to a cheaper provider

## Factory Method

```typescript
storage.withRouting(
  routes: Route[],
  defaultDisk: string | FilesystemContract,
): RouterDisk
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `routes` | `Route[]` | Yes | Ordered array of routing rules |
| `defaultDisk` | `string \| FilesystemContract` | Yes | Fallback disk when no route matches |

## Route Factory Functions

Routes are created using factory functions:

### `byExtension(extensions: string[], disk: string | FilesystemContract)`

Matches files by their file extension (case-insensitive).

```typescript
import { byExtension } from '@fozooni/nestjs-storage';

byExtension(['.jpg', '.jpeg', '.png', '.gif', '.webp'], 's3-images');
```

### `byPrefix(prefix: string, disk: string | FilesystemContract)`

Matches files by path prefix.

```typescript
import { byPrefix } from '@fozooni/nestjs-storage';

byPrefix('uploads/videos/', 'r2-videos');
```

### `byMimeType(mimeTypes: string[], disk: string | FilesystemContract)`

Matches files by MIME type. **Write-only** -- MIME type is not available at read time.

```typescript
import { byMimeType } from '@fozooni/nestjs-storage';

byMimeType(['video/mp4', 'video/webm', 'video/avi'], 'r2-videos');
```

### `bySize(maxBytes: number, disk: string | FilesystemContract)`

Matches files under a size threshold. **Write-only** -- file size is not available at read time for routing decisions.

```typescript
import { bySize } from '@fozooni/nestjs-storage';

bySize(1024 * 1024, 'fast-ssd'); // Files under 1 MB → fast SSD storage
```

### `custom(matchFn: (path: string, context?: RouteContext) => boolean, disk: string | FilesystemContract)`

Matches files using a custom predicate function.

```typescript
import { custom } from '@fozooni/nestjs-storage';

custom(
  (path, context) => path.startsWith('tmp/') && (context?.size ?? 0) < 1024,
  'ephemeral-disk',
);
```

## Route Configuration Table

| Factory | Match Criteria | Works for Reads? | Works for Writes? | Notes |
|---|---|---|---|---|
| `byExtension()` | File extension | Yes | Yes | Case-insensitive, include the dot |
| `byPrefix()` | Path prefix | Yes | Yes | Trailing slash recommended |
| `byMimeType()` | MIME type | No | Yes | Only available during write context |
| `bySize()` | Content size | No | Yes | Only available during write context |
| `custom()` | Custom function | Depends | Yes | Read works if predicate uses only path |

## Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import {
  StorageService,
  byExtension,
  byPrefix,
} from '@fozooni/nestjs-storage';

@Injectable()
export class MediaStorageService {
  private readonly disk;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.withRouting(
      [
        byExtension(['.jpg', '.png', '.webp'], 's3-images'),
        byExtension(['.mp4', '.webm'], 'r2-videos'),
        byPrefix('documents/', 'gcs-docs'),
      ],
      'local', // default fallback
    );
  }

  async store(path: string, content: Buffer): Promise<void> {
    // Automatically routed based on extension or prefix:
    // 'photo.jpg'           → s3-images
    // 'trailer.mp4'         → r2-videos
    // 'documents/report.pdf' → gcs-docs
    // 'data.csv'            → local (default)
    await this.disk.put(path, content);
  }

  async retrieve(path: string): Promise<Buffer> {
    // Read routing uses the same extension/prefix rules
    return this.disk.get(path);
  }
}
```

## First-Match-Wins Rule

Routes are evaluated **in order**. The first matching route wins. This is critical for overlapping rules:

```typescript
const disk = storage.withRouting(
  [
    // Rule 1: .jpg files → s3-images
    byExtension(['.jpg'], 's3-images'),
    // Rule 2: uploads/ prefix → r2-uploads
    byPrefix('uploads/', 'r2-uploads'),
  ],
  'local',
);

// 'uploads/photo.jpg' matches BOTH rules.
// Result: routed to 's3-images' (Rule 1 wins — first match)
await disk.put('uploads/photo.jpg', content);
```

::: warning byExtension Runs Before byPrefix
If you define `byExtension` before `byPrefix`, extension matching takes priority. To prioritize prefix-based routing, place `byPrefix` rules first in the array:

```typescript
// Prefix-first ordering:
const disk = storage.withRouting(
  [
    byPrefix('uploads/', 'r2-uploads'),   // Check prefix first
    byExtension(['.jpg'], 's3-images'),   // Then extension
  ],
  'local',
);

// 'uploads/photo.jpg' → r2-uploads (prefix matched first)
```
:::

## Advanced: Full Media Service

```typescript
import { Injectable, Logger } from '@nestjs/common';
import {
  StorageService,
  FilesystemContract,
  byExtension,
  byPrefix,
  byMimeType,
  bySize,
  custom,
} from '@fozooni/nestjs-storage';

@Injectable()
export class EnterpriseMediaService {
  private readonly logger = new Logger(EnterpriseMediaService.name);
  private readonly disk: FilesystemContract;

  constructor(private readonly storage: StorageService) {
    this.disk = this.storage.withRouting(
      [
        // Images → S3 (optimized for image serving with CloudFront)
        byExtension(
          ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'],
          's3-images',
        ),

        // Videos → Cloudflare R2 (cheap egress for large files)
        byExtension(
          ['.mp4', '.webm', '.avi', '.mov', '.mkv'],
          'r2-videos',
        ),

        // Documents → GCS (strong consistency for document workflows)
        byExtension(
          ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'],
          'gcs-documents',
        ),

        // Temporary files → local disk (fast, ephemeral)
        byPrefix('tmp/', 'local'),

        // Small files (< 64KB) → fast SSD storage
        bySize(64 * 1024, 'fast-ssd'),
      ],
      'local', // Everything else → local
    );
  }

  async upload(
    path: string,
    content: Buffer,
    mimeType?: string,
  ): Promise<{ path: string; disk: string }> {
    await this.disk.put(path, content);
    this.logger.log(`File routed: ${path} (${content.length} bytes)`);
    return { path, disk: 'routed' };
  }

  async download(path: string): Promise<Buffer> {
    return this.disk.get(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.disk.exists(path);
  }
}
```

## Read vs. Write Routing

Understanding routing behavior for reads vs. writes is essential:

### Write Routing (all rules available)

During a `put()` or `putFile()` call, all route types can be evaluated because the content is available:

```typescript
// All of these work during writes:
byExtension(['.jpg'], 'images');     // Path is known ✓
byPrefix('uploads/', 'uploads');     // Path is known ✓
byMimeType(['image/jpeg'], 'images'); // MIME can be inferred ✓
bySize(1024 * 1024, 'small-files');  // Content size is known ✓
custom((path, ctx) => true, 'disk'); // Full context available ✓
```

### Read Routing (path-based rules only)

During a `get()`, `exists()`, or `size()` call, only the path is available:

```typescript
// These work during reads:
byExtension(['.jpg'], 'images');     // Path is known ✓
byPrefix('uploads/', 'uploads');     // Path is known ✓

// These CANNOT match during reads:
byMimeType(['image/jpeg'], 'images'); // No content to check MIME ✗
bySize(1024 * 1024, 'small-files');  // No content to check size ✗
```

::: info Read Routing for Size/MIME Rules
If a file was written using a `byMimeType` or `bySize` rule, subsequent reads for that file will fall through to the default disk (since those rules cannot match at read time). Design your routing so that read-time rules (extension, prefix) cover all files that need to be read back.

The recommended pattern: use `byExtension` or `byPrefix` as your primary routing mechanism, and use `byMimeType`/`bySize` only as secondary rules for write-time optimization.
:::

## Cross-Disk Copy and Move

When `copy()` or `move()` is called, the source and destination may resolve to different disks:

```typescript
const disk = storage.withRouting(
  [
    byExtension(['.jpg'], 's3-images'),
    byExtension(['.pdf'], 'gcs-docs'),
  ],
  'local',
);

// Source: 's3-images' (by .jpg extension)
// Destination: 'gcs-docs' (by .pdf extension)
// RouterDisk reads from S3, writes to GCS
await disk.copy('photo.jpg', 'converted.pdf');
```

The router handles cross-disk operations by reading the content from the source disk and writing it to the destination disk.

## Route Ordering Best Practices

```typescript
// Recommended ordering strategy:
const disk = storage.withRouting(
  [
    // 1. Most specific prefix rules first
    byPrefix('system/config/', 'config-disk'),
    byPrefix('system/logs/', 'log-disk'),

    // 2. Extension rules (commonly used, well-defined)
    byExtension(['.jpg', '.png', '.webp'], 'image-disk'),
    byExtension(['.mp4', '.webm'], 'video-disk'),

    // 3. Size-based rules (write-only, broad catch)
    bySize(100 * 1024, 'fast-small-disk'),

    // 4. Custom rules last (most flexible, least predictable)
    custom((path) => path.includes('archive'), 'cold-storage'),
  ],
  'default-disk',
);
```

## Dynamic Routing

Create routing rules dynamically based on configuration:

```typescript
@Injectable()
export class DynamicRouterService {
  private disk: FilesystemContract;

  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {
    const routes = this.buildRoutes();
    this.disk = this.storage.withRouting(routes, 'local');
  }

  private buildRoutes(): Route[] {
    const routes: Route[] = [];

    const imageExtensions = this.config.get<string[]>('storage.imageExtensions');
    if (imageExtensions) {
      routes.push(byExtension(imageExtensions, 's3-images'));
    }

    const videoExtensions = this.config.get<string[]>('storage.videoExtensions');
    if (videoExtensions) {
      routes.push(byExtension(videoExtensions, 'r2-videos'));
    }

    const smallFileThreshold = this.config.get<number>('storage.smallFileThreshold');
    if (smallFileThreshold) {
      routes.push(bySize(smallFileThreshold, 'fast-disk'));
    }

    return routes;
  }
}
```

## Testing with RouterDisk

```typescript
import { Test } from '@nestjs/testing';
import {
  StorageService,
  byExtension,
  byPrefix,
  FakeDisk,
} from '@fozooni/nestjs-storage';

describe('MediaStorageService', () => {
  let storage: StorageService;
  let imageDisk: FakeDisk;
  let videoDisk: FakeDisk;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          default: 'local',
          disks: {
            images: { driver: 'fake' },
            videos: { driver: 'fake' },
            local: { driver: 'fake' },
          },
        }),
      ],
    }).compile();

    storage = module.get(StorageService);
    imageDisk = storage.disk('images') as FakeDisk;
    videoDisk = storage.disk('videos') as FakeDisk;
  });

  it('routes images to image disk', async () => {
    const router = storage.withRouting(
      [
        byExtension(['.jpg', '.png'], 'images'),
        byExtension(['.mp4'], 'videos'),
      ],
      'local',
    );

    await router.put('photo.jpg', Buffer.from('image data'));

    expect(await imageDisk.exists('photo.jpg')).toBe(true);
    expect(await videoDisk.exists('photo.jpg')).toBe(false);
  });

  it('routes videos to video disk', async () => {
    const router = storage.withRouting(
      [
        byExtension(['.jpg', '.png'], 'images'),
        byExtension(['.mp4'], 'videos'),
      ],
      'local',
    );

    await router.put('clip.mp4', Buffer.from('video data'));

    expect(await videoDisk.exists('clip.mp4')).toBe(true);
    expect(await imageDisk.exists('clip.mp4')).toBe(false);
  });
});
```

## How It Works Under the Hood

1. **Route evaluation**: For every operation, `RouterDisk` iterates through the routes array in order. Each route's match function is called with the file path and (for writes) a context object containing size and MIME type.

2. **First match**: The first route whose match function returns `true` determines the target disk. If no route matches, the default disk is used.

3. **Disk resolution**: Route disks can be specified as strings (resolved via `StorageService.disk()`) or as `FilesystemContract` instances.

4. **Cross-disk operations**: For `copy()` and `move()`, the source and destination paths are independently resolved to their respective disks. If they resolve to different disks, the content is read from the source and written to the destination.

5. **Listing operations**: `files()` and `allFiles()` aggregate results from all configured disks (primary routes + default), deduplicating by path.

## Gotchas

::: warning First-Match-Wins Is Final
Once a route matches, no further routes are evaluated. If a file matches `byExtension` and `byPrefix`, only the first matching rule determines the disk. Order your routes carefully.
:::

::: warning byMimeType and bySize Are Write-Only
These rules cannot participate in read routing because the content is not available at read time. If you route files using these rules, ensure there is also a path-based rule (extension or prefix) that can match the same files for reads, or ensure those files are read through the default disk.
:::

::: info Listing Across Disks
When you call `files()` or `allFiles()` on a `RouterDisk`, it queries all configured disks and merges the results. This can be slow if you have many disks or many files. For performance-sensitive listings, query individual disks directly.
:::

::: tip Debugging Route Resolution
If you are unsure which disk a path resolves to, temporarily add a `custom` route with logging:

```typescript
custom((path, ctx) => {
  console.log(`Routing: ${path}`, ctx);
  return false; // never match — just log
}, 'unused'),
```
:::

## Cross-References

- [Decorator Pattern Overview](./index) -- how decorators compose
- [ScopedDisk](./scoped-disk) -- scope individual route target disks
- [ReplicatedDisk](./replicated-disk) -- replicate specific route targets
- [CachedDisk](./cached-disk) -- cache metadata across routed disks
