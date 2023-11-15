import { Injectable, Inject } from '@nestjs/common';
import { InitTracingDto } from '@app/common';
import axios from 'axios';

import { FarmsService } from '../../farms/src/farms.service';

@Injectable()
export class TracingService {
  constructor(
    @Inject('FarmsRepositoryInterface')
    private readonly cropService: FarmsService,
  ) {
    console.log('servicio tracing iniciado');
  }

  getHello() {
    return { mensaje: 'hola mundo' };
  }
  //-------------funcion para inicializar el trazamiento del cultivo------------------------
  async initTracing(dataTracing: InitTracingDto) {
    // conseguir los datos del cultivo(crop)
    const resCropData = await this.cropService.findCropById(dataTracing.cropId);
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
        const resUpdateCrop = await this.cropService.updateCrop(
          newCrop,
          dataTracing.cropId,
        );
        console.log('lo que me devuelve luego de actualizar', resUpdateCrop);
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
  //----------------------------------------------------------------------------------
  //-------funcion para añadir las actividades y mintear el nft si es necesario-------
}
