import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import {
  PostgresDBModule,
  RabbitmqModule,
  RabbitmqService,
  UserEntity,
} from '@app/common';

import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersRepository } from '@app/common';
import { AuthService } from './auth.service';


@Module({
  imports: [
    RabbitmqModule,
   
    PostgresDBModule,

    TypeOrmModule.forFeature([UserEntity]),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: 'RabbitmqServiceInterface',
      useClass: RabbitmqService,
    },
    {
      provide: 'UsersRepositoryInterface',
      useClass: UsersRepository,
    },
    {
      provide: 'AuthServiceInterface',
      useClass: AuthService,
    },
  ],
})
export class AuthModule {}
