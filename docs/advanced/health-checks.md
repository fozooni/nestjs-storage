---
title: Health Checks
description: Production readiness probes with @nestjs/terminus integration for storage disks
---

# Health Checks

`@fozooni/nestjs-storage` provides a `StorageHealthIndicator` that integrates with [`@nestjs/terminus`](https://docs.nestjs.com/recipes/terminus) to verify storage disks are operational. Each health check performs a write-read-delete cycle on a temporary file.

## Installation

```bash
pnpm add @nestjs/terminus
```

::: warning Peer Dependency
`@nestjs/terminus` is an optional peer dependency. The `StorageHealthIndicator` is only available when `@nestjs/terminus` is installed.
:::

## Core API

### `StorageHealthIndicator`

An injectable NestJS health indicator that checks storage disk connectivity.

```ts
import { StorageHealthIndicator } from '@fozooni/nestjs-storage';
```

### `check(key, diskName?, options?)`

Checks a single storage disk by writing a small file, reading it back, and deleting it.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `key` | `string` | — | Health indicator key (shown in health response) |
| `diskName` | `string?` | Default disk | Which disk to check |
| `options` | `StorageHealthCheckOptions?` | — | Custom options |

```ts
await storageHealth.check('storage');
await storageHealth.check('s3-storage', 's3');
await storageHealth.check('local-storage', 'local', { timeout: 10_000 });
```

### `checkDisks(key, diskNames, options?)`

Checks multiple storage disks in parallel. The overall check is healthy only if all disks pass.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `key` | `string` | — | Health indicator key |
| `diskNames` | `string[]` | — | Array of disk names to check |
| `options` | `StorageHealthCheckOptions?` | — | Custom options applied to all checks |

```ts
await storageHealth.checkDisks('all-storage', ['s3', 'gcs', 'local']);
```

### `StorageHealthCheckOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `healthCheckFile` | `string` | `'.storage-health-check'` | Name of the temporary file used for the write-read-delete cycle |
| `timeout` | `number` | `5000` | Maximum time in milliseconds before the check is considered failed |

## Basic Health Controller

```ts
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';
import { StorageHealthIndicator } from '@fozooni/nestjs-storage';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly storageHealth: StorageHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.storageHealth.check('storage'),
    ]);
  }
}
```

Response when healthy:

```json
{
  "status": "ok",
  "info": {
    "storage": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "storage": {
      "status": "up"
    }
  }
}
```

Response when unhealthy:

```json
{
  "status": "error",
  "info": {},
  "error": {
    "storage": {
      "status": "down",
      "message": "Storage health check timed out after 5000ms"
    }
  },
  "details": {
    "storage": {
      "status": "down",
      "message": "Storage health check timed out after 5000ms"
    }
  }
}
```

## Multiple Disk Health Checks

Check all your configured disks individually for granular health reporting:

```ts
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';
import { StorageHealthIndicator } from '@fozooni/nestjs-storage';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly storageHealth: StorageHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      // Check each disk individually
      () => this.storageHealth.check('primary-s3', 's3'),
      () => this.storageHealth.check('backup-gcs', 'gcs'),
      () => this.storageHealth.check('cache-local', 'local'),
    ]);
  }

  @Get('storage')
  @HealthCheck()
  storageHealth(): Promise<HealthCheckResult> {
    return this.health.check([
      // Or check all at once with checkDisks
      () =>
        this.storageHealth.checkDisks('all-disks', ['s3', 'gcs', 'local'], {
          timeout: 10_000,
        }),
    ]);
  }
}
```

## Custom Health Check File Path

By default, the health check writes to `.storage-health-check` at the root of the disk. You can customize this path:

```ts
@Get()
@HealthCheck()
check(): Promise<HealthCheckResult> {
  return this.health.check([
    () =>
      this.storageHealth.check('storage', 's3', {
        healthCheckFile: '.health/storage-probe',
      }),
  ]);
}
```

::: tip
Use a dedicated path like `.health/` to keep health check files organized and easy to exclude from directory listings.
:::

## Timeout Configuration

Set a timeout appropriate for your storage driver. Local disks are fast, but cloud disks may need more time:

```ts
@Get()
@HealthCheck()
check(): Promise<HealthCheckResult> {
  return this.health.check([
    // Local disk — fast
    () =>
      this.storageHealth.check('local-storage', 'local', {
        timeout: 2000,
      }),

    // S3 — may need more time over the network
    () =>
      this.storageHealth.check('s3-storage', 's3', {
        timeout: 10_000,
      }),

    // Azure — cross-region may be slower
    () =>
      this.storageHealth.check('azure-storage', 'azure', {
        timeout: 15_000,
      }),
  ]);
}
```

## Full Module Setup

```ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { StorageModule, StorageHealthIndicator } from '@fozooni/nestjs-storage';
import { HealthController } from './health.controller';

@Module({
  imports: [
    TerminusModule,
    StorageModule.forRoot({
      default: 's3',
      disks: {
        s3: {
          driver: 's3',
          bucket: 'my-bucket',
          region: 'us-east-1',
        },
        local: {
          driver: 'local',
          root: '/data/storage',
        },
      },
    }),
  ],
  controllers: [HealthController],
  providers: [StorageHealthIndicator],
})
export class AppModule {}
```

## Kubernetes Integration

### Liveness Probe

Checks if the application is running. Should be lightweight:

```ts
@Get('liveness')
@HealthCheck()
liveness(): Promise<HealthCheckResult> {
  return this.health.check([
    // Only check local disk for liveness (fast, in-process)
    () =>
      this.storageHealth.check('local', 'local', {
        timeout: 2000,
      }),
  ]);
}
```

### Readiness Probe

Checks if the application is ready to serve traffic. Should include all dependencies:

```ts
@Get('readiness')
@HealthCheck()
readiness(): Promise<HealthCheckResult> {
  return this.health.check([
    // Check all disks — application is only ready if all storage is reachable
    () =>
      this.storageHealth.checkDisks('storage', ['s3', 'gcs', 'local'], {
        timeout: 10_000,
      }),
  ]);
}
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      containers:
        - name: app
          image: my-app:latest
          ports:
            - containerPort: 3000
          livenessProbe:
            httpGet:
              path: /health/liveness
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 15
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/readiness
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 10
            failureThreshold: 3
          startupProbe:
            httpGet:
              path: /health/readiness
              port: 3000
            initialDelaySeconds: 0
            periodSeconds: 5
            timeoutSeconds: 10
            failureThreshold: 30
```

## Health Check with Detailed Metadata

Add custom metadata to health check responses:

```ts
import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { InjectStorage, StorageService } from '@fozooni/nestjs-storage';

@Injectable()
export class DetailedStorageHealthIndicator extends HealthIndicator {
  constructor(
    @InjectStorage()
    private readonly storage: StorageService,
  ) {
    super();
  }

  async check(key: string, diskName: string): Promise<HealthIndicatorResult> {
    const disk = this.storage.disk(diskName);
    const startTime = Date.now();

    try {
      const healthFile = '.health-check-probe';

      await disk.put(healthFile, `health-${Date.now()}`);
      await disk.get(healthFile);
      await disk.delete(healthFile);

      const latency = Date.now() - startTime;

      return this.getStatus(key, true, {
        driver: diskName,
        latencyMs: latency,
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.getStatus(key, false, {
        driver: diskName,
        error: error instanceof Error ? error.message : 'Unknown error',
        checkedAt: new Date().toISOString(),
      });
    }
  }
}
```

::: tip Health Check Frequency and Caching
Health checks perform I/O operations (write, read, delete) on every invocation. For high-traffic deployments:

- Set Kubernetes probe `periodSeconds` to at least 10-15 seconds
- Consider caching health check results for 5-10 seconds using `@nestjs/terminus` caching
- Monitor health check latency as an indicator of storage performance
- Use separate liveness (lightweight) and readiness (thorough) probes
:::

::: info How the Health Check Cycle Works
Each `check()` call performs three operations in sequence:

1. **Write** — `put('.storage-health-check', '<timestamp>')` to verify write access
2. **Read** — `get('.storage-health-check')` to verify read access
3. **Delete** — `delete('.storage-health-check')` to verify delete access and clean up

If any operation fails or times out, the disk is reported as "down". The entire cycle typically completes in under 100ms for local disks and 200-500ms for cloud disks.
:::
