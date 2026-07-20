import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
      throw new UnauthorizedException('Missing authorization header');
    }

    const authHeaderParts = (authHeader as string).split(' ');

    if (authHeaderParts.length !== 2) {
      throw new UnauthorizedException(
        'Malformed authorization header',
      );
    }

    const [, jwt] = authHeaderParts;

    return this.authService.send({ cmd: 'verify-jwt' }, { jwt }).pipe(
      switchMap(({ exp, user }) => {
        if (!exp) {
          throw new UnauthorizedException('JWT token has no expiration date');
        }

        const TOKEN_EXP_MS = exp * 1000;
        const isJwtValid = Date.now() < TOKEN_EXP_MS;

        if (!isJwtValid) {
          throw new UnauthorizedException('JWT token expired');
        }

        // Attach the user to the request object
        request.user = user;

        return of(true);
      }),
      catchError((error) => {
        console.error('Authentication error', error);
        throw new UnauthorizedException('Authentication error');
      }),
    );
  }
}
