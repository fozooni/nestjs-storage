import { NamingStrategy } from './naming-strategy.interface';

export class OriginalNamingStrategy implements NamingStrategy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generate(_file: any, originalName: string): string {
    return originalName;
  }
}
