import { Inject } from '@nestjs/common';
import { getStorageDiskToken } from '../constants';

export const InjectDisk = (diskName: string): ParameterDecorator =>
  Inject(getStorageDiskToken(diskName));
