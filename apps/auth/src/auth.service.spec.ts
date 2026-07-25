import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

// The service reaches for these dependencies; we hand it test doubles so no
// real database, mailer, S3 or signing key is involved.
describe('AuthService', () => {
  let service: AuthService;
  let usersRepository: {
    findByCondition: jest.Mock;
    save: jest.Mock;
    findOneById: jest.Mock;
    update: jest.Mock;
  };
  let jwtService: {
    signAsync: jest.Mock;
    verifyAsync: jest.Mock;
    decode: jest.Mock;
  };
  let notificationsService: {
    welcomeEmail: jest.Mock;
    forgotPasswordEmail: jest.Mock;
  };
  const s3Service = {} as any;

  beforeEach(() => {
    usersRepository = {
      findByCondition: jest.fn(),
      save: jest.fn(),
      findOneById: jest.fn(),
      update: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
      decode: jest.fn(),
    };
    notificationsService = {
      welcomeEmail: jest.fn(),
      forgotPasswordEmail: jest.fn(),
    };

    service = new AuthService(
      usersRepository as any,
      jwtService as any,
      s3Service,
      notificationsService as any,
    );
  });

  describe('password hashing', () => {
    it('hashes a password and matches it back', async () => {
      const hash = await service.hashPassword('s3cret');
      expect(hash).not.toEqual('s3cret');
      await expect(service.doesPasswordMatch('s3cret', hash)).resolves.toBe(
        true,
      );
      await expect(service.doesPasswordMatch('wrong', hash)).resolves.toBe(
        false,
      );
    });
  });

  describe('register', () => {
    it('throws ConflictException when the email already exists', async () => {
      usersRepository.findByCondition.mockResolvedValue({ id: 1 });

      await expect(
        service.register({
          email: 'taken@example.com',
          password: 'pw',
        } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersRepository.save).not.toHaveBeenCalled();
    });

    it('hashes the password, saves the user, and sends the welcome email', async () => {
      usersRepository.findByCondition.mockResolvedValue(null);
      usersRepository.save.mockImplementation(async (u) => ({ id: 7, ...u }));

      const result = await service.register({
        email: 'new@example.com',
        firstName: 'Ana',
        lastName: 'Diaz',
        password: 'plain',
      } as any);

      const saved = usersRepository.save.mock.calls[0][0];
      expect(saved.password).not.toEqual('plain');
      expect(result.status).toBe('success');
      expect(result.user.password).toBeUndefined();
      expect(notificationsService.welcomeEmail).toHaveBeenCalledWith(
        'new@example.com',
        'Ana Diaz',
      );
    });
  });

  describe('validateUser', () => {
    it('returns undefined when the user does not exist', async () => {
      usersRepository.findByCondition.mockResolvedValue(null);
      await expect(service.validateUser('x@x.com', 'pw')).resolves.toBeFalsy();
    });

    it('returns null when the password does not match', async () => {
      const hash = await bcrypt.hash('right', 12);
      usersRepository.findByCondition.mockResolvedValue({
        id: 1,
        password: hash,
      });
      await expect(
        service.validateUser('x@x.com', 'wrong'),
      ).resolves.toBeNull();
    });

    it('returns the user when credentials are valid', async () => {
      const hash = await bcrypt.hash('right', 12);
      const user = { id: 1, email: 'x@x.com', password: hash };
      usersRepository.findByCondition.mockResolvedValue(user);
      await expect(service.validateUser('x@x.com', 'right')).resolves.toBe(
        user,
      );
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException on invalid credentials', async () => {
      usersRepository.findByCondition.mockResolvedValue(null);
      await expect(
        service.login({ email: 'x@x.com', password: 'pw' } as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues access and refresh tokens on valid credentials', async () => {
      const hash = await bcrypt.hash('right', 12);
      usersRepository.findByCondition.mockResolvedValue({
        id: 1,
        email: 'x@x.com',
        password: hash,
      });
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.login({
        email: 'x@x.com',
        password: 'right',
      } as any);

      expect(result.accesToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshToken', () => {
    it('throws when no token is provided', async () => {
      await expect(
        service.refreshToken(undefined as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws when the token is invalid', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad'));
      await expect(service.refreshToken('bad-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('reissues an access token when the refresh token is valid', async () => {
      jwtService.verifyAsync.mockResolvedValue({ user: { id: 1 }, exp: 123 });
      jwtService.signAsync.mockResolvedValue('new-access-token');

      const result = await service.refreshToken('good-token');

      expect(result.accesToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('good-token');
    });
  });

  describe('forgotPassword', () => {
    it('returns a generic OK (no enumeration) and sends no email when the user is not found', async () => {
      usersRepository.findByCondition.mockResolvedValue(null);
      const result = await service.forgotPassword('missing@example.com');
      expect(result.status).toBe('OK');
      expect(notificationsService.forgotPasswordEmail).not.toHaveBeenCalled();
    });

    it('stores a hashed token and emails the raw token when the user exists', async () => {
      usersRepository.findByCondition.mockResolvedValue({
        id: 5,
        email: 'u@example.com',
      });
      jwtService.signAsync.mockResolvedValue('raw-jwt');

      const result = await service.forgotPassword('u@example.com');

      const [, update] = usersRepository.update.mock.calls[0];
      expect(update.forgotPasswordToken).not.toEqual('raw-jwt');
      expect(notificationsService.forgotPasswordEmail).toHaveBeenCalledWith(
        'u@example.com',
        'raw-jwt',
      );
      expect(result.status).toBe('OK');
    });
  });

  describe('resetPassword', () => {
    it('throws BadRequestException when the token cannot be verified', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
      await expect(
        service.resetPassword('bad', 'newpw'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the token does not match the stored hash', async () => {
      jwtService.verifyAsync.mockResolvedValue({});
      jwtService.decode.mockReturnValue({
        email: 'u@example.com',
        timestamp: Date.now(),
      });
      const otherHash = await bcrypt.hash('some-other-token', 12);
      usersRepository.findByCondition.mockResolvedValue({
        id: 5,
        email: 'u@example.com',
        forgotPasswordToken: otherHash,
      });

      await expect(
        service.resetPassword('provided-token', 'newpw'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('changes the password when the token is valid and unexpired', async () => {
      const token = 'valid-token';
      const storedHash = await bcrypt.hash(token, 12);
      jwtService.verifyAsync.mockResolvedValue({});
      jwtService.decode.mockReturnValue({
        email: 'u@example.com',
        timestamp: Date.now(),
      });
      usersRepository.findByCondition.mockResolvedValue({
        id: 5,
        email: 'u@example.com',
        forgotPasswordToken: storedHash,
      });

      const result = await service.resetPassword(token, 'newpw');

      const [, update] = usersRepository.update.mock.calls[0];
      expect(update.forgotPasswordToken).toBeNull();
      expect(update.password).not.toEqual('newpw');
      expect(result.status).toBe('OK');
    });
  });
});
