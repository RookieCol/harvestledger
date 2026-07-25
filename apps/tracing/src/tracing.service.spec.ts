import { TracingService } from './tracing.service';

// Pure unit test: the Mongoose model is mocked as a constructor with a
// `save` on each instance plus a static `find(...).sort(...).exec()` chain.
describe('TracingService', () => {
  let service: TracingService;
  let saved: any[];
  let modelMock: jest.Mock & { find: jest.Mock };

  beforeEach(() => {
    saved = [];
    modelMock = jest.fn().mockImplementation((doc) => ({
      ...doc,
      save: jest.fn().mockImplementation(function (this: any) {
        saved.push(doc);
        return Promise.resolve(doc);
      }),
    })) as any;

    service = new TracingService(modelMock as any);
  });

  describe('recordEvent', () => {
    it('builds and saves a document with the event type, ids and payload', async () => {
      const data = {
        cropId: 5,
        farmId: 2,
        userId: 8,
        payload: { id: 11, foo: 'bar' },
      };

      await service.recordEvent('ACTIVITY_CREATED', data as any);

      expect(saved).toHaveLength(1);
      const doc = saved[0];
      expect(doc.eventType).toBe('ACTIVITY_CREATED');
      expect(doc.cropId).toBe(5);
      expect(doc.farmId).toBe(2);
      expect(doc.userId).toBe(8);
      expect(doc.payload).toEqual({ id: 11, foo: 'bar' });
      expect(doc.occurredAt).toBeInstanceOf(Date);
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
