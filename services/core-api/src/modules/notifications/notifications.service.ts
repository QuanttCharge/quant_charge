import { config } from '../../common/config.js';
import { logger } from '../../common/logger.js';

/**
 * Phase 6: FCM / APNS / SMTP mocks.
 */
export async function sendPushMock(params: {
  token: string;
  title: string;
  body: string;
}): Promise<void> {
  logger.info(
    { provider: 'FCM/APNS', keyConfigured: Boolean(config.FCM_SERVER_KEY), ...params },
    'mock push notification',
  );
  // TODO(phase-6): integrate firebase-admin / apn
}

export async function sendEmailMock(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  logger.info(
    {
      smtp: `${config.SMTP_HOST}:${config.SMTP_PORT}`,
      from: config.SMTP_FROM,
      to: params.to,
      subject: params.subject,
    },
    'mock email (Mailhog)',
  );
  // TODO(phase-6): nodemailer to Mailhog
}
