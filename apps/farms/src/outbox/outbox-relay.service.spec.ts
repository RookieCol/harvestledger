import { of, throwError } from 'rxjs';
import { OutboxRelayService } from './outbox-relay.service';

// Pure unit test: the DataSource and the tracing client are mocked, so nothing
// touches Postgres or the broker.
describe('OutboxRelayService', () => {
  let service: OutboxRelayService;
  let manager: { query: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let tracingClient: { emit: jest.Mock };
  let config: { get: jest.Mock };

  const buildManager = (pendingRows: any[]) => ({
    // First call is the SELECT ... FOR UPDATE SKIP LOCKED; the rest are UPDATEs.
    query: jest.fn((sql: string) =>
      sql.includes('SELECT') ? Promise.resolve(pendingRows) : Promise.resolve(),
    ),
  });

  beforeEach(() => {
    config = { get: jest.fn().mockReturnValue('true') };
    tracingClient = { emit: jest.fn().mockReturnValue(of(undefined)) };
    manager = buildManager([]);
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    service = new OutboxRelayService(
      dataSource as any,
      config as any,
      tracingClient as any,
    );
  });

  it('does nothing when the relay is disabled', async () => {
    config.get.mockReturnValue('false');
    await service.drain();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('publishes each pending row and marks it published', async () => {
    manager = buildManager([
      { id: 1, pattern: 'crop.initialized', payload: { cropId: 7 } },
      { id: 2, pattern: 'harvest.created', payload: { cropId: 7 } },
    ]);
    dataSource.transaction = jest.fn((cb) => cb(manager));

    await service.drain();

    expect(tracingClient.emit).toHaveBeenCalledWith('crop.initialized', {
      cropId: 7,
    });
    expect(tracingClient.emit).toHaveBeenCalledWith('harvest.created', {
      cropId: 7,
    });
    // Each published row gets a publishedAt UPDATE (id 1 and id 2).
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
    tracingClient.emit.mockReturnValue(
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
});
