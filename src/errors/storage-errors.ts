/**
 * Base error class for all storage-related errors.
 *
 * All driver errors extend this class, so consumers can catch either the
 * specific subtype or the base `StorageError` depending on how much
 * granularity they need.
 *
 * @example
 * ```ts
 * try {
 *   await storage.get('missing.txt');
 * } catch (e) {
 *   if (e instanceof StorageFileNotFoundError) {
 *     // handle 404
 *   } else if (e instanceof StorageError) {
 *     // handle any storage error
 *   }
 * }
 * ```
 */
export class StorageError extends Error {
  /**
   * @param message  Human-readable error description.
   * @param disk     Name of the disk that produced the error (e.g. `'local'`, `'s3'`).
   * @param path     Path of the file or directory involved, if applicable.
   * @param cause    Original underlying error, if any.
   */
  constructor(
    message: string,
    public readonly disk?: string,
    public readonly path?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    // Restore the correct prototype chain so `instanceof` works after transpilation
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;

    if (cause?.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * Thrown when a requested file or directory does not exist.
 * Maps to HTTP 404 in most contexts.
 */
export class StorageFileNotFoundError extends StorageError {}

/**
 * Thrown when an operation is denied due to insufficient permissions,
 * missing credentials, or an unsupported operation on a given driver
 * (e.g. per-object ACLs on R2).
 * Maps to HTTP 403 in most contexts.
 */
export class StoragePermissionError extends StorageError {}

/**
 * Thrown when a transient network or cloud-provider error occurs
 * (HTTP 5xx, connection timeouts, SDK transport errors).
 * Safe to retry with exponential back-off.
 */
export class StorageNetworkError extends StorageError {}

/**
 * Thrown when the disk or driver is misconfigured (missing required fields,
 * optional peer dependency not installed, etc.).
 * Not retryable — requires user action to fix configuration.
 */
export class StorageConfigurationError extends StorageError {}

/**
 * Thrown when a write operation would exceed the configured storage quota.
 * Carries the same `disk`, `path`, and `cause` fields as `StorageError`.
 */
export class StorageQuotaExceededError extends StorageError {}
