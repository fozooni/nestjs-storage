import { DiskConfig } from '../interfaces/storage.interface';
import { sanitizePath } from '../utils/storage.utils';
import { S3Disk } from './s3-disk';

export class R2Disk extends S3Disk {
  constructor(config: DiskConfig) {
    if (!config.accountId) {
      throw new Error('R2 configuration requires accountId');
    }

    const r2Config: DiskConfig = {
      ...config,
      endpoint: config.endpoint || `https://${config.accountId}.r2.cloudflarestorage.com`,
      region: config.region || 'auto',
      use_path_style_endpoint: false,
    };

    super(r2Config);
  }

  async getVisibility(_path: string): Promise<'private' | 'public'> {
    return 'private';
  }

  async setVisibility(_path: string, _visibility: 'private' | 'public'): Promise<boolean> {
    throw new Error(
      'Cloudflare R2 does not support per-object ACLs. ' +
        'Use R2 custom domains in the Cloudflare dashboard for public access.',
    );
  }

  url(path: string): string {
    if (this.config.url) {
      const key = sanitizePath(path);
      return `${this.config.url}/${key}`;
    }

    throw new Error(
      'R2 does not provide default public URLs. ' +
        'Configure a custom domain in DiskConfig.url to use url().',
    );
  }
}
