export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://trazza_app:app@localhost:5432/trazza',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  ingestToken: process.env.INGEST_TOKEN ?? 'dev-ingest-token',
  // Bridge MQTT -> ingesta.
  mqttUrl: process.env.MQTT_URL ?? 'mqtt://mqtt:1883',
  mqttTopicPrefix: process.env.MQTT_TOPIC_PREFIX ?? 'trazza',
  // Object storage (MinIO / S3) para fotos de activos.
  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? 'minio',        // host interno (red Docker)
    port: Number(process.env.MINIO_INTERNAL_PORT ?? 9000),
    useSSL: (process.env.MINIO_USE_SSL ?? 'false') === 'true',
    accessKey: process.env.MINIO_ROOT_USER ?? 'trazza',
    secretKey: process.env.MINIO_ROOT_PASSWORD ?? 'trazza',
    bucket: process.env.MINIO_BUCKET ?? 'trazza',
    // Host público con el que el navegador alcanza MinIO (para firmar las URLs).
    publicUrl: process.env.MINIO_PUBLIC_URL ?? 'http://localhost:9000',
  },
};
