import { IsNotEmpty, IsString, IsNumber, Min } from 'class-validator';

export class CreateCropDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  product: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  size: number;

  @IsNotEmpty()
  @IsString()
  location: string;

  @IsNotEmpty()
  sowingDate: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  plants: number;

  @IsNotEmpty()
  @IsNumber()
  farmId: number;
}
