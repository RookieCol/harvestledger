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

    // Log para depuración
    console.log('authHeader', authHeader);

    if (!authHeader) {
      return false;
    }

    const authHeaderParts = (authHeader as string).split(' ');

    if (authHeaderParts.length !== 2) {
      // Manejo de error específico para el formato incorrecto del encabezado de autorización
      throw new UnauthorizedException('Formato de encabezado de autorización incorrecto');
    }

    const [, jwt] = authHeaderParts;

    return this.authService.send({ cmd: 'verify-jwt' }, { jwt }).pipe(
      switchMap(({ exp }) => {
        if (!exp) {
          // Log para depuración
          console.log('No exp');
          // Manejo de error específico para tokens JWT sin fecha de expiración
          throw new UnauthorizedException('Token JWT sin fecha de expiración');
        }

        const TOKEN_EXP_MS = exp * 1000;
        const isJwtValid = Date.now() < TOKEN_EXP_MS;

        if (!isJwtValid) {
          // Log para depuración
          console.log('Token JWT caducado');
          // Manejo de error específico para tokens JWT caducados
          throw new UnauthorizedException('Token JWT caducado');
        }

        return of(true); // La autenticación es exitosa
      }),
      catchError((error) => {
        // Log para depuración
        console.error('Error de autenticación', error);
        // Manejo de error genérico en caso de problemas con el servicio de autenticación
        throw new UnauthorizedException('Error de autenticación');
      }),
    );
  }
}
