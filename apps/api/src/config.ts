export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://trazza_app:app@localhost:5432/trazza',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  ingestToken: process.env.INGEST_TOKEN ?? 'dev-ingest-token',
  // Bridge MQTT -> ingesta.
  mqttUrl: process.env.MQTT_URL ?? 'mqtt://mqtt:1883',
  mqttTopicPrefix: process.env.MQTT_TOPIC_PREFIX ?? 'trazza',
};
