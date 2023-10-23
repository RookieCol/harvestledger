import { Injectable } from "@nestjs/common";
import { BaseAbstractRepository } from "./base/base.abstract.repository";
import { HarvestEntity } from "../entities/harvest.entity";
import { HarvestsRepositoryInterface } from "../interfaces/harvests.repository.interface";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";




@Injectable()
export class HarvestsRepository 
extends BaseAbstractRepository<HarvestEntity>
implements HarvestsRepositoryInterface
{
    constructor(
        @InjectRepository(HarvestEntity)
        private readonly HarvestRepository: Repository<HarvestEntity>
        ){
            super (HarvestRepository)
        }




}

