# @fozooni/nestjs-storage — LLM Quick Reference

> Compact reference for AI coding tools (Cursor, Copilot, Claude Code, etc.).
> For the full API surface, all interfaces, and migration guides see [llm-full.md](llm-full.md).

---

## What it is

Unified storage abstraction for NestJS. One interface (`FilesystemContract`) works identically across Local filesystem, Amazon S3, Cloudflare R2, Google Cloud Storage, Azure Blob Storage, MinIO, Backblaze B2, DigitalOcean Spaces, and Wasabi. A decorator stack adds caching, retries, replication, CDN URLs, OpenTelemetry tracing, encryption, quota enforcement, file versioning, and content-aware routing — all composable at runtime.

---

## Install

```bash
npm install @fozooni/nestjs-storage
# or: pnpm add @fozooni/nestjs-storage
```

Install only the driver SDK(s) you need:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner  # S3, R2, MinIO, B2, DO, Wasabi
npm install @google-cloud/storage                               # GCS
npm install @azure/storage-blob                                 # Azure
```

---

## Module setup

```typescript
// Synchronous
StorageModule.forRoot({
  default: 'local',
  disks: {
    local: { driver: 'local', root: './storage' },
    s3:    { driver: 's3', bucket: 'my-bucket', region: 'us-east-1', key: '...', secret: '...' },
  },
})

// Async (useFactory)
StorageModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    default: config.get('STORAGE_DRIVER'),
    disks: { ... },
  }),
  inject: [ConfigService],
})
```

---

## Inject

```typescript
// Main service (all proxy methods + disk factories)
constructor(private storage: StorageService) {}

// Specific disk by name
@InjectDisk('s3') private s3: FilesystemContract

// Alternative: inject StorageService
@InjectStorage() private storage: StorageService
```

---

## Drivers — minimum config

| Driver | Required fields |
|--------|----------------|
| `local` | `root` |
| `s3` | `bucket`, `region`, `key`, `secret` |
| `r2` | `bucket`, `accountId`, `key`, `secret` |
| `gcs` | `bucket` (+ `keyFilename` or `credentials`) |
| `azure` | `containerName`, `accountName`, `accountKey` or `sasToken` |
| `minio` | `bucket`, `endpoint`, `key`, `secret` |
| `b2` | `bucket`, `endpoint`, `key`, `secret` |
| `digitalocean` | `bucket`, `region`, `endpoint`, `key`, `secret` |
| `wasabi` | `bucket`, `region`, `endpoint`, `key`, `secret` |

---

## Core file operations

```typescript
// Read
await storage.exists('path/file.txt')         // boolean
await storage.get('path/file.txt')            // Buffer (default)
await storage.get('path/file.txt', { responseType: 'stream' })  // ReadableStream
await storage.get('path/file.txt', { responseType: 'string' })  // string

// Write
await storage.put('path/file.txt', 'content')
await storage.put('path/file.txt', buffer, { visibility: 'public', mimetype: 'image/png' })
await storage.putFile('uploads', req.file)        // auto-named
await storage.putFileAs('uploads', req.file, 'custom.jpg')

// Delete / copy / move
await storage.delete('path/file.txt')
await storage.copy('from.txt', 'to.txt')
await storage.move('from.txt', 'to.txt')

// Metadata
await storage.size('file.txt')                // bytes
await storage.lastModified('file.txt')        // ms timestamp
await storage.mimeType('file.txt')            // 'image/jpeg'
await storage.getMetadata('file.txt')         // FileMetadata object

// Convenience
await storage.missing('file.txt')             // inverse of exists
await storage.json('config.json')             // parse JSON file
await storage.checksum('file.txt')            // MD5 (default)
await storage.checksum('file.txt', 'sha256')
await storage.deleteMany(['a.txt', 'b.txt'])  // { succeeded, failed }

// Directory
await storage.files('uploads/')
await storage.allFiles('uploads/')            // recursive
await storage.makeDirectory('uploads/2024')
await storage.deleteDirectory('tmp/')
await storage.directorySize()                 // total bytes

// URLs
storage.url('image.jpg')                      // public URL
await storage.temporaryUrl('file.pdf', new Date(Date.now() + 3600_000))

