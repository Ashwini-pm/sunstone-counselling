import { NextRequest } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

export async function GET(req: NextRequest) {
  const role    = req.nextUrl.searchParams.get('role')
  const station = req.nextUrl.searchParams.get('station')

  if (!role || !station) {
    return new Response('Missing role or station', { status: 400 })
  }

  const key = `avatars/${role}-${station}.mp4`

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME!, Key: key }),
    { expiresIn: 3600 },
  )

  if (req.nextUrl.searchParams.get('json') === '1') {
    return Response.json({ url })
  }
  return Response.redirect(url, 302)
}
