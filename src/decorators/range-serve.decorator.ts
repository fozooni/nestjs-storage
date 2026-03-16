import 'reflect-metadata';

/**
 * Metadata key used to store the disk name on a controller method decorated
 * with `@RangeServe()`.
 */
export const RANGE_SERVE_DISK_KEY = 'storage:range-serve:disk';

/**
 * `@RangeServe(diskName?)` — method decorator that marks a controller action
 * as a range-serving endpoint.
 *
 * When applied, it stores the disk name as route metadata so that interceptors
 * or service helpers (e.g. `StorageService.serveRange()`) can look it up via
 * `Reflect.getMetadata(RANGE_SERVE_DISK_KEY, target, propertyKey)`.
 *
 * @param diskName  Optional name of the configured disk to serve from.
 *                  When omitted, the default disk is used.
 *
 * @example
 * ```ts
 * @Controller('files')
 * export class FilesController {
 *   constructor(private readonly storage: StorageService) {}
 *
 *   @Get(':path(*)')
 *   @RangeServe('s3')
 *   async serve(@Param('path') path: string, @Req() req: Request, @Res() res: Response) {
 *     await this.storage.serveRange(path, req, res, 's3');
 *   }
 * }
 * ```
 */
export function RangeServe(diskName?: string): MethodDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    Reflect.defineMetadata(RANGE_SERVE_DISK_KEY, diskName ?? null, target, propertyKey);
  };
}
