import { extname } from 'path';
import { randomUUID } from 'crypto';

import { NamingStrategy } from './naming-strategy.interface';

export class UuidNamingStrategy implements NamingStrategy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generate(_file: any, originalName: string): string {
    const ext = extname(originalName);
    return `${randomUUID()}${ext}`;
  }
}
