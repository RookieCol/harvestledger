import { Allow } from 'class-validator';

// Internal event payload emitted by `auth` (user.created / user.updated) and
// consumed by `farms` to keep its local UserProjectionEntity in sync. The
// fields carry already-trusted data; @Allow() keeps them from being stripped
// by the whitelisting ValidationPipe without imposing validation on them.
export class UserProjectionEventDto {
  @Allow()
  id: number;

  @Allow()
  firstName: string;

  @Allow()
  lastName: string | null;

  @Allow()
  email: string;

  @Allow()
  rol: string | null;
}
