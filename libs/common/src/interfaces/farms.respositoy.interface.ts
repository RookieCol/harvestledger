import { FarmEntity } from "../entities/farms.entity";
import { BaseInterfaceRepository } from '@app/common/repositories/base/base.interface.repository';

export interface FarmRepositoryInterface
    extends BaseInterfaceRepository<FarmEntity> {}