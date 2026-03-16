import 'reflect-metadata';
import { RANGE_SERVE_DISK_KEY, RangeServe } from './range-serve.decorator';

describe('@RangeServe', () => {
  it('stores the disk name as metadata on the decorated method', () => {
    class TestController {
      @RangeServe('s3')
      serve() {}
    }
    const meta = Reflect.getMetadata(RANGE_SERVE_DISK_KEY, TestController.prototype, 'serve');
    expect(meta).toBe('s3');
  });

  it('stores null when no disk name is provided', () => {
    class TestController {
      @RangeServe()
      serve() {}
    }
    const meta = Reflect.getMetadata(RANGE_SERVE_DISK_KEY, TestController.prototype, 'serve');
    expect(meta).toBeNull();
  });

  it('stores different disk names on different methods', () => {
    class TestController {
      @RangeServe('local')
      localServe() {}

      @RangeServe('s3')
      s3Serve() {}
    }
    expect(Reflect.getMetadata(RANGE_SERVE_DISK_KEY, TestController.prototype, 'localServe')).toBe(
      'local',
    );
    expect(Reflect.getMetadata(RANGE_SERVE_DISK_KEY, TestController.prototype, 's3Serve')).toBe(
      's3',
    );
  });

  it('does not affect methods without the decorator', () => {
    class TestController {
      plain() {}
    }
    const meta = Reflect.getMetadata(RANGE_SERVE_DISK_KEY, TestController.prototype, 'plain');
    expect(meta).toBeUndefined();
  });
});
