import * as request from 'supertest';
import {
  ClientProxy,
  ClientProxyFactory,
  Transport,
} from '@nestjs/microservices';
import { E2EHarness, startHarness, HARNESS_BOOT_TIMEOUT_MS } from './harness';

/**
 * The Phase 5 consistency drill, automated.
 *
 * Splitting the databases means `farms` can no longer read `users`; it keeps a
 * local `user_projection` fed by events from auth's transactional outbox. Two
 * properties make that honest, and neither can be checked without both real
 * databases and a real broker in the loop:
 *
 *  1. DURABILITY — if the publisher is down when a user registers, the event
 *     is not lost. It sits committed in auth's `outbox` (same transaction as
 *     the `users` row) and lands in farms once publishing resumes.
 *  2. IDEMPOTENCY — a redelivered event converges on one row instead of
 *     duplicating or corrupting it. At-least-once delivery guarantees this
 *     will happen in production; the upsert is what makes it harmless.
 *
 * The outage is simulated with the relay's own operational switch
 * (AUTH_OUTBOX_RELAY_ENABLED=false), which is exactly what it exists for.
 */
describe('user_projection consistency (e2e)', () => {
  let harness: E2EHarness;
  let http: () => request.SuperTest<request.Test>;
  let farmsClient: ClientProxy;

  const user = {
    firstName: 'Cora',
    lastName: 'Projected',
    email: 'cora@e2e.test',
    password: 'Password123!',
    documentNumber: 2001,
  };

  // The relay wakes on a 3s interval; give it a few cycles before failing.
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

  const projectionRows = (email: string) =>
    harness.query.farms(
      `select * from user_projection where email = '${email}'`,
    );

  beforeAll(async () => {
    harness = await startHarness();
    http = () => request(harness.gateway.getHttpServer());

    farmsClient = ClientProxyFactory.create({
      transport: Transport.RMQ,
      options: {
        urls: [
          `amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASS}@${process.env.RABBITMQ_HOST}`,
        ],
        queue: process.env.RABBITMQ_FARMS_QUEUE,
        queueOptions: { durable: true },
      },
    });
    await farmsClient.connect();
  }, HARNESS_BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await farmsClient?.close();
    await harness?.teardown();
  }, HARNESS_BOOT_TIMEOUT_MS);

  it('survives a publisher outage: the event waits in auth’s outbox and lands once publishing resumes', async () => {
    // --- publisher "down" ---------------------------------------------------
    process.env.AUTH_OUTBOX_RELAY_ENABLED = 'false';

    await http().post('/api/v1/auth/register').send(user).expect(201);

    // The user exists in auth, and its event is committed but unpublished.
    const [pending] = await harness.query.auth(
      `select count(*)::int as count from outbox where pattern = 'user.created' and "publishedAt" is null`,
    );
    expect(pending.count).toBeGreaterThan(0);

    // Nothing has reached farms yet — this is the window where a naive
    // "publish after commit" would have lost the event outright.
    expect(await projectionRows(user.email)).toHaveLength(0);

    // --- publisher back up --------------------------------------------------
    process.env.AUTH_OUTBOX_RELAY_ENABLED = 'true';

    const landed = await waitFor(
      async () => (await projectionRows(user.email)).length === 1,
    );
    expect(landed).toBe(true);

    const [row] = await projectionRows(user.email);
    expect(row).toEqual(
      expect.objectContaining({ firstName: 'Cora', lastName: 'Projected' }),
    );
  });

  it('converges on redelivery: the same event twice leaves exactly one row', async () => {
    const [existing] = await projectionRows(user.email);

    // At-least-once delivery, forced: re-emit the identical event.
    farmsClient.emit('user.created', {
      id: existing.id,
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      rol: existing.rol,
    });
    farmsClient.emit('user.created', {
      id: existing.id,
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      rol: existing.rol,
    });

    // Give the consumer time to process both before asserting the count.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const rows = await projectionRows(user.email);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(existing.id);
  });

  it('applies a later user.updated to the same row', async () => {
    const [existing] = await projectionRows(user.email);

    farmsClient.emit('user.updated', {
      id: existing.id,
      firstName: 'Cora',
      lastName: 'Renamed',
      email: existing.email,
      rol: 'admin',
    });

    const updated = await waitFor(async () => {
      const [row] = await projectionRows(user.email);
      return row?.lastName === 'Renamed' && row?.rol === 'admin';
    });
    expect(updated).toBe(true);
    expect(await projectionRows(user.email)).toHaveLength(1);
  });
});
