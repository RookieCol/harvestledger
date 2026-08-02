import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HarvestService } from './harvests.service';

// Pure unit test with mocked repository, DataSource/outbox and ownership service.
describe('HarvestService', () => {
  let service: HarvestService;
  let harvestRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let manager: { create: jest.Mock; save: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let outbox: { enqueue: jest.Mock };
  let ownership: {
    assertCropOwner: jest.Mock;
    assertHarvestOwner: jest.Mock;
  };
  const s3Service = {} as any;
  const USER = 8;

  beforeEach(() => {
    harvestRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    manager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 21, ...data })),
    };
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    outbox = { enqueue: jest.fn() };
    ownership = {
      assertCropOwner: jest.fn(),
      assertHarvestOwner: jest.fn(),
    };

    service = new HarvestService(
      harvestRepository as any,
      s3Service,
      ownership as any,
      dataSource as any,
      outbox as any,
    );
  });

  describe('createHarvest', () => {
    it("propagates ForbiddenException when the crop isn't the user's", async () => {
      ownership.assertCropOwner.mockRejectedValue(new ForbiddenException());
      await expect(
        service.createHarvest(USER, { cropId: 5 } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(harvestRepository.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the crop already has a harvest', async () => {
      ownership.assertCropOwner.mockResolvedValue({
        id: 5,
        farm: { id: 2, userId: USER },
      });
      harvestRepository.find.mockResolvedValue([{ id: 1 }]); // isCropHaveHarvest -> true

      await expect(
        service.createHarvest(USER, { cropId: 5 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('saves and enqueues harvest.created when the crop is owned and unharvested', async () => {
      ownership.assertCropOwner.mockResolvedValue({
        id: 5,
        farm: { id: 2, userId: USER },
      });
      harvestRepository.find.mockResolvedValue([]); // no existing harvest

      const result = await service.createHarvest(USER, {
        cropId: 5,
        harvestDate: '2026-01-01',
      } as any);

      expect(ownership.assertCropOwner).toHaveBeenCalledWith(USER, 5);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.create.mock.calls[0][1]).toMatchObject({
        harvestDate: '2026-01-01',
        crop: { id: 5 },
      });
      expect(result.status).toBe('success');
      const [mgrArg, pattern, payload] = outbox.enqueue.mock.calls[0];
      expect(mgrArg).toBe(manager);
      expect(pattern).toBe('harvest.created');
      expect(payload).toMatchObject({ cropId: 5, farmId: 2, userId: USER });
    });
  });

  describe('deleteHarvest', () => {
    it('removes the harvest after the ownership check', async () => {
      const harvest = { id: 21 };
      ownership.assertHarvestOwner.mockResolvedValue(harvest);
      harvestRepository.remove.mockResolvedValue(harvest);

      const result = await service.deleteHarvest(USER, 21);

      expect(ownership.assertHarvestOwner).toHaveBeenCalledWith(USER, 21);
      expect(result.status).toBe('success');
      expect(harvestRepository.remove).toHaveBeenCalledWith(harvest);
    });

    it('propagates NotFoundException from the ownership check', async () => {
      ownership.assertHarvestOwner.mockRejectedValue(new NotFoundException());
      await expect(service.deleteHarvest(USER, 21)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(harvestRepository.remove).not.toHaveBeenCalled();
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
