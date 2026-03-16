import { DiskConfig } from '../interfaces/storage.interface';
import { sanitizePath } from '../utils/storage.utils';
import { S3Disk } from './s3-disk';

/**
 * Wasabi driver — extends S3Disk via Wasabi's S3-compatible endpoint.
 *
 * Required config fields: `bucket`, `region` (e.g. `us-east-1`), `key`, `secret`.
 *
 * @example
 * ```ts
 * StorageModule.forRoot({
 *   default: 'wasabi',
 *   disks: {
 *     wasabi: {
 *       driver: 'wasabi',
 *       bucket: 'my-bucket',
 *       region: 'us-east-1',
 *       key: '<accessKey>',
 *       secret: '<secretKey>',
 *     },
 *   },
 * });
 * ```
 */
export class WasabiDisk extends S3Disk {
  constructor(config: DiskConfig) {
    super({
      ...config,
      endpoint: config.endpoint ?? `https://s3.${config.region}.wasabisys.com`,
      use_path_style_endpoint: false,
    });
  }

  url(path: string): string {
    const key = sanitizePath(path);

    if (this.config.url) {
      return `${this.config.url}/${key}`;
    }

    return `https://s3.${this.config.region}.wasabisys.com/${this.config.bucket}/${key}`;
  }
}
