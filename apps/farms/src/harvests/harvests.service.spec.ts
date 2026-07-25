import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HarvestService } from './harvests.service';

// Pure unit test with mocked repository, tracing client and ownership service.
describe('HarvestService', () => {
  let service: HarvestService;
  let harvestRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let tracingClient: { emit: jest.Mock };
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
    tracingClient = { emit: jest.fn() };
    ownership = {
      assertCropOwner: jest.fn(),
      assertHarvestOwner: jest.fn(),
    };

    service = new HarvestService(
      harvestRepository as any,
      s3Service,
      ownership as any,
      tracingClient as any,
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
        farm: { id: 2, user: { id: USER } },
      });
      harvestRepository.find.mockResolvedValue([{ id: 1 }]); // isCropHaveHarvest -> true

      await expect(
        service.createHarvest(USER, { cropId: 5 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(harvestRepository.save).not.toHaveBeenCalled();
      expect(tracingClient.emit).not.toHaveBeenCalled();
    });

    it('saves and emits harvest.created when the crop is owned and unharvested', async () => {
      ownership.assertCropOwner.mockResolvedValue({
        id: 5,
        farm: { id: 2, user: { id: USER } },
      });
      harvestRepository.find.mockResolvedValue([]); // no existing harvest
      const created = { id: 21, harvestDate: '2026-01-01', crop: { id: 5 } };
      harvestRepository.create.mockReturnValue(created);
      harvestRepository.save.mockResolvedValue(created);

      const result = await service.createHarvest(USER, {
        cropId: 5,
        harvestDate: '2026-01-01',
      } as any);

      expect(ownership.assertCropOwner).toHaveBeenCalledWith(USER, 5);
      expect(harvestRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          harvestDate: '2026-01-01',
          crop: { id: 5 },
        }),
      );
      expect(result.status).toBe('success');
      const [event, payload] = tracingClient.emit.mock.calls[0];
      expect(event).toBe('harvest.created');
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
