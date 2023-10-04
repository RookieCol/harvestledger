import { NestFactory } from '@nestjs/core';
import { FarmsModule } from './farms.module';

async function bootstrap() {
  const app = await NestFactory.create(FarmsModule);
  await app.listen(3000);
}
bootstrap();
