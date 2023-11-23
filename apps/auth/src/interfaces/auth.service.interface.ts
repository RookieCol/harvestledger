import { CreateUserDto, ExistingUserDto, UserEntity } from '@app/common';

export interface AuthServiceInterface {
  findByEmail(email: string): Promise<UserEntity>;
  hashPassword(password: string): Promise<string>;
  register(newUser: Readonly<CreateUserDto>): Promise<any>;
  login(existingUser: Readonly<ExistingUserDto>): Promise<{
    accesToken: string;
    refreshToken: string;
    user: UserEntity;
  }>;
  doesPasswordMatch(password: string, hashedPassword: string): Promise<boolean>;
  validateUser(email: string, password: string): Promise<UserEntity>;
  verifyJwt(jwt: string): Promise<{ user: UserEntity; exp: number }>;
}
