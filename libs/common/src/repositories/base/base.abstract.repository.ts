import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';

import { BaseInterfaceRepository } from './base.interface.repository';

interface HasId {
  id: number;
}

export abstract class BaseAbstractRepository<T extends HasId>
  implements BaseInterfaceRepository<T>
{
  private entity: Repository<T>;

  protected constructor(entity: Repository<T>) {
      this.entity = entity;
  }

  public async save(data: DeepPartial<T>): Promise<T> {
      return await this.entity.save(data);
  }

  public async saveMany(data: DeepPartial<T>[]): Promise<T[]> {
      return await this.entity.save(data);
  }

  public create(data: DeepPartial<T>): T {
      return this.entity.create(data);
  }

  public createMany(data: DeepPartial<T>[]): T[] {
      return this.entity.create(data);
  }

  public async findOneById(id: any): Promise<T> {
    const options: FindOptionsWhere<T> = {
      id: id,
    };
    return await this.entity.findOneBy(options);
  }

  public async findByCondition(filterCondition: FindOneOptions<T>): Promise<T | undefined> {
      return await this.entity.findOne(filterCondition);
  }

  public async findWithRelations(relations: FindManyOptions<T>): Promise<T[]> {
      return await this.entity.find(relations);
  }

  public async findAll(options?: FindManyOptions<T>): Promise<T[]> {
      return await this.entity.find(options);
  }

  public async remove(data: T): Promise<T> {
      return await this.entity.remove(data);
  }

  public async preload(entityLike: DeepPartial<T>): Promise<T | undefined> {
      return await this.entity.preload(entityLike);
  }

  public async update(id: number, data: DeepPartial<T>): Promise<T | undefined> {
      const existingEntity = await this.findOneById(id);
      
      if (!existingEntity) {
          return undefined; // Entity with the given ID does not exist
      }

      const updatedEntity = this.entity.merge(existingEntity, data);
      return this.entity.save(updatedEntity);
  }
}
