import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CropsService } from './crops.service';

// Pure unit test: repositories, S3, the tracing client and the ownership
// service are all mocked, so nothing touches Postgres, S3, or the broker.
describe('CropsService', () => {
  let service: CropsService;
  let cropsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let farmsRepository: { findOne: jest.Mock };
  let tracingClient: { emit: jest.Mock };
  let ownership: {
    assertFarmOwner: jest.Mock;
    assertCropOwner: jest.Mock;
  };
  const s3Service = {} as any;
  const USER = 9;

  beforeEach(() => {
    cropsRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    farmsRepository = { findOne: jest.fn() };
    tracingClient = { emit: jest.fn() };
    ownership = {
      assertFarmOwner: jest.fn(),
      assertCropOwner: jest.fn(),
    };

    service = new CropsService(
      cropsRepository as any,
      farmsRepository as any,
      s3Service,
      ownership as any,
      tracingClient as any,
    );
  });

  describe('createCrop', () => {
    it('asserts farm ownership, saves, and emits crop.initialized', async () => {
      const dto = { name: 'Tomatoes', farmId: 3 } as any;
      ownership.assertFarmOwner.mockResolvedValue({
        id: 3,
        user: { id: USER },
      });
      cropsRepository.create.mockReturnValue(dto);
      cropsRepository.save.mockResolvedValue({ id: 42, ...dto });

      const result = await service.createCrop(USER, dto);

      expect(ownership.assertFarmOwner).toHaveBeenCalledWith(USER, 3);
      // farmId must be mapped to the farm relation, not passed as a plain field.
      expect(cropsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Tomatoes', farm: { id: 3 } }),
      );
      expect(cropsRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ farmId: 3 }),
      );
      expect(result.status).toBe('success');
      const [event, payload] = tracingClient.emit.mock.calls[0];
      expect(event).toBe('crop.initialized');
      expect(payload).toMatchObject({ cropId: 42, farmId: 3, userId: USER });
    });

    it("propagates ForbiddenException when the farm isn't the user's", async () => {
      ownership.assertFarmOwner.mockRejectedValue(new ForbiddenException());
      await expect(
        service.createCrop(USER, { farmId: 3 } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(cropsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateCrop', () => {
    it('updates the crop returned by the ownership check', async () => {
      ownership.assertCropOwner.mockResolvedValue({ id: 1, name: 'old' });
      cropsRepository.save.mockResolvedValue(undefined);

      const result = await service.updateCrop(USER, { name: 'new' }, 1);

      expect(ownership.assertCropOwner).toHaveBeenCalledWith(USER, 1);
      expect(result.status).toBe('success');
      expect(cropsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, name: 'new' }),
      );
    });

    it('propagates NotFoundException from the ownership check', async () => {
      ownership.assertCropOwner.mockRejectedValue(new NotFoundException());
      await expect(
        service.updateCrop(USER, { name: 'x' }, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(cropsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('deleteCrop', () => {
    it('removes the crop after the ownership check', async () => {
      const crop = { id: 1 };
      ownership.assertCropOwner.mockResolvedValue(crop);
      cropsRepository.remove.mockResolvedValue(undefined);

      const result = await service.deleteCrop(USER, 1);

      expect(ownership.assertCropOwner).toHaveBeenCalledWith(USER, 1);
      expect(result.status).toBe('success');
      expect(cropsRepository.remove).toHaveBeenCalledWith(crop);
    });

    it('propagates ForbiddenException from the ownership check', async () => {
      ownership.assertCropOwner.mockRejectedValue(new ForbiddenException());
      await expect(service.deleteCrop(USER, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(cropsRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('findCropById', () => {
    it('returns the crop from the ownership check', async () => {
      ownership.assertCropOwner.mockResolvedValue({ id: 1 });
      const result = await service.findCropById(USER, 1);
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ id: 1 });
    });
  });
});
