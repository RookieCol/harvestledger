import { ActivitiesEntity, CreateActivityDto, CropEntity } from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository } from 'typeorm';
import axios from 'axios';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(ActivitiesEntity)
    private activitiesRepository: Repository<ActivitiesEntity>,
    @InjectRepository(CropEntity)
    private cropsRepository: Repository<CropEntity>,
    private s3Service: S3Service,
  ) {}
  /*----------------------------ACTIVITIES---------------------------------------------*/
  async createActivity(createActivityDto: CreateActivityDto) {
    const newActivity = this.activitiesRepository.create(createActivityDto);
    const savedActivity = await this.activitiesRepository.save(newActivity);

    // -----------------------------------------------------------------------------------
    // traer el metadata del crop con el crodIP, newActivity.crop.id
    const cropFinding = await this.findCropById(newActivity.crop.id);
    const metadata = await this.getMetadataPinata(cropFinding.data.metadataLink);
    
    // formatear el metadata del activity
    const formatActivityMetadata = this.formatActivityMetadata(newActivity, newActivity.type);
    
    // unificar el metadata del crop traido con el metadata del activity
    const mixMetadata = {
      ...metadata,
      attributes: [...metadata.attributes, formatActivityMetadata]
    };

    // subir el nuevo metadata a pinata
    const responsePinata = await this.setMetadataPinata(mixMetadata);

    // actualizar el metadata en crop.
    const newCrop = {
      metadataLink: responsePinata.IpfsHash,
    };
    const resUpdateCrop = await this.updateCropTracing(
      newCrop,
      mixMetadata.databaseId,
    );
    // -----------------------------------------------------------------------------------
    return {
      data: savedActivity,
      message: 'Created activity and update tracing successfully',
      status: 'success',
    };
  }

  async findActivitiesByCropId(
    cropId: number,
  ): Promise<{ data: ActivitiesEntity[]; message: string; status: string }> {
    const activities = await this.activitiesRepository.find({
      where: { crop: Equal(cropId) },
    });
    return {
      data: activities,
      message: 'Activities retrieved successfully',
      status: 'success',
    };
  }

  /*   async updateActivity(updateActivityDto: any, activityId: number) {
    const activity = await this.activitiesRepository.findOne({
      where: { id: activityId },
    });

    if (!activity) {
      return {
        data: null,
        message: 'Activity not found',
        status: 'error',
      };
    }

    try {
      Object.assign(activity, updateActivityDto.updateActivityDto);
      await this.activitiesRepository.save(activity);
      return {
        data: activity,
        message: 'Activity updated successfully',
        status: 'success',
      };
    } catch (error) {
      console.error('Error updating Activity:', error);
      return {
        data: null,
        message: 'An error occurred while updating the Activity',
        status: 'error',
      };
    }
  }
 */
  async deleteActivity(
    activityId: number,
  ): Promise<{ data: any; message: string; status: string }> {
    const activity = await this.activitiesRepository.find({
      where: { id: Equal(activityId) },
    });

    if (activity.length === 0) {
      return {
        data: activity,
        message: 'Activity not found',
        status: 'error',
      };
    }

    const deletedActivity = await this.activitiesRepository.remove(activity);

    return {
      data: deletedActivity,
      message: 'Activity deleted successfully',
      status: 'success',
    };
  }

  async uploadActivityPhoto(
    file: Express.Multer.File,
    userId: number,
    activityId: number,
  ) {
    const url = await this.s3Service.uploadFile(
      file,
      `activity-${activityId}-user-${userId}`,
    );
    const activity = await this.activitiesRepository.findOne({
      where: { id: activityId },
    });
    if (!activity) {
      throw new NotFoundException('Harvest not found');
    }
    activity.photo = url.key;
    await this.activitiesRepository.save(activity);
    return {
      data: url.key,
      message: 'Activity image uploaded successfully',
      status: 'success',
    };
  }

  async getActivityPhoto(activityId: number) {
    const activity = await this.activitiesRepository.findOne({
      where: { id: activityId },
    });

    if (!activity.photo || activity.photo === null) {
      return { message: 'Activity photo not found', status: 'error' };
    }

    const imageData = await this.s3Service.getFile(activity.photo);

    return { message: 'ok', data: imageData };
  }

  // Encontrar un Crop dando un ID y devolver toda la información del crop
  private async findCropById(
    cropId: number
  ) {
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId }
    });
    if(crop != null) {
      return {
        data: crop,
        message: 'success',
        status: 200
      }
    } else {
      return{
        message: 'error',
        status: 400
      }
    }    
  }
  // get crop metadata from pinata
  private async getMetadataPinata(hashCrop: string){
    const metadata = await axios.get(`${process.env.PINATA_GATEWAY}${hashCrop}`);
    return metadata.data;
  }
  // private method for fomat activity metadata
  private formatActivityMetadata(data, type: string){
    if (type === "fertilizante") {
      const formatData = {
        trait_type: `fertilizante aplicado: ${data.title}`,
        value: `Cantidad aplicada por area: ${data.appRatio}, en fecha: ${data.inputDate}`
      };
      return formatData;

    } 

    if (type === 'proteccion') {
      const formatData = {
        trait_type: `proteccion aplicada: ${data.bioName}`,
        value: `Cantidad aplicada por area: ${data.appRatio}, en fecha: ${data.inputDate}`
      };
      return formatData;
    }

    if (type === 'cosecha') {
      const formatData = {
        trait_type: "cosecha",
        value: data.harvestDate
      }
      return formatData;
    }
  }
  // set the metadata of crop in pinata clud
  private async setMetadataPinata(formatMetadata) {
    const newLoteData = JSON.stringify({
      pinataMetadata: {
        name: `${formatMetadata.name}-${formatMetadata.databaseId}`,
      },
      pinataContent: formatMetadata,
    });

    const configFetch = {
      method: 'post',
      url: 'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
      data: newLoteData,
    };

    const response = await axios(configFetch);
    return response.data;
  }
  // updateCrop after create activity
  private async updateCropTracing(updateCrop: any, cropId: number) {
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId },
    });
    // verifico si el crop ha sido encontrado
    if (!crop) {
      return {
        data: null,
        message: 'Crop not found',
        status: 404,
      };
    }
    // una vez encontrado el crop, actualizo sus datos
    try {
      const newCrop = {...crop, ...updateCrop}
      const resUpdateCrop = await this.cropsRepository.save(newCrop);
      return {
        data: {...resUpdateCrop},
        message: 'Crop updated successfully',
        status: 200,
      };
    } catch (error) {
      console.error('Error updating Crop:', error);
      return {
        data: null,
        message: 'An error occurred while updating the Crop',
        status: 500,
      };
    }
  }
}
