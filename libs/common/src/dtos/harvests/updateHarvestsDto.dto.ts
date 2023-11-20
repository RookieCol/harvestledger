import { PartialType } from '@nestjs/swagger';
import { CreateHarvestDto } from './createHarvestDto.dto';

export class UpdateHarvestDto extends PartialType(CreateHarvestDto) {}
