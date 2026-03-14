import { ModuleMetadata, Type } from '@nestjs/common';
import { StorageConfig } from './storage.interface';

export interface StorageModuleOptions extends StorageConfig {}

export interface StorageModuleOptionsFactory {
  createStorageOptions(): Promise<StorageModuleOptions> | StorageModuleOptions;
}

export interface StorageModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<StorageModuleOptionsFactory>;
  useClass?: Type<StorageModuleOptionsFactory>;
  useFactory?: (...args: any[]) => Promise<StorageModuleOptions> | StorageModuleOptions;
  inject?: any[];
}
