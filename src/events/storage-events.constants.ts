export const StorageEvents = {
  PUT: 'storage.put',
  PUT_FILE: 'storage.putFile',
  DELETE: 'storage.delete',
  COPY: 'storage.copy',
  MOVE: 'storage.move',
  DELETE_MANY: 'storage.deleteMany',
} as const;

export type StorageEventName = (typeof StorageEvents)[keyof typeof StorageEvents];
