import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';

import { UsersRepositoryInterface } from '@app/common';

export class CreateUser {
  constructor(
    @Inject('UsersRepositoryInterface')
    private readonly usersRepository: UsersRepositoryInterface,
    private readonly configService: ConfigService,
  ) {}

  public async run() {
    const userEmail = this.configService.get('ADMIN_EMAIL');
    const userPass = this.configService.get('ADMIN_PASSWORD');

    // verificamos si existe el administrador
    const existingAdmin = await this.usersRepository.findByCondition({
      where: { email: 'admin@example.com' },
      select: ['id', 'rol', 'email', 'password'],
    });
    const hashedPassword = await this.hashPassword(userPass);
    if (existingAdmin) {
      console.log('Existe el administrador');
      const doesPasswordMatch = await this.doesPasswordMatch(userPass, existingAdmin.password);      
      if (existingAdmin.email !== userEmail || existingAdmin.rol !== 'admin' || !doesPasswordMatch) {
        console.log('administrador debe ser actualizado!');
        existingAdmin.email = userEmail;
        existingAdmin.rol = 'admin';
        existingAdmin.password = hashedPassword;
        const responseAdmin = await this.usersRepository.save(existingAdmin);
        console.log('administrador actualizado: ', responseAdmin);
      }
    } else {
      console.log('No existe el administrador');
      const responseAdmin = await this.usersRepository.save({
        firstName: 'HarvestLedger',
        email: userEmail,
        password: hashedPassword,
        rol: 'admin',
      });
      console.log('administrador creado: ', responseAdmin);
      delete responseAdmin.password;
    }
    
    // console.log('credenciales: ', userEmail, userPass);
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