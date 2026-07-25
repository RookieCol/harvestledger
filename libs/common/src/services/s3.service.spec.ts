import { Upload } from '@aws-sdk/lib-storage';
import { S3Service } from './s3.service';

// Mock the AWS SDK so no network/credentials are involved.
jest.mock('@aws-sdk/lib-storage');
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: (...args: any[]) => mockSend(...args) })),
  GetObjectCommand: jest.fn((input) => input),
}));

const config = {
  get: (k: string) =>
    ({ S3_BUCKET: 'bucket', S3_REGION: 'us-east-1' })[k] ?? undefined,
} as any;

describe('S3Service', () => {
  let service: S3Service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new S3Service(config);
  });

  describe('uploadFile', () => {
    const file = {
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
    } as Express.Multer.File;

    it('uploads with the real content type and returns the key', async () => {
      (Upload as unknown as jest.Mock).mockImplementation((opts: any) => ({
        params: opts.params,
        done: jest.fn().mockResolvedValue(undefined),
      }));

      const result = await service.uploadFile(file, 'crop-1');

      expect(result).toEqual({ key: 'crop-1' });
      const passedParams = (Upload as unknown as jest.Mock).mock.calls[0][0]
        .params;
      expect(passedParams.ContentType).toBe('image/png');
    });

    it('throws when the upload fails instead of reporting success', async () => {
      (Upload as unknown as jest.Mock).mockImplementation(() => ({
        done: jest.fn().mockRejectedValue(new Error('S3 down')),
      }));

      await expect(service.uploadFile(file, 'crop-1')).rejects.toThrow(
        'S3 down',
      );
    });
  });

  describe('getFile', () => {
    it('returns null for a missing key', async () => {
      await expect(service.getFile('')).resolves.toBeNull();
    });

    it('returns null when the object does not exist (NoSuchKey)', async () => {
      mockSend.mockRejectedValue(
        Object.assign(new Error('missing'), { name: 'NoSuchKey' }),
      );
      await expect(service.getFile('nope')).resolves.toBeNull();
    });

    it('rethrows an unexpected S3 error instead of swallowing it', async () => {
      mockSend.mockRejectedValue(
        Object.assign(new Error('boom'), { name: 'InternalError' }),
      );
      await expect(service.getFile('key')).rejects.toThrow('boom');
    });
  });
});
