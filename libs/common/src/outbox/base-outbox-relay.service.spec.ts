import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { BaseOutboxRelayService } from './base-outbox-relay.service';

// Pure unit test: the DataSource and the target client are mocked, so nothing
// touches Postgres or the broker.
class TestOutboxRelayService extends BaseOutboxRelayService {
  protected readonly logger = new Logger('TestOutboxRelayService');
}

describe('BaseOutboxRelayService', () => {
  let service: BaseOutboxRelayService;
  let manager: { query: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let targetClient: { emit: jest.Mock };
  let config: { get: jest.Mock };

  const buildManager = (pendingRows: any[]) => ({
    // First call is the SELECT ... FOR UPDATE SKIP LOCKED; the rest are UPDATEs.
    query: jest.fn((sql: string) =>
      sql.includes('SELECT') ? Promise.resolve(pendingRows) : Promise.resolve(),
    ),
  });

  beforeEach(() => {
    config = { get: jest.fn().mockReturnValue('true') };
    targetClient = { emit: jest.fn().mockReturnValue(of(undefined)) };
    manager = buildManager([]);
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    service = new TestOutboxRelayService(
      dataSource as any,
      config as any,
      targetClient as any,
      'OUTBOX_RELAY_ENABLED',
    );
  });

  it('does nothing when the relay is disabled', async () => {
    config.get.mockReturnValue('false');
    await service.drain();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(config.get).toHaveBeenCalledWith('OUTBOX_RELAY_ENABLED');
  });

  it('publishes each pending row and marks it published', async () => {
    manager = buildManager([
      { id: 1, pattern: 'crop.initialized', payload: { cropId: 7 } },
      { id: 2, pattern: 'harvest.created', payload: { cropId: 7 } },
    ]);
    dataSource.transaction = jest.fn((cb) => cb(manager));

    await service.drain();

    expect(targetClient.emit).toHaveBeenCalledWith('crop.initialized', {
      cropId: 7,
    });
    expect(targetClient.emit).toHaveBeenCalledWith('harvest.created', {
      cropId: 7,
    });
    const updates = manager.query.mock.calls.filter(([sql]) =>
      sql.includes('SET "publishedAt"'),
    );
    expect(updates.map(([, params]) => params[0])).toEqual([1, 2]);
  });

  it('bumps attempts and leaves the row pending when the publish fails', async () => {
    manager = buildManager([
      { id: 9, pattern: 'crop.initialized', payload: {} },
    ]);
    dataSource.transaction = jest.fn((cb) => cb(manager));
    targetClient.emit.mockReturnValue(
      throwError(() => new Error('broker down')),
    );

    await service.drain();

    const marks = manager.query.mock.calls.filter(([sql]) =>
      sql.includes('SET "publishedAt"'),
    );
    const bumps = manager.query.mock.calls.filter(([sql]) =>
      sql.includes('attempts = attempts + 1'),
    );
    expect(marks).toHaveLength(0);
    expect(bumps).toHaveLength(1);
    expect(bumps[0][1][0]).toBe(9);
  });

  it('does not run a second drain while one is in flight', async () => {
    let release: () => void;
    const gate = new Promise<void>((r) => (release = r));
    dataSource.transaction = jest.fn(async (cb) => {
      await gate; // hold the first drain open
      return cb(buildManager([]));
    });

    const first = service.drain();
    await service.drain(); // should early-return on the in-flight guard
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('reads the enabled switch from the key the subclass supplied', async () => {
    // Each service owns its own outbox and its own switch key — auth's relay
    // (Task 7) must not be silenced by farms' variable.
    const other = new TestOutboxRelayService(
      dataSource as any,
      config as any,
      targetClient as any,
      'AUTH_OUTBOX_RELAY_ENABLED',
    );
    await other.drain();
    expect(config.get).toHaveBeenCalledWith('AUTH_OUTBOX_RELAY_ENABLED');
  });

  // --- fan-out routing ----------------------------------------------------
  // A single client means "everything goes here" (farms -> tracing). A routing
  // table means one event can reach several services that know nothing about
  // each other — what user.created needs: farms' read model AND the welcome
  // email.
  describe('per-pattern routing', () => {
    let farms: { emit: jest.Mock };
    let notifications: { emit: jest.Mock };

    const routed = (rows: any[]) => {
      farms = { emit: jest.fn().mockReturnValue(of(undefined)) };
      notifications = { emit: jest.fn().mockReturnValue(of(undefined)) };
      manager = buildManager(rows);
      dataSource = { transaction: jest.fn((cb) => cb(manager)) };
      return new TestOutboxRelayService(
        dataSource as any,
        config as any,
        {
          'user.created': [farms as any, notifications as any],
          'user.updated': [farms as any],
        },
        'OUTBOX_RELAY_ENABLED',
      );
    };

    it('fans one event out to every target registered for its pattern', async () => {
      const relay = routed([
        { id: 1, pattern: 'user.created', payload: { id: 9 } },
      ]);

      await relay.drain();

      expect(farms.emit).toHaveBeenCalledWith('user.created', { id: 9 });
      expect(notifications.emit).toHaveBeenCalledWith('user.created', {
        id: 9,
      });
    });

    it('sends a pattern only to its own targets', async () => {
      const relay = routed([
        { id: 1, pattern: 'user.updated', payload: { id: 9 } },
      ]);

      await relay.drain();

      expect(farms.emit).toHaveBeenCalledTimes(1);
      expect(notifications.emit).not.toHaveBeenCalled();
    });

    it('leaves a row pending — never silently dropped — when no target is registered', async () => {
      const relay = routed([
        { id: 1, pattern: 'user.deleted', payload: { id: 9 } },
      ]);

      await relay.drain();

      expect(farms.emit).not.toHaveBeenCalled();
      const published = manager.query.mock.calls.filter(([sql]) =>
        sql.includes('SET \"publishedAt\"'),
      );
      expect(published).toHaveLength(0);
    });

    it('does not mark the row published when only one of the targets fails', async () => {
      const relay = routed([
        { id: 1, pattern: 'user.created', payload: { id: 9 } },
      ]);
      notifications.emit.mockReturnValue(throwError(() => new Error('down')));

      await relay.drain();

      const published = manager.query.mock.calls.filter(([sql]) =>
        sql.includes('SET \"publishedAt\"'),
      );
      expect(published).toHaveLength(0);
    });
  });

  // The outbox breaks the synchronous call chain, so the trace context rides
  // inside the payload. It must not leak into what the consumer receives.
  it('strips the trace carrier from the payload before publishing', async () => {
    manager = buildManager([
      {
        id: 1,
        pattern: 'user.created',
        payload: { id: 9, _trace: { traceparent: '00-abc-def-01' } },
      },
    ]);
    dataSource.transaction = jest.fn((cb) => cb(manager));

    await service.drain();

    expect(targetClient.emit).toHaveBeenCalledWith('user.created', { id: 9 });
  });
});
