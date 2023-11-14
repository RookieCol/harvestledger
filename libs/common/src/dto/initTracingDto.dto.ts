import { IsNumber, IsString } from 'class-validator';

export class InitTracingDto {
  @IsNumber()
  cropId: number;

  @IsString()
  product: string;
}