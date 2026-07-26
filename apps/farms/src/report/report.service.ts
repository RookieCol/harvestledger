import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository } from 'typeorm';

import { RedisService, Role, UserEntity } from '@app/common';

// Reports are cached briefly — they are expensive and rarely need to be
// second-fresh. Keys are per-scope so a farmer's cache can't leak across users.
const REPORT_CACHE_TTL_SECONDS = 60;
const ADMIN_REPORT_KEY = 'report:admin';
const farmerReportKey = (farmerId: number) => `report:farmer:${farmerId}`;

// The whole ownership tree, loaded in a fixed number of queries (one per depth)
// instead of the old per-user/per-farm/per-crop N+1 walk.
const REPORT_RELATIONS = [
  'farms',
  'farms.crops',
  'farms.crops.activities',
  'farms.crops.harvest',
];

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private readonly redisService: RedisService,
  ) {}

  async generateAdminReport(req_id: number) {
    const requester = await this.userRepository.findOne({
      where: { id: req_id },
    });
    // Defence in depth: the gateway RolesGuard is the primary check, but a
    // message put straight on the queue must not bypass it.
    if (requester?.rol !== Role.Admin) {
      throw new ForbiddenException('Admin role required');
    }

    const cached = await this.redisService.get(ADMIN_REPORT_KEY);
    if (cached) {
      return { result: JSON.parse(cached), status: 'success' };
    }

    // One nested read (query strategy → a fixed handful of queries, not N+1).
    const users = await this.userRepository.find({
      relations: REPORT_RELATIONS,
      relationLoadStrategy: 'query',
    });
    const result = users.map((user) => this.shapeUser(user));

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

    const user = await this.userRepository.findOne({
      where: { id: Equal(farmer_id) },
      relations: REPORT_RELATIONS,
      relationLoadStrategy: 'query',
    });
    if (!user) {
      throw new ForbiddenException('You can only access your own report');
    }

    const result = this.shapeUser(user).farms;

    await this.redisService.setWithTtl(
      cacheKey,
      JSON.stringify(result),
      REPORT_CACHE_TTL_SECONDS,
    );
    return { result, status: 'success' };
  }

  // Normalise the entity's `crop.harvest` relation to the `crop.harvests` the
  // report writer expects, and drop the password/token fields.
  private shapeUser(user: UserEntity) {
    const { password, forgotPasswordToken, ...safeUser } =
      user as UserEntity & {
        password?: string;
        forgotPasswordToken?: string;
      };
    void password;
    void forgotPasswordToken;
    return {
      ...safeUser,
      farms: (user.farms ?? []).map((farm) => ({
        ...farm,
        crops: (farm.crops ?? []).map((crop) => ({
          ...crop,
          activities: crop.activities ?? [],
          harvests: crop.harvest ?? [],
        })),
      })),
    };
  }
}
