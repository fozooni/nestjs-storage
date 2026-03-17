# ScopedDisk

`ScopedDisk` provides **path-scoped isolation** by automatically prefixing all file paths with a configured directory prefix. It is the simplest and one of the most frequently used decorators, especially for multi-tenant applications.

## When to Use

- **Multi-tenant applications**: isolate each tenant's files under `tenants/{tenantId}/`
- **Per-user uploads**: scope uploads to `uploads/user-{userId}/`
- **Module isolation**: give each module its own directory namespace
- **Environment separation**: prefix by `staging/` or `production/`

## Factory Method

```typescript
storage.scope(prefix: string, diskName?: string): ScopedDisk
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `prefix` | `string` | Yes | The path prefix to prepend to all operations |
| `diskName` | `string` | No | Name of the disk to scope. Defaults to the default disk |

You can also call `.scope()` directly on any `FilesystemContract` instance:

```typescript
const disk = storage.disk('s3');
const scoped = disk.scope('uploads/2026');
```

## Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class UploadService {
  private readonly uploads;

  constructor(private readonly storage: StorageService) {
    this.uploads = this.storage.scope('uploads');
  }

  async store(filename: string, content: Buffer): Promise<void> {
    // Actually writes to: uploads/filename
    await this.uploads.put(filename, content);
  }

  async retrieve(filename: string): Promise<Buffer> {
    // Actually reads from: uploads/filename
    return this.uploads.get(filename);
  }

  async listAll(): Promise<string[]> {
    // Lists files under uploads/, but returns RELATIVE paths
    // e.g., ['photo.jpg', 'doc.pdf'] — not ['uploads/photo.jpg', ...]
    return this.uploads.files();
  }
}
```

::: tip Path Stripping on Read
When you call `files()`, `allFiles()`, or `directories()` on a `ScopedDisk`, the prefix is **automatically stripped** from returned paths. Your code never needs to know about the underlying prefix.
:::

## Nested Scoping

Scopes can be nested. Each nested `.scope()` appends to the existing prefix:

```typescript
const uploads = storage.scope('uploads');
const userUploads = uploads.scope('user-42');
// Effective prefix: uploads/user-42/

await userUploads.put('avatar.jpg', avatarBuffer);
// Actual path on disk: uploads/user-42/avatar.jpg

const images = userUploads.scope('images');
// Effective prefix: uploads/user-42/images/

await images.put('photo.png', photoBuffer);
// Actual path on disk: uploads/user-42/images/photo.png
```

## Multi-Tenant Pattern

The most common use case is per-tenant isolation. Create a scoped disk dynamically per request:

```typescript
import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { StorageService, FilesystemContract } from '@fozooni/nestjs-storage';

@Injectable({ scope: Scope.REQUEST })
export class TenantStorageService {
  public readonly disk: FilesystemContract;

  constructor(
    @Inject(REQUEST) private readonly request: Request,
    private readonly storage: StorageService,
  ) {
    const tenantId = this.request.headers['x-tenant-id'] as string;
    this.disk = this.storage.scope(`tenants/${tenantId}`, 's3');
  }

  async uploadDocument(name: string, content: Buffer): Promise<string> {
    const path = `documents/${name}`;
    await this.disk.put(path, content);
    // Actual S3 key: tenants/{tenantId}/documents/{name}
    return path;
  }

  async listDocuments(): Promise<string[]> {
    // Returns: ['documents/report.pdf', 'documents/invoice.pdf']
    // NOT: ['tenants/abc-123/documents/report.pdf', ...]
    return this.disk.allFiles('documents');
  }

  async getStorageUsage(): Promise<number> {
    return this.disk.directorySize('');
  }
}
```

::: info Request-Scoped Services
Using `Scope.REQUEST` means a new `TenantStorageService` instance is created for every HTTP request. This is the cleanest way to bind a scoped disk to a tenant. For performance-sensitive applications, consider caching scoped disks in a `Map`.
:::

