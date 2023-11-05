import { Module } from '@nestjs/common';
import { RabbitmqModule } from '@app/common/modules/rabbitmq.module';
import { ConfigModule } from '@nestjs/config';
import { AuthController,FarmsController,CropsController, ActivitiesController  } from './controllers';



@Module({
  imports: [
    
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:'.env'
    }),

    RabbitmqModule.registerRmq('AUTH_SERVICE',process.env.RABBITMQ_AUTH_QUEUE),
    RabbitmqModule.registerRmq('FARMS_SERVICE',process.env.RABBITMQ_FARMS_QUEUE),
  ],
  controllers: [AuthController,FarmsController,CropsController,ActivitiesController],
})
export class GatewayModule {}
