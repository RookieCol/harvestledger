import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { AuthServiceInterface } from './interfaces/auth.service.interface';
import { UserRepositoryInterface } from '@app/common';
import { CreateUserDto, UserEntity } from '@app/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService implements AuthServiceInterface {
  constructor(
    @Inject('UsersRepositoryInterface')
    private readonly usersRepository: UserRepositoryInterface,
  ) {}

  async findByEmail(email: string): Promise<UserEntity> {
    return this.usersRepository.findByCondition({
      where: { email },
      select: ['id', 'firstName', 'lastName', 'email', 'password'],
    });
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async register(newUser: Readonly<CreateUserDto>): Promise<UserEntity> {
    const { password, ...userProperties } = newUser; // Exclude password from userProperties

    const existingUser = await this.findByEmail(userProperties.email);

    if (existingUser) {
      throw new ConflictException('An account with that email already exists!');
    }

    const hashedPassword = await this.hashPassword(password);

    // Create a user object without the password property
    const userToSave: Partial<UserEntity> = {
      ...userProperties, // Include all other properties from newUser
      password: hashedPassword, // Include the hashed password
    };

    const savedUser = await this.usersRepository.save(userToSave);

    // Return the saved user without the password property
    const userWithoutPassword: UserEntity = { ...savedUser };
    delete userWithoutPassword.password;

    return userWithoutPassword;
  }
}
