import { EventEmitter } from 'events';

import { Injectable, Optional, Inject } from '@nestjs/common';

@Injectable()
export class StorageEventsService {
  private readonly emitter = new EventEmitter();

  constructor(
    // Optional integration with @nestjs/event-emitter
    // If EventEmitter2 is registered in the app, events will also be emitted through it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Optional() @Inject('EventEmitter2') private readonly eventEmitter2?: any,
  ) {
    // Allow many listeners (one per storage event per subscriber)
    this.emitter.setMaxListeners(100);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (payload: any) => void): this {
    this.emitter.on(event, handler);
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, handler: (payload: any) => void): this {
    this.emitter.off(event, handler);
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  once(event: string, handler: (payload: any) => void): this {
    this.emitter.once(event, handler);
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string, payload: any): void {
    this.emitter.emit(event, payload);
    this.eventEmitter2?.emit(event, payload);
  }
}
