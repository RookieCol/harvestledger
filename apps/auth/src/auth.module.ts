import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import {
  ActivitiesEntity,
  AwsS3Module,
  CropEntity,
  FarmEntity,
  HarvestEntity,
  AppLoggerModule,
  HealthModule,
  NotificationsService,
  PostgresDBModule,
  RabbitmqModule,
  RabbitmqService,
  RedisModule,
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

@Module({
  imports: [
    RabbitmqModule,
    PostgresDBModule,
    AwsS3Module,
    NotificationsModule,
    RedisModule,
    HealthModule,
    AppLoggerModule,
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
