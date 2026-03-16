import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

import { StorageService } from '../storage.service';

export interface StorageHealthCheckOptions {
  /** File path used for the health check write/read/delete cycle. */
  healthCheckFile?: string;
  /** Timeout in milliseconds (default: 5000). */
  timeout?: number;
}

@Injectable()
export class StorageHealthIndicator {
  constructor(
    private readonly storage: StorageService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  /**
   * Check a single disk's health by performing a write/read/delete cycle.
   */
  async check(
    key: string,
    diskName?: string,
    options?: StorageHealthCheckOptions,
  ): Promise<HealthIndicatorResult> {
    const healthCheckFile = options?.healthCheckFile ?? '.storage-health-check';
    const timeout = options?.timeout ?? 5000;
    const indicator = this.healthIndicatorService.check(key);

    try {
      const disk = diskName ? this.storage.disk(diskName) : this.storage.disk();

      const result = await this.withTimeout(
        this.performHealthCheck(disk, healthCheckFile),
        timeout,
      );

      if (!result.success) {
        return indicator.down({
          message: result.error || 'Health check failed',
          disk: diskName || 'default',
        });
      }

      return indicator.up({ disk: diskName || 'default' });
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'Unknown error',
        disk: diskName || 'default',
      });
    }
  }

  /**
   * Check multiple disks at once.
   */
  async checkDisks(
    key: string,
    diskNames: string[],
    options?: StorageHealthCheckOptions,
  ): Promise<HealthIndicatorResult> {
    const results = await Promise.all(
      diskNames.map(async (diskName) => {
        try {
          const result = await this.check(`${key}_${diskName}`, diskName, options);
          const diskResult = result[`${key}_${diskName}`];
          return { diskName, status: diskResult.status, message: diskResult.message };
        } catch (error) {
          return {
            diskName,
            status: 'down' as const,
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }),
    );

    const allHealthy = results.every((r) => r.status === 'up');
    const diskStatuses: Record<string, string> = {};
    for (const r of results) {
      diskStatuses[r.diskName] = r.status;
    }

    const indicator = this.healthIndicatorService.check(key);
    return allHealthy
      ? indicator.up({ disks: diskStatuses })
      : indicator.down({ disks: diskStatuses });
  }

  private async performHealthCheck(
    disk: any,
    healthCheckFile: string,
  ): Promise<{ success: boolean; error?: string }> {
    const testContent = `health-check-${Date.now()}`;

    try {
      await disk.put(healthCheckFile, testContent);

      const readContent = await disk.get(healthCheckFile, { responseType: 'string' });
      if (readContent !== testContent) {
        return { success: false, error: 'Read content does not match written content' };
      }

      await disk.delete(healthCheckFile);
      return { success: true };
    } catch (error) {
      // Attempt cleanup
      try {
        await disk.delete(healthCheckFile);
      } catch {
        // Ignore cleanup errors
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Health check timed out after ${ms}ms`));
      }, ms);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
