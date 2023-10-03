import { BaseInterfaceRepository } from '@app/common';

import { UserEntity } from '../entities/user.entity';

export interface UserRepositoryInterface
  extends BaseInterfaceRepository<UserEntity> {}