import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let s3Instance: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Instance) {
    s3Instance = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
      forcePathStyle: true, // required for Ceph RGW
    });
  }
  return s3Instance;
}

function getBucket(): string {
  return process.env.S3_BUCKET ?? "groombook-pet-photos";
}

/** Generate a presigned PUT URL for uploading a pet photo. Expires in 15 min. */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  sizeBytes: number,
  expiresIn = 900
): Promise<string> {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/** Generate a presigned GET URL for viewing a pet photo. Expires in 1 hour. */
export async function getPresignedGetUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/** Delete a pet photo object from storage. */
export async function deleteObject(key: string): Promise<void> {
  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    })
  );
}

/** Read an object from S3 and return its body buffer and content type. */
export async function getObject(key: string): Promise<{ body: Buffer; contentType: string }> {
  const client = getS3Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    })
  );
  const chunks: Uint8Array[] = [];
  // response.Body is a Readable stream; collect chunks into a buffer
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const contentType = response.ContentType ?? "application/octet-stream";
  return { body, contentType };
}

/** Upload an object directly to S3 (server-side only, not a pre-signed URL). */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
  contentLength: number
): Promise<void> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: contentLength,
    })
  );
}
