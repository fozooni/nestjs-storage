# @fozooni/nestjs-storage

[![CI](https://github.com/fozooni/nestjs-storage/actions/workflows/ci.yml/badge.svg)](https://github.com/fozooni/nestjs-storage/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@fozooni/nestjs-storage.svg)](https://www.npmjs.com/package/@fozooni/nestjs-storage)
[![npm downloads](https://img.shields.io/npm/dt/@fozooni/nestjs-storage.svg)](https://www.npmjs.com/package/@fozooni/nestjs-storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful, driver-based storage module for NestJS with a unified API across **9 cloud drivers** and **10 composable decorator disks**.

**[Read the full documentation &rarr;](https://fozooni.github.io/nestjs-storage/)**

## Highlights

- **Unified API** — One interface (`FilesystemContract`) for Local, S3, R2, GCS, Azure, MinIO, B2, DigitalOcean Spaces, and Wasabi
- **Decorator Stack** — Encryption, caching, retries, replication, quotas, versioning, CDN, OpenTelemetry tracing, content-aware routing, and path scoping — all composable at runtime
- **NestJS Native** — `forRoot()` / `forRootAsync()`, `@InjectDisk()`, interceptors, pipes, health checks, audit logging
- **845+ Tests** — 45 test suites, tested on Node 18, 20, 22

## Install

```bash
npm install @fozooni/nestjs-storage
# or
pnpm add @fozooni/nestjs-storage
```

Install only the driver SDK(s) you need:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner  # S3/R2/MinIO/B2/DO/Wasabi
npm install @google-cloud/storage                               # GCS
npm install @azure/storage-blob                                 # Azure
```

## Quick Start

```typescript
import { Module } from '@nestjs/common';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 'local',
      disks: {
        local: { driver: 'local', root: './storage' },
        s3: { driver: 's3', bucket: 'my-bucket', region: 'us-east-1', key: '...', secret: '...' },
      },
    }),
  ],
})
export class AppModule {}
```

```typescript
import { Injectable } from '@nestjs/common';
import { StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class FilesService {
  constructor(private storage: StorageService) {}

  async uploadFile(path: string, content: Buffer) {
    await this.storage.put(path, content, { visibility: 'public' });
    return this.storage.url(path);
  }

  async downloadFile(path: string) {
    return this.storage.get(path);
  }
}
```

## Documentation

Full documentation with deep examples for every feature:

**[https://fozooni.github.io/nestjs-storage/](https://fozooni.github.io/nestjs-storage/)**

- [Getting Started](https://fozooni.github.io/nestjs-storage/guide/)
- [All 9 Drivers](https://fozooni.github.io/nestjs-storage/drivers/)
- [10 Decorator Disks](https://fozooni.github.io/nestjs-storage/decorators/)
- [Services & Advanced Topics](https://fozooni.github.io/nestjs-storage/advanced/)
- [API Reference](https://fozooni.github.io/nestjs-storage/api/)

## AI / LLM Documentation

This package ships with purpose-built reference files for AI coding tools:

| File | Description | Best for |
|------|-------------|----------|
| [`llm.md`](llm.md) | Compact quick-reference | Day-to-day coding with Cursor, Copilot |
| [`llm-full.md`](llm-full.md) | Complete API surface | Architecture decisions, full context |

**Usage with AI tools:**

- **Cursor** — Add to `.cursorrules` or `@`-mention in chat
- **Claude Code** — Reference in `CLAUDE.md` or add as project docs
- **Antigravity / Others** — Add as context documentation

See the [LLM Documentation Guide](https://fozooni.github.io/nestjs-storage/guide/llm-docs) for detailed setup instructions.

## Compatibility

| @fozooni/nestjs-storage | NestJS   | Node.js    |
| ----------------------- | -------- | ---------- |
| `0.x`                   | 10 \| 11 | 18, 20, 22 |

## Support

If you find this package useful, please consider giving it a star on [GitHub](https://github.com/fozooni/nestjs-storage). It helps others discover it and motivates further development!

## Contributing

Contributions are welcome! Please see the existing code patterns and ensure all tests pass before submitting a PR.

```bash
pnpm install
pnpm test
pnpm lint
pnpm build
```

## License

[MIT](LICENSE) &copy; [Fozooni](https://github.com/fozooni)
