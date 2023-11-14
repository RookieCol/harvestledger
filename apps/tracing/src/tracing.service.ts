import { Injectable } from '@nestjs/common';
import { InitTracingDto } from '@app/common';

@Injectable()
export class TracingService {
  constructor(
  ) {
    console.log('servicio tracing iniciado')
  }

  getHello(): string {
    console.log('llega');
    
    return 'Hello World!';
  }

  async initTracing(initTracingDto: InitTracingDto) {
    // console.log(initTracingDto);
    return { initTracingDto };
  }

  // async updateCrop(updateCropDto: any, cropId: number) {

  //   const crop = await this.cropsRepository.findOne({
  //     where: { id: cropId },
  //   });

  //   if (!crop) {
  //     return {
  //       data: null,
  //       message: 'Crop not found',
  //       status: 'error',
  //     };
  //   }

  //   try {
  //     Object.assign(crop, updateCropDto.updateCropDto);
  //     await this.cropsRepository.save(crop);
  //     return {
  //       data: crop,
  //       message: 'Crop updated successfully',
  //       status: 'success',
  //     };
  //   } catch (error) {
  //     console.error('Error updating Crop:', error);
  //     return {
  //       data: null,
  //       message: 'An error occurred while updating the Crop',
  //       status: 'error',
  //     };
  //   }

  // }
}
