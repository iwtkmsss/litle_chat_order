import nodemailer from 'nodemailer';
import { smtpConfig } from './config.js';
import {
  listPreparedEmailNotifications,
  markEmailNotificationSent,
} from './database.js';

function isSmtpConfigured() {
  return Boolean(smtpConfig.host && smtpConfig.user && smtpConfig.password && smtpConfig.from);
}

function createTransporter() {
  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.password,
    },
  });
}

export async function sendPreparedApplicationEmails(applicationId, actor = null) {
  if (!isSmtpConfigured()) {
    return { configured: false, sent: 0, failed: 0 };
  }

  const notifications = listPreparedEmailNotifications(applicationId);

  if (notifications.length === 0) {
    return { configured: true, sent: 0, failed: 0 };
  }

  const transporter = createTransporter();
  let sent = 0;
  let failed = 0;

  for (const notification of notifications) {
    try {
      await transporter.sendMail({
        from: smtpConfig.from,
        to: notification.recipientEmail,
        subject: notification.subject,
        text: notification.body,
      });
      markEmailNotificationSent(notification.id, actor);
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to send email notification #${notification.id}:`, error);
    }
  }

  return { configured: true, sent, failed };
}
