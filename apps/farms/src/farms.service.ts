import {
  ActivitiesEntity,
  CreateActivityDto,
  CropEntity,
  FarmDto,
  FarmEntity,
  HarvestEntity,
} from '@app/common';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository } from 'typeorm';
import axios from 'axios';

@Injectable()
export class FarmsService {
  constructor(
    @InjectRepository(FarmEntity)
    private farmsRepository: Repository<FarmEntity>,
    @InjectRepository(CropEntity)
    private cropsRepository: Repository<CropEntity>,
    @InjectRepository(ActivitiesEntity)
    private activitiesRepository: Repository<ActivitiesEntity>,
    @InjectRepository(HarvestEntity)
    private harvestRepository: Repository<HarvestEntity>,
  ) {}

  /* --------------------FARMS---------------------------------------------*/

  async createFarm(createFarmDto: FarmDto) {
    const newFarm = this.farmsRepository.create(createFarmDto);
    const savedFarm = await this.farmsRepository.save(newFarm);
    return {
      data: savedFarm,
      message: 'Farm created successfully',
      status: 'success',
    };
  }

  async findAllByUserId(
    userId: number,
  ): Promise<{ data: FarmEntity[]; message: string; status: string }> {
    const farms = await this.farmsRepository.find({
      where: { user: Equal(userId) },
    });
    return {
      data: farms,
      message: 'Farms retrieved successfully',
      status: 'success',
    };
  }
  
  async updateFarm(updateFarmDto: any, farmId: number) {
    const farm = await this.farmsRepository.findOne({
      where: { id: farmId },
    });

    if (!farm) {
      return {
        data: null,
        message: 'Farm not found',
        status: 'error',
      };
    }

    try {
      Object.assign(farm, updateFarmDto.updateFarmDto);
      await this.farmsRepository.save(farm);
      return {
        data: farm,
        message: 'Farm updated successfully',
        status: 'success',
      };
    } catch (error) {
      console.error('Error updating Farm:', error);
      return {
        message: 'An error occurred while updating the Farm',
        status: 'error',
      };
    }
  }

  async deleteFarm(
    farmId: number,
  ): Promise<{ data: any; message: string; status: string }> {
    // Check if the farm exists
    const farm = await this.farmsRepository.find({
      where: { id: Equal(farmId) },
    });

    if (farm.length === 0) {
      return {
        data: farm,
        message: 'Farm not found',
        status: 'error',
      };
    }

    const deletedFarm = await this.farmsRepository.remove(farm);

    return {
      data: deletedFarm,
      message: 'Farm deleted successfully',
      status: 'success',
    };
  }

  /*--------------------------------CROPS---------------------------------------------*/
  async createCrop(createFarmDto: FarmDto) {
    const newFarm = this.cropsRepository.create(createFarmDto);
    const savedFarm = await this.cropsRepository.save(newFarm);
    return {
      data: savedFarm,
      message: 'Created crop successfully',
      status: 'success',
    };
  }

  async findCropsByFarmId(
    farmId: number,
  ): Promise<{ data: CropEntity[]; message: string; status: string }> {
    const crops = await this.cropsRepository.find({
      where: { farm: Equal(farmId) },
      relations: ['farm'],
    }); // Encuentra las fincas por userId
    return {
      data: crops,
      message: 'Crops retrieved successfully',
      status: 'success',
    };
  }

