import { DiskConfig } from '../interfaces/storage.interface';
import { sanitizePath } from '../utils/storage.utils';
import { S3Disk } from './s3-disk';

/**
 * Backblaze B2 driver — extends S3Disk via B2's S3-compatible endpoint.
 *
 * Required config fields: `bucket`, `region`, `key` (B2 key ID), `secret` (B2 application key).
 * B2 does not support per-object ACLs; bucket-level settings control public access.
 *
 * @example
 * ```ts
 * StorageModule.forRoot({
 *   default: 'b2',
 *   disks: {
 *     b2: {
 *       driver: 'b2',
 *       bucket: 'my-bucket',
 *       region: 'us-west-004',
 *       key: '<keyId>',
 *       secret: '<applicationKey>',
 *     },
 *   },
 * });
 * ```
 */
export class BackblazeDisk extends S3Disk {
  constructor(config: DiskConfig) {
    super({
      ...config,
      endpoint: config.endpoint ?? `https://s3.${config.region}.backblazeb2.com`,
      use_path_style_endpoint: false,
    });
  }

  url(path: string): string {
    const key = sanitizePath(path);

    if (this.config.url) {
      return `${this.config.url}/${key}`;
    }

    // B2 friendly-URL pattern (works when bucket is public)
    return `https://f002.backblazeb2.com/file/${this.config.bucket}/${key}`;
  }
}
