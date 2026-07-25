import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthServiceInterface } from './interfaces/auth.service.interface';
import {
  ExistingUserDto,
  NotificationsService,
  RedisService,
  UsersRepositoryInterface,
} from '@app/common';
import { CreateUserDto, UserEntity } from '@app/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { UpdateUserDto } from '@app/common/dtos/users/updateUserDto.dto';
import { S3Service } from '@app/common/services/s3.service';

// Refresh tokens live 7 days; the Redis allowlist entry matches that lifetime.
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class AuthService implements AuthServiceInterface {
  constructor(
    @Inject('UsersRepositoryInterface')
    private readonly usersRepository: UsersRepositoryInterface,
    private readonly jwtService: JwtService,
    private s3Service: S3Service,
    private notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  // Redis key for a specific refresh token (per user, per token id).
  private refreshKey(userId: number, jti: string): string {
    return `refresh:${userId}:${jti}`;
  }

  // Issue a rotated refresh token and record its id as the only valid one.
  private async issueRefreshToken(user: { id: number }): Promise<string> {
    const jti = randomUUID();
    const refreshToken = await this.jwtService.signAsync(
      { user, jti },
      { expiresIn: '7d', secret: process.env.JWT_REFRESH_SECRET },
    );
    await this.redisService.setWithTtl(
      this.refreshKey(user.id, jti),
      '1',
      REFRESH_TTL_SECONDS,
    );
    return refreshToken;
  }

  async findByEmail(email: string): Promise<UserEntity> {
    return this.usersRepository.findByCondition({
      where: { email },
      select: [
        'id',
        'firstName',
        'lastName',
        'email',
        'rol',
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
      throw new ConflictException('User already exists');
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
    delete user.firstName;
    delete user.lastName;
    delete user.email;

    const accesToken = await this.jwtService.signAsync(
      { user },
      { expiresIn: '15m' },
    );
    const refreshToken = await this.issueRefreshToken(user);

    return { accesToken, refreshToken, user };
  }
  async refreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    let payload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { user, jti } = payload;

    // Reuse/revocation check: the token id must still be the valid one in Redis.
    // A rotated (already-used) or revoked token is no longer present.
    const key = this.refreshKey(user.id, jti);
    if (!jti || !(await this.redisService.exists(key))) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Rotate: invalidate the presented token and mint a fresh one.
    await this.redisService.del(key);
    const newRefreshToken = await this.issueRefreshToken(user);

    const accesToken = await this.jwtService.signAsync(
      { user },
      { expiresIn: '15m' },
    );

    return { accesToken, refreshToken: newRefreshToken, user };
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
    // Look up the user by ID
    const user = await this.usersRepository.findOneById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
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
      throw new NotFoundException('User not found');
    }

    return { user, message: 'User found', status: 'success' };
  }

  async forgotPassword(email: string) {
    const genericResponse = {
      message: 'If that email exists, a reset link has been sent',
      status: 'OK',
    };

    const user = await this.usersRepository.findByCondition({
      where: { email },
      select: ['id', 'firstName', 'lastName', 'email', 'password'],
    });

    // Do not reveal whether the email is registered (avoids user enumeration).
    if (!user) {
      return genericResponse;
    }

    // Generate the JWT token
    const forgotPasswordToken = await this.jwtService.signAsync(
      { userId: user.id, email: user.email, timestamp: new Date().getTime() },
      { expiresIn: '24h' },
    );

    // Hash the JWT token with bcrypt
    const hashedToken = await bcrypt.hash(forgotPasswordToken, 12);

    // Store the hashed token in the database
    await this.usersRepository.update(user.id, {
      forgotPasswordToken: hashedToken,
    });

    // Send the email with the raw (unhashed) JWT token
    await this.notificationsService.forgotPasswordEmail(
      user.email,
      forgotPasswordToken,
    );

    return genericResponse;
  }

  async resetPassword(token: string, newPassword: string) {
    let decodedToken;
    try {
      await this.jwtService.verifyAsync(token);
      decodedToken = this.jwtService.decode(token);
    } catch (error) {
      throw new BadRequestException('Invalid token');
    }

    const user = await this.findByEmail(decodedToken.email);
    // Same error for missing user and mismatched token: don't leak which failed.
    if (!user) {
      throw new BadRequestException('Invalid token');
    }

    // Check with bcrypt whether the stored hashed token matches the provided one
    const isTokenValid = await bcrypt.compare(token, user.forgotPasswordToken);

    if (!isTokenValid) {
      throw new BadRequestException('Invalid token');
    }

    // Check whether the token has expired
    const currentTime = new Date().getTime();
    if (currentTime > decodedToken.timestamp + 24 * 60 * 60 * 1000) {
      // 24 hours in milliseconds
      throw new BadRequestException('Token has expired');
    }

    // Hash the new password
    const hashedNewPassword = await this.hashPassword(newPassword);

    // Update the user's password and clear the reset password token
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
      return { message: 'Image uploaded successfully', status: 'success' };
    } catch (err) {
      console.log(err);
      return { message: 'Error uploading the image', status: 'error' };
    }
  }

  async getUserImage(userId: number) {
    const user = await this.usersRepository.findOneById(userId);
    const data = await this.s3Service.getFile(user.photo);
    return { message: 'Ok', data };
  }
}
