import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProjectionEntity, UserProjectionEventDto } from '@app/common';

// Consumer-side of the auth -> farms event-carried read model. `upsert` is
// keyed on `id`, so a redelivered user.created/user.updated event converges
// instead of duplicating or corrupting the row.
@Injectable()
export class UserProjectionService {
  constructor(
    @InjectRepository(UserProjectionEntity)
    private readonly repository: Repository<UserProjectionEntity>,
  ) {}

  async upsert(data: UserProjectionEventDto): Promise<void> {
    await this.repository.upsert(
      {
        id: data.id,
        firstName: data.firstName,
        lastName: data.lastName ?? null,
        email: data.email,
        rol: data.rol ?? null,
      },
      ['id'],
    );
  }
}
