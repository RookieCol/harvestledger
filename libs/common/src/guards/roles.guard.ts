import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

/**
 * Checks that the authenticated user (attached by AuthGuard) holds one of the
 * roles declared with @Roles(). Use it after AuthGuard:
 *   @UseGuards(AuthGuard, RolesGuard)
 *   @Roles(Role.Admin)
 * Replaces the old hand-written `if (user.rol !== 'admin')` that dereferenced a
 * possibly-null user and 500'd.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles on the route → nothing to enforce here.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.rol)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
