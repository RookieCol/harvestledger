import { of, throwError, lastValueFrom } from 'rxjs';
import { RmqReliabilityInterceptor } from './rmq-reliability.interceptor';

function makeContext(replyTo: string | undefined) {
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const message = { properties: { replyTo } };
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
  const interceptor = new RmqReliabilityInterceptor();

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

  it('nacks (no requeue) on error when it is an event (no replyTo)', async () => {
    const { ctx, channel, message } = makeContext(undefined);
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, {
          handle: () => throwError(() => new Error('boom')),
        } as any),
      ),
    ).rejects.toThrow('boom');
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
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
