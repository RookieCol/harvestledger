import { IsNumber, IsString } from 'class-validator';
export class CreateHarvestDto {
  @IsString()
  harvestDate: string;
  @IsNumber()
  amount: number;
  @IsString()
  unit: string;
  @IsNumber()
  categroy: string;
  @IsString()
  description: string;
  @IsNumber()
  cropId: number;
}
