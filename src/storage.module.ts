import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { STORAGE_MODULE_OPTIONS } from './constants';
import {
  StorageModuleAsyncOptions,
  StorageModuleOptions,
  StorageModuleOptionsFactory,
} from './interfaces/storage-module-options.interface';
import { StorageService } from './storage.service';

@Global()
@Module({})
export class StorageModule {
  static forRoot(options: StorageModuleOptions): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        {
          provide: STORAGE_MODULE_OPTIONS,
          useValue: options,
        },
        StorageService,
      ],
      exports: [StorageService],
    };
  }

  static forRootAsync(options: StorageModuleAsyncOptions): DynamicModule {
    const asyncProviders = this.createAsyncProviders(options);

    return {
      module: StorageModule,
      imports: options.imports || [],
      providers: [...asyncProviders, StorageService],
      exports: [StorageService],
    };
  }

  private static createAsyncProviders(options: StorageModuleAsyncOptions): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: STORAGE_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
      ];
    }

    if (options.useClass) {
      return [
        {
          provide: STORAGE_MODULE_OPTIONS,
          useFactory: async (optionsFactory: StorageModuleOptionsFactory) =>
            optionsFactory.createStorageOptions(),
          inject: [options.useClass],
        },
        {
          provide: options.useClass,
          useClass: options.useClass,
        },
      ];
    }

    if (options.useExisting) {
      return [
        {
          provide: STORAGE_MODULE_OPTIONS,
          useFactory: async (optionsFactory: StorageModuleOptionsFactory) =>
            optionsFactory.createStorageOptions(),
          inject: [options.useExisting],
        },
      ];
    }

    throw new Error(
      'StorageModule.forRootAsync() requires one of: useFactory, useClass, or useExisting',
    );
  }
}
