import { Injectable, Logger } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3Service {
  private logger = new Logger(S3Service.name);
  private region: string;
  private s3: S3Client;

  constructor(private configService: ConfigService) {
    this.region = configService.get<string>('S3_REGION') || 'us-east-1';
    this.s3 = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: configService.get<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: configService.get<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }
  async uploadFile(file: Express.Multer.File, key: string) {
    const bucket = this.configService.get<string>('S3_BUCKET');
    const params = {
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(file.buffer),
      ContentType: 'image/jpeg',

    };
  
    try {
      const parallelUploadS3 = new Upload({
        client: this.s3, 
        params,
        partSize: 1024 * 1024 * 5, 
      });
  
      parallelUploadS3.on("httpUploadProgress", (progress) => {
        console.log(progress);
      });
  
      await parallelUploadS3.done();
  
      return `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`;
    } catch (err) {
      this.logger.error('Cannot save file to S3:', err);
      throw err;
    }
  }
  
}
