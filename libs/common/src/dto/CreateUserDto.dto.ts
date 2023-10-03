import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Gender, DocumentType } from '../entities/user.entity'; // Replace with the actual path to your enums file

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  @IsEnum(DocumentType) // Use the same enum as in UserEntity
  documentType: DocumentType;

  @IsOptional()
  @IsEnum(Gender) // Use the same enum as in UserEntity
  gender: Gender;

  @IsOptional()
  dateOfBirth: Date;

  @IsOptional()
  @IsString()
  country: string;

  @IsOptional()
  @IsString()
  state: string;

  @IsOptional()
  @IsString()
  city: string;
}
