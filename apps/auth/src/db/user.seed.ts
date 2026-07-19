import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { Inject, Logger } from '@nestjs/common';

import { UsersRepositoryInterface } from '@app/common';

/**
 * Crea (o reconcilia) la cuenta de administrador a partir del entorno.
 *
 * El administrador se identifica siempre por ADMIN_EMAIL: no hay cuentas
 * privilegiadas hardcodeadas en el código.
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
        'ADMIN_EMAIL o ADMIN_PASSWORD no definidos: se omite el seed de administrador.',
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
      this.logger.log(`Administrador creado: ${adminEmail}`);
      return;
    }

    // Reconcilia rol y contraseña si el entorno cambió desde el último arranque.
    const passwordMatches = await this.doesPasswordMatch(
      adminPass,
      existingAdmin.password,
    );
    if (existingAdmin.rol !== 'admin' || !passwordMatches) {
      existingAdmin.rol = 'admin';
      existingAdmin.password = await this.hashPassword(adminPass);
      await this.usersRepository.save(existingAdmin);
      this.logger.log(`Administrador actualizado: ${adminEmail}`);
      return;
    }

    this.logger.log('Administrador ya existe y está al día.');
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
