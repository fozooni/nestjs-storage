import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

import { StorageService } from '../storage.service';
import { StorageFileInterceptor } from './storage-file.interceptor';
import { StorageFilesInterceptor } from './storage-files.interceptor';
import type { StoredFile } from './stored-file.interface';

// Mock multer before the interceptor loads it
const mockMulterFile = {
  buffer: Buffer.from('hello'),
  originalname: 'photo.jpg',
  mimetype: 'image/jpeg',
  size: 5,
  fieldname: 'avatar',
  encoding: '7bit',
};

const mockMulterMiddleware = jest.fn().mockImplementation((req: any, _res: any, cb: any) => {
  req.file = mockMulterFile;
  cb(null);
});

const mockArrayMiddleware = jest.fn().mockImplementation((req: any, _res: any, cb: any) => {
  req.files = [mockMulterFile];
  cb(null);
});

const mockMulter = jest.fn().mockReturnValue({
  single: jest.fn().mockReturnValue(mockMulterMiddleware),
  array: jest.fn().mockReturnValue(mockArrayMiddleware),
});
(mockMulter as any).memoryStorage = jest.fn().mockReturnValue({});

jest.mock('multer', () => mockMulter);

describe('StorageFileInterceptor', () => {
  let mockDisk: any;
  let mockStorage: jest.Mocked<StorageService>;
  let mockContext: ExecutionContext;
  let mockNext: CallHandler;

  beforeEach(() => {
    mockDisk = {
      putFile: jest.fn().mockResolvedValue('avatars/uuid.jpg'),
      url: jest.fn().mockReturnValue('https://example.com/avatars/uuid.jpg'),
    };
    mockStorage = {
      disk: jest.fn().mockReturnValue(mockDisk),
    } as any;
    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ file: null }),
        getResponse: jest.fn().mockReturnValue({}),
      }),
    } as any;
    mockNext = {
      handle: jest.fn().mockReturnValue(of({ success: true })),
    };
  });

  it('should store uploaded file and replace req.file with StoredFile', async () => {
    const InterceptorClass = StorageFileInterceptor('avatar', { disk: 's3', path: 'avatars' });
    const interceptor = new InterceptorClass(mockStorage);

    const req: any = {};
    (mockContext.switchToHttp as jest.Mock).mockReturnValue({
      getRequest: jest.fn().mockReturnValue(req),
      getResponse: jest.fn().mockReturnValue({}),
    });

    await interceptor.intercept(mockContext, mockNext);

    expect(mockStorage.disk).toHaveBeenCalledWith('s3');
    expect(mockDisk.putFile).toHaveBeenCalledWith(
      'avatars',
      mockMulterFile,
      expect.objectContaining({ namingStrategy: expect.any(Object) }),
    );

    const storedFile: StoredFile = req.file;
    expect(storedFile.path).toBe('avatars/uuid.jpg');
    expect(storedFile.url).toBe('https://example.com/avatars/uuid.jpg');
    expect(storedFile.mimetype).toBe('image/jpeg');
    expect(storedFile.originalname).toBe('photo.jpg');
    expect(storedFile.disk).toBe('s3');
    expect(storedFile.size).toBe(5);
  });

  it('should use default disk when no disk option specified', async () => {
    const InterceptorClass = StorageFileInterceptor('avatar');
    const interceptor = new InterceptorClass(mockStorage);

    const req: any = {};
    (mockContext.switchToHttp as jest.Mock).mockReturnValue({
      getRequest: jest.fn().mockReturnValue(req),
      getResponse: jest.fn().mockReturnValue({}),
    });

    await interceptor.intercept(mockContext, mockNext);

    expect(mockStorage.disk).toHaveBeenCalledWith(undefined);
    expect(req.file.disk).toBe('default');
  });

  it('should pass through if no file uploaded', async () => {
    const noFileMiddleware = jest.fn().mockImplementation((_req: any, _res: any, cb: any) => {
      cb(null); // no file set
    });
    const multerMock = require('multer');
    multerMock.mockReturnValueOnce({ single: jest.fn().mockReturnValue(noFileMiddleware) });

    const InterceptorClass = StorageFileInterceptor('avatar');
    const interceptor = new InterceptorClass(mockStorage);

    const req: any = {};
    (mockContext.switchToHttp as jest.Mock).mockReturnValue({
      getRequest: jest.fn().mockReturnValue(req),
      getResponse: jest.fn().mockReturnValue({}),
    });

    await interceptor.intercept(mockContext, mockNext);

    expect(mockDisk.putFile).not.toHaveBeenCalled();
    expect(req.file).toBeUndefined();
  });

  it('should throw when storage fails', async () => {
    mockDisk.putFile.mockResolvedValue(false);

    const InterceptorClass = StorageFileInterceptor('avatar', { disk: 's3' });
    const interceptor = new InterceptorClass(mockStorage);

    const req: any = {};
    (mockContext.switchToHttp as jest.Mock).mockReturnValue({
      getRequest: jest.fn().mockReturnValue(req),
      getResponse: jest.fn().mockReturnValue({}),
    });

    await expect(interceptor.intercept(mockContext, mockNext)).rejects.toThrow(
      'Failed to store uploaded file',
    );
  });
});

describe('StorageFilesInterceptor', () => {
  let mockDisk: any;
  let mockStorage: jest.Mocked<StorageService>;
  let mockContext: ExecutionContext;
  let mockNext: CallHandler;

  beforeEach(() => {
    mockDisk = {
      putFile: jest.fn().mockResolvedValue('uploads/uuid.jpg'),
      url: jest.fn().mockReturnValue('https://example.com/uploads/uuid.jpg'),
    };
    mockStorage = {
      disk: jest.fn().mockReturnValue(mockDisk),
    } as any;
    mockNext = {
      handle: jest.fn().mockReturnValue(of({ success: true })),
    };
    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({}),
        getResponse: jest.fn().mockReturnValue({}),
      }),
    } as any;
  });

  it('should store multiple files and replace req.files with StoredFile[]', async () => {
    const InterceptorClass = StorageFilesInterceptor('photos', 5, { disk: 's3', path: 'uploads' });
    const interceptor = new InterceptorClass(mockStorage);

    const req: any = {};
    (mockContext.switchToHttp as jest.Mock).mockReturnValue({
      getRequest: jest.fn().mockReturnValue(req),
      getResponse: jest.fn().mockReturnValue({}),
    });

    await interceptor.intercept(mockContext, mockNext);

    expect(mockDisk.putFile).toHaveBeenCalledTimes(1);
    expect(req.files).toHaveLength(1);
    expect(req.files[0]).toMatchObject({
      path: 'uploads/uuid.jpg',
      url: 'https://example.com/uploads/uuid.jpg',
      disk: 's3',
    });
  });

  it('should return empty array when no files uploaded', async () => {
    const emptyArrayMiddleware = jest.fn().mockImplementation((_req: any, _res: any, cb: any) => {
      cb(null);
    });
    const multerMock = require('multer');
    multerMock.mockReturnValueOnce({ array: jest.fn().mockReturnValue(emptyArrayMiddleware) });

    const InterceptorClass = StorageFilesInterceptor('photos');
    const interceptor = new InterceptorClass(mockStorage);

    const req: any = {};
    (mockContext.switchToHttp as jest.Mock).mockReturnValue({
      getRequest: jest.fn().mockReturnValue(req),
      getResponse: jest.fn().mockReturnValue({}),
    });

    await interceptor.intercept(mockContext, mockNext);

    expect(req.files).toEqual([]);
  });
});
