import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

// Pure unit test with mocked repository, DataSource/outbox and ownership service.
describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let activitiesRepository: {
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
    assertActivityOwner: jest.Mock;
  };
  const s3Service = {} as any;
  const USER = 8;

  beforeEach(() => {
    activitiesRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    manager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 11, ...data })),
    };
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    outbox = { enqueue: jest.fn() };
    ownership = {
      assertCropOwner: jest.fn(),
      assertActivityOwner: jest.fn(),
    };

    service = new ActivitiesService(
      activitiesRepository as any,
      s3Service,
      ownership as any,
      dataSource as any,
      outbox as any,
    );
  });

  describe('createActivity', () => {
    it('asserts ownership, maps cropId to the relation, and enqueues activity.created', async () => {
      ownership.assertCropOwner.mockResolvedValue({
        id: 5,
        farm: { id: 2, user: { id: USER } },
      });

      const result = await service.createActivity(USER, {
        cropId: 5,
        type: 'fertilizer',
      } as any);

      expect(ownership.assertCropOwner).toHaveBeenCalledWith(USER, 5);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.create.mock.calls[0][1]).toMatchObject({
        type: 'fertilizer',
        crop: { id: 5 },
      });
      expect(result.status).toBe('success');
      const [mgrArg, pattern, payload] = outbox.enqueue.mock.calls[0];
      expect(mgrArg).toBe(manager);
      expect(pattern).toBe('activity.created');
      expect(payload).toMatchObject({ cropId: 5, farmId: 2, userId: USER });
    });

    it("propagates ForbiddenException when the crop isn't the user's", async () => {
      ownership.assertCropOwner.mockRejectedValue(new ForbiddenException());
      await expect(
        service.createActivity(USER, { cropId: 5 } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('deleteActivity', () => {
    it('removes the activity after the ownership check', async () => {
      const activity = { id: 11 };
      ownership.assertActivityOwner.mockResolvedValue(activity);
      activitiesRepository.remove.mockResolvedValue(activity);

      const result = await service.deleteActivity(USER, 11);

      expect(ownership.assertActivityOwner).toHaveBeenCalledWith(USER, 11);
      expect(result.status).toBe('success');
      expect(activitiesRepository.remove).toHaveBeenCalledWith(activity);
    });

    it('propagates NotFoundException from the ownership check', async () => {
      ownership.assertActivityOwner.mockRejectedValue(new NotFoundException());
      await expect(service.deleteActivity(USER, 11)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(activitiesRepository.remove).not.toHaveBeenCalled();
    });
  });
});
