import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import {
  ActivitiesEntity,
  AwsS3Module,
  CropEntity,
  FarmEntity,
  HarvestEntity,
  NotificationsService,
  PostgresDBModule,
  RabbitmqModule,
  RabbitmqService,
  UserEntity,
} from '@app/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersRepository } from '@app/common';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt-strategy';
import { JwtGuard } from './guards/jwt.guard';
import { NotificationsModule } from '@app/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    RabbitmqModule,
    PostgresDBModule,
    AwsS3Module,
    NotificationsModule,
    TypeOrmModule.forFeature([
      UserEntity,
      FarmEntity,
      CropEntity,
      ActivitiesEntity,
      HarvestEntity,
    ]),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '3600s' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    NotificationsService,
    JwtStrategy,
    JwtGuard,
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
