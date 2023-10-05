import { Injectable } from "@nestjs/common";
import { BaseAbstractRepository } from "./base/base.abstract.repository";
import { FarmEntity } from "../entities/farms.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FarmRepositoryInterface } from "../interfaces/farms.respositoy.interface";

@Injectable()
export class FarmsRepository 
  extends BaseAbstractRepository<FarmEntity> 
  implements FarmRepositoryInterface {
    constructor(
      @InjectRepository(FarmEntity)
      private readonly farmRepository: Repository<FarmEntity>, // Remove the extra closing parenthesis here
    ) {
      super(farmRepository);
    }
}
