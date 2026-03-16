import { StorageConfigurationError } from '../errors/storage-errors';
import { DiskConfig } from '../interfaces/storage.interface';
import { sanitizePath } from '../utils/storage.utils';
import { S3Disk } from './s3-disk';

/**
 * MinIO driver — extends S3Disk using MinIO's S3-compatible API.
 *
 * Required config fields: `endpoint`, `bucket`, `key`, `secret`.
 *
 * @example
 * ```ts
 * StorageModule.forRoot({
 *   default: 'minio',
 *   disks: {
 *     minio: {
 *       driver: 'minio',
 *       endpoint: 'http://localhost:9000',
 *       bucket: 'my-bucket',
 *       key: 'minioadmin',
 *       secret: 'minioadmin',
 *     },
 *   },
 * });
 * ```
 */
export class MinioDisk extends S3Disk {
  constructor(config: DiskConfig) {
    if (!config.endpoint) {
      throw new StorageConfigurationError(
        'MinIO configuration requires endpoint (e.g. http://localhost:9000)',
        'minio',
      );
    }

    super({
      ...config,
      // MinIO requires a region value even though it is not used; default to us-east-1
      region: config.region ?? 'us-east-1',
      // MinIO uses path-style URLs: http://host/bucket/key
      use_path_style_endpoint: true,
    });
  }

  url(path: string): string {
    const key = sanitizePath(path);

    // If a custom base URL is configured (e.g. CDN or MinIO public alias), prefer it
    if (this.config.url) {
      return `${this.config.url}/${key}`;
    }

    // Default: path-style URL  http(s)://endpoint/bucket/key
    const endpoint = this.config.endpoint!.replace(/\/$/, '');
    return `${endpoint}/${this.config.bucket}/${key}`;
  }
}
