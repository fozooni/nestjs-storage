import { DiskConfig } from '../interfaces/storage.interface';
import { sanitizePath } from '../utils/storage.utils';
import { S3Disk } from './s3-disk';

/**
 * DigitalOcean Spaces driver — extends S3Disk via the Spaces S3-compatible API.
 *
 * Required config fields: `bucket`, `region` (e.g. `nyc3`), `key`, `secret`.
 *
 * @example
 * ```ts
 * StorageModule.forRoot({
 *   default: 'spaces',
 *   disks: {
 *     spaces: {
 *       driver: 'digitalocean',
 *       bucket: 'my-space',
 *       region: 'nyc3',
 *       key: '<accessKey>',
 *       secret: '<secretKey>',
 *     },
 *   },
 * });
 * ```
 */
export class DigitalOceanDisk extends S3Disk {
  constructor(config: DiskConfig) {
    super({
      ...config,
      endpoint: config.endpoint ?? `https://${config.region}.digitaloceanspaces.com`,
      use_path_style_endpoint: false,
    });
  }

  url(path: string): string {
    const key = sanitizePath(path);

    if (this.config.url) {
      return `${this.config.url}/${key}`;
    }

    // Spaces virtual-hosted-style URL: https://{bucket}.{region}.digitaloceanspaces.com/{key}
    return `https://${this.config.bucket}.${this.config.region}.digitaloceanspaces.com/${key}`;
  }
}
