import { PartialType } from "@nestjs/swagger";
import { NewFarmDto } from "./createFarmDto";



export class UpdateFarmDto extends PartialType(NewFarmDto){}