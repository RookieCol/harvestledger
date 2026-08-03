import * as request from 'supertest';
import { E2EHarness, startHarness, HARNESS_BOOT_TIMEOUT_MS } from './harness';

/**
 * Fan-out across the mesh, end to end.
 *
 * One registration produces one `user.created` row in auth's outbox, and that
 * single event has to reach two services that know nothing about each other:
 * `farms` upserts its local read model, `notifications` sends the welcome
 * email. This is the claim the new service exists to make, and it is only
 * true if both land from the same event — hence a real SMTP sink (Mailpit)
 * rather than a mocked mailer.
 *
 * It also pins the reason the split was worth doing: `auth` no longer sends
 * mail itself, so the registration response does not wait on SMTP.
 */
describe('notifications fan-out (e2e)', () => {
  let harness: E2EHarness;
  let http: () => request.SuperTest<request.Test>;

  const user = {
    firstName: 'Nora',
    lastName: 'Notified',
    email: 'nora@e2e.test',
    password: 'Password123!',
    documentNumber: 3001,
  };

  const waitFor = async (
    predicate: () => Promise<boolean>,
    timeoutMs = 20_000,
  ) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  };

  // Mailpit's REST API: every message it has accepted over SMTP.
  const inboxFor = async (email: string) => {
    const response = await fetch(`${harness.mailpitUrl}/api/v1/messages`);
    const body = (await response.json()) as { messages?: any[] };
    return (body.messages ?? []).filter((message) =>
      (message.To ?? []).some((to: any) => to.Address === email),
    );
  };

  beforeAll(async () => {
    harness = await startHarness();
    http = () => request(harness.gateway.getHttpServer());
  }, HARNESS_BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await harness?.teardown();
  }, HARNESS_BOOT_TIMEOUT_MS);

  it('one user.created reaches both farms (read model) and notifications (email)', async () => {
    await http().post('/api/v1/auth/register').send(user).expect(201);

    const emailed = await waitFor(
      async () => (await inboxFor(user.email)).length === 1,
    );
    expect(emailed).toBe(true);

    const [message] = await inboxFor(user.email);
    expect(message.Subject).toContain('Nora Notified');

    // Same event, other consumer: the projection landed too.
    const projected = await waitFor(async () => {
      const rows = await harness.query.farms(
        `select * from user_projection where email = '${user.email}'`,
      );
      return rows.length === 1;
    });
    expect(projected).toBe(true);
  });

  it('emails the raw reset token on a password reset request', async () => {
    await http()
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email })
      .expect(201);

    const arrived = await waitFor(async () =>
      (await inboxFor(user.email)).some((message: any) =>
        (message.Subject ?? '').includes('Reset Password'),
      ),
    );
    expect(arrived).toBe(true);

    // Only the bcrypt hash is stored; the usable token exists solely in the
    // email. If those ever diverge the reset link silently stops working.
    const [row] = await harness.query.auth(
      `select "forgotPasswordToken" from users where email = '${user.email}'`,
    );
    expect(row.forgotPasswordToken).toMatch(/^\$2[aby]\$/);
  });
});
