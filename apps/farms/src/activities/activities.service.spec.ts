import { NotFoundException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

// Pure unit test with mocked repositories and tracing client.
describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let activitiesRepository: {
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
    activitiesRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    cropsRepository = { findOne: jest.fn() };
    tracingClient = { emit: jest.fn() };

    service = new ActivitiesService(
      activitiesRepository as any,
      cropsRepository as any,
      s3Service,
      tracingClient as any,
    );
  });

  describe('createActivity', () => {
    it('maps cropId to the crop relation, saves, and emits activity.created', async () => {
      const created = { id: 11, type: 'fertilizer', crop: { id: 5 } };
      activitiesRepository.create.mockReturnValue(created);
      activitiesRepository.save.mockResolvedValue(created);
      cropsRepository.findOne.mockResolvedValue({
        id: 5,
        farm: { id: 2, user: { id: 8 } },
      });

      const result = await service.createActivity({
        cropId: 5,
        type: 'fertilizer',
      } as any);

      // cropId must be translated into a crop relation on the created entity
      expect(activitiesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'fertilizer', crop: { id: 5 } }),
      );
      expect(activitiesRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ cropId: 5 }),
      );

      expect(result.status).toBe('success');
      expect(tracingClient.emit).toHaveBeenCalledTimes(1);
      const [event, payload] = tracingClient.emit.mock.calls[0];
      expect(event).toBe('activity.created');
      expect(payload).toMatchObject({ cropId: 5, farmId: 2, userId: 8 });
      expect(payload.payload).toBe(created);
    });
  });

  describe('findActivitiesByCropId', () => {
    it('returns the activities for a crop', async () => {
      activitiesRepository.find.mockResolvedValue([{ id: 1 }]);
      const result = await service.findActivitiesByCropId(5);
      expect(result.status).toBe('success');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('deleteActivity', () => {
    it('throws NotFoundException when the activity is missing', async () => {
      activitiesRepository.find.mockResolvedValue([]);
      await expect(service.deleteActivity(1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(activitiesRepository.remove).not.toHaveBeenCalled();
    });
  });
});
