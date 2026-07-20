import { HarvestEntity, CropEntity } from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository } from 'typeorm';
import axios from 'axios';

@Injectable()
export class HarvestService {
  constructor(
    @InjectRepository(HarvestEntity)
    private harvestRepository: Repository<HarvestEntity>,
    @InjectRepository(CropEntity)
    private cropsRepository: Repository<CropEntity>,
    private s3Service: S3Service,
  ) {}

  /*-----------------------------HARVEST------------------------------------------------*/
  async createHarvest(createHarvestDto: any) {
    const response = await this.isCropHaveHarvest(createHarvestDto.crop.id);

    if (response === true) {
      return {
        data: null,
        message: 'The crop already has a harvest, no more can be added',
        status: 'error',
      };
    } else {
      const newHarvest = this.harvestRepository.create(createHarvestDto);
      const savedHarvest = await this.harvestRepository.save(newHarvest);

      // ---------------------------------------------------------------------------------
      // fetch the crop metadata using the cropID, newHarvest.crop.id
      const cropFinding = await this.findCropById(createHarvestDto.crop.id);
      const metadata = await this.getMetadataPinata(
        cropFinding.data.metadataLink,
      );

      // format the harvest metadata
      const formatHarvest = this.formatActivityMetadata(newHarvest, 'harvest');

      // merge the fetched crop metadata with the harvest metadata
      const mixMetadata = {
        ...metadata,
        attributes: [...metadata.attributes, formatHarvest],
      };

      // upload the new metadata to pinata
      const responsePinata = await this.setMetadataPinata(mixMetadata);

      // update the metadata hash on the crop
      const newCrop = {
        metadataLink: responsePinata.IpfsHash,
      };
      const resUpdateCrop = await this.updateCropTracing(
        newCrop,
        mixMetadata.databaseId,
      );
      // ---------------------------------------------------------------------------------
      return {
        data: savedHarvest,
        message: 'Created harvest and updated tracing successfully',
        status: 'success',
      };
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

  async uploadHarvestImage(
    file: Express.Multer.File,
    userId: number,
    harvestId: number,
  ) {
    const url = await this.s3Service.uploadFile(
      file,
      `harvest-${harvestId}-user-${userId}`,
    );
    const harvest = await this.harvestRepository.findOne({
      where: { id: harvestId },
    });
    if (!harvest) {
      throw new NotFoundException('Harvest not found');
    }
    harvest.photo = url.key;
    await this.harvestRepository.save(harvest);
    return {
      data: url.key,
      message: 'Harvest image uploaded successfully',
      status: 'success',
    };
  }

  async getHarvestImage(harvestId: number) {
    const harvest = await this.harvestRepository.findOne({
      where: { id: harvestId },
    });

    if (!harvest.photo || harvest.photo === null) {
      return { message: 'Harvest photo not found', status: 'error' };
    }

    const imageData = await this.s3Service.getFile(harvest.photo);

    return { message: 'ok', data: imageData };
  }

  // check if harvest exists in crop
  async isCropHaveHarvest(cropId: number) {
    const response = await this.harvestRepository.find({
      where: { crop: Equal(cropId) },
    });

    if (response.length === 0) {
      return false;
    } else {
      return true;
    }
  }
  // get the crop by id
  private async findCropById(cropId: number) {
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId },
    });
    if (crop != null) {
      return {
        data: crop,
        message: 'success',
        status: 200,
      };
    } else {
      return {
        message: 'error',
        status: 400,
      };
    }
  }
  // get crop metadata from pinata
  private async getMetadataPinata(hashCrop: string) {
    const metadata = await axios.get(
      `${process.env.PINATA_GATEWAY}${hashCrop}`,
    );
    return metadata.data;
  }
  // private method for fomat activity metadata
  private formatActivityMetadata(data, type: string) {
    if (type === 'fertilizer') {
      const formatData = {
        trait_type: `fertilizer applied: ${data.title}`,
        value: `Amount applied per area: ${data.appRatio}, on date: ${data.inputDate}`,
      };
      return formatData;
    }

    if (type === 'protection') {
      const formatData = {
        trait_type: `protection applied: ${data.bioName}`,
        value: `Amount applied per area: ${data.appRatio}, on date: ${data.inputDate}`,
      };
      return formatData;
    }

    if (type === 'harvest') {
      const formatData = {
        trait_type: 'harvest',
        value: data.harvestDate,
      };
      return formatData;
    }
  }
  // set the metadata of crop in pinata clud
  private async setMetadataPinata(formatMetadata) {
    const pinataPayload = JSON.stringify({
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
      data: pinataPayload,
    };

    const response = await axios(configFetch);
    return response.data;
  }
  // updateCrop after create activity
  private async updateCropTracing(updateCrop: any, cropId: number) {
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId },
    });
    // check whether the crop was found
    if (!crop) {
      return {
        data: null,
        message: 'Crop not found',
        status: 404,
      };
    }
    // once the crop is found, update its data
    try {
      const newCrop = { ...crop, ...updateCrop };
      const resUpdateCrop = await this.cropsRepository.save(newCrop);
      return {
        data: { ...resUpdateCrop },
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
