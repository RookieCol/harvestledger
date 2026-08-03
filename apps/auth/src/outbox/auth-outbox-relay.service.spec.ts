import { of } from 'rxjs';
import { AuthOutboxRelayService } from './auth-outbox-relay.service';

// The draining behaviour itself is covered by the base class's own spec
// (libs/common/src/outbox/base-outbox-relay.service.spec.ts); what this
// verifies is auth's wiring: its own pause switch and its own client.
describe('AuthOutboxRelayService', () => {
  it('drains through the base class using the AUTH_OUTBOX_RELAY_ENABLED switch', async () => {
    const config = { get: jest.fn().mockReturnValue('false') };
    const dataSource = { transaction: jest.fn() };
    const farmsClient = { emit: jest.fn().mockReturnValue(of(undefined)) };
    const notificationsClient = {
      emit: jest.fn().mockReturnValue(of(undefined)),
    };

    const service = new AuthOutboxRelayService(
      dataSource as any,
      config as any,
      farmsClient as any,
      notificationsClient as any,
    );

    await service.drain();

    expect(config.get).toHaveBeenCalledWith('AUTH_OUTBOX_RELAY_ENABLED');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
