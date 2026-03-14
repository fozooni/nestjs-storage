import { Test } from '@nestjs/testing';

import { STORAGE_MODULE_OPTIONS } from './constants';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';
import type { StorageModuleOptions } from './interfaces/storage-module-options.interface';

// Mock disk constructors to avoid actual SDK calls
jest.mock('./disk/local-disk', () => ({
  LocalDisk: jest.fn().mockImplementation(() => ({
    exists: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    putFile: jest.fn(),
    putFileAs: jest.fn(),
    delete: jest.fn(),
    copy: jest.fn(),
    move: jest.fn(),
    size: jest.fn(),
    lastModified: jest.fn(),
    files: jest.fn(),
    allFiles: jest.fn(),
    directories: jest.fn(),
    allDirectories: jest.fn(),
    makeDirectory: jest.fn(),
    deleteDirectory: jest.fn(),
    getVisibility: jest.fn(),
    setVisibility: jest.fn(),
    url: jest.fn(),
    temporaryUrl: jest.fn(),
    prepend: jest.fn(),
    append: jest.fn(),
    getMetadata: jest.fn(),
    mimeType: jest.fn(),
    directorySize: jest.fn(),
    getBucket: jest.fn(),
  })),
}));

jest.mock('./disk/s3-disk', () => ({
  S3Disk: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('./disk/r2-disk', () => ({
  R2Disk: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('./disk/gcs-disk', () => ({
  GcsDisk: jest.fn().mockImplementation(() => ({})),
}));

const testOptions: StorageModuleOptions = {
  default: 'local',
  disks: {
    local: { driver: 'local', root: '/tmp/test-storage' },
  },
};

describe('StorageModule', () => {
  describe('forRoot', () => {
    it('should provide StorageService', async () => {
      const module = await Test.createTestingModule({
        imports: [StorageModule.forRoot(testOptions)],
      }).compile();

      const service = module.get<StorageService>(StorageService);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(StorageService);
    });

    it('should provide STORAGE_MODULE_OPTIONS', async () => {
      const module = await Test.createTestingModule({
        imports: [StorageModule.forRoot(testOptions)],
      }).compile();

      const options = module.get(STORAGE_MODULE_OPTIONS);
      expect(options).toEqual(testOptions);
    });
  });

  describe('forRootAsync', () => {
    it('should support useFactory', async () => {
      const module = await Test.createTestingModule({
        imports: [
          StorageModule.forRootAsync({
            useFactory: () => testOptions,
          }),
        ],
      }).compile();

      const service = module.get<StorageService>(StorageService);
      expect(service).toBeDefined();

      const options = module.get(STORAGE_MODULE_OPTIONS);
      expect(options).toEqual(testOptions);
    });

    it('should support useFactory with inject', async () => {
      const CONFIG_TOKEN = 'CONFIG_TOKEN';

      // The injected provider must be available within StorageModule's scope
      // Pass it through imports as a dynamic module
      const configModule = {
        module: class ConfigModule {},
        providers: [{ provide: CONFIG_TOKEN, useValue: { storagePath: '/custom/path' } }],
        exports: [CONFIG_TOKEN],
      };

      const module = await Test.createTestingModule({
        imports: [
          StorageModule.forRootAsync({
            useFactory: (config: { storagePath: string }) => ({
              default: 'local',
              disks: {
                local: { driver: 'local' as const, root: config.storagePath },
              },
            }),
            inject: [CONFIG_TOKEN],
            imports: [configModule],
          }),
        ],
      }).compile();

      const options = module.get(STORAGE_MODULE_OPTIONS);
      expect(options.disks.local.root).toBe('/custom/path');
    });

    it('should support useClass', async () => {
      class TestOptionsFactory {
        createStorageOptions(): StorageModuleOptions {
          return testOptions;
        }
      }

      const module = await Test.createTestingModule({
        imports: [
          StorageModule.forRootAsync({
            useClass: TestOptionsFactory,
          }),
        ],
      }).compile();

      const service = module.get<StorageService>(StorageService);
      expect(service).toBeDefined();
    });

    it('should support useExisting', async () => {
      class ExistingOptionsFactory {
        createStorageOptions(): StorageModuleOptions {
          return testOptions;
        }
      }

      // useExisting requires the factory to be available in the module scope
      // Pass it through imports as a dynamic module
      const factoryModule = {
        module: class TestFactoryModule {},
        providers: [{ provide: ExistingOptionsFactory, useValue: new ExistingOptionsFactory() }],
        exports: [ExistingOptionsFactory],
      };

      const module = await Test.createTestingModule({
        imports: [
          StorageModule.forRootAsync({
            useExisting: ExistingOptionsFactory,
            imports: [factoryModule],
          }),
        ],
      }).compile();

      const service = module.get<StorageService>(StorageService);
      expect(service).toBeDefined();
    });

    it('should throw if no option method is provided', () => {
      expect(() => StorageModule.forRootAsync({} as any)).toThrow(
        'StorageModule.forRootAsync() requires one of: useFactory, useClass, or useExisting',
      );
    });
  });
});
