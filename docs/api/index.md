---
title: API Reference
description: Complete type reference for @fozooni/nestjs-storage v0.1.0
---

# API Reference

This section provides a complete type reference for every interface, type, constant, and method exported by `@fozooni/nestjs-storage`.

## Sections

| Page | Description |
|------|-------------|
| [FilesystemContract](/api/filesystem-contract) | The core interface implemented by all disks — every method with its full TypeScript signature |
| [Interfaces](/api/interfaces) | All configuration, option, result, and event interfaces |
| [Types & Constants](/api/types) | Type aliases, enums, constants, injection tokens, and exported classes |

## TypeScript IntelliSense

All types are fully exported with JSDoc comments. Your IDE will provide inline documentation for every method, parameter, and return type:

```ts
import {
  // Core
  FilesystemContract,
  StorageService,
  StorageConfig,
  DiskConfig,

  // Options
  PutOptions,
  GetOptions,
  RangeOptions,

  // Results
  FileMetadata,
  RangeResult,
  ConditionalWriteResult,

  // Decorators
  InjectStorage,
  InjectDisk,
  RangeServe,

  // Types
  StorageDriver,
  Visibility,
  ChecksumAlgorithm,
} from '@fozooni/nestjs-storage';
```

::: tip IDE Support
For the best experience, ensure your `tsconfig.json` includes the package's type declarations. If you are using `pnpm`, types are resolved automatically. With `npm` or `yarn`, you may need to check that `node_modules/@fozooni/nestjs-storage/dist` is accessible.
:::
