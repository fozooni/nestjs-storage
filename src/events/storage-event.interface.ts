export interface StorageBaseEvent {
  disk: string;
  timestamp: Date;
}

export interface StoragePutEvent extends StorageBaseEvent {
  path: string;
  size?: number;
  mimetype?: string;
}

export interface StoragePutFileEvent extends StorageBaseEvent {
  path: string;
  size?: number;
  mimetype?: string;
  originalname?: string;
}

export interface StorageDeleteEvent extends StorageBaseEvent {
  path: string;
}

export interface StorageCopyEvent extends StorageBaseEvent {
  from: string;
  to: string;
}

export interface StorageMoveEvent extends StorageBaseEvent {
  from: string;
  to: string;
}

export interface StorageDeleteManyEvent extends StorageBaseEvent {
  succeeded: string[];
  failed: string[];
}
