import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/**
 * Marks a route as requiring one of the given roles. Enforced by RolesGuard,
 * which must run after AuthGuard (AuthGuard attaches `request.user`).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
