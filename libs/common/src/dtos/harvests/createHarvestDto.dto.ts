import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateHarvestDto {
  @IsString()
  harvestDate: string;

  @IsNumber()
  amount: number;

  @IsString()
  unit: string;

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  description: string;

  @IsNumber()
  cropId: number;
}
