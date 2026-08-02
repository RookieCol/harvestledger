import * as request from 'supertest';
import { E2EHarness, startHarness, HARNESS_BOOT_TIMEOUT_MS } from './harness';

/**
 * The authorization e2e the roadmap has been promising since Phase 1: user A
 * asks for user B's resources and must be refused — over the real transport,
 * against a real database, through every hop that is supposed to enforce it.
 *
 * This is the test that a unit test cannot replace. `OwnershipService` is
 * unit-tested in isolation, but "the guard rejects a foreign id when called"
 * and "the HTTP API rejects a foreign id" are different claims: between them
 * sit the gateway's JWT guard, the RabbitMQ hop, the RPC exception filter that
 * has to carry a 403 back across the wire, and the controllers that have to
 * pass `req.user.id` rather than trusting a client-supplied one.
 */
describe('IDOR (e2e)', () => {
  let harness: E2EHarness;
  let http: () => request.SuperTest<request.Test>;

  // Two real, registered users. B owns everything; A is the intruder.
  const userA = {
    firstName: 'Alice',
    lastName: 'Intruder',
    email: 'alice@e2e.test',
    password: 'Password123!',
    documentNumber: 1001,
  };
  const userB = {
    firstName: 'Bob',
    lastName: 'Owner',
    email: 'bob@e2e.test',
    password: 'Password123!',
    documentNumber: 1002,
  };

  let tokenA: string;
  let tokenB: string;
  let farmB: number;
  let cropB: number;
  let activityB: number;
  let harvestB: number;

  const login = async (user: { email: string; password: string }) => {
    const response = await http()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(201);
    return response.body.accesToken as string;
  };

  beforeAll(async () => {
    harness = await startHarness();
    http = () => request(harness.gateway.getHttpServer());

    await http().post('/api/v1/auth/register').send(userA).expect(201);
    await http().post('/api/v1/auth/register').send(userB).expect(201);

    tokenA = await login(userA);
    tokenB = await login(userB);

    // Everything below belongs to B, created through the public API — no
    // direct database seeding, so the ownership rows are written by the same
    // code path production uses.
    const farmResponse = await http()
      .post('/api/v1/farms')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'North field', location: 'Boyacá', state: 1, area: 12 })
      .expect(201);
    farmB = farmResponse.body.data.id;

    const cropResponse = await http()
      .post('/api/v1/crops')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Tomatoes',
        product: 'Tomato',
        size: 3,
        location: 'Plot 1',
        sowingDate: '2026-03-01',
        plants: 500,
        farmId: farmB,
      })
      .expect(201);
    cropB = cropResponse.body.data.id;

    const activityResponse = await http()
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        cropId: cropB,
        type: 'irrigation',
        title: 'Drip irrigation',
        inputDate: '2026-03-05',
      })
      .expect(201);
    activityB = activityResponse.body.data.id;

    const harvestResponse = await http()
      .post('/api/v1/harvests')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        cropId: cropB,
        harvestDate: '2026-06-01',
        amount: 100,
        unit: 'kg',
        category: 'A',
      })
      .expect(201);
    harvestB = harvestResponse.body.data.id;
  }, HARNESS_BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await harness?.teardown();
  }, HARNESS_BOOT_TIMEOUT_MS);

  describe('the owner can reach their own resources', () => {
    // The control group. Without it, a broken pipeline that 403s everything
    // would make every test below pass for the wrong reason.
    it('B reads their own crop', async () => {
      const response = await http()
        .get(`/api/v1/crops/findOne/${cropB}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(response.body.data.id).toBe(cropB);
    });

    it("B lists their own farm's crops", async () => {
      await http()
        .get(`/api/v1/crops?farmId=${farmB}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
    });
  });

  describe('A is refused every one of B’s resources', () => {
    it('403 reading B’s crop', async () => {
      await http()
        .get(`/api/v1/crops/findOne/${cropB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
    });

    it('403 listing crops of B’s farm', async () => {
      await http()
        .get(`/api/v1/crops?farmId=${farmB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
    });

    it('403 updating B’s crop', async () => {
      await http()
        .patch(`/api/v1/crops?cropId=${cropB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hijacked' })
        .expect(403);
    });

    it('403 deleting B’s crop', async () => {
      await http()
        .delete(`/api/v1/crops?cropId=${cropB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
    });

    it('403 updating B’s farm', async () => {
      await http()
        .patch(`/api/v1/farms?farmId=${farmB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hijacked' })
        .expect(403);
    });

    it('403 deleting B’s farm', async () => {
      await http()
        .delete(`/api/v1/farms?farmId=${farmB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
    });

    it('403 listing activities of B’s crop', async () => {
      await http()
        .get(`/api/v1/activities?cropId=${cropB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
    });

    it('403 deleting B’s activity', async () => {
      await http()
        .delete(`/api/v1/activities?activityId=${activityB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
    });

    it('403 listing harvests of B’s crop', async () => {
      await http()
        .get(`/api/v1/harvests?cropId=${cropB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
    });

    it('403 deleting B’s harvest', async () => {
      await http()
        .delete(`/api/v1/harvests?harvestId=${harvestB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
    });

    it('403 creating a crop inside B’s farm', async () => {
      // The write-side of the same flaw: not reading someone else's data but
      // attaching your own to their farm.
      await http()
        .post('/api/v1/crops')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Squatter',
          product: 'Maize',
          size: 1,
          location: 'Plot 9',
          sowingDate: '2026-04-01',
          plants: 10,
          farmId: farmB,
        })
        .expect(403);
    });
  });

  describe('B’s resources survive A’s attempts', () => {
    it('the crop is unchanged and still there', async () => {
      const response = await http()
        .get(`/api/v1/crops/findOne/${cropB}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(response.body.data.name).toBe('Tomatoes');
    });
  });

  describe('a missing resource is 404, not 403', () => {
    // 404-vs-403 all the way through the RPC hop, not just inside the guard.
    it('404 for a crop id that does not exist', async () => {
      await http()
        .get('/api/v1/crops/findOne/999999')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });

  describe('authentication is required at all', () => {
    it('401 without a token', async () => {
      await http().get(`/api/v1/crops/findOne/${cropB}`).expect(401);
    });

    it('401 with a forged token', async () => {
      await http()
        .get(`/api/v1/crops/findOne/${cropB}`)
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });
  });
});
