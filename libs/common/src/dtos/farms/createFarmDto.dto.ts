import { IsString, IsNumber, IsEnum } from 'class-validator';
import { FarmState } from '../../entities/farms.entity'; // Make sure the correct enum is imported

export class CreateFarmDto {
  @IsString()
  name: string;

  @IsString()
  location: string;

  @IsEnum(FarmState)
  state: FarmState;

  @IsNumber()
  area: number;
}
