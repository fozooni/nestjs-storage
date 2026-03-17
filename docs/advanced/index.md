---
title: Advanced Topics
description: Advanced features and patterns for @fozooni/nestjs-storage v0.1.0
---

# Advanced Topics

This section covers the advanced features, patterns, and internals of `@fozooni/nestjs-storage`. These guides assume familiarity with the [Getting Started](/guide/) and [Core Operations](/guide/core-operations) sections.

## Overview

| Page | Description |
|------|-------------|
| [Range Requests](/advanced/range-requests) | Stream partial file content with HTTP 206 for video, audio, and resumable downloads |
| [Conditional Writes](/advanced/conditional-writes) | Optimistic locking with ETag-based `putIfMatch` and create-only `putIfNoneMatch` |
| [Presigned POST](/advanced/presigned-post) | Browser-to-cloud direct uploads bypassing your server for S3-compatible drivers |
| [Multipart Uploads](/advanced/multipart-uploads) | Chunked uploads for large files with progress tracking and resumability |
| [Health Checks](/advanced/health-checks) | Production readiness probes with `@nestjs/terminus` integration |
| [Interceptors & Pipes](/advanced/interceptors-pipes) | File upload interceptors, extension validators, and magic-byte validation |
| [Middleware](/advanced/middleware) | `LocalSignedUrlMiddleware` for HMAC-SHA256 signed URL verification |
| [Decorators & DI](/advanced/decorators-di) | Injection tokens, parameter decorators, and custom provider patterns |
| [Config Validation](/advanced/config-validation) | Automatic disk configuration validation and required fields per driver |
| [Utilities](/advanced/utilities) | Path, file, stream, S3, and visibility helper functions |
| [Composing Decorators](/advanced/composing-decorators) | Stacking decorator disks for enterprise patterns and best practices |

## Prerequisites

All advanced features require `@fozooni/nestjs-storage` v0.1.0 or later:

```bash
pnpm add @fozooni/nestjs-storage@^0.1.0
```

::: tip
Each advanced page includes complete, copy-pasteable NestJS examples. Start with whichever feature your application needs — these guides are designed to be read independently.
:::
