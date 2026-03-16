import { firstValueFrom, toArray } from 'rxjs';
import { take } from 'rxjs/operators';

import type { MultipartUploadStatus } from '../interfaces/storage.interface';
import { StorageUploadProgressService } from './storage-upload-progress.service';

function makeStatus(uploadId: string, completedParts: number): MultipartUploadStatus {
  return {
    uploadId,
    key: 'file.txt',
    totalParts: 5,
    completedParts,
    uploadedBytes: completedParts * 1024,
    totalBytes: 5 * 1024,
  };
}

describe('StorageUploadProgressService', () => {
  let service: StorageUploadProgressService;

  beforeEach(() => {
    service = new StorageUploadProgressService();
  });

  it('emits tracked status updates on the observable', async () => {
    const progress$ = service.getProgress$('upload-1');
    const collected: MultipartUploadStatus[] = [];
    const sub = progress$.subscribe((s) => collected.push(s));

    service.track('upload-1', makeStatus('upload-1', 1));
    service.track('upload-1', makeStatus('upload-1', 2));

    sub.unsubscribe();
    expect(collected).toHaveLength(2);
    expect(collected[0].completedParts).toBe(1);
    expect(collected[1].completedParts).toBe(2);
  });

  it('completes the observable when complete() is called', async () => {
    const progress$ = service.getProgress$('upload-2');

    setTimeout(() => {
      service.track('upload-2', makeStatus('upload-2', 1));
      service.complete('upload-2');
    }, 0);

    const all = await firstValueFrom(progress$.pipe(toArray()));
    expect(all).toHaveLength(1);
    expect(all[0].completedParts).toBe(1);
  });

  it('errors the observable when error() is called', async () => {
    const progress$ = service.getProgress$('upload-3');

    setTimeout(() => {
      service.error('upload-3', new Error('upload failed'));
    }, 0);

    await expect(firstValueFrom(progress$)).rejects.toThrow('upload failed');
  });

  it('handles multiple concurrent uploads independently', async () => {
    const a$ = service.getProgress$('a');
    const b$ = service.getProgress$('b');
    const aValues: number[] = [];
    const bValues: number[] = [];

    const subA = a$.subscribe((s) => aValues.push(s.completedParts));
    const subB = b$.subscribe((s) => bValues.push(s.completedParts));

    service.track('a', makeStatus('a', 1));
    service.track('b', makeStatus('b', 10));
    service.track('a', makeStatus('a', 2));

    subA.unsubscribe();
    subB.unsubscribe();

    expect(aValues).toEqual([1, 2]);
    expect(bValues).toEqual([10]);
  });

  it('does nothing when complete() is called for an unknown upload', () => {
    expect(() => service.complete('nonexistent')).not.toThrow();
  });

  it('does nothing when error() is called for an unknown upload', () => {
    expect(() => service.error('nonexistent', new Error('x'))).not.toThrow();
  });

  it('creates a new subject when subscribing before the first track()', () => {
    const progress$ = service.getProgress$('lazy');
    const values: number[] = [];
    const sub = progress$.subscribe((s) => values.push(s.completedParts));

    service.track('lazy', makeStatus('lazy', 3));
    sub.unsubscribe();

    expect(values).toEqual([3]);
  });

  it('removes the subject after complete()', async () => {
    service.getProgress$('x');
    service.complete('x');
    // A new subscription after complete yields a fresh observable (empty, not completed).
    const progress$ = service.getProgress$('x');
    const values: number[] = [];
    const sub = progress$.pipe(take(1)).subscribe((s) => values.push(s.completedParts));
    service.track('x', makeStatus('x', 1));
    sub.unsubscribe();
    expect(values).toEqual([1]);
  });
});
