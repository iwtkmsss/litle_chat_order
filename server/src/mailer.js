import nodemailer from 'nodemailer';
import { smtpConfig } from './config.js';
import {
  getEmailNotificationById,
  listPreparedEmailNotifications,
  markEmailNotificationError,
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

function getSendErrorMessage(error) {
  return error?.response || error?.message || 'Невідома помилка SMTP-відправки.';
}

async function sendNotification(transporter, notification, actor = null) {
  try {
    await transporter.sendMail({
      from: smtpConfig.from,
      to: notification.recipientEmail,
      subject: notification.subject,
      text: notification.body,
    });
    markEmailNotificationSent(notification.id, actor);
    return { sent: true, error: '' };
  } catch (error) {
    const message = getSendErrorMessage(error);
    markEmailNotificationError(notification.id, message);
    console.error(`Failed to send email notification #${notification.id}:`, error);
    return { sent: false, error: message };
  }
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
    const result = await sendNotification(transporter, notification, actor);

    if (result.sent) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return { configured: true, sent, failed };
}

export async function retryEmailNotification(notificationId, actor = null) {
  const notification = getEmailNotificationById(notificationId);

  if (!notification) {
    return { configured: true, sent: false, error: 'Email-повідомлення не знайдено.' };
  }

  if (!isSmtpConfigured()) {
    markEmailNotificationError(notification.id, 'SMTP не налаштовано.');
    return { configured: false, sent: false, error: 'SMTP не налаштовано.' };
  }

  if (notification.status === 'skipped') {
    return { configured: true, sent: false, error: 'Email не вказано, відправка неможлива.' };
  }

  if (!notification.recipientEmail) {
    return { configured: true, sent: false, error: 'Email одержувача не вказано.' };
  }

  const transporter = createTransporter();
  const result = await sendNotification(transporter, notification, actor);

  return {
    configured: true,
    sent: result.sent,
    error: result.error,
  };
}
