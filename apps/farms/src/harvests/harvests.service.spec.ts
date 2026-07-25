import { ConflictException } from '@nestjs/common';
import { HarvestService } from './harvests.service';

// Pure unit test with mocked repositories and tracing client.
describe('HarvestService', () => {
  let service: HarvestService;
  let harvestRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let cropsRepository: { findOne: jest.Mock };
  let tracingClient: { emit: jest.Mock };
  const s3Service = {} as any;

  beforeEach(() => {
    harvestRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    cropsRepository = { findOne: jest.fn() };
    tracingClient = { emit: jest.fn() };

    service = new HarvestService(
      harvestRepository as any,
      cropsRepository as any,
      s3Service,
      tracingClient as any,
    );
  });

  describe('createHarvest', () => {
    it('throws ConflictException when the crop already has a harvest', async () => {
      // isCropHaveHarvest -> find returns a non-empty array
      harvestRepository.find.mockResolvedValue([{ id: 1 }]);

      await expect(
        service.createHarvest({ cropId: 5 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(harvestRepository.save).not.toHaveBeenCalled();
      expect(tracingClient.emit).not.toHaveBeenCalled();
    });

    it('maps cropId to the crop relation, saves, and emits harvest.created', async () => {
      harvestRepository.find.mockResolvedValue([]); // no existing harvest
      const created = { id: 21, harvestDate: '2026-01-01', crop: { id: 5 } };
      harvestRepository.create.mockReturnValue(created);
      harvestRepository.save.mockResolvedValue(created);
      cropsRepository.findOne.mockResolvedValue({
        id: 5,
        farm: { id: 2, user: { id: 8 } },
      });

      const result = await service.createHarvest({
        cropId: 5,
        harvestDate: '2026-01-01',
      } as any);

      expect(harvestRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          harvestDate: '2026-01-01',
          crop: { id: 5 },
        }),
      );
      expect(harvestRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ cropId: 5 }),
      );

      expect(result.status).toBe('success');
      expect(tracingClient.emit).toHaveBeenCalledTimes(1);
      const [event, payload] = tracingClient.emit.mock.calls[0];
      expect(event).toBe('harvest.created');
      expect(payload).toMatchObject({ cropId: 5, farmId: 2, userId: 8 });
    });
  });

  describe('isCropHaveHarvest', () => {
    it('returns false when there are no harvests', async () => {
      harvestRepository.find.mockResolvedValue([]);
      await expect(service.isCropHaveHarvest(5)).resolves.toBe(false);
    });

    it('returns true when a harvest exists', async () => {
      harvestRepository.find.mockResolvedValue([{ id: 1 }]);
      await expect(service.isCropHaveHarvest(5)).resolves.toBe(true);
    });
  });
});
