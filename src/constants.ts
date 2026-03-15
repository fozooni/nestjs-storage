export const STORAGE_MODULE_OPTIONS = Symbol('STORAGE_MODULE_OPTIONS');

export const STORAGE_DISK_TOKEN_PREFIX = 'STORAGE_DISK_';

export function getStorageDiskToken(diskName: string): string {
  return `${STORAGE_DISK_TOKEN_PREFIX}${diskName}`;
}