## Advanced: Scoped Disk Cache

To avoid creating new `ScopedDisk` instances on every request, cache them:

```typescript
@Injectable()
export class TenantDiskFactory {
  private readonly cache = new Map<string, FilesystemContract>();

  constructor(private readonly storage: StorageService) {}

  forTenant(tenantId: string): FilesystemContract {
    if (!this.cache.has(tenantId)) {
      this.cache.set(
        tenantId,
        this.storage.scope(`tenants/${tenantId}`, 's3'),
      );
    }
    return this.cache.get(tenantId)!;
  }
}
```

```typescript
@Controller('files')
export class FileController {
  constructor(private readonly tenantDisks: TenantDiskFactory) {}

  @Post()
  async upload(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { path: string; content: string },
  ) {
    const disk = this.tenantDisks.forTenant(tenantId);
    await disk.put(body.path, Buffer.from(body.content));
    return { stored: true };
  }
}
```

## All Scoped Operations

Every `FilesystemContract` method is scoped. Here is a representative sample:

```typescript
const scoped = storage.scope('data/reports');

// Write operations — prefix added
await scoped.put('q1.csv', csvBuffer);          // → data/reports/q1.csv
await scoped.putFile('q2.csv', '/tmp/q2.csv');  // → data/reports/q2.csv
await scoped.prepend('q1.csv', headerRow);      // → data/reports/q1.csv
await scoped.append('q1.csv', footerRow);       // → data/reports/q1.csv

// Read operations — prefix added to input, stripped from output
const buf = await scoped.get('q1.csv');          // reads data/reports/q1.csv
const exists = await scoped.exists('q1.csv');    // checks data/reports/q1.csv
const size = await scoped.size('q1.csv');         // size of data/reports/q1.csv

// Listing operations — prefix stripped from results
const files = await scoped.files();              // ['q1.csv', 'q2.csv']
const allFiles = await scoped.allFiles();        // recursive listing

// Delete operations — prefix added
await scoped.delete('q1.csv');                   // deletes data/reports/q1.csv
await scoped.deleteDirectory('archive');         // deletes data/reports/archive/

// Copy/Move — both source and destination scoped
await scoped.copy('q1.csv', 'archive/q1.csv');
// copies data/reports/q1.csv → data/reports/archive/q1.csv

// URL generation — prefix added
const url = await scoped.url('q1.csv');
// URL points to data/reports/q1.csv
```

## How It Works Under the Hood

`ScopedDisk` extends `DiskDecorator` and overrides every method to:

1. **Prepend** the configured prefix to all input paths
2. **Strip** the prefix from all output paths (listings, metadata)
3. **Delegate** the actual operation to the inner disk

The prefix is normalized:
- Leading slashes are removed
- Trailing slash is ensured
- Double slashes are collapsed

```typescript
// Internal prefix normalization
'uploads'       → 'uploads/'
'/uploads/'     → 'uploads/'
'uploads//foo'  → 'uploads/foo/'
```

## Gotchas

::: warning Escaping the Scope
There is no way to "escape" a scoped disk. Paths like `../secret.txt` are normalized and will NOT traverse above the scope prefix. This is intentional for security.
:::

::: warning Copy/Move Across Scopes
When you `copy()` or `move()` on a scoped disk, both source and destination are within the scope. To copy between different scopes, use two separate disk references:

```typescript
const scopeA = storage.scope('tenant-a');
const scopeB = storage.scope('tenant-b');

const content = await scopeA.get('file.txt');
await scopeB.put('file.txt', content);
```
:::

## Cross-References

- [Decorator Pattern Overview](./index) -- how decorators compose
- [QuotaDisk](./quota-disk) -- combine with scoping for per-tenant quotas
- [RouterDisk](./router-disk) -- route by prefix instead of scoping
- [Configuration Guide](/guide/configuration) -- multi-disk setup for tenants
