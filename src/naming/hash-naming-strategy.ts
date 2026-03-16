import { extname } from 'path';
import { createHash } from 'crypto';

import { NamingStrategy } from './naming-strategy.interface';

export class HashNamingStrategy implements NamingStrategy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generate(file: any, originalName: string): string {
    const ext = extname(originalName);
    const content: Buffer =
      file.buffer ?? (typeof file === 'string' ? Buffer.from(file) : Buffer.from(originalName));
    const hash = createHash('md5').update(content).digest('hex');
    return `${hash}${ext}`;
  }
}
