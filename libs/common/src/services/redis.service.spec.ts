import { RedisService } from './redis.service';

describe('RedisService', () => {
  let client: {
    get: jest.Mock;
    set: jest.Mock;
    exists: jest.Mock;
    del: jest.Mock;
    disconnect: jest.Mock;
  };
  let service: RedisService;

  beforeEach(() => {
    client = {
      get: jest.fn(),
      set: jest.fn(),
      exists: jest.fn(),
      del: jest.fn(),
      disconnect: jest.fn(),
    };
    service = new RedisService(client as any);
  });

  it('setWithTtl writes with an EX expiry', async () => {
    client.set.mockResolvedValue('OK');
    await service.setWithTtl('k', 'v', 30);
    expect(client.set).toHaveBeenCalledWith('k', 'v', 'EX', 30);
  });

  describe('setIfAbsent (idempotency primitive)', () => {
    it('returns true when the key was newly set', async () => {
      client.set.mockResolvedValue('OK');
      await expect(service.setIfAbsent('k', 'v', 30)).resolves.toBe(true);
      expect(client.set).toHaveBeenCalledWith('k', 'v', 'EX', 30, 'NX');
    });

    it('returns false when the key already existed', async () => {
      client.set.mockResolvedValue(null);
      await expect(service.setIfAbsent('k', 'v', 30)).resolves.toBe(false);
    });
  });

  describe('exists', () => {
    it('returns true when the key exists', async () => {
      client.exists.mockResolvedValue(1);
      await expect(service.exists('k')).resolves.toBe(true);
    });

    it('returns false when the key is absent', async () => {
      client.exists.mockResolvedValue(0);
      await expect(service.exists('k')).resolves.toBe(false);
    });
  });

  it('disconnects the client on module destroy', () => {
    service.onModuleDestroy();
    expect(client.disconnect).toHaveBeenCalled();
  });
});
