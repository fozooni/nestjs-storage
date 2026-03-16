import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import type { MultipartUploadStatus } from '../interfaces/storage.interface';

@Injectable()
export class StorageUploadProgressService {
  private subjects = new Map<string, Subject<MultipartUploadStatus>>();

  /**
   * Push a status update for the given upload ID.
   * Creates the subject on first call.
   */
  track(uploadId: string, status: MultipartUploadStatus): void {
    this.getOrCreate(uploadId).next(status);
  }

  /**
   * Returns an observable that emits status updates for the given upload.
   * If the upload does not yet exist, a new subject is created so the
   * caller can subscribe before the first `track()` call.
   */
  getProgress$(uploadId: string): Observable<MultipartUploadStatus> {
    return this.getOrCreate(uploadId).asObservable();
  }

  /**
   * Signal that the upload has finished successfully.
   * The observable completes and the subject is removed.
   */
  complete(uploadId: string): void {
    const subject = this.subjects.get(uploadId);
    if (subject) {
      subject.complete();
      this.subjects.delete(uploadId);
    }
  }

  /**
   * Signal that the upload has failed.
   * The observable errors and the subject is removed.
   */
  error(uploadId: string, err: Error): void {
    const subject = this.subjects.get(uploadId);
    if (subject) {
      subject.error(err);
      this.subjects.delete(uploadId);
    }
  }

  private getOrCreate(uploadId: string): Subject<MultipartUploadStatus> {
    let subject = this.subjects.get(uploadId);
    if (!subject) {
      subject = new Subject<MultipartUploadStatus>();
      this.subjects.set(uploadId, subject);
    }
    return subject;
  }
}
