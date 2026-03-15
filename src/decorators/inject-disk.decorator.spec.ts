import { getStorageDiskToken, STORAGE_DISK_TOKEN_PREFIX } from '../constants';

describe('getStorageDiskToken', () => {
  it('should return a deterministic token for a disk name', () => {
    expect(getStorageDiskToken('s3')).toBe(`${STORAGE_DISK_TOKEN_PREFIX}s3`);
    expect(getStorageDiskToken('local')).toBe(`${STORAGE_DISK_TOKEN_PREFIX}local`);
  });

  it('should return the same token for the same disk name', () => {
    expect(getStorageDiskToken('gcs')).toBe(getStorageDiskToken('gcs'));
  });

  it('should return different tokens for different disk names', () => {
    expect(getStorageDiskToken('s3')).not.toBe(getStorageDiskToken('gcs'));
  });
});
