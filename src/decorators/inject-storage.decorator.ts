import { Inject } from '@nestjs/common';
import { StorageService } from '../storage.service';

export const InjectStorage = (): ParameterDecorator => Inject(StorageService);
