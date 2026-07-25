import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { Workbook } from 'exceljs';
import { Response } from 'express';

import { AuthGuard } from '@app/common';
import {
  Controller,
  UseGuards,
  Inject,
  Get,
  Header,
  Res,
  Param,
  HttpException,
  Request,
  ParseIntPipe,
} from '@nestjs/common';

@Controller('report')
export class ReportController {
  constructor(
    @Inject('FARMS_SERVICE') private readonly farmsService: ClientProxy,
  ) {}

  // reports ---------------------------------------------------------------------
  @UseGuards(AuthGuard)
  @Get('admin')
  @Header('Content-Disposition', 'attachment; filename=' + 'admin-report.csv')
  async getAdminReport(@Request() req: any, @Res() response: Response) {
    const res = await lastValueFrom(
      this.farmsService.send({ cmd: 'getAdminReport' }, req.user.id),
    );

    if (res.status === 'error') {
      throw new HttpException({ message: res.message }, 500);
    }

    const content = res.result;
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Admin report');
    const columns = [
      'First name',
      'Last name',
      'Email',
      'Gender',
      'Document type',
      'Document number',
      'Date of birth',
      'Country',
      'State',
      'City',
      'Role',
      'Farm name',
      'Location',
      'Farm state',
      'Area',
      'Crop name',
      'Product',
      'Size',
      'Location',
      'Sowing date',
      'Plants',
      'Activity type',
      'Input date',
      'Title',
      'Manufacture location',
      'Application ratio',
      'Application method',
      'Comment',
      'Category',
      'Biological name',
      'Biological type',
      'Harvest date',
      'Amount',
      'Unit',
      'Category',
      'Description',
    ];
    worksheet.addRow(columns);
    // iterate over users
    for (const user of content) {
      const userData = [
        user.firstName,
        user.lastName,
        user.email,
        user.gender,
        user.documentType,
        user.documentNumber,
        user.dateOfBirth,
        user.country,
        user.state,
        user.city,
        user.rol,
      ];
      if (user.farms && user.farms.length > 0) {
        for (const farm of user.farms) {
          const hasCrops = farm.crops && farm.crops.length > 0;

          if (hasCrops) {
            for (const crop of farm.crops) {
              const hasActivities =
                crop.activities && crop.activities.length > 0;
              const hasHarvests = crop.harvests && crop.harvests.length > 0;

              if (hasActivities) {
                for (const activity of crop.activities) {
                  worksheet.addRow([
                    ...userData,
                    farm.name,
                    farm.location,
                    farm.state,
                    farm.area,
                    crop.name,
                    crop.product,
                    crop.size,
                    crop.location,
                    crop.sowingDate,
                    crop.plants,
                    activity.type,
                    activity.inputDate,
                    activity.title,
                    activity.manufactureLocation,
                    activity.appRatio,
                    activity.appMethod,
                    activity.comment,
                    activity.category,
                    activity.bioName,
                    activity.bioType,
                  ]);
                }
              }

              if (hasHarvests) {
                for (const harvest of crop.harvests) {
                  worksheet.addRow([
                    ...userData,
                    farm.name,
                    farm.location,
                    farm.state,
                    farm.area,
                    crop.name,
                    crop.product,
                    crop.size,
                    crop.location,
                    crop.sowingDate,
                    crop.plants,
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '', // padding for the activity columns
                    harvest.harvestDate,
                    harvest.amount,
                    harvest.unit,
                    harvest.category,
                    harvest.description,
                  ]);
                }
              }

              if (!hasActivities && !hasHarvests) {
                worksheet.addRow([
                  ...userData,
                  farm.name,
                  farm.location,
                  farm.state,
                  farm.area,
                  crop.name,
                  crop.product,
                  crop.size,
                  crop.location,
                  crop.sowingDate,
                  crop.plants,
                ]);
              }
            }
          } else {
            worksheet.addRow([
              ...userData,
              farm.name,
              farm.location,
              farm.state,
              farm.area,
            ]);
          }
        }
      } else {
        worksheet.addRow(userData);
      }
    }
    workbook.csv.write(response).then(function () {
      response.end();
      console.log('File write done.');
    });
  }

  @UseGuards(AuthGuard)
  @Get('farmer/:id')
  @Header('Content-Disposition', 'attachment; filename=' + 'farmer-report.csv')
  async getFarmerReport(
    @Request() req: any,
    @Res() response: Response,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    const res = await lastValueFrom(
      this.farmsService.send(
        { cmd: 'getFarmerReport' },
        { id: +id, req_id: req.user.id },
      ),
    );

    if (res.status === 'error') {
      throw new HttpException({ message: res.message }, 500);
    }

    const content = res.result;
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Reporte de agricultor');
    const columns = [
      'Farm name',
      'Location',
      'Farm state',
      'Area',
      'Crop name',
      'Product',
      'Size',
      'Location',
      'Sowing date',
      'Plants',
      'Activity type',
      'Input date',
      'Title',
      'Manufacture location',
      'Application ratio',
      'Application method',
      'Comment',
      'Category',
      'Biological name',
      'Biological type',
      'Harvest date',
      'Amount',
      'Unit',
      'Category',
      'Description',
    ];
    worksheet.addRow(columns);
    for (const farm of content) {
      if (farm.crops && farm.crops.length > 0) {
        for (const crop of farm.crops) {
          const hasActivities = crop.activities && crop.activities.length > 0;
          const hasHarvests = crop.harvests && crop.harvests.length > 0;

          if (hasActivities) {
            for (const activity of crop.activities) {
              worksheet.addRow([
                farm.name,
                farm.location,
                farm.state,
                farm.area,
                crop.name,
                crop.product,
                crop.size,
                crop.location,
                crop.sowingDate,
                crop.plants,
                activity.type,
                activity.inputDate,
                activity.title,
                activity.manufactureLocation,
                activity.appRatio,
                activity.appMethod,
                activity.comment,
                activity.category,
                activity.bioName,
                activity.bioType,
              ]);
            }
          }

          if (hasHarvests) {
            for (const harvest of crop.harvests) {
              worksheet.addRow([
                farm.name,
                farm.location,
                farm.state,
                farm.area,
                crop.name,
                crop.product,
                crop.size,
                crop.location,
                crop.sowingDate,
                crop.plants,
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '', // padding for the activity columns
                harvest.harvestDate,
                harvest.amount,
                harvest.unit,
                harvest.category,
                harvest.description,
              ]);
            }
          }

          if (!hasActivities && !hasHarvests) {
            worksheet.addRow([
              farm.name,
              farm.location,
              farm.state,
              farm.area,
              crop.name,
              crop.product,
              crop.size,
              crop.location,
              crop.sowingDate,
              crop.plants,
            ]);
          }
        }
      } else {
        worksheet.addRow([farm.name, farm.location, farm.state, farm.area]);
      }
    }
    workbook.csv.write(response).then(function () {
      response.end();
      console.log('File write done.');
    });
  }
}
