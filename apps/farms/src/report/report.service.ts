import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository } from 'typeorm';

import {
  FarmEntity,
  RedisService,
  Role,
  UserProjectionEntity,
} from '@app/common';

// Reports are cached briefly — they are expensive and rarely need to be
// second-fresh. Keys are per-scope so a farmer's cache can't leak across users.
const REPORT_CACHE_TTL_SECONDS = 60;
const ADMIN_REPORT_KEY = 'report:admin';
const farmerReportKey = (farmerId: number) => `report:farmer:${farmerId}`;

// The whole ownership tree, loaded in a fixed number of queries (one per depth)
// instead of a per-farm/-crop N+1 walk. `FarmEntity` is the root now — `users`
// lives in a different database, so the tree can no longer start there.
const FARM_REPORT_RELATIONS = ['crops', 'crops.activities', 'crops.harvest'];

interface OwnerSummary {
  id: number;
  firstName?: string;
  lastName?: string | null;
  email?: string;
  rol?: string | null;
}

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(FarmEntity)
    private farmsRepository: Repository<FarmEntity>,
    @InjectRepository(UserProjectionEntity)
    private userProjectionRepository: Repository<UserProjectionEntity>,
    private readonly redisService: RedisService,
  ) {}

  async generateAdminReport(req_id: number) {
    const requester = await this.userProjectionRepository.findOne({
      where: { id: req_id },
    });
    // Defence in depth: the gateway RolesGuard is the primary check, but a
    // message put straight on the queue must not bypass it. This now checks
    // farms' own (eventually consistent) copy of the role, not auth's `users`
    // table directly — see the Phase 5 design spec for the trade-off.
    if (requester?.rol !== Role.Admin) {
      throw new ForbiddenException('Admin role required');
    }

    const cached = await this.redisService.get(ADMIN_REPORT_KEY);
    if (cached) {
      return { result: JSON.parse(cached), status: 'success' };
    }

    const farms = await this.farmsRepository.find({
      relations: FARM_REPORT_RELATIONS,
      relationLoadStrategy: 'query',
    });
    const owners = await this.userProjectionRepository.find();
    const ownerById = new Map(owners.map((owner) => [owner.id, owner]));

    const result = this.groupByOwner(farms, ownerById);

    await this.redisService.setWithTtl(
      ADMIN_REPORT_KEY,
      JSON.stringify(result),
      REPORT_CACHE_TTL_SECONDS,
    );
    return { result, status: 'success' };
  }

  async generateFarmerReport(farmer_id: number, req_id: number) {
    // A farmer can only pull their own report.
    if (farmer_id !== req_id) {
      throw new ForbiddenException('You can only access your own report');
    }

    const cacheKey = farmerReportKey(farmer_id);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return { result: JSON.parse(cached), status: 'success' };
    }

    const farms = await this.farmsRepository.find({
      where: { userId: Equal(farmer_id) },
      relations: FARM_REPORT_RELATIONS,
      relationLoadStrategy: 'query',
    });

    const result = farms.map((farm) => this.shapeFarm(farm));

    await this.redisService.setWithTtl(
      cacheKey,
      JSON.stringify(result),
      REPORT_CACHE_TTL_SECONDS,
    );
    return { result, status: 'success' };
  }

  private groupByOwner(
    farms: FarmEntity[],
    ownerById: Map<number, UserProjectionEntity>,
  ): Array<{ owner: OwnerSummary; farms: unknown[] }> {
    const byOwner = new Map<
      number,
      { owner: OwnerSummary; farms: unknown[] }
    >();

    for (const farm of farms) {
      if (!byOwner.has(farm.userId)) {
        const owner = ownerById.get(farm.userId);
        byOwner.set(farm.userId, {
          owner: owner
            ? {
                id: owner.id,
                firstName: owner.firstName,
                lastName: owner.lastName,
                email: owner.email,
                rol: owner.rol,
              }
            : { id: farm.userId },
          farms: [],
        });
      }
      byOwner.get(farm.userId).farms.push(this.shapeFarm(farm));
    }

    return Array.from(byOwner.values());
  }

  // Normalise the entity's `crop.harvest` relation to the `crop.harvests` the
  // report writer expects.
  private shapeFarm(farm: FarmEntity) {
    return {
      ...farm,
      crops: (farm.crops ?? []).map((crop) => ({
        ...crop,
        activities: crop.activities ?? [],
        harvests: crop.harvest ?? [],
      })),
    };
  }
}
