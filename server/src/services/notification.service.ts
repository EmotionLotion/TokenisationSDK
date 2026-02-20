/**
 * Notification Service
 *
 * Handles multi-channel notifications for the tokenization platform.
 * Supports email, webhooks, and push notifications.
 */

import { logger } from '../middleware/logger.js';

export type NotificationType =
  | 'DIVIDEND_AVAILABLE'
  | 'DIVIDEND_CLAIMED'
  | 'KYC_APPROVED'
  | 'KYC_REJECTED'
  | 'KYC_EXPIRING'
  | 'TRANSFER_COMPLETE'
  | 'TRANSFER_FAILED'
  | 'TOKEN_MINTED'
  | 'TOKEN_BURNED'
  | 'COMPLIANCE_ALERT'
  | 'SANCTIONS_MATCH'
  | 'PRICE_ALERT'
  | 'SYSTEM_ALERT';

export type NotificationChannel = 'email' | 'webhook' | 'push' | 'sms';

export interface NotificationRecipient {
  id: string;
  email?: string;
  phone?: string;
  pushToken?: string;
  webhookUrl?: string;
  preferences: {
    channels: NotificationChannel[];
    types: NotificationType[];
    frequency: 'immediate' | 'daily' | 'weekly';
  };
}

export interface NotificationPayload {
  type: NotificationType;
  recipient: NotificationRecipient;
  data: Record<string, unknown>;
  priority: 'high' | 'medium' | 'low';
  metadata?: {
    assetId?: string;
    transactionHash?: string;
    amount?: string;
    currency?: string;
  };
}

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: string;
  sentAt: Date;
}

export interface EmailConfig {
  provider: 'sendgrid' | 'ses' | 'smtp';
  apiKey?: string;
  apiUrl?: string; // Provider API URL (defaults based on provider)
  fromEmail: string;
  fromName: string;
  region?: string;
}

export interface WebhookConfig {
  timeout: number;
  retries: number;
  signatureSecret?: string;
}

export interface NotificationServiceConfig {
  email?: EmailConfig;
  webhook?: WebhookConfig;
  templates?: Map<NotificationType, NotificationTemplate>;
}

export interface NotificationTemplate {
  subject: string;
  htmlTemplate: string;
  textTemplate: string;
}

/**
 * Default email templates
 */
const DEFAULT_TEMPLATES: Map<NotificationType, NotificationTemplate> = new Map([
  [
    'DIVIDEND_AVAILABLE',
    {
      subject: 'Dividend Available for Claim',
      htmlTemplate: `
        <h2>Dividend Available</h2>
        <p>A dividend of <strong>{{amount}} {{currency}}</strong> is available for your {{assetName}} holdings.</p>
        <p>Record Date: {{recordDate}}</p>
        <p>Payment Date: {{paymentDate}}</p>
        <p><a href="{{claimUrl}}">Claim Your Dividend</a></p>
      `,
      textTemplate: `
        Dividend Available

        A dividend of {{amount}} {{currency}} is available for your {{assetName}} holdings.
        Record Date: {{recordDate}}
        Payment Date: {{paymentDate}}

        Claim at: {{claimUrl}}
      `,
    },
  ],
  [
    'KYC_APPROVED',
    {
      subject: 'KYC Verification Approved',
      htmlTemplate: `
        <h2>KYC Approved</h2>
        <p>Congratulations! Your KYC verification has been approved.</p>
        <p>Verification Level: <strong>{{level}}</strong></p>
        <p>Valid Until: {{expiryDate}}</p>
        <p>You can now participate in token offerings and transfers.</p>
      `,
      textTemplate: `
        KYC Approved

        Congratulations! Your KYC verification has been approved.
        Verification Level: {{level}}
        Valid Until: {{expiryDate}}

        You can now participate in token offerings and transfers.
      `,
    },
  ],
  [
    'KYC_REJECTED',
    {
      subject: 'KYC Verification Requires Attention',
      htmlTemplate: `
        <h2>KYC Verification Update</h2>
        <p>We were unable to verify your identity with the documents provided.</p>
        <p>Reason: {{reason}}</p>
        <p><a href="{{retryUrl}}">Submit New Documents</a></p>
      `,
      textTemplate: `
        KYC Verification Update

        We were unable to verify your identity with the documents provided.
        Reason: {{reason}}

        Submit new documents at: {{retryUrl}}
      `,
    },
  ],
  [
    'KYC_EXPIRING',
    {
      subject: 'KYC Verification Expiring Soon',
      htmlTemplate: `
        <h2>KYC Expiring Soon</h2>
        <p>Your KYC verification will expire on <strong>{{expiryDate}}</strong>.</p>
        <p>Please complete re-verification to maintain your trading access.</p>
        <p><a href="{{renewUrl}}">Renew KYC</a></p>
      `,
      textTemplate: `
        KYC Expiring Soon

        Your KYC verification will expire on {{expiryDate}}.
        Please complete re-verification to maintain your trading access.

        Renew at: {{renewUrl}}
      `,
    },
  ],
  [
    'TRANSFER_COMPLETE',
    {
      subject: 'Token Transfer Complete',
      htmlTemplate: `
        <h2>Transfer Complete</h2>
        <p>Your transfer of <strong>{{amount}} {{tokenSymbol}}</strong> has been completed.</p>
        <p>Transaction: <a href="{{explorerUrl}}">{{transactionHash}}</a></p>
        <p>To: {{toAddress}}</p>
      `,
      textTemplate: `
        Transfer Complete

        Your transfer of {{amount}} {{tokenSymbol}} has been completed.
        Transaction: {{transactionHash}}
        To: {{toAddress}}
      `,
    },
  ],
  [
    'COMPLIANCE_ALERT',
    {
      subject: 'Compliance Alert',
      htmlTemplate: `
        <h2>Compliance Alert</h2>
        <p>{{message}}</p>
        <p>Action Required: {{action}}</p>
        <p>Deadline: {{deadline}}</p>
      `,
      textTemplate: `
        Compliance Alert

        {{message}}
        Action Required: {{action}}
        Deadline: {{deadline}}
      `,
    },
  ],
]);

