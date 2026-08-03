import { Allow } from 'class-validator';

// Internal event payload emitted by `auth` when a user asks to reset their
// password, consumed by `notifications` to send the email. The token is the
// raw (unhashed) JWT — auth stores only its bcrypt hash — so this event is
// as sensitive as the email it produces and never leaves the cluster.
export class PasswordResetRequestedDto {
  @Allow()
  email: string;

  @Allow()
  token: string;
}
