# StorageAuditService

`StorageAuditService` provides **audit logging** for all storage write operations. It records who did what, when, and to which file — with a pluggable sink architecture that lets you send audit entries to a database, file, external API, or any combination thereof.

```ts
import { Injectable } from '@nestjs/common';
import { StorageAuditService } from '@fozooni/nestjs-storage';

@Injectable()
export class MyService {
  constructor(private readonly audit: StorageAuditService) {}
}
```

## Enabling Audit Logging

Audit logging is **disabled by default**. Enable it in your `StorageModule` configuration:

```ts
StorageModule.forRoot({
  default: 'local',
  disks: { /* ... */ },
  auditLog: true,
})
```

When enabled, the default sink logs to the **NestJS Logger** at the `log` level. You can add custom sinks to send entries elsewhere.

## AuditEntry Interface

Every audited operation produces an `AuditEntry` object:

| Field | Type | Description |
|---|---|---|
| `operation` | `string` | The operation name: `'put'`, `'put_file'`, `'delete'`, `'delete_many'`, `'copy'`, `'move'`, `'prepend'`, `'append'`, `'setVisibility'`, `'makeDirectory'`, `'deleteDirectory'` |
| `disk` | `string` | Name of the disk the operation was performed on |
| `path` | `string \| undefined` | Target file path (for single-file operations) |
| `fromPath` | `string \| undefined` | Source path (for `copy` and `move` operations) |
| `toPath` | `string \| undefined` | Destination path (for `copy` and `move` operations) |
| `userId` | `string \| undefined` | User ID, if provided via request context |
| `ip` | `string \| undefined` | Client IP address, if provided via request context |
| `timestamp` | `Date` | When the operation occurred |
| `success` | `boolean` | Whether the operation succeeded |
| `error` | `string \| undefined` | Error message if the operation failed |

## AuditSink Interface

Custom sinks implement the `AuditSink` interface:

```ts
interface AuditSink {
  log(entry: AuditEntry): void | Promise<void>;
}
```

The `log` method can be synchronous or asynchronous. If it returns a Promise, it is awaited in a best-effort manner — failures do not block the storage operation.

## Methods

| Method | Signature | Description |
|---|---|---|
| `addSink` | `addSink(sink: AuditSink): void` | Register a custom audit sink. Multiple sinks can be active simultaneously. |

## Default Logger Sink

With `auditLog: true` and no custom sinks, entries are logged via NestJS Logger:

```
[StorageAuditService] PUT uploads/photo.jpg on [s3] — success: true
[StorageAuditService] DELETE uploads/old.txt on [local] — success: true
[StorageAuditService] COPY images/a.png -> images/b.png on [s3] — success: true
```

## Custom Sink: Database

Store audit entries in a database for querying and compliance:

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageAuditService, AuditEntry, AuditSink } from '@fozooni/nestjs-storage';
import { AuditLogEntity } from './audit-log.entity';

class DatabaseAuditSink implements AuditSink {
  constructor(private readonly repo: Repository<AuditLogEntity>) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.repo.save({
      operation: entry.operation,
      disk: entry.disk,
      path: entry.path,
      fromPath: entry.fromPath,
      toPath: entry.toPath,
      userId: entry.userId,
      ip: entry.ip,
      timestamp: entry.timestamp,
      success: entry.success,
      error: entry.error,
    });
  }
}

@Injectable()
export class AuditSetupService implements OnModuleInit {
  constructor(
    private readonly audit: StorageAuditService,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
  ) {}

  onModuleInit(): void {
    this.audit.addSink(new DatabaseAuditSink(this.auditRepo));
  }
}
```

### TypeORM Entity

```ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('storage_audit_log')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  operation: string;

  @Column()
  disk: string;

  @Column({ nullable: true })
  path?: string;

  @Column({ nullable: true })
  fromPath?: string;

  @Column({ nullable: true })
  toPath?: string;

  @Column({ nullable: true })
  @Index()
  userId?: string;

  @Column({ nullable: true })
  ip?: string;

  @CreateDateColumn()
  @Index()
  timestamp: Date;

  @Column()
  success: boolean;

  @Column({ nullable: true, type: 'text' })
  error?: string;
}
```

## Custom Sink: File Appender

Write audit entries to a log file (useful for environments without a database):

```ts
import { appendFile } from 'fs/promises';
import { AuditSink, AuditEntry } from '@fozooni/nestjs-storage';

class FileAuditSink implements AuditSink {
  constructor(private readonly filePath: string) {}

  async log(entry: AuditEntry): Promise<void> {
    const line = JSON.stringify({
      ts: entry.timestamp.toISOString(),
      op: entry.operation,
      disk: entry.disk,
      path: entry.path,
      from: entry.fromPath,
      to: entry.toPath,
      user: entry.userId,
      ip: entry.ip,
      ok: entry.success,
      err: entry.error,
    });

    await appendFile(this.filePath, line + '\n', 'utf-8');
  }
}

