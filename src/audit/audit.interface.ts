/**
 * A single auditable storage operation record.
 */
export interface AuditEntry {
  /** The operation that was performed (e.g. `'put'`, `'delete'`, `'copy'`). */
  operation: string;
  /** Name of the disk on which the operation was performed. */
  disk: string;
  /** Path of the primary file or directory involved, if applicable. */
  path?: string;
  /** Optional user identifier for multi-tenant / authenticated contexts. */
  userId?: string;
  /** Optional client IP address from the HTTP request. */
  ip?: string;
  /** ISO timestamp of the operation. */
  timestamp: Date;
  /** Whether the operation succeeded. */
  success: boolean;
  /** Error message if the operation failed. */
  error?: string;
}

/**
 * Pluggable sink for audit log entries.
 * Implement this interface to route audit events to any destination
 * (database, external SIEM, structured log file, etc.).
 *
 * @example
 * ```ts
 * class DatabaseAuditSink implements AuditSink {
 *   log(entry: AuditEntry) {
 *     this.db.auditLogs.insert(entry);
 *   }
 * }
 * ```
 */
export interface AuditSink {
  log(entry: AuditEntry): void;
}
