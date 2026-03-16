import { DiskConfig } from '../interfaces/storage.interface';
import { StorageConfigurationError } from '../errors/storage-errors';

/**
 * Validates `DiskConfig` objects before a disk is constructed.
 *
 * Called automatically by `StorageService.disk()`. Also available for
 * use in custom driver factories.
 *
 * Throws `StorageConfigurationError` with a descriptive message when required
 * fields are missing or invalid.
 *
 * @example
 * ```ts
 * DiskConfigValidator.validate('my-disk', { driver: 's3', bucket: 'my-bucket', region: 'us-east-1' });
 * // → no-op (valid)
 *
 * DiskConfigValidator.validate('bad-disk', { driver: 's3' });
 * // → throws StorageConfigurationError: 'Disk [bad-disk] (s3): missing required fields: bucket, region'
 * ```
 */
export class DiskConfigValidator {
  /**
   * Validate a disk configuration.
   *
   * @param name - The disk name (used in error messages).
   * @param config - The disk configuration to validate.
   * @throws `StorageConfigurationError` if the configuration is invalid.
   */
  static validate(name: string, config: DiskConfig): void {
    const missing = DiskConfigValidator.getMissingFields(config);

    if (missing.length > 0) {
      throw new StorageConfigurationError(
        `Disk [${name}] (${config.driver}): missing required fields: ${missing.join(', ')}`,
        name,
      );
    }

    DiskConfigValidator.validateCdn(name, config);
  }

  private static getMissingFields(config: DiskConfig): string[] {
    switch (config.driver) {
      case 's3':
        return DiskConfigValidator.checkRequired(config, ['bucket', 'region']);

      case 'r2':
        return DiskConfigValidator.checkRequired(config, ['bucket', 'accountId']);

      case 'gcs':
        return DiskConfigValidator.checkRequired(config, ['bucket']);

      case 'minio':
        return DiskConfigValidator.checkRequired(config, ['bucket', 'endpoint']);

      case 'b2':
        return DiskConfigValidator.checkRequired(config, ['bucket', 'endpoint']);

      case 'digitalocean':
        return DiskConfigValidator.checkRequired(config, ['bucket', 'region', 'endpoint']);

      case 'wasabi':
        return DiskConfigValidator.checkRequired(config, ['bucket', 'region', 'endpoint']);

      case 'azure': {
        const missing = DiskConfigValidator.checkRequired(config, ['containerName']);
        if (!config.accountKey && !config.sasToken) {
          missing.push('accountKey or sasToken');
        }
        return missing;
      }

      case 'local':
      default:
        // No strictly required fields for local or unknown/custom drivers
        return [];
    }
  }

  private static checkRequired(config: DiskConfig, fields: string[]): string[] {
    return fields.filter((f) => !config[f]);
  }

  private static validateCdn(name: string, config: DiskConfig): void {
    if (!config.cdn) return;

    if (!config.cdn.baseUrl) {
      throw new StorageConfigurationError(
        `Disk [${name}]: cdn.baseUrl is required when cdn is configured`,
        name,
      );
    }

    if (config.cdn.provider === 'cloudfront') {
      const missingCf: string[] = [];
      if (!config.cdn.signingKeyId) missingCf.push('cdn.signingKeyId');
      if (!config.cdn.signingKey) missingCf.push('cdn.signingKey');
      if (missingCf.length > 0) {
        throw new StorageConfigurationError(
          `Disk [${name}]: CloudFront CDN requires: ${missingCf.join(', ')}`,
          name,
        );
      }
    }
  }
}
