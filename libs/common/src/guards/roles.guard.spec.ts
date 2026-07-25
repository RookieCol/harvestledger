import { ForbiddenException } from '@nestjs/common';
import { Role } from '../enums/role.enum';
import { RolesGuard } from './roles.guard';

function makeContext(user: any) {
  return {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('RolesGuard', () => {
  it('allows the route when no @Roles metadata is present', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };
    const guard = new RolesGuard(reflector as any);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('allows a user whose role is in the required set', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.Admin]),
    };
    const guard = new RolesGuard(reflector as any);
    expect(guard.canActivate(makeContext({ rol: 'admin' }))).toBe(true);
  });

  it('throws ForbiddenException for a user without the required role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.Admin]),
    };
    const guard = new RolesGuard(reflector as any);
    expect(() => guard.canActivate(makeContext({ rol: 'farmer' }))).toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException (not a 500) when there is no user', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.Admin]),
    };
    const guard = new RolesGuard(reflector as any);
    expect(() => guard.canActivate(makeContext(null))).toThrow(
      ForbiddenException,
    );
  });
});