export class NotificationService {
  private config: NotificationServiceConfig;
  private templates: Map<NotificationType, NotificationTemplate>;
  private pendingNotifications: NotificationPayload[] = [];

  constructor(config: NotificationServiceConfig = {}) {
    this.config = config;
    this.templates = config.templates || DEFAULT_TEMPLATES;
  }

  /**
   * Send a notification
   */
  async send(payload: NotificationPayload): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    const { recipient, type } = payload;

    // Filter channels based on recipient preferences
    const enabledChannels = recipient.preferences.channels.filter(channel => {
      if (!recipient.preferences.types.includes(type)) return false;

      switch (channel) {
        case 'email':
          return !!recipient.email && !!this.config.email;
        case 'webhook':
          return !!recipient.webhookUrl;
        case 'push':
          return !!recipient.pushToken;
        case 'sms':
          return !!recipient.phone;
        default:
          return false;
      }
    });

    // Send via each enabled channel
    for (const channel of enabledChannels) {
      try {
        const result = await this.sendViaChannel(channel, payload);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          channel,
          error: error instanceof Error ? error.message : 'Unknown error',
          sentAt: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * Send via specific channel
   */
  private async sendViaChannel(
    channel: NotificationChannel,
    payload: NotificationPayload
  ): Promise<NotificationResult> {
    switch (channel) {
      case 'email':
        return this.sendEmail(payload);
      case 'webhook':
        return this.sendWebhook(payload);
      case 'push':
        return this.sendPush(payload);
      case 'sms':
        return this.sendSMS(payload);
      default:
        throw new Error(`Unsupported channel: ${channel}`);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(payload: NotificationPayload): Promise<NotificationResult> {
    const { recipient, type, data } = payload;
    const template = this.templates.get(type);

    if (!template) {
      throw new Error(`No template for type: ${type}`);
    }

    const subject = this.renderTemplate(template.subject, data);
    const html = this.renderTemplate(template.htmlTemplate, data);
    const text = this.renderTemplate(template.textTemplate, data);

    // Send based on provider
    if (this.config.email?.provider === 'sendgrid') {
      return this.sendSendGridEmail(recipient.email!, subject, html, text);
    } else if (this.config.email?.provider === 'ses') {
      return this.sendSESEmail(recipient.email!, subject, html, text);
    } else {
      // Mock for development
      logger.info(`[Email] To: ${recipient.email}, Subject: ${subject}`);
      return {
        success: true,
        channel: 'email',
        messageId: `mock-${Date.now()}`,
        sentAt: new Date(),
      };
    }
  }

  /**
   * Send via SendGrid
   */
  private async sendSendGridEmail(
    to: string,
    subject: string,
    html: string,
    text: string
  ): Promise<NotificationResult> {
    const apiUrl = this.config.email?.apiUrl || 'https://api.sendgrid.com/v3/mail/send';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.email?.apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: {
          email: this.config.email?.fromEmail,
          name: this.config.email?.fromName,
        },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`SendGrid error: ${response.status}`);
    }

    return {
      success: true,
      channel: 'email',
      messageId: response.headers.get('x-message-id') || undefined,
      sentAt: new Date(),
    };
  }

  /**
   * Send via AWS SES
   */
  private async sendSESEmail(
    to: string,
    subject: string,
    html: string,
    text: string
  ): Promise<NotificationResult> {
    const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');

    const client = new SESClient({
      region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1',
      ...(process.env.AWS_ACCESS_KEY_ID && {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      }),
    });

    const command = new SendEmailCommand({
      Source: process.env.EMAIL_FROM_ADDRESS || 'noreply@ahoy.fund',
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: text, Charset: 'UTF-8' },
        },
      },
    });

