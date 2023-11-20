import { PartialType } from "@nestjs/swagger";
import { CreateFarmDto } from "./createFarmDto.dto";



export class UpdateFarmDto extends PartialType(CreateFarmDto){}