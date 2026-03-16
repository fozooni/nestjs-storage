import { extname } from 'path';
import { randomUUID } from 'crypto';

import { NamingStrategy } from './naming-strategy.interface';

export interface DatePathNamingStrategyOptions {
  useUuid?: boolean; // default: true
}

export class DatePathNamingStrategy implements NamingStrategy {
  private readonly useUuid: boolean;

  constructor(options: DatePathNamingStrategyOptions = {}) {
    this.useUuid = options.useUuid !== false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generate(_file: any, originalName: string): string {
    const ext = extname(originalName);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const leaf = this.useUuid ? randomUUID() : originalName.replace(ext, '');
    return `${year}/${month}/${day}/${leaf}${ext}`;
  }
}