  // Encontrar un Crop dando un ID y devolver toda la información del crop
  async findCropById(
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

  async updateCrop(updateCrop: any, cropId: number) {
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

  async deleteCrop(
    cropId: number,
  ): Promise<{message: string; status: string }> {
    // Check if the farm exists
    const crop = await this.cropsRepository.find({
      where: { id: Equal(cropId) },
    });

    if (crop.length === 0) {
      return {
        message: 'Crop not found',
        status: 'error',
      };
    }
    

   await this.cropsRepository.remove(crop);

    return {
      message: 'Crop deleted successfully',
      status: 'success',
    };
  }
  /*----------------------------ACTIVITIES---------------------------------------------*/
  async createActivity(createActivityDto: CreateActivityDto) {
    const newActivity = this.activitiesRepository.create(createActivityDto);
    const savedActivity = await this.activitiesRepository.save(newActivity);
    // -----------------------------------------------------------------------------------
    // traer el metadata del crop con el crodIP, newActivity.crop.id
    const cropFinding = await this.findCropById(newActivity.crop.id);
    const metadata = await this.getMetadataPinata(cropFinding.data.metadataLink);
    
    // formatear el metadata del activity
    const formatActivityMetadata = this.formatActivirtyMetadata(newActivity, newActivity.type);
    
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
    const resUpdateCrop = await this.updateCrop(
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
    }); // Encuentra las fincas por userId
    return {
      data: activities,
      message: 'Activities retrieved successfully',
      status: 'success',
    };
  }

  /*-----------------------------HARVEST------------------------------------------------*/

  async createHarvest(createHarvestDto: any) {
    const response = await this.isCropHaveHarvest(createHarvestDto.crop.id);
    
    if (response === true) {
      return {
        data: null,
        message: 'el cultivo ya posee un harvest, no es posible añadir más',
        status: 'error'
      } 
    } else {
      const newHarvest = this.harvestRepository.create(createHarvestDto);
      const savedHarvest = await this.harvestRepository.save(newHarvest);
      
      // ---------------------------------------------------------------------------------
      // traer el metadata del crop con el cropID, newHarvest.crop.id
      const cropFinding = await this.findCropById(createHarvestDto.crop.id);
      const metadata = await this.getMetadataPinata(cropFinding.data.metadataLink);
  
      // formatear el metadata del harvest
      const formatCosecha = this.formatActivirtyMetadata(newHarvest, 'cosecha');
    
      // unificar el metadata del crop traido con el metadata del harvest
      const mixMetadata = {
        ...metadata,
        attributes: [...metadata.attributes, formatCosecha]
      }  
  
      // subir el nuevo metadata a pinata
      const responsePinata = await this.setMetadataPinata(mixMetadata);
  
      // actualizar el hash del metadata en crop
      const newCrop = {
        metadataLink: responsePinata.IpfsHash,
      }
      const resUpdateCrop = await this.updateCrop(
        newCrop,
        mixMetadata.databaseId
      )
      // ---------------------------------------------------------------------------------
      return {
        data: savedHarvest,
        message: 'Created harvest and updated tracing successfully',
        status: 'success',
      };
    }
  }

  async isCropHaveHarvest(cropId: number) {
    const response = await this.harvestRepository.find({
      where: { crop: Equal(cropId) },
    })
    
    if (response.length === 0) {
      return false;
    } else {
      return true;
    }
  }

  async findHarvestByCropId(
    cropId: number,
  ): Promise<{ data: HarvestEntity[]; message: string; status: string }> {
    const harvest = await this.harvestRepository.find({
      where: { crop: Equal(cropId) },
    });

    if (harvest.length === 0) {
      return {
        data: null,
        message: 'Harvest not found',
        status: 'error',
      };
    } else {
      return {
        data: harvest,
        message: 'Harvest retrieved successfully',
        status: 'success',
      };
    }
  }

  async deleteHarvest(
    harvestId: number,
  ): Promise<{ data: any; message: string; status: string }> {
    // Check if the farm exists
    const harvest = await this.harvestRepository.find({
      where: { id: Equal(harvestId) },
    });

    if (harvest.length === 0) {
      return {
        data: harvest,
        message: 'Harvest not found',
        status: 'error',
      };
    }

    const deletedHarvest = await this.harvestRepository.remove(harvest);

    return {
      data: deletedHarvest,
      message: 'Harvest deleted successfully',
      status: 'success',
    };
  }

  async updateHarvest(updateHarvestDto: any, harvestId: number) {
    const harvest = await this.harvestRepository.findOne({
      where: { id: harvestId },
    });

    if (!harvest) {
      return {
        data: null,
        message: 'Harvest not found',
        status: 'error',
      };
    }

    try {
      Object.assign(harvest, updateHarvestDto.updateHarvestDto);
      await this.harvestRepository.save(harvest);
      return {
        data: harvest,
        message: 'Harvest updated successfully',
        status: 'success',
      };
    } catch (error) {
      console.error('Error updating Harvest:', error);
      return {
        data: null,
        message: 'An error occurred while updating the Harvest',
        status: 'error',
      };
    }
  }

  // ---------------------FUNCIONES AUXILIARES-------------------------------------------
  private formatActivirtyMetadata(data, type: string){
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

  private async getMetadataPinata(hashCrop: string){
    const metadata = await axios.get(`${process.env.PINATA_GATEWAY}${hashCrop}`);
    return metadata.data;
  }

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
}
