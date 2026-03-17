# StorageEventsService

`StorageEventsService` provides event-driven hooks for all storage operations. It emits events whenever files are written, deleted, copied, or moved — enabling audit logging, webhooks, cache invalidation, real-time notifications, and more.

```ts
import { Injectable } from '@nestjs/common';
import { StorageEventsService } from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(private readonly events: StorageEventsService) {}
}
```

You can also access it through `StorageService`:

```ts
this.storage.events.on('storage.put', handler);
```

## Methods

| Method | Signature | Description |
|---|---|---|
| `on` | `on(event: string, handler: (payload: any) => void): void` | Register a persistent event listener |
| `off` | `off(event: string, handler: (payload: any) => void): void` | Remove a previously registered listener |
| `once` | `once(event: string, handler: (payload: any) => void): void` | Register a one-time listener (auto-removed after first invocation) |
| `emit` | `emit(event: string, payload: any): void` | Manually emit an event |

## Event Names and Payloads

All events are emitted **after** the operation completes (or fails). The `success` field indicates whether the operation succeeded.

| Event Name | Payload Type | Fields |
|---|---|---|
| `storage.put` | `StoragePutEvent` | `disk: string`, `path: string`, `success: boolean`, `options?: PutOptions` |
| `storage.put_file` | `StoragePutFileEvent` | `disk: string`, `path: string`, `success: boolean`, `originalName: string` |
| `storage.delete` | `StorageDeleteEvent` | `disk: string`, `path: string`, `success: boolean` |
| `storage.delete_many` | `StorageDeleteManyEvent` | `disk: string`, `paths: string[]`, `result: Record<string, boolean>` |
| `storage.copy` | `StorageCopyEvent` | `disk: string`, `from: string`, `to: string`, `success: boolean` |
| `storage.move` | `StorageMoveEvent` | `disk: string`, `from: string`, `to: string`, `success: boolean` |
| `storage.retry` | `StorageRetryEvent` | `disk: string`, `operation: string`, `attempt: number`, `maxRetries: number`, `error: Error` |

::: info Fire and Forget
Events are dispatched synchronously in a fire-and-forget manner. A slow or failing event handler will **not** block or roll back the storage operation. If your handler is async, it will not be awaited — exceptions in async handlers are caught and logged but do not propagate.
:::

## Example: Logging All Write Operations

```ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { StorageEventsService } from '@fozooni/nestjs-storage';

@Injectable()
export class StorageLoggerService implements OnModuleInit {
  private readonly logger = new Logger(StorageLoggerService.name);

  constructor(private readonly events: StorageEventsService) {}

  onModuleInit(): void {
    this.events.on('storage.put', (event) => {
      this.logger.log(`PUT ${event.path} on [${event.disk}] — success: ${event.success}`);
    });

    this.events.on('storage.put_file', (event) => {
      this.logger.log(
        `PUT_FILE ${event.originalName} -> ${event.path} on [${event.disk}] — success: ${event.success}`,
      );
    });

    this.events.on('storage.delete', (event) => {
      this.logger.log(`DELETE ${event.path} on [${event.disk}] — success: ${event.success}`);
    });

    this.events.on('storage.copy', (event) => {
      this.logger.log(
        `COPY ${event.from} -> ${event.to} on [${event.disk}] — success: ${event.success}`,
      );
    });

    this.events.on('storage.move', (event) => {
      this.logger.log(
        `MOVE ${event.from} -> ${event.to} on [${event.disk}] — success: ${event.success}`,
      );
    });

    this.events.on('storage.retry', (event) => {
      this.logger.warn(
        `RETRY ${event.operation} on [${event.disk}] — attempt ${event.attempt}/${event.maxRetries}: ${event.error.message}`,
      );
    });
  }
}
```

## Example: Sending a Webhook on File Upload

```ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  StorageEventsService,
  StoragePutFileEvent,
} from '@fozooni/nestjs-storage';

@Injectable()
export class WebhookNotifierService implements OnModuleInit {
  private readonly logger = new Logger(WebhookNotifierService.name);

  constructor(
    private readonly events: StorageEventsService,
    private readonly http: HttpService,
  ) {}

  onModuleInit(): void {
    this.events.on('storage.put_file', (event: StoragePutFileEvent) => {
      if (event.success) {
        this.sendWebhook(event).catch((err) => {
          this.logger.error(`Webhook failed for ${event.path}: ${err.message}`);
        });
      }
    });
  }

  private async sendWebhook(event: StoragePutFileEvent): Promise<void> {
    await firstValueFrom(
      this.http.post('https://hooks.example.com/storage', {
        event: 'file.uploaded',
        path: event.path,
        disk: event.disk,
        originalName: event.originalName,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
```

## Example: Real-Time Notification Service

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { StorageEventsService } from '@fozooni/nestjs-storage';

interface StorageNotification {
  type: 'created' | 'deleted' | 'moved' | 'copied';
  path: string;
  disk: string;
  timestamp: Date;
}

@Injectable()
export class StorageNotificationService implements OnModuleInit {
  private readonly notifications$ = new Subject<StorageNotification>();

  constructor(private readonly events: StorageEventsService) {}

