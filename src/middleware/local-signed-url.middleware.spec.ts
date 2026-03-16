import { createHmac } from 'crypto';

import { LocalSignedUrlMiddleware } from './local-signed-url.middleware';

const SECRET = 'super-secret-key-for-testing';

function sign(path: string, expiresAt: number): string {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return createHmac('sha256', SECRET).update(`${normalizedPath}:${expiresAt}`).digest('hex');
}

function buildRequest(overrides: Partial<{ path: string; query: Record<string, string> }> = {}) {
  return {
    path: overrides.path ?? '/uploads/photo.jpg',
    query: overrides.query ?? {},
    url: overrides.path ?? '/uploads/photo.jpg',
  };
}

function buildResponse() {
  const res = {
    _status: 200,
    _body: {} as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
  };
  return res;
}

describe('LocalSignedUrlMiddleware', () => {
  let middleware: LocalSignedUrlMiddleware;
  const next = jest.fn();

  beforeEach(() => {
    middleware = new LocalSignedUrlMiddleware(SECRET);
    jest.clearAllMocks();
  });

  describe('missing parameters', () => {
    it('should return 403 when expires is missing', () => {
      const req = buildRequest({ query: { signature: 'abc' } });
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(res._status).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when signature is missing', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const req = buildRequest({ query: { expires: String(expiresAt) } });
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(res._status).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when both params are missing', () => {
      const req = buildRequest({ query: {} });
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(res._status).toBe(403);
    });
  });

  describe('expired URLs', () => {
    it('should return 403 when URL has expired', () => {
      const expiresAt = Math.floor(Date.now() / 1000) - 60; // 60 seconds in the past
      const path = '/uploads/photo.jpg';
      const signature = sign(path, expiresAt);
      const req = buildRequest({
        path,
        query: { expires: String(expiresAt), signature },
      });
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(res._status).toBe(403);
      expect((res._body as { message: string }).message).toBe('URL has expired');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for non-numeric expires value', () => {
      const req = buildRequest({
        query: { expires: 'not-a-number', signature: 'abc' },
      });
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(res._status).toBe(403);
    });
  });

  describe('invalid signatures', () => {
    it('should return 403 for wrong signature', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const req = buildRequest({
        query: { expires: String(expiresAt), signature: 'deadbeef'.repeat(8) },
      });
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(res._status).toBe(403);
      expect((res._body as { message: string }).message).toBe('Invalid signature');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for tampered path', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const originalPath = '/uploads/photo.jpg';
      const signature = sign(originalPath, expiresAt); // signed for original path
      const req = buildRequest({
        path: '/uploads/different.jpg', // different path
        query: { expires: String(expiresAt), signature },
      });
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(res._status).toBe(403);
    });

    it('should return 403 for tampered expiry', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const path = '/uploads/photo.jpg';
      const signature = sign(path, expiresAt);
      const req = buildRequest({
        path,
        query: {
          expires: String(expiresAt + 9999), // tampered expiry
          signature,
        },
      });
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(res._status).toBe(403);
    });

    it('should return 403 for non-hex signature (buffer parse error)', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const req = buildRequest({
        query: { expires: String(expiresAt), signature: 'ZZZ!!!invalid' },
      });
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(res._status).toBe(403);
    });
  });

  describe('valid signatures', () => {
    it('should call next() for a valid, non-expired signed URL', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const path = '/uploads/photo.jpg';
      const signature = sign(path, expiresAt);
      const req = buildRequest({ path, query: { expires: String(expiresAt), signature } });
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res._status).toBe(200); // unchanged
    });

    it('should accept paths without leading slash', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const path = 'uploads/photo.jpg'; // no leading slash
      const signature = sign(path, expiresAt);
      const req = { path, query: { expires: String(expiresAt), signature } };
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should accept paths with nested directories', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const path = '/a/b/c/file.pdf';
      const signature = sign(path, expiresAt);
      const req = buildRequest({ path, query: { expires: String(expiresAt), signature } });
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should accept a URL that expires exactly now', () => {
      // Expires at this exact second — should still be valid
      const expiresAt = Math.floor(Date.now() / 1000);
      const path = '/file.txt';
      const signature = sign(path, expiresAt);
      const req = buildRequest({ path, query: { expires: String(expiresAt), signature } });
      const res = buildResponse();
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
