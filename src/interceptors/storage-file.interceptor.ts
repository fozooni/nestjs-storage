import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  mixin,
  Optional,
  Type,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { StorageAuditService } from '../audit/storage-audit.service';
import { StorageService } from '../storage.service';
import type { NamingStrategy } from '../interfaces/storage.interface';
import { UuidNamingStrategy } from '../naming/uuid-naming-strategy';
import { StoredFile } from './stored-file.interface';

export interface StorageFileInterceptorOptions {
  /** Disk name to use. Defaults to the default disk. */
  disk?: string;
  /** Storage directory path. Defaults to root. */
  path?: string;
  /** Naming strategy for the uploaded file. Defaults to UuidNamingStrategy. */
  namingStrategy?: NamingStrategy;
  /** Multer fileFilter function */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fileFilter?: (req: any, file: any, cb: any) => void;
  /** Multer limits */
  limits?: { fileSize?: number; files?: number };
}

/**
 * Factory that returns a NestJS interceptor which:
 * 1. Parses the multipart request using multer (memoryStorage)
 * 2. Stores the uploaded file to the configured storage disk
 * 3. Replaces req.file with a StoredFile object
 *
 * Requires `multer` to be installed: `npm install multer`
 *
 * @example
 * ```typescript
 * @Post('avatar')
 * @UseInterceptors(StorageFileInterceptor('avatar', { disk: 's3', path: 'avatars' }))
 * async upload(@UploadedFile() file: StoredFile) {
 *   return { url: file.url, path: file.path };
 * }
 * ```
 */
export function StorageFileInterceptor(
  fieldName: string,
  options: StorageFileInterceptorOptions = {},
): Type<NestInterceptor> {
  @Injectable()
  class StorageFileInterceptorClass implements NestInterceptor {
    constructor(
      private readonly storageService: StorageService,
      @Optional() private readonly auditService?: StorageAuditService,
    ) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
      const ctx = context.switchToHttp();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const req = ctx.getRequest<any>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = ctx.getResponse<any>();

      await this.runMulter(req, res);

      if (!req.file) {
        return next.handle();
      }

      const diskName = options.disk ?? 'default';
      const disk = this.storageService.disk(options.disk);
      const strategy = options.namingStrategy ?? new UuidNamingStrategy();

      let storedPath: string | false;
      try {
        storedPath = await disk.putFile(options.path ?? '', req.file, {
          namingStrategy: strategy,
        });
      } catch (error) {
        this.auditService?.log({
          operation: 'putFile',
          disk: diskName,
          path: options.path ?? '',
          timestamp: new Date(),
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }

      if (storedPath === false) {
        this.auditService?.log({
          operation: 'putFile',
          disk: diskName,
          path: options.path ?? '',
          timestamp: new Date(),
          success: false,
        });
        throw new Error('Failed to store uploaded file');
      }

      this.auditService?.log({
        operation: 'putFile',
        disk: diskName,
        path: storedPath,
        timestamp: new Date(),
        success: true,
      });

      const storedFile: StoredFile = {
        path: storedPath,
        url: disk.url(storedPath),
        size: req.file.size,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
        disk: diskName,
      };

      req.file = storedFile;
      return next.handle();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private runMulter(req: any, res: any): Promise<void> {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const multer = require('multer');
      const upload = multer({
        storage: multer.memoryStorage(),
        fileFilter: options.fileFilter,
        limits: options.limits,
      }).single(fieldName);

      return new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upload(req, res, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  return mixin(StorageFileInterceptorClass);
}
