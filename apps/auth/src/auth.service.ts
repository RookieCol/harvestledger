import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthServiceInterface } from './interfaces/auth.service.interface';
import {
  ExistingUserDto,
  NotificationsService,
  UsersRepositoryInterface,
} from '@app/common';
import { CreateUserDto, UserEntity } from '@app/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { UpdateUserDto } from '@app/common/dtos/users/updateUserDto.dto';
import { S3Service } from '@app/common/services/s3.service';
import * as argon2 from 'argon2';

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
      select: [
        'id',
        'firstName',
        'lastName',
        'email',
        'forgotPasswordToken',
        'password',
      ],
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

    await this.notificationsService.welcomeEmail(
      userWithoutPassword.email,
      `${userWithoutPassword.firstName} ${userWithoutPassword.lastName}`,
    );

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
    delete user.forgotPasswordToken;
    delete user.firstName
    delete user.lastName
    delete user.email
    

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

  async forgotPassword(email: string) {
    const user = await this.usersRepository.findByCondition({
      where: { email },
      select: ['id', 'firstName', 'lastName', 'email', 'password'],
    });

    if (!user) {
      return { message: 'Usuario no encontrado', status: 'error' };
    }

    // Genera el token JWT
    const forgotPasswordToken = await this.jwtService.signAsync(
      { userId: user.id, email: user.email, timestamp: new Date().getTime() },
      { expiresIn: '24h' },
    );

    // Hashea el token JWT
    const hashedToken = await argon2.hash(forgotPasswordToken);

    // Guarda el token hasheado en la base de datos
    await this.usersRepository.update(user.id, {
      forgotPasswordToken: hashedToken,
    });

    // Envía el email con el token JWT (no hasheado)
    await this.notificationsService.forgotPasswordEmail(
      user.email,
      forgotPasswordToken,
    );

    return { message: 'Reset password email sent', status: 'OK' };
  }

  async resetPassword(token: string, newPassword: string) {
    let decodedToken;
    try {
      decodedToken = await this.jwtService.verifyAsync(token);
      decodedToken = this.jwtService.decode(token);
      console.log(decodedToken);
    } catch (error) {
      return { message: 'Invalid token', status: 'error' };
    }

    const user = await this.findByEmail(decodedToken.email);
    if (!user) {
      return { message: 'User not found', status: 'error' };
    }


    // Verifica si el token hasheado guardado coincide con el token proporcionado
    const isTokenValid = await argon2.verify(user.forgotPasswordToken, token);
    if (!isTokenValid) {
      return { message: 'Invalid token', status: 'error' };
    }

    // Verifica si el token ha expirado
    const currentTime = new Date().getTime();
    if (currentTime > decodedToken.timestamp + 24 * 60 * 60 * 1000) {
      // 24 horas en milisegundos
      return { message: 'Token has expired', status: 'error' };
    }


    // Hashea la nueva contraseña
    const hashedNewPassword = await this.hashPassword(newPassword);
    

    // Actualiza la contraseña del usuario y elimina el token de restablecimiento de contraseña
    await this.usersRepository.update(user.id, {
      password: hashedNewPassword,
      forgotPasswordToken: null,
    });

    return { message: 'Password has been changed', status: 'OK' };
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
