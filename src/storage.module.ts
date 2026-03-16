import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { getStorageDiskToken, STORAGE_MODULE_OPTIONS } from './constants';
import {
  StorageModuleAsyncOptions,
  StorageModuleOptions,
  StorageModuleOptionsFactory,
} from './interfaces/storage-module-options.interface';
import { StorageService } from './storage.service';
import { StorageEventsService } from './events/storage-events.service';
import { StorageAuditService } from './audit/storage-audit.service';
import { StorageTempCleanupService } from './temp/storage-temp.service';
import { StorageMigrator } from './migration/storage-migrator';
import { StorageUploadProgressService } from './progress/storage-upload-progress.service';
import { StorageArchiver } from './archiver/storage-archiver';

@Global()
@Module({})
export class StorageModule {
  static forRoot(options: StorageModuleOptions): DynamicModule {
    const diskNames = Object.keys(options.disks || {});
    const diskProviders = this.createDiskProviders(diskNames);
    const auditProviders = options.auditLog ? [StorageAuditService] : [];

    return {
      module: StorageModule,
      providers: [
        {
          provide: STORAGE_MODULE_OPTIONS,
          useValue: options,
        },
        StorageService,
        StorageEventsService,
        StorageTempCleanupService,
        StorageMigrator,
        StorageUploadProgressService,
        StorageArchiver,
        ...auditProviders,
        ...diskProviders,
      ],
      exports: [
        StorageService,
        StorageEventsService,
        StorageTempCleanupService,
        StorageMigrator,
        StorageUploadProgressService,
        StorageArchiver,
        ...auditProviders,
        ...diskProviders.map((p) => p.provide),
      ],
    };
  }

  static forRootAsync(options: StorageModuleAsyncOptions): DynamicModule {
    const asyncProviders = this.createAsyncProviders(options);
    const diskProviders = this.createDiskProviders(options.injectDisks || []);

    // For async, always register StorageAuditService (it will only be injected if auditLog:true is in config)
    const auditProviders: Provider[] = [StorageAuditService];

    return {
      module: StorageModule,
      imports: options.imports || [],
      providers: [
        ...asyncProviders,
        StorageService,
        StorageEventsService,
        StorageTempCleanupService,
        StorageMigrator,
        StorageUploadProgressService,
        StorageArchiver,
        ...auditProviders,
        ...diskProviders,
      ],
      exports: [
        StorageService,
        StorageEventsService,
        StorageTempCleanupService,
        StorageMigrator,
        StorageUploadProgressService,
        StorageArchiver,
        ...auditProviders,
        ...diskProviders.map((p) => p.provide),
      ],
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

  private static createDiskProviders(
    diskNames: string[],
  ): { provide: string; useFactory: (storage: StorageService) => any; inject: any[] }[] {
    return diskNames.map((diskName) => ({
      provide: getStorageDiskToken(diskName),
      useFactory: (storageService: StorageService) => storageService.disk(diskName),
      inject: [StorageService],
    }));
  }
}
