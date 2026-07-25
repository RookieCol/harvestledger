import { TracingService } from './tracing.service';

// Pure unit test: the Mongoose model is mocked as a constructor with a
// `save` on each instance plus a static `find(...).sort(...).exec()` chain;
// Redis is mocked for the idempotency checks.
describe('TracingService', () => {
  let service: TracingService;
  let saved: any[];
  let modelMock: jest.Mock & { find: jest.Mock };
  let redis: { setIfAbsent: jest.Mock; del: jest.Mock };

  beforeEach(() => {
    saved = [];
    modelMock = jest.fn().mockImplementation((doc) => ({
      ...doc,
      save: jest.fn().mockImplementation(function (this: any) {
        saved.push(doc);
        return Promise.resolve(doc);
      }),
    })) as any;
    redis = { setIfAbsent: jest.fn().mockResolvedValue(true), del: jest.fn() };

    service = new TracingService(modelMock as any, redis as any);
  });

  const data = {
    cropId: 5,
    farmId: 2,
    userId: 8,
    payload: { id: 11, foo: 'bar' },
  } as any;

  describe('recordEvent', () => {
    it('claims an idempotency key and saves the document the first time', async () => {
      await service.recordEvent('ACTIVITY_CREATED', data);

      expect(redis.setIfAbsent).toHaveBeenCalledWith(
        'idem:tracing:ACTIVITY_CREATED:11',
        '1',
        expect.any(Number),
      );
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        eventType: 'ACTIVITY_CREATED',
        cropId: 5,
        farmId: 2,
        userId: 8,
      });
    });

    it('tolerates a payload without an id (key ends in undefined)', async () => {
      await service.recordEvent('CROP_INITIALIZED', {
        cropId: 5,
        farmId: 2,
        userId: 8,
        payload: null,
      } as any);

      expect(redis.setIfAbsent).toHaveBeenCalledWith(
        'idem:tracing:CROP_INITIALIZED:undefined',
        '1',
        expect.any(Number),
      );
      expect(saved).toHaveLength(1);
    });

    it('skips (dedupes) when the key already exists', async () => {
      redis.setIfAbsent.mockResolvedValue(false);

      const result = await service.recordEvent('ACTIVITY_CREATED', data);

      expect(result).toEqual({ deduped: true });
      expect(saved).toHaveLength(0);
    });

    it('rolls back the idempotency key when the save fails', async () => {
      modelMock.mockImplementationOnce((doc) => ({
        ...doc,
        save: jest.fn().mockRejectedValue(new Error('mongo down')),
      }));

      await expect(
        service.recordEvent('HARVEST_CREATED', data),
      ).rejects.toThrow('mongo down');
      expect(redis.del).toHaveBeenCalledWith('idem:tracing:HARVEST_CREATED:11');
    });
  });

  describe('getHistory', () => {
    it('queries by cropId sorted by occurredAt ascending', async () => {
      const events = [{ id: 1 }, { id: 2 }];
      const exec = jest.fn().mockResolvedValue(events);
      const sort = jest.fn().mockReturnValue({ exec });
      modelMock.find = jest.fn().mockReturnValue({ sort });

      const result = await service.getHistory(5);

      expect(modelMock.find).toHaveBeenCalledWith({ cropId: 5 });
      expect(sort).toHaveBeenCalledWith({ occurredAt: 1 });
      expect(result).toBe(events);
    });
  });
});
