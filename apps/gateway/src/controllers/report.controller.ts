import { ClientProxy } from "@nestjs/microservices";
import { lastValueFrom } from 'rxjs';
import * as fs from 'fs';
import { Workbook } from 'exceljs';
import * as path from 'path';
import { Response } from "express";

import { AuthGuard } from "@app/common";
import { Controller, UseGuards, Inject, Get, Header, Res, Param, HttpException } from "@nestjs/common";

@Controller('report')
export class ReportController {
  constructor(
    @Inject('FARMS_SERVICE') private readonly farmsService: ClientProxy,
  ) {}

  // reports ---------------------------------------------------------------------
  @UseGuards(AuthGuard)
  @Get('farmer/:id')
  @Header('Content-Disposition', 'attachment; filename=' + 'farmer-report.cvsd')
  async getFarmerReport(
    @Res() response: Response,
    @Param('id') id: number,
  ): Promise<void> {
    const res = await lastValueFrom(this.farmsService.send({ cmd: 'getFarmerReport' }, id));

    if (res.status === 'error') {
      throw new HttpException({message: 'error de servidor'}, 500);
    }

    const content = res.result;
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Reporte de agricultor');
    const columns = ['Nombre de Granja', 'Ubicación', 'Estado de granja', 'Área', 
                      'Nombre Cultivo', 'Producto', 'Tamaño', 'Ubicación', 'Fecha de siembra', 'Matas',
                      'Tipo de Actividad', 'Fecha de ingreso', 'Título', 'Ubicación de fabricación', 'Ratio de aplicación', 'Método de aplicación', 'Comentario', 'Categoría', 'Nombre biológico', 'Tipo biológico',
                      'Fecha de Cosecha', 'Cantidad', 'Medida', 'Categoria', 'Descripción'
                    ];
    worksheet.addRow(columns);
    for (let farm of content) {
      if (farm.crops && farm.crops.length > 0) {
        for (const crop of farm.crops) {
          const hasActivities = crop.activities && crop.activities.length > 0;
          const hasHarvests = crop.harvests && crop.harvests.length > 0;

          if (hasActivities) {
            for (const activity of crop.activities) {
              worksheet.addRow([farm.name, farm.location, farm.state, farm.area, 
                                crop.name, crop.product, crop.size, crop.location, crop.sowingDate, crop.plants,
                                activity.type, activity.inputDate, activity.title, activity.manufactureLocation, activity.appRatio, activity.appMethod, activity.comment, activity.category, activity.bioName, activity.bioType,
                              ]);
            }
          }

          if (hasHarvests) {
            for (const harvest of crop.harvests) {
              worksheet.addRow([farm.name, farm.location, farm.state, farm.area, 
                                crop.name, crop.product, crop.size, crop.location, crop.sowingDate, crop.plants,
                                '', '', '', '', '', '', '', '', '', '', // Espacios para las columnas de actividades
                                harvest.harvestDate, harvest.amount, harvest.unit, harvest.category, harvest.description,
                              ]);
            }
          }
          
          if (!hasActivities && !hasHarvests) {
            worksheet.addRow([farm.name, farm.location, farm.state, farm.area, 
                              crop.name, crop.product, crop.size, crop.location, crop.sowingDate, crop.plants]);
          }

        }
      } else {
        worksheet.addRow([farm.name, farm.location, farm.state, farm.area]);
      }
    }
    workbook.csv.write(response).then(function (data) {
      response.end();
      console.log('File write done.');
    });
  }
}