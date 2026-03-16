import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  mixin,
  Type,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { StorageService } from '../storage.service';
import type { NamingStrategy } from '../interfaces/storage.interface';
import { UuidNamingStrategy } from '../naming/uuid-naming-strategy';
import { StoredFile } from './stored-file.interface';
import { StorageFileInterceptorOptions } from './storage-file.interceptor';

/**
 * Factory that returns a NestJS interceptor which handles multiple file uploads.
 * Parses the multipart request using multer (memoryStorage), stores each file
 * to the configured storage disk, and replaces req.files with StoredFile[].
 *
 * Requires `multer` to be installed: `npm install multer`
 *
 * @example
 * ```typescript
 * @Post('photos')
 * @UseInterceptors(StorageFilesInterceptor('photos', 5, { disk: 's3', path: 'gallery' }))
 * async upload(@UploadedFiles() files: StoredFile[]) {
 *   return files.map(f => ({ url: f.url, path: f.path }));
 * }
 * ```
 */
export function StorageFilesInterceptor(
  fieldName: string,
  maxCount: number = 10,
  options: StorageFileInterceptorOptions = {},
): Type<NestInterceptor> {
  @Injectable()
  class StorageFilesInterceptorClass implements NestInterceptor {
    constructor(private readonly storageService: StorageService) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
      const ctx = context.switchToHttp();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const req = ctx.getRequest<any>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = ctx.getResponse<any>();

      await this.runMulter(req, res);

      if (!req.files || req.files.length === 0) {
        req.files = [];
        return next.handle();
      }

      const disk = this.storageService.disk(options.disk);
      const strategy: NamingStrategy = options.namingStrategy ?? new UuidNamingStrategy();
      const storedFiles: StoredFile[] = [];

      for (const file of req.files) {
        const storedPath = await disk.putFile(options.path ?? '', file, {
          namingStrategy: strategy,
        });
        if (storedPath !== false) {
          storedFiles.push({
            path: storedPath,
            url: disk.url(storedPath),
            size: file.size,
            mimetype: file.mimetype,
            originalname: file.originalname,
            disk: options.disk ?? 'default',
          });
        }
      }

      req.files = storedFiles;
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
      }).array(fieldName, maxCount);

      return new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upload(req, res, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  return mixin(StorageFilesInterceptorClass);
}
