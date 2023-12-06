import { Injectable, Inject } from '@nestjs/common';
import { InitTracingDto } from '@app/common';
import axios from 'axios';
import * as fs from 'fs';
import { promisify } from 'util';
import { ethers, EventLog } from 'ethers';

import { CropsService } from '../../farms/src/crops/crops.service';
import { HarvestService } from '../../farms/src/harvests/harvests.service';
import * as cropABI from './cropABI.json';

const WALLET_PRIVATE_KEY='REDACTED_PRIVATE_KEY';
const CONTRACT_ADDRESS='0x9dE4243c61395F30DeBa324e450Dc4D6A77E447C';
const ALCHEMY_URL_KEY='REDACTED_RPC_URL';

@Injectable()
export class TracingService {
  constructor(
    @Inject('CropsServiceInterface')
    private readonly cropsService: CropsService,
    @Inject('HarvestServiceInterface')
    private readonly harvestService: HarvestService,
  ) {}

  provider = new ethers.JsonRpcProvider(ALCHEMY_URL_KEY);
  signer = new ethers.Wallet(WALLET_PRIVATE_KEY, this.provider);
  myNftContract = new ethers.Contract(
    CONTRACT_ADDRESS,
    cropABI.abi,
    this.signer,
  );
    
  getHello() {
    return { mensaje: 'hola mundo' };
  }
//-------------funcion para inicializar el trazamiento del cultivo------------------------
  async initTracing(dataTracing: InitTracingDto) {
    // conseguir los datos del cultivo(crop)
    const resCropData = await this.cropsService.findCropById(dataTracing.cropId);
    
    // formatear dichos datos según el estandar de los NFT's
    if (resCropData.status === 200) {
      const formatMetadata = this.formatLoteData(resCropData.data);
      // subir la metadata formateada a pinata
      const resPinata = await this.setLotePinata(formatMetadata);

      if (resPinata.status === 200) {
        // setear la respuesta hash de pinata en el atributo 'metadataLink' del cultivo
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
            message: 'trazamiendo inicial y actualizacion realizado',
            status: 200,
          };
        } else {
          return {
            message: 'no es posible actualizar el lote',
            status: 500,
          };
        }
      } else {
        return {
          message: 'error, no se pudo subir a pinata',
          status: 500,
        };
      }
    } else {
      return {
        message: 'error, crop no existe',
        status: 404,
      };
    }
  }
   // ----------------------for init tracing purpose----------------------------------
  async setLotePinata(formatMetadata) {
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
    return response;
  }
  formatLoteData(cropData) {
    const formatObject = {
      name: cropData.name,
      descripcion: `Producto: ${
        cropData.product
      }; Sembrado en fecha: ${cropData.sowingDate.substring(0, 10)}`,
      image: '',
      attributes: [],
      databaseId: cropData.id,
    };

    return formatObject;
  }
//----------------------------------------------------------------------------------------
  //-------funcion para añadir las actividades y mintear el nft si es necesario-------
  async updateTracing(id: number, filePath: string)  {
    // traigo el crop dando el id
    const cropFinding = await this.cropsService.findCropById(id);
    console.log('crop encontrado:', cropFinding);

    // solo continuar si NFT ID del crop es null
    if(cropFinding.data.nftId === null) {
      // traigo la metadata del crop desde pinata
      const metadata = await axios.get(`${process.env.PINATA_GATEWAY}${cropFinding.data.metadataLink}`);
      console.log('metadata crop:', metadata.data);
      
      // subir la imagen recibida a pinata
      const imageBlob = await this.convertToBlob(filePath);
      const imageName = `cropId_${id}_image`;
      const resUploadImage = await this.uploadImageToPinata(imageBlob, imageName);
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(err);
        } else {
          console.log('Image deleted successfully');
        }
      });
      console.log('respuesta de imagen subida:', resUploadImage);

      // mezclo el hash de la imagen recibida con la metadata y formo una nueva metadata a subir
      const mixData = {
        ...metadata.data,
        image: `ipfs://${resUploadImage.IpfsHash}`,
      };
      console.log('metadata mezclado:', mixData);

      // subo el nuevo metadata a pinata
      const resMetadataPinata = await this.setLotePinata(mixData);
      console.log('nuevo hash de pinata:', resMetadataPinata.data);

      // actualizo en el crop el nuevo hash de la metadata
      const newCrop = {
        metadataLink: resMetadataPinata.data.IpfsHash,
      }
      const resUpdateCrop = await this.cropsService.updateCropTracing(
        newCrop,
        mixData.databaseId,
      );
      console.log('nuevo crop updated:', resUpdateCrop)

      // consulto si el crop ya tiene una actividad cosecha
      const respHarvestCrop = await this.harvestService.isCropHaveHarvest(id);
      console.log(respHarvestCrop);
      if (respHarvestCrop) {
        // si ya tiene procedo a mintear
        const metadataNftUri = `${process.env.PINATA_GATEWAY}${resUpdateCrop.data.metadataLink}`
        const resMintNft = await this.mintNft(id, mixData.name, metadataNftUri);
        console.log('id del nft minteado:', resMintNft);
        
        // actualizo el update con id del nft minteado
        const newCropNft = {
          nftId: resMintNft,
        }
        const resUpdateCropNft = await this.cropsService.updateCropTracing(newCropNft, mixData.databaseId)
        console.log('crop actualizado con nft:', resUpdateCropNft);

        // devuelvo el mensaje que todo fue correcto y hubo minteo
        return {
          data: resUpdateCropNft.data,
          message: 'crop actualizo su imagen y minteo un NFT',
          status: 200
        }
      }

      // devuelvo en un message que todo fue correcto
      return {
        data: resUpdateCrop.data,
        message: 'actualización de imagen correcta',
        status: 200
      }
  
    } else {
      // en caso que el NFT ID no sea null, enviar un mensaje error diciendo que el crop ya esta minteado
      return {
        data: cropFinding.data,
        message: 'crop ya esta minteado, no se ha realizado ninguna acción',
        status: 500,
      }

    }

  }
  private readonly readFileAsync = promisify(fs.readFile);
  // convierte una imagen a un blob
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
  // sube una imagen a pinata
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
  };
  // mintea un NFT
  async mintNft(cropId: number, cropName: string, metadataUri: string) {
    // establecer parametros (solo produccion)
    // const gasPrice = ethers.parseUnits('1000', 'gwei');
    // const gasLimit = 400000;
    
    const nftTxn = await this.myNftContract.mintHarvestNft(
      cropId, cropName, metadataUri,
      // {
      //   gasPrice: gasPrice,
      //   gasLimit: gasLimit,
      // }
    );

    await nftTxn.wait();
    console.log(`exito en minteo https://mumbai.polygonscan.com/tx/${nftTxn.hash}`);

    const transferEvents = await this.myNftContract.queryFilter('Transfer');
    const lastEvent = transferEvents[transferEvents.length - 1] as EventLog;
    const mintedNft = lastEvent.args ? lastEvent.args[2] : 0;

    return parseInt(mintedNft, 16);
  }
}
