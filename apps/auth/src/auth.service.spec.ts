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
  let redisService: {
    setWithTtl: jest.Mock;
    exists: jest.Mock;
    del: jest.Mock;
  };
  const s3Service = {} as any;
  let dataSource: { transaction: jest.Mock };
  let savedInTransaction: any[];
  let updatedInTransaction: any[];
  let outbox: { enqueue: jest.Mock };

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
    redisService = {
      setWithTtl: jest.fn(),
      exists: jest.fn(),
      del: jest.fn(),
    };

    outbox = { enqueue: jest.fn() };
    // Stand-in for the real transaction: runs the callback against a manager
    // that behaves like TypeORM's (create returns the entity, save assigns an
    // id), so the outbox enqueue inside the transaction is observable.
    savedInTransaction = [];
    updatedInTransaction = [];
    dataSource = {
      transaction: jest.fn((cb) =>
        cb({
          create: (_entity: any, data: any) => data,
          update: (...args: any[]) => {
            updatedInTransaction.push(args);
            return { affected: 1 };
          },
          save: async (...args: any[]) => {
            const entity = args.length > 1 ? args[1] : args[0];
            savedInTransaction.push(entity);
            return { id: 7, ...entity };
          },
        }),
      ),
    };

    service = new AuthService(
      usersRepository as any,
      jwtService as any,
      s3Service,
      redisService as any,
      dataSource as any,
      outbox as any,
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

    it('hashes the password, saves the user in a transaction, and enqueues user.created', async () => {
      usersRepository.findByCondition.mockResolvedValue(null);

      const result = await service.register({
        email: 'new@example.com',
        firstName: 'Ana',
        lastName: 'Diaz',
        password: 'plain',
      } as any);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(savedInTransaction[0].password).not.toEqual('plain');
      const [, pattern, payload] = outbox.enqueue.mock.calls[0];
      expect(pattern).toBe('user.created');
      expect(payload).toEqual(
        expect.objectContaining({ id: 7, email: 'new@example.com' }),
      );
      expect(result.status).toBe('success');
      expect(result.user.password).toBeUndefined();
      // The welcome email is `notifications`' job, driven off this same event —
      // registration must not block on SMTP.
      expect(payload).toEqual(
        expect.objectContaining({ firstName: 'Ana', lastName: 'Diaz' }),
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

    it('issues an access token and records the refresh token id in Redis', async () => {
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
      // The refresh token's id is stored (allowlist) with a TTL.
      expect(redisService.setWithTtl).toHaveBeenCalledWith(
        expect.stringMatching(/^refresh:1:/),
        '1',
        expect.any(Number),
      );
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

    it('throws when the token id is not (or no longer) in Redis', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        user: { id: 1 },
        jti: 'abc',
      });
      redisService.exists.mockResolvedValue(false); // revoked / already rotated

      await expect(service.refreshToken('reused-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('rotates the refresh token when valid: revokes the old id, mints a new one', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        user: { id: 1 },
        jti: 'old-jti',
      });
      redisService.exists.mockResolvedValue(true);
      jwtService.signAsync
        .mockResolvedValueOnce('new-refresh-token') // issueRefreshToken
        .mockResolvedValueOnce('new-access-token'); // access token

      const result = await service.refreshToken('good-token');

      expect(redisService.del).toHaveBeenCalledWith('refresh:1:old-jti');
      expect(redisService.setWithTtl).toHaveBeenCalledWith(
        expect.stringMatching(/^refresh:1:/),
        '1',
        expect.any(Number),
      );
      expect(result.accesToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });
  });

  describe('forgotPassword', () => {
    it('returns a generic OK (no enumeration) and sends no email when the user is not found', async () => {
      usersRepository.findByCondition.mockResolvedValue(null);
      const result = await service.forgotPassword('missing@example.com');
      expect(result.status).toBe('OK');
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('stores the hashed token and enqueues the raw token for notifications, in one transaction', async () => {
      usersRepository.findByCondition.mockResolvedValue({
        id: 5,
        email: 'u@example.com',
      });
      jwtService.signAsync.mockResolvedValue('raw-jwt');

      const result = await service.forgotPassword('u@example.com');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // Only the bcrypt hash is persisted; the raw token exists solely in the
      // event, which is what lets the user actually complete the reset.
      const [, , update] = updatedInTransaction[0];
      expect(update.forgotPasswordToken).not.toEqual('raw-jwt');
      const [, pattern, payload] = outbox.enqueue.mock.calls[0];
      expect(pattern).toBe('user.password_reset_requested');
      expect(payload).toEqual({ email: 'u@example.com', token: 'raw-jwt' });
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