// Register in your setup service
this.audit.addSink(new FileAuditSink('/var/log/storage-audit.jsonl'));
```

## Custom Sink: External API

Forward audit entries to an external logging or compliance service:

```ts
import { AuditSink, AuditEntry } from '@fozooni/nestjs-storage';

class ApiAuditSink implements AuditSink {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(entry),
    });
  }
}

// Register
this.audit.addSink(
  new ApiAuditSink('https://audit.example.com/ingest', process.env.AUDIT_API_KEY),
);
```

## Multiple Sinks

You can register as many sinks as you need. All sinks receive every audit entry:

```ts
@Injectable()
export class AuditSetupService implements OnModuleInit {
  constructor(private readonly audit: StorageAuditService) {}

  onModuleInit(): void {
    // Log to NestJS Logger (already active by default)
    // Plus log to database
    this.audit.addSink(new DatabaseAuditSink(this.auditRepo));
    // Plus log to file
    this.audit.addSink(new FileAuditSink('/var/log/storage.jsonl'));
    // Plus forward to external API
    this.audit.addSink(new ApiAuditSink(process.env.AUDIT_URL, process.env.AUDIT_KEY));
  }
}
```

::: info Performance
Audit logging is **best-effort**. Sink failures are caught and logged but do not block or roll back the storage operation. If a database sink is slow, it will not degrade your application's file operation latency. All sinks run concurrently via `Promise.allSettled`.
:::

## Correlating with Request Context

To populate `userId` and `ip` on audit entries, provide request context. A common pattern uses a `ClsModule` (continuation-local storage) or a custom NestJS interceptor:

### Using an Interceptor

```ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { StorageAuditService } from '@fozooni/nestjs-storage';

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  constructor(private readonly audit: StorageAuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Set context that will be attached to audit entries
    // during this request's lifecycle
    this.audit.setContext({
      userId: request.user?.id,
      ip: request.ip,
    });

    return next.handle();
  }
}
```

```ts
// Apply globally
app.useGlobalInterceptors(new AuditContextInterceptor(auditService));

// Or per-controller
@UseInterceptors(AuditContextInterceptor)
@Controller('files')
export class FilesController { /* ... */ }
```

::: tip Correlating with Request Context
For the most reliable correlation, use NestJS's `ClsModule` (from the `nestjs-cls` package) which provides true async-local storage. This ensures each request's context is isolated even under concurrent load.
:::

## Querying Audit Logs

If you use the database sink, you can query audit logs for compliance and debugging:

```ts
@Injectable()
export class AuditQueryService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  /** Get all operations by a specific user */
  async byUser(userId: string, limit = 100): Promise<AuditLogEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  /** Get all operations on a specific file path */
  async byPath(path: string): Promise<AuditLogEntity[]> {
    return this.repo.find({
      where: { path },
      order: { timestamp: 'DESC' },
    });
  }

  /** Get all failed operations in a time range */
  async failures(since: Date, until: Date): Promise<AuditLogEntity[]> {
    return this.repo
      .createQueryBuilder('audit')
      .where('audit.success = :success', { success: false })
      .andWhere('audit.timestamp BETWEEN :since AND :until', { since, until })
      .orderBy('audit.timestamp', 'DESC')
      .getMany();
  }

  /** Get operation counts grouped by type */
  async operationStats(since: Date): Promise<Array<{ operation: string; count: number }>> {
    return this.repo
      .createQueryBuilder('audit')
      .select('audit.operation', 'operation')
      .addSelect('COUNT(*)', 'count')
      .where('audit.timestamp >= :since', { since })
      .groupBy('audit.operation')
      .getRawMany();
  }
}
```

### Audit Query Controller

```ts
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly auditQuery: AuditQueryService) {}

  @Get('user/:userId')
  async userAudit(
    @Param('userId') userId: string,
    @Query('limit') limit?: number,
  ) {
    return this.auditQuery.byUser(userId, limit);
  }

  @Get('file')
  async fileAudit(@Query('path') path: string) {
    return this.auditQuery.byPath(path);
  }

  @Get('failures')
  async failures(
    @Query('since') since: string,
    @Query('until') until: string,
  ) {
    return this.auditQuery.failures(new Date(since), new Date(until));
  }

  @Get('stats')
  async stats(@Query('since') since: string) {
    return this.auditQuery.operationStats(new Date(since));
  }
}
```

## Operations That Are Audited

All **write** operations are audited. Read operations (`get`, `exists`, `files`, `url`, etc.) are not audited by default to avoid excessive log volume.

| Operation | Audited Fields |
|---|---|
| `put` | `path` |
| `put_file` | `path` |
| `delete` | `path` |
| `delete_many` | `path` (one entry per file) |
| `copy` | `fromPath`, `toPath` |
| `move` | `fromPath`, `toPath` |
| `prepend` | `path` |
| `append` | `path` |
| `setVisibility` | `path` |
| `makeDirectory` | `path` |
| `deleteDirectory` | `path` |

::: danger Sensitive Data
Audit entries may contain file paths that reveal sensitive information about your application's structure. Ensure your audit sinks have appropriate access controls. Do not expose audit query endpoints without authentication and authorization.
:::
