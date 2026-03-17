---
title: Decorators & Dependency Injection
description: Injection tokens, parameter decorators, and custom provider patterns for @fozooni/nestjs-storage
---

# Decorators & Dependency Injection

`@fozooni/nestjs-storage` provides several decorators and injection utilities for integrating storage into NestJS's dependency injection system.

## Decorators

### `@InjectStorage()`

Injects the `StorageService` singleton. This is the primary entry point for accessing disks.

```ts
import { Injectable } from '@nestjs/common';
import { InjectStorage, StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class FileService {
  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {}

  async uploadFile(path: string, content: Buffer): Promise<string> {
    await this.storage.disk().put(path, content);
    return this.storage.disk().url(path);
  }

  async copyBetweenDisks(
    path: string,
    fromDisk: string,
    toDisk: string,
  ): Promise<void> {
    const content = await this.storage.disk(fromDisk).get(path, {
      responseType: 'buffer',
    });
    await this.storage.disk(toDisk).put(path, content);
  }
}
```

**When to use:** When you need to access multiple disks or switch between disks dynamically.

### `@InjectDisk(diskName)`

Injects a specific `FilesystemContract` disk instance by name. More direct than going through `StorageService`.

```ts
import { Injectable } from '@nestjs/common';
import { InjectDisk, FilesystemContract } from '@fozooni/nestjs-storage';

@Injectable()
export class AvatarService {
  constructor(
    @InjectDisk('avatars')
    private readonly avatarDisk: FilesystemContract,
  ) {}

  async upload(userId: string, data: Buffer): Promise<string> {
    const path = `users/${userId}/avatar.jpg`;
    await this.avatarDisk.put(path, data, {
      visibility: 'public',
      mimetype: 'image/jpeg',
    });
    return this.avatarDisk.url(path);
  }

  async delete(userId: string): Promise<void> {
    await this.avatarDisk.delete(`users/${userId}/avatar.jpg`);
  }

  async exists(userId: string): Promise<boolean> {
    return this.avatarDisk.exists(`users/${userId}/avatar.jpg`);
  }
}
```

**When to use:** When a service only interacts with one disk and you want type-safe access without the `StorageService` indirection.

::: tip `injectDisks` Must Include the Disk Name
For `@InjectDisk()` to work, the disk name must be listed in the `injectDisks` option when registering the module:

```ts
StorageModule.forRoot({
  default: 's3',
  disks: {
    s3: { driver: 's3', bucket: 'main', region: 'us-east-1' },
    avatars: { driver: 's3', bucket: 'avatars', region: 'us-east-1' },
    local: { driver: 'local', root: '/data' },
  },
  injectDisks: ['avatars', 'local'], // Only these can be @InjectDisk'd
});
```

If you forget to include a disk name in `injectDisks`, NestJS will throw a dependency resolution error at startup.
:::

### `@RangeServe(diskName?)`

A metadata decorator that marks a controller method as a range-serving endpoint. Sets metadata used by the framework for automatic range header parsing.

```ts
import { Controller, Get, Param } from '@nestjs/common';
import { RangeServe } from '@fozooni/nestjs-storage';

@Controller('media')
export class MediaController {
  @Get('video/:id')
  @RangeServe('videos')
  async streamVideo(@Param('id') id: string) {
    return { path: `videos/${id}.mp4` };
  }

  @Get('audio/:id')
  @RangeServe('audio')
  async streamAudio(@Param('id') id: string) {
    return { path: `music/${id}.mp3` };
  }

  @Get('default/:path(*)')
  @RangeServe() // Uses default disk
  async streamDefault(@Param('path') path: string) {
    return { path };
  }
}
```

**Metadata key:** `RANGE_SERVE_DISK_KEY`

## Injection Tokens

### `getStorageDiskToken(diskName)`

Generates the injection token string for a named disk. Used internally by `@InjectDisk()`, but also available for building custom providers.

```ts
import { getStorageDiskToken } from '@fozooni/nestjs-storage';

const token = getStorageDiskToken('avatars');
// Returns: 'STORAGE_DISK_avatars'
```

### `STORAGE_MODULE_OPTIONS`

A `Symbol` injection token for the raw storage module configuration object. Useful when building custom providers or factories that need access to the full config.

```ts
import { Inject, Injectable } from '@nestjs/common';
import {
  STORAGE_MODULE_OPTIONS,
  StorageConfig,
} from '@fozooni/nestjs-storage';

@Injectable()
export class StorageInfoService {
  constructor(
    @Inject(STORAGE_MODULE_OPTIONS)
    private readonly config: StorageConfig,
  ) {}

  getConfiguredDisks(): string[] {
    return Object.keys(this.config.disks);
  }

  getDefaultDiskName(): string {
    return this.config.default;
  }

  getDiskDriver(name: string): string {
    return this.config.disks[name]?.driver ?? 'unknown';
  }
}
```

### `STORAGE_DISK_TOKEN_PREFIX`

The string prefix used to build disk injection tokens: `'STORAGE_DISK_'`.

```ts
import { STORAGE_DISK_TOKEN_PREFIX } from '@fozooni/nestjs-storage';

// Manual token construction (equivalent to getStorageDiskToken):
const token = `${STORAGE_DISK_TOKEN_PREFIX}myDisk`;
// 'STORAGE_DISK_myDisk'
```

## Custom Provider Patterns

### Custom Disk Provider

Register a custom disk implementation using `getStorageDiskToken`:

