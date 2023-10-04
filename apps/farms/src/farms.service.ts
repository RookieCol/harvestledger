import { Injectable } from '@nestjs/common';

@Injectable()
export class FarmsService {
  getHello(): string {
    return 'Hello World!';
  }
}
