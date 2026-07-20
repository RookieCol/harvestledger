import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { Inject, Logger } from '@nestjs/common';

import { UsersRepositoryInterface } from '@app/common';

/**
 * Creates (or reconciles) the administrator account from the environment.
 *
 * The administrator is always identified by ADMIN_EMAIL: there are no
 * privileged accounts hardcoded in the source.
 */
export class CreateUser {
  private readonly logger = new Logger(CreateUser.name);

  constructor(
    @Inject('UsersRepositoryInterface')
    private readonly usersRepository: UsersRepositoryInterface,
    private readonly configService: ConfigService,
  ) {}

  public async run() {
    const adminEmail = this.configService.get('ADMIN_EMAIL');
    const adminPass = this.configService.get('ADMIN_PASSWORD');

    if (!adminEmail || !adminPass) {
      this.logger.warn(
        'ADMIN_EMAIL or ADMIN_PASSWORD not set: skipping administrator seed.',
      );
      return;
    }

    const existingAdmin = await this.usersRepository.findByCondition({
      where: { email: adminEmail },
      select: ['id', 'rol', 'email', 'password'],
    });

    if (!existingAdmin) {
      await this.usersRepository.save({
        firstName: 'Admin',
        email: adminEmail,
        password: await this.hashPassword(adminPass),
        rol: 'admin',
      });
      this.logger.log(`Administrator created: ${adminEmail}`);
      return;
    }

    // Reconcile role and password if the environment changed since the last startup.
    const passwordMatches = await this.doesPasswordMatch(
      adminPass,
      existingAdmin.password,
    );
    if (existingAdmin.rol !== 'admin' || !passwordMatches) {
      existingAdmin.rol = 'admin';
      existingAdmin.password = await this.hashPassword(adminPass);
      await this.usersRepository.save(existingAdmin);
      this.logger.log(`Administrator updated: ${adminEmail}`);
      return;
    }

    this.logger.log('Administrator already exists and is up to date.');
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  private async doesPasswordMatch(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }
}
