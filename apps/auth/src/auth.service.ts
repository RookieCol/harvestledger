import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthServiceInterface } from './interfaces/auth.service.interface';
import { ExistingUserDto, NotificationsService, UsersRepositoryInterface } from '@app/common';
import { CreateUserDto, UserEntity } from '@app/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { UpdateUserDto } from '@app/common/dtos/users/updateUserDto.dto';
import { S3Service } from '@app/common/services/s3.service';

@Injectable()
export class AuthService implements AuthServiceInterface {
  constructor(
    @Inject('UsersRepositoryInterface')
    private readonly usersRepository: UsersRepositoryInterface,
    private readonly jwtService: JwtService,
    private s3Service: S3Service,
    private notificationsService: NotificationsService,
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
    const { password, ...userProperties } = newUser; 
    const existingUser = await this.findByEmail(userProperties.email);

    if (existingUser) {
      return {
        message: 'User already exists',
        status: 'error',
      };
    }

    const hashedPassword = await this.hashPassword(password);

    const userToSave: Partial<UserEntity> = {
      ...userProperties,
      password: hashedPassword,
    };

    const savedUser = await this.usersRepository.save(userToSave);

    const userWithoutPassword: UserEntity = { ...savedUser };
    delete userWithoutPassword.password;

    try{
       
      const email = this.notificationsService.example()
      console.log(email)
      

    }catch(err){
      console.log(err);
    }

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

    const accesToken = await this.jwtService.signAsync(
      { user },
      { expiresIn: '15m' },
    );
    const refreshToken = await this.jwtService.signAsync(
      { user },
      { expiresIn: '7d', secret: process.env.JWT_REFRESH_SECRET },
    );

    return { accesToken, refreshToken, user };
  }
  async refreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    try {
      const { user, exp } = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      // Lógica adicional para validar si el token de actualización ya fue utilizado o está revocado

      const accesToken = await this.jwtService.signAsync(
        { user },
        { expiresIn: '15m' },
      );

      // Considera no generar un nuevo token de actualización cada vez

      return { accesToken, refreshToken, user, exp };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
  s;

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

  async getUser(userId: any): Promise<any> {
    const user = await this.usersRepository.findByCondition({
      where: { id: userId },
    });

    if (!user) {
      return {
        message: 'Usuario no encontrado',
        status: 'error',
      };
    }

    return { user, message: 'Usuario encontrado', status: 'success' };
  }

  async uploadUserImage(file: Express.Multer.File, userId: number) {
    try {
      const user = await this.usersRepository.findOneById(userId);
      const photo = await this.s3Service.uploadFile(file, `user-${userId}`);
      user.photo = photo.key;
      await this.usersRepository.save(user);
      return { message: 'Imagen subida con exito', status: 'success' };
    } catch (err) {
      console.log(err);
      return { message: 'Error al subir la imagen', status: 'error' };
    }
  }

  async getUserImage(userId: number) {
    const user = await this.usersRepository.findOneById(userId);
    const data = await this.s3Service.getFile(user.photo);
    return { message: 'Ok', data };
  }
}
