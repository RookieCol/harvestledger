import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseAbstractRepository } from './base/base.abstract.repository';
import { CropEntity } from '../entities/crops.entity';

@Injectable()
export class CropsRepository extends BaseAbstractRepository<CropEntity> {
  constructor(
    @InjectRepository(CropEntity)
    private readonly cropRepository: Repository<CropEntity>,
  ) {
    super(cropRepository);
  }
}
