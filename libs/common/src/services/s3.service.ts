import { Injectable, Logger } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

@Injectable()
export class S3Service {
  private logger = new Logger(S3Service.name);
  private region: string;
  private s3: S3Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    this.bucket = this.configService.get<string>('S3_BUCKET');
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
    const params = {
      Bucket: this.bucket,
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
      try{

        await parallelUploadS3.done();
      }catch(err){
        console.log(err);
      }
      return {key}
     /*  return `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`; */
    } catch (err) {
      this.logger.error('Cannot save file to S3:', err);
      throw err;
    }
  }

  async getFile(key: string) {
    const getObjectCommand = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
    });

    try {
        const streamToString = (stream: any) =>
            new Promise((resolve, reject) => {
                const chunks = [];
                stream.on("data", (chunk:any) => chunks.push(chunk));
                stream.on("error", reject);
                stream.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
            });

        const data = await this.s3.send(getObjectCommand);

        const bodyContents = await streamToString(data.Body);
        return bodyContents;
    } catch (err) {
        console.log("Error", err);
    }
}

}