// Streaming for NestJS controllers
await storage.getStreamableFile('video.mp4')  // StreamableFile with headers
```

---

## Disk access

```typescript
storage.disk('s3')                    // named disk
storage.cloud()                       // alias for disk('main')
storage.disk()                        // default disk
storage.diskByBucket('my-bucket')     // lookup by bucket name
storage.scope('users/123')            // path-scoped disk
storage.scope('users/123', 's3')      // scoped from named disk
storage.build({ driver: 'local', root: '/tmp' })  // instant, uncached
storage.extend('custom', (config) => new MyDisk(config))  // register driver
storage.setDisk('local', myDiskInstance)  // override at runtime
```

---

## Decorator factories

```typescript
storage.encrypted('disk', { key: '32-byte-hex-or-buffer' })   // AES-256-GCM
storage.cached('disk', { ttl: 60_000 })                        // cache metadata
storage.withRetry('disk', { maxRetries: 3, baseDelay: 100 })   // retry on network errors
storage.replicated('disk', [disk2, disk3], { strategy: 'all' }) // write to all
storage.withTracing('disk')                                     // OpenTelemetry spans
storage.withQuota('disk', new MemoryQuotaStore(), { maxBytes: 1_073_741_824 })
storage.withVersioning('disk')       // auto-snapshot on every write
storage.withRouting(routes, defaultDisk)  // route writes by content
```

---

## RouterDisk

```typescript
import { byExtension, byPrefix, byMimeType, bySize, custom } from '@fozooni/nestjs-storage';

const router = storage.withRouting([
  byExtension(['.jpg', '.png', '.webp'], storage.disk('images')),
  byMimeType(['video/mp4', 'video/webm'], storage.disk('videos')),
  bySize(5 * 1024 * 1024, storage.disk('small')),   // ≤ 5 MB
  byPrefix('docs/', storage.disk('documents')),
  custom((path, mime, size) => path.startsWith('temp/'), storage.disk('temp')),
], storage.disk('default'));
```

---

## Range requests (HTTP 206) — v0.1.0

```typescript
// In a NestJS controller:
@Get('video/:key')
async streamVideo(@Param('key') key: string, @Req() req, @Res() res) {
  await this.storage.serveRange(`videos/${key}`, req, res, 's3');
}

// Low-level
const { stream, size, contentRange, totalSize } = await disk.getRange('file.mp4', { start: 0, end: 999 });

// Method decorator (mark for custom interceptors)
@RangeServe('s3')
async streamFile() { ... }
```

---

## Conditional writes — v0.1.0

```typescript
// Write only if ETag matches (optimistic locking)
const { success, etag } = await disk.putIfMatch('config.json', newContent, knownEtag);

// Write only if file does not exist (create-only)
const { success, etag } = await disk.putIfNoneMatch('config.json', initialContent);
```

---

## File versioning — v0.1.0

```typescript
const versioned = storage.withVersioning('local');

await versioned.put('config.json', '{"v":2}');  // snapshots previous content

const versions = await versioned.listVersions('config.json');
// [{ versionId, size, lastModified, isLatest, checksum? }]

await versioned.getVersion('config.json', versions[0].versionId);  // Buffer
await versioned.restoreVersion('config.json', versions[0].versionId);
await versioned.deleteVersion('config.json', versions[0].versionId);
```

---

## StorageMigrator — v0.1.0

```typescript
@Injectable()
export class MigrateService {
  constructor(private migrator: StorageMigrator) {}

  async run() {
    const source = this.storage.disk('old-s3');
    const target = this.storage.disk('new-s3');

    for await (const progress of this.migrator.migrate(source, target, {
      prefix: 'uploads/',
      concurrency: 10,
      verify: true,            // checksum verification
      deleteSource: false,
      dryRun: false,
      onError: 'skip',         // or 'abort'
    })) {
      console.log(progress.path, progress.status); // 'pending' | 'copied' | 'failed'
    }
  }
}
```

---

## StorageUploadProgressService — v0.1.0

```typescript
// Track progress of a multipart upload (inject and subscribe)
this.progress.track(uploadId, { loaded: bytes, total: totalBytes });
const progress$ = this.progress.getProgress$(uploadId);  // Observable
this.progress.complete(uploadId);
this.progress.error(uploadId, new Error('Upload failed'));
```

---

## StorageArchiver — v0.1.0

```bash
npm install archiver   # optional peer dep
```

```typescript
const zipStream = await this.archiver.createZip([
  { path: 'report.pdf', name: 'report.pdf' },
  { path: 'images/photo.jpg', name: 'photo.jpg' },
], storage.disk('s3'));

