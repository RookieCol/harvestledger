import { FarmDto } from '@app/common/dto/farmsDto.dto';
import { Inject, Injectable } from '@nestjs/common';
import { FarmRepositoryInterface } from '@app/common';
@Injectable()
export class FarmsService {
  
  constructor(
    @Inject('FarmRepositoryInterface')
    private farmRepository: FarmRepositoryInterface,
    ) {}
  
  async createFarm(createFarmDto: FarmDto): Promise<any> {
   
    return await this.farmRepository.save(createFarmDto) 
  }
}
