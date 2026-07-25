import { Injectable, Logger } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3Service {
  private logger = new Logger(S3Service.name);
  private region: string;
  private s3: S3Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    this.bucket = this.configService.get<string>('S3_BUCKET');
    this.region = configService.get<string>('S3_REGION') || 'us-east-1';
    const endpoint = configService.get<string>('S3_ENDPOINT');

    this.s3 = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: configService.get<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: configService.get<string>('S3_SECRET_ACCESS_KEY'),
      },
      // S3_ENDPOINT points at a local S3-compatible store (e.g. MinIO) for
      // development; unset it to talk to real AWS S3.
      ...(endpoint && { endpoint, forcePathStyle: true }),
    });
  }
  async uploadFile(file: Express.Multer.File, key: string) {
    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: Buffer.from(file.buffer),
      // Preserve the real content type instead of forcing image/jpeg.
      ContentType: file.mimetype,
    };

    try {
      const parallelUploadS3 = new Upload({
        client: this.s3,
        params,
        partSize: 1024 * 1024 * 5,
      });

      // A failed upload must surface, not be swallowed and reported as success.
      await parallelUploadS3.done();
      return { key };
    } catch (err) {
      this.logger.error('Cannot save file to S3:', err);
      throw err;
    }
  }

  async getFile(key: string) {
    if (!key) {
      this.logger.error('No key provided to get file from S3.');
      return null;
    }
    const getObjectCommand = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      const streamToString = (stream: any) =>
        new Promise((resolve, reject) => {
          const chunks = [];
          stream.on('data', (chunk: any) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () =>
            resolve(Buffer.concat(chunks).toString('base64')),
          );
        });

      const data = await this.s3.send(getObjectCommand);

      const bodyContents = await streamToString(data.Body);
      return bodyContents;
    } catch (err) {
      // A missing object is an expected "no photo" case → null.
      if (err.name === 'NoSuchKey') {
        this.logger.error(`File with key "${key}" not found in S3 bucket.`);
        return null;
      }

      // Anything else is a real failure and must surface, not be swallowed.
      this.logger.error('Error retrieving file from S3:', err);
      throw err;
    }
  }
}
