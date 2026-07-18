import { config } from './common/config.js';
import { logger } from './common/logger.js';
import { installGracefulShutdown, onShutdown } from './common/graceful-shutdown.js';
import { RedisRegistry } from './modules/redis/registry.js';
import { KafkaProducerService } from './modules/kafka/producer.js';
import { startOcppServer } from './modules/ocpp/server.js';

async function main(): Promise<void> {
  installGracefulShutdown();

  const registry = new RedisRegistry();
  const kafka = new KafkaProducerService();
  await kafka.connect();

  const { close } = startOcppServer(registry, kafka);

  onShutdown(async () => {
    await close();
    await kafka.disconnect();
    await registry.close();
  });

  logger.info(
    { instanceId: config.OCPP_INSTANCE_ID, port: config.OCPP_WS_PORT },
    'ocpp-gateway ready (no business logic — validate & publish only)',
  );
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});