```ts
import { Module } from '@nestjs/common';
import {
  StorageModule,
  getStorageDiskToken,
  FilesystemContract,
} from '@fozooni/nestjs-storage';
import { CustomCloudDisk } from './custom-cloud.disk';

@Module({
  imports: [
    StorageModule.forRoot({
      default: 's3',
      disks: {
        s3: { driver: 's3', bucket: 'main', region: 'us-east-1' },
      },
    }),
  ],
  providers: [
    {
      provide: getStorageDiskToken('custom'),
      useFactory: (): FilesystemContract => {
        return new CustomCloudDisk({
          apiKey: process.env.CUSTOM_CLOUD_API_KEY,
          endpoint: process.env.CUSTOM_CLOUD_ENDPOINT,
        });
      },
    },
  ],
  exports: [getStorageDiskToken('custom')],
})
export class CustomStorageModule {}
```

Then inject it:

```ts
@Injectable()
export class MyService {
  constructor(
    @InjectDisk('custom')
    private readonly customDisk: FilesystemContract,
  ) {}
}
```

### Factory Provider with Dependencies

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StorageModule,
  getStorageDiskToken,
  InjectStorage,
  StorageService,
  EncryptedDisk,
} from '@fozooni/nestjs-storage';

@Module({
  providers: [
    {
      provide: getStorageDiskToken('encrypted-s3'),
      useFactory: (
        storage: StorageService,
        config: ConfigService,
      ) => {
        const baseDisk = storage.disk('s3');
        return new EncryptedDisk(baseDisk, {
          algorithm: 'aes-256-gcm',
          key: config.getOrThrow('ENCRYPTION_KEY'),
        });
      },
      inject: [StorageService, ConfigService],
    },
  ],
  exports: [getStorageDiskToken('encrypted-s3')],
})
export class EncryptedStorageModule {}
```

### Scoped Provider (Request-scoped Disk)

```ts
import { Module, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import {
  StorageModule,
  getStorageDiskToken,
  StorageService,
  ScopedDisk,
} from '@fozooni/nestjs-storage';

@Module({
  providers: [
    {
      provide: getStorageDiskToken('tenant'),
      scope: Scope.REQUEST,
      useFactory: (storage: StorageService, request: Request) => {
        const tenantId = request.headers['x-tenant-id'] as string;
        const baseDisk = storage.disk('s3');
        return new ScopedDisk(baseDisk, `tenants/${tenantId}`);
      },
      inject: [StorageService, REQUEST],
    },
  ],
  exports: [getStorageDiskToken('tenant')],
})
export class TenantStorageModule {}
```

Usage in a controller:

```ts
@Controller('files')
export class TenantFileController {
  constructor(
    @InjectDisk('tenant')
    private readonly disk: FilesystemContract,
  ) {}

  @Get(':path(*)')
  async getFile(@Param('path') path: string) {
    // Automatically scoped to tenants/{tenantId}/
    return this.disk.get(path);
  }
}
```

## `forRootAsync()` with `injectDisks`

The `injectDisks` option controls which disks get registered as injectable providers:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    ConfigModule.forRoot(),
    StorageModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        default: 's3',
        disks: {
          s3: {
            driver: 's3',
            bucket: config.get('S3_BUCKET'),
            region: config.get('S3_REGION'),
          },
          local: {
            driver: 'local',
            root: config.get('LOCAL_STORAGE_ROOT', '/data'),
          },
          backups: {
            driver: 'gcs',
            bucket: config.get('GCS_BACKUP_BUCKET'),
          },
        },
        // Only these disks will be available via @InjectDisk()
        injectDisks: ['s3', 'local', 'backups'],
      }),
    }),
  ],
})
export class AppModule {}
```

## Multiple Disk Injection Example

```ts
import { Injectable } from '@nestjs/common';
import {
  InjectStorage,
  InjectDisk,
  StorageService,
  FilesystemContract,
} from '@fozooni/nestjs-storage';

@Injectable()
export class MediaService {
  constructor(
    // Full storage service for dynamic disk access
    @InjectStorage()
    private readonly storage: StorageService,

    // Direct disk injection for known disks
    @InjectDisk('images')
    private readonly imagesDisk: FilesystemContract,

    @InjectDisk('videos')
    private readonly videosDisk: FilesystemContract,

    @InjectDisk('thumbnails')
    private readonly thumbsDisk: FilesystemContract,
  ) {}

  async uploadImage(name: string, data: Buffer): Promise<string> {
    await this.imagesDisk.put(`originals/${name}`, data);
    return this.imagesDisk.url(`originals/${name}`);
  }

  async uploadVideo(name: string, data: Buffer): Promise<string> {
    await this.videosDisk.put(`raw/${name}`, data);
    return this.videosDisk.url(`raw/${name}`);
  }

  async saveThumbnail(name: string, data: Buffer): Promise<string> {
    await this.thumbsDisk.put(name, data, { visibility: 'public' });
    return this.thumbsDisk.url(name);
  }

  async migrateFile(
    path: string,
    fromDisk: string,
    toDisk: string,
  ): Promise<void> {
    // Use StorageService for dynamic disk names
    const content = await this.storage.disk(fromDisk).get(path, {
      responseType: 'buffer',
    });
    await this.storage.disk(toDisk).put(path, content);
    await this.storage.disk(fromDisk).delete(path);
  }
}
```

::: info Token Resolution Order
When NestJS resolves `@InjectDisk('myDisk')`:

1. It looks for a provider with token `STORAGE_DISK_myDisk`
2. If registered via `injectDisks: ['myDisk']`, the factory creates the disk from config
3. If registered via a custom provider with `getStorageDiskToken('myDisk')`, that factory runs
4. Custom providers take precedence over `injectDisks` auto-registration

This means you can override any disk's injection behavior by registering a custom provider with the same token.
:::
