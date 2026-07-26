import { of, throwError, lastValueFrom } from 'rxjs';
import { RmqReliabilityInterceptor } from './rmq-reliability.interceptor';

function makeContext(replyTo: string | undefined, headers?: any) {
  const channel = {
    ack: jest.fn(),
    nack: jest.fn(),
    sendToQueue: jest.fn(),
  };
  const message = {
    properties: { replyTo, headers },
    content: Buffer.from('x'),
  };
  const ctx: any = {
    getType: () => 'rpc',
    switchToRpc: () => ({
      getContext: () => ({
        getChannelRef: () => channel,
        getMessage: () => message,
      }),
    }),
  };
  return { ctx, channel, message };
}

describe('RmqReliabilityInterceptor', () => {
  const interceptor = new RmqReliabilityInterceptor({
    maxRetries: 3,
    retryQueue: 'tracing_queue.retry',
    deadLetterQueue: 'tracing_queue.dlq',
  });

  it('acks on success (RPC)', async () => {
    const { ctx, channel, message } = makeContext('amq.reply-to');
    await lastValueFrom(
      interceptor.intercept(ctx, { handle: () => of('ok') } as any),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('acks on error when RPC (reply carries the outcome)', async () => {
    const { ctx, channel, message } = makeContext('amq.reply-to');
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, {
          handle: () => throwError(() => new Error('boom')),
        } as any),
      ),
    ).rejects.toThrow('boom');
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('republishes to the retry queue (with an incremented counter) and acks while retries remain', async () => {
    const { ctx, channel, message } = makeContext(undefined, {
      'x-retry-count': 1,
    });
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, {
          handle: () => throwError(() => new Error('boom')),
        } as any),
      ),
    ).rejects.toThrow('boom');
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'tracing_queue.retry',
      message.content,
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-retry-count': 2 }),
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('parks the event in the DLQ and acks once retries are exhausted', async () => {
    const { ctx, channel, message } = makeContext(undefined, {
      'x-retry-count': 3, // >= maxRetries 3
    });
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, {
          handle: () => throwError(() => new Error('boom')),
        } as any),
      ),
    ).rejects.toThrow('boom');
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'tracing_queue.dlq',
      message.content,
      expect.any(Object),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('republishes to retry on the first failure (no counter yet)', async () => {
    const { ctx, channel } = makeContext(undefined, undefined);
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, {
          handle: () => throwError(() => new Error('boom')),
        } as any),
      ),
    ).rejects.toThrow('boom');
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'tracing_queue.retry',
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-retry-count': 1 }),
      }),
    );
  });

  it('acks an event on success', async () => {
    const { ctx, channel, message } = makeContext(undefined);
    await lastValueFrom(
      interceptor.intercept(ctx, { handle: () => of(undefined) } as any),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('passes non-rpc contexts straight through', async () => {
    const ctx: any = { getType: () => 'http' };
    const result = await lastValueFrom(
      interceptor.intercept(ctx, { handle: () => of('x') } as any),
    );
    expect(result).toBe('x');
  });
});
