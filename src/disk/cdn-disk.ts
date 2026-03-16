import {
  CdnConfig,
  FilesystemContract,
  TemporaryUrlOptions,
} from '../interfaces/storage.interface';
import { DiskDecorator } from './disk-decorator';

/**
 * `CdnDisk` is a decorator that rewrites `url()` to return CDN URLs and
 * optionally generates **CloudFront signed URLs** for `temporaryUrl()`.
 *
 * It is automatically applied by `StorageService.disk()` when `DiskConfig.cdn`
 * is set. You can also use it directly for manual control.
 *
 * Requires the optional peer `@aws-sdk/cloudfront-signer` only when
 * `cdn.provider === 'cloudfront'`.
 *
 * @example
 * ```ts
 * // Via config (automatic)
 * StorageModule.forRoot({
 *   default: 's3',
 *   disks: {
 *     s3: {
 *       driver: 's3',
 *       bucket: 'my-bucket',
 *       region: 'us-east-1',
 *       cdn: { baseUrl: 'https://cdn.example.com', provider: 'generic' },
 *     },
 *   },
 * });
 *
 * // Via service (manual)
 * const disk = new CdnDisk(storageService.disk('s3'), {
 *   baseUrl: 'https://d111111abcdef8.cloudfront.net',
 *   provider: 'cloudfront',
 *   signingKeyId: 'K2JCJMDEHXQW5F',
 *   signingKey: '-----BEGIN RSA PRIVATE KEY-----\n...',
 * });
 * disk.url('images/photo.jpg'); // → 'https://cdn.example.com/images/photo.jpg'
 * ```
 */
export class CdnDisk extends DiskDecorator {
  private readonly cdnConfig: CdnConfig;

  constructor(disk: FilesystemContract, cdnConfig: CdnConfig) {
    super(disk);
    this.cdnConfig = cdnConfig;
  }

  override url(path: string): string {
    const base = this.cdnConfig.baseUrl.replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    return `${base}/${cleanPath}`;
  }

  override async temporaryUrl(
    path: string,
    expiration: Date | number,
    _options?: TemporaryUrlOptions,
  ): Promise<string> {
    if (this.cdnConfig.provider === 'cloudfront' && this.cdnConfig.signingKeyId) {
      return this.cloudfrontSignedUrl(path, expiration);
    }
    // Fallback: plain CDN URL (generic CDN or missing CF credentials)
    return Promise.resolve(this.url(path));
  }

  private async cloudfrontSignedUrl(path: string, expiration: Date | number): Promise<string> {
    let signer: {
      getSignedUrl(opts: {
        url: string;
        keyPairId: string;
        privateKey: string;
        dateLessThan: string;
      }): string;
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      signer = require('@aws-sdk/cloudfront-signer') as typeof signer;
    } catch {
      throw new Error(
        'CdnDisk: @aws-sdk/cloudfront-signer is required for CloudFront signed URLs. ' +
          'Install it with: npm install @aws-sdk/cloudfront-signer',
      );
    }

    const url = this.url(path);
    const expiresAt =
      expiration instanceof Date
        ? expiration.toISOString()
        : new Date(Date.now() + (expiration as number) * 1000).toISOString();

    return signer.getSignedUrl({
      url,
      keyPairId: this.cdnConfig.signingKeyId!,
      privateKey: this.cdnConfig.signingKey!,
      dateLessThan: expiresAt,
    });
  }

  /** Placeholder CDN invalidation — override in subclasses or extend for real CF invalidation. */
  override async invalidateCdn(_paths: string[]): Promise<void> {
    // Subclasses or consumers can override for real CloudFront CreateInvalidation calls
  }

  /** Expose the CDN configuration for introspection. */
  get cdnConfiguration(): CdnConfig {
    return { ...this.cdnConfig };
  }
}
