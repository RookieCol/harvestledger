import { ForbiddenException } from '@nestjs/common';
import { ReportService } from './report.service';

describe('ReportService', () => {
  let userRepository: { findOne: jest.Mock; find: jest.Mock };
  let redis: { get: jest.Mock; setWithTtl: jest.Mock };
  let service: ReportService;

  beforeEach(() => {
    userRepository = { findOne: jest.fn(), find: jest.fn() };
    redis = { get: jest.fn().mockResolvedValue(null), setWithTtl: jest.fn() };
    service = new ReportService(userRepository as any, redis as any);
  });

  describe('generateAdminReport', () => {
    it('throws ForbiddenException for a non-admin', async () => {
      userRepository.findOne.mockResolvedValue({ id: 1, rol: 'farmer' });
      await expect(service.generateAdminReport(1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('loads the whole tree in one nested read and caches it (no N+1)', async () => {
      userRepository.findOne.mockResolvedValue({ id: 1, rol: 'admin' });
      userRepository.find.mockResolvedValue([
        {
          id: 1,
          farms: [{ id: 1, crops: [{ id: 1, activities: [], harvest: [] }] }],
        },
      ]);

      const result = await service.generateAdminReport(1);

      // A single find with nested relations replaces the per-user/-farm/-crop walk.
      expect(userRepository.find).toHaveBeenCalledTimes(1);
      expect(userRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: expect.arrayContaining(['farms.crops.activities']),
          relationLoadStrategy: 'query',
        }),
      );
      // crop.harvest is normalised to crop.harvests for the report writer.
      expect(result.result[0].farms[0].crops[0]).toHaveProperty('harvests');
      expect(redis.setWithTtl).toHaveBeenCalledWith(
        'report:admin',
        expect.any(String),
        expect.any(Number),
      );
    });

    it('returns the cached report without querying when present', async () => {
      userRepository.findOne.mockResolvedValue({ id: 1, rol: 'admin' });
      redis.get.mockResolvedValue(JSON.stringify([{ id: 1, cached: true }]));

      const result = await service.generateAdminReport(1);

      expect(userRepository.find).not.toHaveBeenCalled();
      expect(result.result[0].cached).toBe(true);
    });
  });

  describe('generateFarmerReport', () => {
    it('throws ForbiddenException when requesting another farmer', async () => {
      await expect(service.generateFarmerReport(2, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns the farms tree for the requester and caches it', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 1,
        farms: [{ id: 1, crops: [] }],
      });

      const result = await service.generateFarmerReport(1, 1);

      expect(userRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ relationLoadStrategy: 'query' }),
      );
      expect(Array.isArray(result.result)).toBe(true);
      expect(redis.setWithTtl).toHaveBeenCalledWith(
        'report:farmer:1',
        expect.any(String),
        expect.any(Number),
      );
    });
  });
});
