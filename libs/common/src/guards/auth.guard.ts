import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, Observable, of, switchMap } from 'rxjs';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: ClientProxy,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    if (context.getType() !== 'http') {
      return false;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Falta el encabezado de autorización');
    }

    const authHeaderParts = (authHeader as string).split(' ');

    if (authHeaderParts.length !== 2) {
      throw new UnauthorizedException('Formato de encabezado de autorización incorrecto');
    }

    const [, jwt] = authHeaderParts;

    return this.authService.send({ cmd: 'verify-jwt' }, { jwt }).pipe(
      switchMap(({ exp, user}) => {
        if (!exp) {
          throw new UnauthorizedException('Token JWT sin fecha de expiración');
        }

        const TOKEN_EXP_MS = exp * 1000;
        const isJwtValid = Date.now() < TOKEN_EXP_MS;

        if (!isJwtValid) {
          throw new UnauthorizedException('Token JWT caducado');
        }

        // Asigna el ID del usuario al objeto request
        request.user = user;

        return of(true); 
      }),
      catchError((error) => {
        console.error('Error de autenticación', error);
        throw new UnauthorizedException('Error de autenticación');
      }),
    );
  }
}
