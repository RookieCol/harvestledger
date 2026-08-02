import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OwnershipService } from './ownership.service';

// Pure unit test: the four repositories are mocked, so nothing touches Postgres.
//
// This is the IDOR guard — the single place that decides whether a user may
// touch a resource. The invariants asserted here are the ones that must hold
// whatever the data layer looks like underneath:
//   - missing resource        → 404 (not 403: don't leak existence... see below)
//   - someone else's resource → 403
//   - owner cannot be resolved → 403 (fail closed)
// How the owner id is *reached* (a plain `farm.userId` scalar since the Phase 5
// database split; previously an eager `farm.user` relation) is deliberately not
// asserted — that is an implementation detail.
describe('OwnershipService', () => {
  let farmsRepository: { findOne: jest.Mock };
  let cropsRepository: { findOne: jest.Mock };
  let activitiesRepository: { findOne: jest.Mock };
  let harvestsRepository: { findOne: jest.Mock };
  let service: OwnershipService;

  const OWNER = 9;
  const INTRUDER = 10;

  beforeEach(() => {
    farmsRepository = { findOne: jest.fn() };
    cropsRepository = { findOne: jest.fn() };
    activitiesRepository = { findOne: jest.fn() };
    harvestsRepository = { findOne: jest.fn() };

    service = new OwnershipService(
      farmsRepository as any,
      cropsRepository as any,
      activitiesRepository as any,
      harvestsRepository as any,
    );
  });

  describe('assertFarmOwner', () => {
    it('returns the farm when it belongs to the caller', async () => {
      const farm = { id: 3, userId: OWNER };
      farmsRepository.findOne.mockResolvedValue(farm);

      await expect(service.assertFarmOwner(OWNER, 3)).resolves.toBe(farm);
      expect(farmsRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 3 } }),
      );
    });

    it('throws NotFoundException when the farm does not exist', async () => {
      farmsRepository.findOne.mockResolvedValue(null);

      await expect(service.assertFarmOwner(OWNER, 3)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the farm belongs to another user', async () => {
      farmsRepository.findOne.mockResolvedValue({ id: 3, userId: OWNER });

      await expect(service.assertFarmOwner(INTRUDER, 3)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('fails closed when the owner cannot be resolved', async () => {
      // A farm row with no owner attached must never be readable. If the
      // ownership check ever degrades to "no owner loaded ⇒ allow", this is
      // the test that catches it.
      farmsRepository.findOne.mockResolvedValue({ id: 3 });

      await expect(service.assertFarmOwner(OWNER, 3)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('assertCropOwner', () => {
    it('returns the crop when its farm belongs to the caller', async () => {
      const crop = { id: 1, farm: { id: 3, userId: OWNER } };
      cropsRepository.findOne.mockResolvedValue(crop);

      await expect(service.assertCropOwner(OWNER, 1)).resolves.toBe(crop);
      expect(cropsRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
    });

    it('throws NotFoundException when the crop does not exist', async () => {
      cropsRepository.findOne.mockResolvedValue(null);

      await expect(service.assertCropOwner(OWNER, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws ForbiddenException when the crop's farm belongs to another user", async () => {
      cropsRepository.findOne.mockResolvedValue({
        id: 1,
        farm: { id: 3, userId: OWNER },
      });

      await expect(service.assertCropOwner(INTRUDER, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('fails closed when the crop has no farm attached', async () => {
      cropsRepository.findOne.mockResolvedValue({ id: 1 });

      await expect(service.assertCropOwner(OWNER, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('assertActivityOwner', () => {
    it('returns the activity when the crop → farm chain belongs to the caller', async () => {
      const activity = {
        id: 7,
        crop: { id: 1, farm: { id: 3, userId: OWNER } },
      };
      activitiesRepository.findOne.mockResolvedValue(activity);

      await expect(service.assertActivityOwner(OWNER, 7)).resolves.toBe(
        activity,
      );
      expect(activitiesRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7 } }),
      );
    });

    it('throws NotFoundException when the activity does not exist', async () => {
      activitiesRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assertActivityOwner(OWNER, 7),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when the chain leads to another user', async () => {
      activitiesRepository.findOne.mockResolvedValue({
        id: 7,
        crop: { id: 1, farm: { id: 3, userId: OWNER } },
      });

      await expect(
        service.assertActivityOwner(INTRUDER, 7),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('fails closed when the crop has no farm attached', async () => {
      activitiesRepository.findOne.mockResolvedValue({
        id: 7,
        crop: { id: 1 },
      });

      await expect(
        service.assertActivityOwner(OWNER, 7),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('fails closed when the activity has no crop attached', async () => {
      activitiesRepository.findOne.mockResolvedValue({ id: 7 });

      await expect(
        service.assertActivityOwner(OWNER, 7),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertHarvestOwner', () => {
    it('returns the harvest when the crop → farm chain belongs to the caller', async () => {
      const harvest = {
        id: 5,
        crop: { id: 1, farm: { id: 3, userId: OWNER } },
      };
      harvestsRepository.findOne.mockResolvedValue(harvest);

      await expect(service.assertHarvestOwner(OWNER, 5)).resolves.toBe(harvest);
      expect(harvestsRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5 } }),
      );
    });

    it('throws NotFoundException when the harvest does not exist', async () => {
      harvestsRepository.findOne.mockResolvedValue(null);

      await expect(service.assertHarvestOwner(OWNER, 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the chain leads to another user', async () => {
      harvestsRepository.findOne.mockResolvedValue({
        id: 5,
        crop: { id: 1, farm: { id: 3, userId: OWNER } },
      });

      await expect(
        service.assertHarvestOwner(INTRUDER, 5),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('fails closed when the crop has no farm attached', async () => {
      harvestsRepository.findOne.mockResolvedValue({ id: 5, crop: { id: 1 } });

      await expect(service.assertHarvestOwner(OWNER, 5)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('fails closed when the harvest has no crop attached', async () => {
      harvestsRepository.findOne.mockResolvedValue({ id: 5 });

      await expect(service.assertHarvestOwner(OWNER, 5)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // 404-vs-403 is a deliberate design decision documented on the service: a
  // missing resource is a 404 even for a stranger. Pinned here so it is a
  // choice someone has to consciously revisit rather than drift away from.
  it('distinguishes a missing resource (404) from someone else’s (403)', async () => {
    cropsRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.assertCropOwner(INTRUDER, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    cropsRepository.findOne.mockResolvedValueOnce({
      id: 99,
      farm: { id: 3, userId: OWNER },
    });
    await expect(service.assertCropOwner(INTRUDER, 99)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
