import { PartialType } from "@nestjs/swagger";
import { CreateActivityDto } from "./createActivityDto.dto";


export class UpdateActivityDto extends PartialType(CreateActivityDto) {}