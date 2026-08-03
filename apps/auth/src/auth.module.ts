import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import {
  AwsS3Module,
  AppLoggerModule,
  HealthModule,
  OutboxEntity,
  OutboxService,
  PostgresDBModule,
  RabbitmqModule,
  RabbitmqService,
  RedisModule,
  UserEntity,
} from '@app/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthOutboxRelayService } from './outbox/auth-outbox-relay.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersRepository } from '@app/common';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt-strategy';
import { JwtGuard } from './guards/jwt.guard';
import { migrations as authMigrations } from './db/migrations';

@Module({
  imports: [
    RabbitmqModule,
    RabbitmqModule.registerRmq(
      'FARMS_SERVICE',
      process.env.RABBITMQ_FARMS_QUEUE,
    ),
    RabbitmqModule.registerRmq(
      'NOTIFICATIONS_SERVICE',
      process.env.RABBITMQ_NOTIFICATIONS_QUEUE,
    ),
    PostgresDBModule.forApp({
      migrations: authMigrations,
      uriEnvKey: 'AUTH_POSTGRES_URI',
    }),
    AwsS3Module,
    RedisModule,
    HealthModule,
    AppLoggerModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([UserEntity, OutboxEntity]),
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
    OutboxService,
    AuthOutboxRelayService,
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
