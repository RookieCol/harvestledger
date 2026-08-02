import { UserProjectionService } from './user-projection.service';

describe('UserProjectionService', () => {
  let repository: { upsert: jest.Mock };
  let service: UserProjectionService;

  beforeEach(() => {
    repository = { upsert: jest.fn() };
    service = new UserProjectionService(repository as any);
  });

  it('upserts by id on user.created', async () => {
    await service.upsert({
      id: 1,
      firstName: 'Ana',
      lastName: 'Diaz',
      email: 'ana@example.com',
      rol: 'farmer',
    });

    expect(repository.upsert).toHaveBeenCalledWith(
      {
        id: 1,
        firstName: 'Ana',
        lastName: 'Diaz',
        email: 'ana@example.com',
        rol: 'farmer',
      },
      ['id'],
    );
  });

  it('converges instead of duplicating when the same event is redelivered', async () => {
    const event = {
      id: 1,
      firstName: 'Ana',
      lastName: 'Diaz',
      email: 'ana@example.com',
      rol: 'farmer',
    };

    await service.upsert(event);
    await service.upsert(event);

    expect(repository.upsert).toHaveBeenCalledTimes(2);
    // Both calls target the same row (same `id` conflict key) — a real
    // Postgres upsert would leave exactly one row; this asserts the
    // conflict key used to guarantee that.
    expect(repository.upsert.mock.calls[0][1]).toEqual(['id']);
    expect(repository.upsert.mock.calls[1][1]).toEqual(['id']);
  });

  it('applies an update on user.updated the same way', async () => {
    await service.upsert({
      id: 1,
      firstName: 'Ana',
      lastName: 'Diaz',
      email: 'ana@example.com',
      rol: 'admin', // promoted
    });

    expect(repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, rol: 'admin' }),
      ['id'],
    );
  });

  it('normalises missing optional fields to null', async () => {
    await service.upsert({
      id: 2,
      firstName: 'Bo',
      email: 'bo@example.com',
    } as any);

    expect(repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ lastName: null, rol: null }),
      ['id'],
    );
  });
});
