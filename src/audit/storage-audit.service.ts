import { Injectable, Logger } from '@nestjs/common';

import { AuditEntry, AuditSink } from './audit.interface';

/**
 * `StorageAuditService` records storage operations through a chain of `AuditSink`s.
 *
 * The default sink writes a structured log line via NestJS `Logger`.
 * Additional sinks can be registered at runtime via `addSink()`.
 *
 * Enable audit logging by setting `auditLog: true` in `StorageModule.forRoot()`:
 *
 * ```ts
 * StorageModule.forRoot({
 *   auditLog: true,
 *   default: 'local',
 *   disks: { ... },
 * });
 * ```
 *
 * To add a custom sink (e.g. database), inject `StorageAuditService` and call `addSink()`:
 *
 * ```ts
 * constructor(private readonly audit: StorageAuditService) {
 *   audit.addSink(new MyDatabaseAuditSink());
 * }
 * ```
 */
@Injectable()
export class StorageAuditService {
  private readonly logger = new Logger(StorageAuditService.name);
  private readonly sinks: AuditSink[] = [];

  constructor() {
    // Default sink: NestJS Logger
    this.sinks.push({
      log: (entry: AuditEntry) => {
        const status = entry.success ? 'OK' : 'FAIL';
        const msg = `[${status}] ${entry.operation} ${entry.disk}:${entry.path ?? '*'}${entry.userId ? ` user=${entry.userId}` : ''}${entry.ip ? ` ip=${entry.ip}` : ''}${entry.error ? ` error=${entry.error}` : ''}`;
        if (entry.success) {
          this.logger.log(msg);
        } else {
          this.logger.warn(msg);
        }
      },
    });
  }

  /**
   * Register an additional `AuditSink`. All sinks receive every entry.
   */
  addSink(sink: AuditSink): void {
    this.sinks.push(sink);
  }

  /**
   * Emit an audit entry to all registered sinks.
   * Sink errors are swallowed to ensure audit logging never disrupts storage operations.
   */
  log(entry: AuditEntry): void {
    for (const sink of this.sinks) {
      try {
        sink.log(entry);
      } catch {
        // Never let an audit sink failure break the storage operation
      }
    }
  }
}
