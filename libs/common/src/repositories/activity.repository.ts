import { Injectable } from "@nestjs/common";
import { BaseAbstractRepository } from "./base/base.abstract.repository";
import { ActivitiesEntity } from "../entities/activities.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm"; 

@Injectable()
export class ActivitiesRepository extends BaseAbstractRepository<ActivitiesEntity> {
    constructor(
        @InjectRepository(ActivitiesEntity)
        private readonly activitiesRepository: Repository<ActivitiesEntity>
    ) {
        super(activitiesRepository);
    }
}
