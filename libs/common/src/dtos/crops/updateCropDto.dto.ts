import { PartialType } from "@nestjs/swagger";
import { CreateCropDto } from "./createCropDto.dto";


export class UpdateCropDto extends PartialType(CreateCropDto) {}