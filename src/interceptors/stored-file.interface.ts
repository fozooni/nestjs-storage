export interface StoredFile {
  /** Path in storage (e.g. 'avatars/550e8400-e29b-41d4-a716-446655440000.jpg') */
  path: string;
  /** Public URL from disk.url(path) */
  url: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimetype: string;
  /** Original filename from the client */
  originalname: string;
  /** Disk name used for storage (options.disk, or 'default' if none specified) */
  disk: string;
}
