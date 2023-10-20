import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthServiceInterface } from './interfaces/auth.service.interface';
import { ExistingUserDto, UsersRepositoryInterface } from '@app/common';
import { CreateUserDto, UserEntity } from '@app/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { UpdateUserDto } from '@app/common/dto/Users/updateUserDto.dto';

@Injectable()
export class AuthService implements AuthServiceInterface {
  constructor(
    @Inject('UsersRepositoryInterface')
    private readonly usersRepository: UsersRepositoryInterface,
    private readonly jwtService: JwtService,
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

  async register(newUser: Readonly<CreateUserDto>): Promise<any> {
    const { password, ...userProperties } = newUser; // Exclude password from userProperties

    const existingUser = await this.findByEmail(userProperties.email);

    if (existingUser) {
      return {
        message: 'User already exists',
        status: 'error',
      };
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

    return {
      user: userWithoutPassword,
      message: 'User created successfully',
      status: 'success',
    };
  }
  async doesPasswordMatch(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  async validateUser(email: string, password: string): Promise<UserEntity> {
    const user = await this.findByEmail(email);

    const doesUserExist = !!user;

    if (!doesUserExist) return;

    const doesPasswordMatch = await this.doesPasswordMatch(
      password,
      user.password,
    );

    if (!doesPasswordMatch) return null;

    return user;
  }

  async login(existingUser: Readonly<ExistingUserDto>) {
    const { email, password } = existingUser;
    const user = await this.validateUser(email, password);

    if (!user) {
      throw new UnauthorizedException();
    }

    delete user.password;

    const jwt = await this.jwtService.signAsync({ user });

    return { token: jwt, user };
  }

  async verifyJwt(jwt: string): Promise<{ user: UserEntity; exp: number }> {
    if (!jwt) {
      throw new UnauthorizedException();
    }

    try {
      const { user, exp } = await this.jwtService.verifyAsync(jwt);
      return { user, exp };
    } catch (error) {
      throw new UnauthorizedException();
    }
  }

  async updateUserInfo(userId: any, updatedData: UpdateUserDto): Promise<any> {
    // Buscar el usuario por ID
    const user = await this.usersRepository.findOneById(userId);

    if (!user) {
      return {
        message: 'Usuario no encontrado',
        status: 'error',
      };
    }

    for (const key in updatedData) {
      if (updatedData.hasOwnProperty(key)) {
        user[key] = updatedData[key];
      }
    }

    await this.usersRepository.save(user);

    return await this.usersRepository.findOneById(userId);
  }

  async getUser(userId: number): Promise<any> {
    const user = await this.usersRepository.findOneById(userId);

    if (!user) {
      return {
        message: 'Usuario no encontrado',
        status: 'error',
      };
    }

    return user;
  }



}
