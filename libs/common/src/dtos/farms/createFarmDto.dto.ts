import { IsString, IsNumber, IsEnum } from 'class-validator';
import { FarmState } from '../../entities/farms.entity'; // Asegúrate de importar el enum adecuado

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
