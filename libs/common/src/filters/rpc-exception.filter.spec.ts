import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { RpcExceptionFilter } from './rpc-exception.filter';

// The filter turns a thrown exception into an observable that errors with a
// serializable { statusCode, message } — that payload is what the gateway maps
// back onto the HTTP response.
async function caughtPayload(exception: unknown) {
  const filter = new RpcExceptionFilter();
  const obs$ = filter.catch(exception);
  try {
    await lastValueFrom(obs$);
    throw new Error('expected the observable to error');
  } catch (err) {
    return err;
  }
}

describe('RpcExceptionFilter', () => {
  it('maps a NotFoundException to statusCode 404', async () => {
    const payload: any = await caughtPayload(
      new NotFoundException('User not found'),
    );
    expect(payload.statusCode).toBe(404);
    expect(payload.message).toBe('User not found');
  });

  it('maps a ConflictException to statusCode 409', async () => {
    const payload: any = await caughtPayload(new ConflictException('exists'));
    expect(payload.statusCode).toBe(409);
  });

  it('maps a BadRequestException to statusCode 400', async () => {
    const payload: any = await caughtPayload(new BadRequestException('bad'));
    expect(payload.statusCode).toBe(400);
  });

  it('unwraps an RpcException carrying a statusCode', async () => {
    const payload: any = await caughtPayload(
      new RpcException({ statusCode: 403, message: 'forbidden' }),
    );
    expect(payload.statusCode).toBe(403);
    expect(payload.message).toBe('forbidden');
  });

  it('defaults an unknown error to statusCode 500', async () => {
    const payload: any = await caughtPayload(new Error('boom'));
    expect(payload.statusCode).toBe(500);
    expect(payload.message).toBe('boom');
  });
});
