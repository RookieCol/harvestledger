import { ForbiddenException } from '@nestjs/common';
import { ReportService } from './report.service';

describe('ReportService', () => {
  let farmsRepository: { find: jest.Mock };
  let userProjectionRepository: { findOne: jest.Mock; find: jest.Mock };
  let redis: { get: jest.Mock; setWithTtl: jest.Mock };
  let service: ReportService;

  beforeEach(() => {
    farmsRepository = { find: jest.fn() };
    userProjectionRepository = { findOne: jest.fn(), find: jest.fn() };
    redis = { get: jest.fn().mockResolvedValue(null), setWithTtl: jest.fn() };
    service = new ReportService(
      farmsRepository as any,
      userProjectionRepository as any,
      redis as any,
    );
  });

  describe('generateAdminReport', () => {
    it('throws ForbiddenException for a non-admin', async () => {
      userProjectionRepository.findOne.mockResolvedValue({
        id: 1,
        rol: 'farmer',
      });
      await expect(service.generateAdminReport(1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('groups farms by owner, using the local user_projection for owner metadata, and caches it', async () => {
      userProjectionRepository.findOne.mockResolvedValue({
        id: 1,
        rol: 'admin',
      });
      userProjectionRepository.find.mockResolvedValue([
        {
          id: 5,
          firstName: 'Ana',
          lastName: 'Diaz',
          email: 'a@x.com',
          rol: 'farmer',
        },
      ]);
      farmsRepository.find.mockResolvedValue([
        {
          id: 1,
          userId: 5,
          crops: [{ id: 1, activities: [], harvest: [] }],
        },
      ]);

      const result = await service.generateAdminReport(1);

      // One nested read for the whole tree — the N+1 walk must not come back.
      expect(farmsRepository.find).toHaveBeenCalledTimes(1);
      expect(farmsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: expect.arrayContaining(['crops.activities']),
          relationLoadStrategy: 'query',
        }),
      );
      expect(result.result).toEqual([
        expect.objectContaining({
          owner: expect.objectContaining({ id: 5, firstName: 'Ana' }),
          farms: [
            expect.objectContaining({
              id: 1,
              crops: [expect.objectContaining({ harvests: [] })],
            }),
          ],
        }),
      ]);
      expect(redis.setWithTtl).toHaveBeenCalledWith(
        'report:admin',
        expect.any(String),
        expect.any(Number),
      );
    });

    it('falls back to a bare owner id when no projection row exists yet (eventual consistency)', async () => {
      userProjectionRepository.findOne.mockResolvedValue({
        id: 1,
        rol: 'admin',
      });
      userProjectionRepository.find.mockResolvedValue([]);
      farmsRepository.find.mockResolvedValue([{ id: 1, userId: 9, crops: [] }]);

      const result = await service.generateAdminReport(1);

      expect(result.result[0].owner).toEqual({ id: 9 });
    });

    it('returns the cached report without querying when present', async () => {
      userProjectionRepository.findOne.mockResolvedValue({
        id: 1,
        rol: 'admin',
      });
      redis.get.mockResolvedValue(
        JSON.stringify([{ owner: { id: 1 }, farms: [] }]),
      );

      const result = await service.generateAdminReport(1);

      expect(farmsRepository.find).not.toHaveBeenCalled();
      expect(result.result[0].owner.id).toBe(1);
    });
  });

  describe('generateFarmerReport', () => {
    it('throws ForbiddenException when requesting another farmer', async () => {
      await expect(service.generateFarmerReport(2, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns the farms tree for the requester and caches it', async () => {
      farmsRepository.find.mockResolvedValue([{ id: 1, userId: 1, crops: [] }]);

      const result = await service.generateFarmerReport(1, 1);

      expect(farmsRepository.find).toHaveBeenCalledWith(
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
