import { NotificationsController } from './notifications.controller';

describe('NotificationsController', () => {
  let notificationsService: {
    welcomeEmail: jest.Mock;
    forgotPasswordEmail: jest.Mock;
  };
  let controller: NotificationsController;

  beforeEach(() => {
    notificationsService = {
      welcomeEmail: jest.fn(),
      forgotPasswordEmail: jest.fn(),
    };
    controller = new NotificationsController(notificationsService as any);
  });

  it('sends the welcome email on user.created', async () => {
    await controller.handleUserCreated({
      id: 1,
      firstName: 'Ana',
      lastName: 'Diaz',
      email: 'ana@example.com',
      rol: null,
    });

    expect(notificationsService.welcomeEmail).toHaveBeenCalledWith(
      'ana@example.com',
      'Ana Diaz',
    );
  });

  it('does not render a dangling "undefined" when the user has no last name', async () => {
    await controller.handleUserCreated({
      id: 2,
      firstName: 'Bo',
      lastName: null,
      email: 'bo@example.com',
      rol: null,
    });

    expect(notificationsService.welcomeEmail).toHaveBeenCalledWith(
      'bo@example.com',
      'Bo',
    );
  });

  it('sends the reset email with the raw token on user.password_reset_requested', async () => {
    await controller.handlePasswordResetRequested({
      email: 'ana@example.com',
      token: 'raw-jwt',
    });

    expect(notificationsService.forgotPasswordEmail).toHaveBeenCalledWith(
      'ana@example.com',
      'raw-jwt',
    );
  });
});