  onModuleInit(): void {
    this.events.on('storage.put', (e) => {
      if (e.success) {
        this.notifications$.next({
          type: 'created',
          path: e.path,
          disk: e.disk,
          timestamp: new Date(),
        });
      }
    });

    this.events.on('storage.delete', (e) => {
      if (e.success) {
        this.notifications$.next({
          type: 'deleted',
          path: e.path,
          disk: e.disk,
          timestamp: new Date(),
        });
      }
    });

    this.events.on('storage.move', (e) => {
      if (e.success) {
        this.notifications$.next({
          type: 'moved',
          path: e.to,
          disk: e.disk,
          timestamp: new Date(),
        });
      }
    });

    this.events.on('storage.copy', (e) => {
      if (e.success) {
        this.notifications$.next({
          type: 'copied',
          path: e.to,
          disk: e.disk,
          timestamp: new Date(),
        });
      }
    });
  }

  /** Get an observable stream of all storage notifications */
  getNotifications$(): Observable<StorageNotification> {
    return this.notifications$.asObservable();
  }

  /** Get notifications filtered by disk name */
  forDisk$(diskName: string): Observable<StorageNotification> {
    return this.notifications$.pipe(
      filter((n) => n.disk === diskName),
    );
  }

  /** Get notifications filtered by path prefix */
  forPrefix$(prefix: string): Observable<StorageNotification> {
    return this.notifications$.pipe(
      filter((n) => n.path.startsWith(prefix)),
    );
  }
}
```

### Using the Notification Service in an SSE Controller

```ts
import { Controller, Sse, Query } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('storage-events')
export class StorageEventsController {
  constructor(
    private readonly notifications: StorageNotificationService,
  ) {}

  @Sse('stream')
  stream(@Query('disk') disk?: string): Observable<MessageEvent> {
    const source$ = disk
      ? this.notifications.forDisk$(disk)
      : this.notifications.getNotifications$();

    return source$.pipe(
      map((notification) => ({
        data: JSON.stringify(notification),
      } as MessageEvent)),
    );
  }
}
```

## Integration with @nestjs/event-emitter

When `@nestjs/event-emitter` is installed and configured, `StorageEventsService` automatically bridges to `EventEmitter2`. This lets you use the `@OnEvent()` decorator to handle storage events declaratively.

### Setup

```bash
pnpm add @nestjs/event-emitter
```

```ts
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { StorageModule } from '@fozooni/nestjs-storage';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    StorageModule.forRoot({ /* ... */ }),
  ],
})
export class AppModule {}
```

### Using @OnEvent Decorators

```ts
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  StoragePutEvent,
  StorageDeleteEvent,
  StorageCopyEvent,
} from '@fozooni/nestjs-storage';

@Injectable()
export class StorageEventHandlers {
  @OnEvent('storage.put')
  handleFilePut(event: StoragePutEvent): void {
    console.log(`File written: ${event.path}`);
  }

  @OnEvent('storage.delete')
  handleFileDeleted(event: StorageDeleteEvent): void {
    console.log(`File deleted: ${event.path}`);
  }

  @OnEvent('storage.copy')
  handleFileCopied(event: StorageCopyEvent): void {
    console.log(`File copied: ${event.from} -> ${event.to}`);
  }

  @OnEvent('storage.put_file')
  handleFileUploaded(event: StoragePutFileEvent): void {
    // Trigger post-processing pipeline
    if (event.originalName.endsWith('.csv')) {
      this.csvProcessor.process(event.path);
    }
  }

  @OnEvent('storage.retry')
  handleRetry(event: StorageRetryEvent): void {
    if (event.attempt === event.maxRetries) {
      this.alertService.critical(
        `Storage operation ${event.operation} exhausted all retries on [${event.disk}]`,
      );
    }
  }
}
```

::: tip
When using `@OnEvent()`, you get the full power of `EventEmitter2` — including wildcard listeners (`@OnEvent('storage.*')`), async handlers, and priority ordering.
:::

## Cache Invalidation Example

A common pattern is invalidating a cache when a file changes:

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { StorageEventsService } from '@fozooni/nestjs-storage';
import { CacheService } from './cache.service';

@Injectable()
export class CacheInvalidationService implements OnModuleInit {
  constructor(
    private readonly events: StorageEventsService,
    private readonly cache: CacheService,
  ) {}

  onModuleInit(): void {
    // Invalidate cache when files are written, deleted, or moved
    const invalidate = (path: string) => {
      this.cache.delete(`file:${path}`);
      this.cache.delete(`metadata:${path}`);
    };

    this.events.on('storage.put', (e) => invalidate(e.path));
    this.events.on('storage.delete', (e) => invalidate(e.path));
    this.events.on('storage.move', (e) => {
      invalidate(e.from);
      invalidate(e.to);
    });
    this.events.on('storage.copy', (e) => invalidate(e.to));
  }
}
```

## Removing Listeners

To unsubscribe from events, save a reference to the handler and call `off()`:

```ts
const handler = (event) => console.log(event.path);

// Subscribe
this.events.on('storage.put', handler);

// Unsubscribe
this.events.off('storage.put', handler);
```

For one-time listeners, use `once()`:

```ts
// Only fires for the next 'storage.put' event, then auto-removes itself
this.events.once('storage.put', (event) => {
  console.log(`First file written: ${event.path}`);
});
```

::: warning
When using `off()`, you must pass the exact same function reference that was passed to `on()`. Arrow functions defined inline cannot be removed — always store a reference if you plan to unsubscribe.
:::
