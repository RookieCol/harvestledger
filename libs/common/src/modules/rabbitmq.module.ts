import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { RabbitmqService } from '../services/rabbitmq.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: './.env',
    }),
  ],
  providers: [RabbitmqService],
  exports: [RabbitmqService],
})
export class RabbitmqModule {
  /**
   * Registers an outbound RabbitMQ client under `service` (e.g. 'AUTH_SERVICE'),
   * injected as `@Inject('AUTH_SERVICE') ClientProxy`.
   *
   * Built through `ClientsModule` rather than a bare `ClientProxyFactory.create()`
   * provider so Nest **owns the client's lifecycle** and closes it on shutdown.
   * A hand-rolled factory provider is not lifecycle-managed: its
   * amqp-connection-manager keeps a reconnecting socket and timers alive after
   * `app.close()`, which leaves a pod holding broker connections through a
   * SIGTERM (and hangs any test process that boots the app).
   */
  static registerRmq(service: string, queue: string): DynamicModule {
    const clients = ClientsModule.registerAsync([
      {
        name: service,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const USER = configService.get('RABBITMQ_USER');
          const PASSWORD = configService.get('RABBITMQ_PASS');
          const HOST = configService.get('RABBITMQ_HOST');

          return {
            transport: Transport.RMQ as const,
            options: {
              urls: [`amqp://${USER}:${PASSWORD}@${HOST}`],
              queue,
              queueOptions: {
                durable: true, // queue survives broker restart
              },
            },
          };
        },
      },
    ]);

    return {
      module: RabbitmqModule,
      imports: [clients],
      exports: [clients],
    };
  }
}
