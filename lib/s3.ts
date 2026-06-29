import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export async function getS3UploadUrl(key: string, contentType: string, expiresIn = 300) {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn })
}

export const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

export const S3_BUCKET = process.env.S3_BUCKET_NAME!

export async function getS3SignedUrl(key: string, expiresIn = 3600) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn })
}

export async function uploadToS3(key: string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
  return `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
}
