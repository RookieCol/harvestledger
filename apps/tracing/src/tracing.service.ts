import { Injectable, Inject } from '@nestjs/common';
import { InitTracingDto } from '@app/common';
import axios from 'axios';
import * as fs from 'fs';
import { promisify } from 'util';
import { ethers, EventLog } from 'ethers';

import { CropsService } from '../../farms/src/crops/crops.service';
import { HarvestService } from '../../farms/src/harvests/harvests.service';
import * as cropABI from './cropABI.json';

/**
 * Blockchain configuration is read from the environment. It must never live in
 * the code: a committed private key is the same as handing over the wallet.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Check .env.example for the required configuration.`,
    );
  }
  return value;
}

@Injectable()
export class TracingService {
  constructor(
    @Inject('CropsServiceInterface')
    private readonly cropsService: CropsService,
    @Inject('HarvestServiceInterface')
    private readonly harvestService: HarvestService,
  ) {}

  provider = new ethers.JsonRpcProvider(requireEnv('BLOCKCHAIN_RPC_URL'));
  signer = new ethers.Wallet(requireEnv('WALLET_PRIVATE_KEY'), this.provider);
  myNftContract = new ethers.Contract(
    requireEnv('CONTRACT_ADDRESS'),
    cropABI.abi,
    this.signer,
  );

  getHello() {
    return { message: 'hello world' };
  }
  //-------------function to initialize crop tracing------------------------
  async initTracing(dataTracing: InitTracingDto) {
    // fetch the crop data
    const resCropData = await this.cropsService.findCropById(
      dataTracing.cropId,
    );

    // format that data according to the NFT standard
    if (resCropData.status === 200) {
      const formatMetadata = this.formatCropMetadata(resCropData.data);
      // upload the formatted metadata to pinata
      const resPinata = await this.pinMetadataToIpfs(formatMetadata);

      if (resPinata.status === 200) {
        // store the hash returned by pinata in the crop's 'metadataLink' attribute
        const newCrop = {
          metadataLink: resPinata.data.IpfsHash,
        };

        const resUpdateCrop = await this.cropsService.updateCropTracing(
          newCrop,
          dataTracing.cropId,
        );
        if (resUpdateCrop.status === 200) {
          return {
            data: { ...resUpdateCrop.data },
            message: 'initial tracing and update completed',
            status: 200,
          };
        } else {
          return {
            message: 'unable to update the batch',
            status: 500,
          };
        }
      } else {
        return {
          message: 'error, could not upload to pinata',
          status: 500,
        };
      }
    } else {
      return {
        message: 'error, crop does not exist',
        status: 404,
      };
    }
  }
  // ----------------------for init tracing purpose----------------------------------
  async pinMetadataToIpfs(formatMetadata) {
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
    return response;
  }
  formatCropMetadata(cropData) {
    const formatObject = {
      name: cropData.name,
      description: `Product: ${
        cropData.product
      }; Sown on: ${cropData.sowingDate.substring(0, 10)}`,
      image: '',
      attributes: [],
      databaseId: cropData.id,
    };

    return formatObject;
  }
  //----------------------------------------------------------------------------------------
  //-------function to add the activities and mint the nft if needed-------
  async updateTracing(id: number, filePath: string) {
    // console.log('starting update tracing: ', id);

    // fetch the crop by id
    const cropFinding = await this.cropsService.findCropById(id);
    // console.log('crop found:', cropFinding);

    // only continue if the crop's NFT ID is null
    if (cropFinding.data.nftId === null) {
      // fetch the crop metadata from pinata
      const metadata = await axios.get(
        `${process.env.PINATA_GATEWAY}${cropFinding.data.metadataLink}`,
      );
      // console.log('crop metadata:', metadata.data);

      // upload the received image to pinata
      const imageBlob = await this.convertToBlob(filePath);
      const imageName = `cropId_${id}_image`;
      const resUploadImage = await this.uploadImageToPinata(
        imageBlob,
        imageName,
      );
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(err);
        } else {
          // console.log('Image deleted successfully');
        }
      });
      // console.log('uploaded image response:', resUploadImage);

      // merge the uploaded image hash into the metadata to build the new metadata to upload
      const mixData = {
        ...metadata.data,
        image: `ipfs://${resUploadImage.IpfsHash}`,
      };
      // console.log('merged metadata:', mixData);

      // upload the new metadata to pinata
      const resMetadataPinata = await this.pinMetadataToIpfs(mixData);
      // console.log('new pinata hash:', resMetadataPinata.data);

      // update the crop with the new metadata hash
      const newCrop = {
        metadataLink: resMetadataPinata.data.IpfsHash,
      };
      const resUpdateCrop = await this.cropsService.updateCropTracing(
        newCrop,
        mixData.databaseId,
      );
      // console.log('crop updated:', resUpdateCrop)

      // check whether the crop already has a harvest activity
      const respHarvestCrop = await this.harvestService.isCropHaveHarvest(id);
      console.log(respHarvestCrop);
      if (respHarvestCrop) {
        // if it does, go ahead and mint
        const metadataNftUri = `${process.env.PINATA_GATEWAY}${resUpdateCrop.data.metadataLink}`;
        const resMintNft = await this.mintNft(id, mixData.name, metadataNftUri);
        // console.log('minted nft id:', resMintNft);

        // update the crop with the minted nft id
        const newCropNft = {
          nftId: resMintNft,
        };
        const resUpdateCropNft = await this.cropsService.updateCropTracing(
          newCropNft,
          mixData.databaseId,
        );
        // console.log('crop updated with nft:', resUpdateCropNft);

        // return a message stating that everything succeeded and an NFT was minted
        return {
          data: resUpdateCropNft.data,
          message: 'crop updated its image and minted an NFT',
          status: 200,
        };
      }

      // return a message stating that everything succeeded
      return {
        data: resUpdateCrop.data,
        message: 'image updated successfully',
        status: 200,
      };
    } else {
      // if the NFT ID is not null, return an error message saying the crop is already minted
      return {
        data: cropFinding.data,
        message: 'crop is already minted, no action was taken',
        status: 500,
      };
    }
  }
  private readonly readFileAsync = promisify(fs.readFile);
  // converts an image to a blob
  async convertToBlob(filePath: string): Promise<Blob> {
    try {
      // Read the file asynchronously
      const fileData = await this.readFileAsync(filePath);
      console.log(fileData);
      // Create a Blob from the file data
      const blob = new Blob([fileData], { type: 'application/octet-stream' });
      console.log(blob);
      return blob;
    } catch (error) {
      console.log(error);
      // Handle any errors that occur during file reading or Blob creation
      throw new Error(`Error converting file to Blob: ${error.message}`);
    }
  }
  // uploads an image to pinata
  async uploadImageToPinata(blob, imageName: string) {
    const formData = new FormData();
    formData.append('file', blob);
    const metadata = JSON.stringify({
      name: imageName,
    });
    formData.append('pinataMetadata', metadata);

    const options = JSON.stringify({
      cidVersion: 0,
    });
    formData.append('pinataOptions', options);
    try {
      const res = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        formData,
        {
          maxBodyLength: Infinity,
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${process.env.PINATA_JWT}`,
          },
        },
      );
      return res.data;
    } catch (error) {
      return error;
    }
  }
  // mints an NFT
  async mintNft(cropId: number, cropName: string, metadataUri: string) {
    // set the parameters (production only)
    const gasPrice = ethers.parseUnits('1000', 'gwei');
    const gasLimit = 400000;

    const nftTxn = await this.myNftContract.mintHarvestNft(
      cropId,
      cropName,
      metadataUri,
      {
        gasPrice: gasPrice,
        gasLimit: gasLimit,
      },
    );

    await nftTxn.wait();
    console.log(`mint successful https://polygonscan.com/tx/${nftTxn.hash}`);

    const transferEvents = await this.myNftContract.queryFilter('Transfer');
    const lastEvent = transferEvents[transferEvents.length - 1] as EventLog;
    const mintedNft = lastEvent.args ? lastEvent.args[2] : 0;

    return parseInt(mintedNft, 16);
  }
}
