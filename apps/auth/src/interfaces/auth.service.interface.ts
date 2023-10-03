import {  CreateUserDto, UserEntity } from '@app/common';

export interface AuthServiceInterface {
  findByEmail(email: string): Promise<UserEntity>;
  hashPassword(password: string): Promise<string>;
  register(newUser: Readonly<CreateUserDto>): Promise<any>;
}
