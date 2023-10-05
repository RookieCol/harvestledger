import { IsString, IsOptional } from 'class-validator';

export class CreateActivityDto {
  @IsString()
  @IsOptional()
  type: string;

  @IsString()
  @IsOptional()
  inputDate: string;

  @IsString()
  @IsOptional()
  title: string;

  @IsString()
  @IsOptional()
  manufactureLocation: string;

  @IsString()
  @IsOptional()
  appRatio: string;

  @IsString()
  @IsOptional()
  appMethod: string;

  @IsString()
  @IsOptional()
  comment: string;

  @IsString()
  @IsOptional()
  category: string;

  @IsString()
  @IsOptional()
  readonly bioName: string;

  @IsString()
  @IsOptional()
  bioType: string;
}
