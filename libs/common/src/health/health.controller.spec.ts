import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('runs an (empty) health check and returns its result', async () => {
    const health = {
      check: jest.fn().mockResolvedValue({ status: 'ok' }),
    };
    const controller = new HealthController(health as any);

    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
    expect(health.check).toHaveBeenCalledWith([]);
  });
});
