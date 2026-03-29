/**
 * S3 Deploy Service
 *
 * Deploys rendered landing page HTML to AWS S3
 * for static hosting via S3 website or CloudFront.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export class S3DeployService {
  async deployPage(config: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    key: string;
    html: string;
  }): Promise<{ url: string }> {
    const client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: config.key,
      Body: config.html,
      ContentType: 'text/html',
    }));

    const url = `https://${config.bucket}.s3.${config.region}.amazonaws.com/${config.key}`;
    return { url };
  }

  async undeployPage(config: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    key: string;
  }): Promise<void> {
    const client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    await client.send(new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: config.key,
    }));
  }
}
