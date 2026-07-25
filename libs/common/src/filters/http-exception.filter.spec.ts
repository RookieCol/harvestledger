import { NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

// Minimal ArgumentsHost/Response doubles so the filter can be exercised without
// a running HTTP server.
function makeHost(url = '/api/v1/thing', method = 'GET') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host: any = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url, method }),
    }),
  };
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  it('keeps the status of a real HttpException', () => {
    const { host, status, json } = makeHost();
    new HttpExceptionFilter().catch(new NotFoundException('nope'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'nope' }),
    );
  });

  it('maps a microservice-propagated { statusCode } error to that HTTP status', () => {
    const { host, status, json } = makeHost();
    new HttpExceptionFilter().catch(
      { statusCode: 409, message: 'User already exists' },
      host,
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: 'User already exists',
      }),
    );
  });

  it('falls back to 500 for an unknown error shape', () => {
    const { host, status } = makeHost();
    new HttpExceptionFilter().catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
  });
});