const tarStream = await this.archiver.createTar([...], storage.disk('local'), { zlib: { level: 9 } });

// Stream directly to HTTP response:
zipStream.pipe(res);
```

---

## StorageEventsService

```typescript
this.storage.events.on('storage.put', (event) => {
  console.log(event.disk, event.path, event.success);
});
// Events: storage.put | storage.put_file | storage.delete | storage.delete_many
//         storage.copy | storage.move | storage.retry
```

---

## Error handling

```typescript
import {
  StorageFileNotFoundError,
  StoragePermissionError,
  StorageNetworkError,
  StorageConfigurationError,
  StorageQuotaExceededError,
} from '@fozooni/nestjs-storage';

try {
  await storage.get('missing.txt');
} catch (e) {
  if (e instanceof StorageFileNotFoundError) { /* 404 */ }
  if (e instanceof StorageNetworkError)      { /* retry-safe */ }
  if (e instanceof StorageQuotaExceededError){ /* quota hit */ }
}
```

---

## Interceptors

```typescript
// Single file upload → req.file becomes StoredFile
@UseInterceptors(StorageFileInterceptor('avatar', {
  disk: 's3',
  path: 'avatars/',
  namingStrategy: new UuidNamingStrategy(),
}))
async upload(@UploadedFile() file: StoredFile) {
  // file.path, file.url, file.size, file.mimetype, file.originalname, file.disk
}

// Multi-file
@UseInterceptors(StorageFilesInterceptor('photos', 10, { disk: 's3' }))
async uploadMany(@UploadedFiles() files: StoredFile[]) { ... }
```

---

## File validation pipes

```typescript
@UploadedFile(
  new ParseFilePipe({
    validators: [
      new FileExtensionValidator({ allowedExtensions: ['.jpg', '.png', '.webp'] }),
      new MagicBytesValidator(),  // verifies actual file bytes, not just extension
    ],
  }),
)
file: Express.Multer.File
```

---

## Naming strategies

```typescript
import {
  UuidNamingStrategy,         // randomUUID() + extension
  HashNamingStrategy,         // md5(content) + extension
  DatePathNamingStrategy,     // YYYY/MM/DD/uuid + extension
  OriginalNamingStrategy,     // keep original filename
} from '@fozooni/nestjs-storage';

// Per-call
await storage.putFile('uploads', file, { namingStrategy: new DatePathNamingStrategy() });

// Disk-level default in config
{ driver: 'local', root: './storage', namingStrategy: new UuidNamingStrategy() }
```

---

## Audit logging

```typescript
StorageModule.forRoot({ ..., auditLog: true })

// Inject and add custom sinks
this.auditService.addSink({
  log(entry) {
    // entry: { operation, disk, path?, userId?, ip?, timestamp, success, error? }
    myLogger.info(entry);
  }
});
```

---

## Health checks

```typescript
import { TerminusModule } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private storageHealth: StorageHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.storageHealth.check('storage'),
      () => this.storageHealth.checkDisks('all-disks', ['local', 's3']),
    ]);
  }
}
```

---

## Testing

```typescript
import { FakeDisk, StorageTestUtils } from '@fozooni/nestjs-storage';

// Swap real disk for in-memory FakeDisk in tests
const fake = StorageTestUtils.fake(storageService, 'local');

await storageService.put('test.txt', 'hello');
fake.assertExists('test.txt');
fake.assertContentEquals('test.txt', 'hello');
fake.assertCount(1);
fake.assertMissing('missing.txt');
fake.reset();  // clear all files

// Standalone FakeDisk
const disk = new FakeDisk();
await disk.put('a.txt', 'content');

// Mock multer file
const file = StorageTestUtils.fakeFile({ originalname: 'test.jpg', size: 1024 });
const bigFile = StorageTestUtils.fakeFileWithSize(5 * 1024 * 1024, 'big.jpg');
```

---

## HMAC signed URLs (LocalDisk)

```typescript
// Config
{ driver: 'local', root: './storage', signSecret: 'at-least-32-chars-secret' }

// Generate
const url = await storage.temporaryUrl('private/file.pdf', new Date(Date.now() + 3600_000));

// Middleware — validate in your NestJS app
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LocalSignedUrlMiddleware).forRoutes('/files/*');
  }
}
```

---

> For full interface definitions, all constructor options, utility functions, and migration guides, see [llm-full.md](llm-full.md).