    const result = await client.send(command);

    return {
      success: true,
      channel: 'email',
      messageId: result.MessageId || `ses-${Date.now()}`,
      sentAt: new Date(),
    };
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(payload: NotificationPayload): Promise<NotificationResult> {
    const { recipient, type, data, metadata } = payload;
    const webhookPayload = {
      event: type,
      timestamp: new Date(),
      data,
      metadata,
    };

    const response = await fetch(recipient.webhookUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': this.signWebhook(JSON.stringify(webhookPayload)),
      },
      body: JSON.stringify(webhookPayload),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }

    return {
      success: true,
      channel: 'webhook',
      sentAt: new Date(),
    };
  }

  /**
   * Sign webhook payload
   */
  private signWebhook(payload: string): string {
    if (!this.config.webhook?.signatureSecret) {
      return '';
    }

    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', this.config.webhook.signatureSecret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Send push notification
   */
  private async sendPush(payload: NotificationPayload): Promise<NotificationResult> {
    // Firebase/APNS implementation would go here
    logger.info(`[Push] Token: ${payload.recipient.pushToken}, Type: ${payload.type}`);
    return {
      success: true,
      channel: 'push',
      messageId: `push-${Date.now()}`,
      sentAt: new Date(),
    };
  }

  /**
   * Send SMS notification
   */
  private async sendSMS(payload: NotificationPayload): Promise<NotificationResult> {
    // Twilio/other SMS implementation would go here
    logger.info(`[SMS] Phone: ${payload.recipient.phone}, Type: ${payload.type}`);
    return {
      success: true,
      channel: 'sms',
      messageId: `sms-${Date.now()}`,
      sentAt: new Date(),
    };
  }

  /**
   * Render template with data
   */
  private renderTemplate(template: string, data: Record<string, unknown>): string {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    return result;
  }

  /**
   * Queue notification for batch sending
   */
  queue(payload: NotificationPayload): void {
    this.pendingNotifications.push(payload);
  }

  /**
   * Send all queued notifications
   */
  async flushQueue(): Promise<NotificationResult[][]> {
    const results: NotificationResult[][] = [];

    while (this.pendingNotifications.length > 0) {
      const payload = this.pendingNotifications.shift()!;
      const result = await this.send(payload);
      results.push(result);
    }

    return results;
  }

  /**
   * Add or update a template
   */
  setTemplate(type: NotificationType, template: NotificationTemplate): void {
    this.templates.set(type, template);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; channels: Record<NotificationChannel, boolean> }> {
    return {
      healthy: true,
      channels: {
        email: !!this.config.email,
        webhook: true,
        push: false, // Would check Firebase connection
        sms: false, // Would check Twilio connection
      },
    };
  }
}

// Export factory function
export function createNotificationService(config?: NotificationServiceConfig): NotificationService {
  return new NotificationService(config);
}
