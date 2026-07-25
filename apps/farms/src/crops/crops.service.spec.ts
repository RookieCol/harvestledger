import { CropsService } from './crops.service';

// Pure unit test: repositories, S3 and the tracing RabbitMQ client are all
// mocked, so nothing touches Postgres, S3, or the broker.
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
  const s3Service = {} as any;

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

    service = new CropsService(
      cropsRepository as any,
      farmsRepository as any,
      s3Service,
      tracingClient as any,
    );
  });

  describe('createCrop', () => {
    it('saves the crop and emits crop.initialized with resolved ids', async () => {
      const dto = { name: 'Tomatoes', farmId: 3 } as any;
      cropsRepository.create.mockReturnValue(dto);
      cropsRepository.save.mockResolvedValue({ id: 42, ...dto });
      farmsRepository.findOne.mockResolvedValue({ id: 3, user: { id: 9 } });

      const result = await service.createCrop(dto);

      expect(result.status).toBe('success');
      expect(tracingClient.emit).toHaveBeenCalledTimes(1);
      const [event, payload] = tracingClient.emit.mock.calls[0];
      expect(event).toBe('crop.initialized');
      expect(payload).toMatchObject({ cropId: 42, farmId: 3, userId: 9 });
    });
  });

  describe('findCropById', () => {
    it('returns 200 with the crop when found', async () => {
      cropsRepository.findOne.mockResolvedValue({ id: 1 });
      const result = await service.findCropById(1);
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ id: 1 });
    });

    it('returns 400 when the crop is missing', async () => {
      cropsRepository.findOne.mockResolvedValue(null);
      const result = await service.findCropById(1);
      expect(result.status).toBe(400);
    });
  });

  describe('updateCrop', () => {
    it('returns an error when the crop does not exist', async () => {
      cropsRepository.findOne.mockResolvedValue(null);
      const result = await service.updateCrop({ name: 'x' }, 1);
      expect(result.status).toBe('error');
      expect(cropsRepository.save).not.toHaveBeenCalled();
    });

    it('merges the update and saves when the crop exists', async () => {
      cropsRepository.findOne.mockResolvedValue({ id: 1, name: 'old' });
      cropsRepository.save.mockResolvedValue(undefined);
      const result = await service.updateCrop({ name: 'new' }, 1);
      expect(result.status).toBe('success');
      expect(cropsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, name: 'new' }),
      );
    });
  });

  describe('deleteCrop', () => {
    it('returns an error when no crop matches', async () => {
      cropsRepository.find.mockResolvedValue([]);
      const result = await service.deleteCrop(1);
      expect(result.status).toBe('error');
      expect(cropsRepository.remove).not.toHaveBeenCalled();
    });

    it('removes the crop when found', async () => {
      cropsRepository.find.mockResolvedValue([{ id: 1 }]);
      cropsRepository.remove.mockResolvedValue(undefined);
      const result = await service.deleteCrop(1);
      expect(result.status).toBe('success');
      expect(cropsRepository.remove).toHaveBeenCalled();
    });
  });
});
