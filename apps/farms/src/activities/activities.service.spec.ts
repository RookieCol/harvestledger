import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

// Pure unit test with mocked repository, tracing client and ownership service.
describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let activitiesRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let tracingClient: { emit: jest.Mock };
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
    tracingClient = { emit: jest.fn() };
    ownership = {
      assertCropOwner: jest.fn(),
      assertActivityOwner: jest.fn(),
    };

    service = new ActivitiesService(
      activitiesRepository as any,
      s3Service,
      ownership as any,
      tracingClient as any,
    );
  });

  describe('createActivity', () => {
    it('asserts crop ownership, maps cropId to the relation, and emits activity.created', async () => {
      ownership.assertCropOwner.mockResolvedValue({
        id: 5,
        farm: { id: 2, user: { id: USER } },
      });
      const created = { id: 11, type: 'fertilizer', crop: { id: 5 } };
      activitiesRepository.create.mockReturnValue(created);
      activitiesRepository.save.mockResolvedValue(created);

      const result = await service.createActivity(USER, {
        cropId: 5,
        type: 'fertilizer',
      } as any);

      expect(ownership.assertCropOwner).toHaveBeenCalledWith(USER, 5);
      expect(activitiesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'fertilizer', crop: { id: 5 } }),
      );
      expect(result.status).toBe('success');
      const [event, payload] = tracingClient.emit.mock.calls[0];
      expect(event).toBe('activity.created');
      expect(payload).toMatchObject({ cropId: 5, farmId: 2, userId: USER });
    });

    it("propagates ForbiddenException when the crop isn't the user's", async () => {
      ownership.assertCropOwner.mockRejectedValue(new ForbiddenException());
      await expect(
        service.createActivity(USER, { cropId: 5 } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(activitiesRepository.save).not.toHaveBeenCalled();
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
