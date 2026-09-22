import { Client } from 'minio';
import { config } from '../config.js';

/**
 * Fotos de activos en MinIO (S3). Se usan URLs prefirmadas: el navegador sube y
 * baja directo a MinIO (la API sólo firma), y el bucket queda privado.
 *
 * Dos clientes: uno con el host INTERNO (`minio:9000`) para administrar el bucket,
 * y otro con el host PÚBLICO (`MINIO_PUBLIC_URL`, p. ej. https://s3.tudominio.com)
 * para firmar URLs que el navegador pueda alcanzar. Firmar no abre conexión.
 */
const m = config.minio;

const admin = new Client({
  endPoint: m.endpoint, port: m.port, useSSL: m.useSSL,
  accessKey: m.accessKey, secretKey: m.secretKey,
});

function publicClient(): Client {
  const u = new URL(m.publicUrl);
  const useSSL = u.protocol === 'https:';
  const port = u.port ? Number(u.port) : (useSSL ? 443 : 80);
  return new Client({
    endPoint: u.hostname, port, useSSL,
    accessKey: m.accessKey, secretKey: m.secretKey,
  });
}
const presigner = publicClient();

/** Crea el bucket si no existe. Best-effort al arrancar la API. */
export async function ensureBucket(): Promise<void> {
  const exists = await admin.bucketExists(m.bucket).catch(() => false);
  if (!exists) await admin.makeBucket(m.bucket);
}

/** URL prefirmada para SUBIR (PUT) un objeto. */
export function presignPut(key: string, expirySeconds = 300): Promise<string> {
  return presigner.presignedPutObject(m.bucket, key, expirySeconds);
}

/** URL prefirmada para DESCARGAR (GET) un objeto (para mostrar la foto). */
export function presignGet(key: string, expirySeconds = 3600): Promise<string> {
  return presigner.presignedGetObject(m.bucket, key, expirySeconds);
}

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
  'image/webp': '.webp', 'image/gif': '.gif',
};
export function extForContentType(ct?: string): string {
  return (ct && EXT[ct.toLowerCase()]) || '';
}
