/**
 * Alert Management System
 *
 * Handles alert definitions, triggers, and notifications.
 */

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'firing' | 'resolved' | 'silenced';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  condition: AlertCondition;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  forDuration: number; // ms to wait before firing
  cooldownPeriod: number; // ms between alerts
  enabled: boolean;
}

export interface AlertCondition {
  type: 'threshold' | 'absence' | 'rate_change';
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number;
  labels?: Record<string, string>;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: Date;
  endsAt?: Date;
  value?: number;
  generatorURL?: string;
}

export interface AlertNotifier {
  name: string;
  notify(alerts: Alert[]): Promise<void>;
}

/**
 * Alert Manager
 */
class AlertManager {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private notifiers: AlertNotifier[] = [];
  private pendingAlerts: Map<string, { rule: AlertRule; startTime: number; value: number }> = new Map();
  private lastNotified: Map<string, number> = new Map();
  private silencedRules: Set<string> = new Set();

  /**
   * Add an alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove an alert rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.pendingAlerts.delete(ruleId);
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  /**
   * Silence a rule
   */
  silenceRule(ruleId: string, duration: number): void {
    this.silencedRules.add(ruleId);
    setTimeout(() => {
      this.silencedRules.delete(ruleId);
    }, duration);
  }

  /**
   * Add a notifier
   */
  addNotifier(notifier: AlertNotifier): void {
    this.notifiers.push(notifier);
  }

  /**
   * Evaluate a metric value against rules
   */
  async evaluate(metric: string, value: number, labels: Record<string, string> = {}): Promise<void> {
    const now = Date.now();
    const matchingRules = Array.from(this.rules.values()).filter(
      rule => rule.enabled && rule.condition.metric === metric
    );

    for (const rule of matchingRules) {
      // Check label match if specified
      if (rule.condition.labels) {
        let labelsMatch = true;
        for (const [key, val] of Object.entries(rule.condition.labels)) {
          if (labels[key] !== val) {
            labelsMatch = false;
            break;
          }
        }
        if (!labelsMatch) continue;
      }

      const conditionMet = this.evaluateCondition(rule.condition, value);
      const alertKey = `${rule.id}:${JSON.stringify(labels)}`;

      if (conditionMet) {
        // Check if already pending
        const pending = this.pendingAlerts.get(alertKey);

        if (pending) {
          // Check if forDuration has passed
          if (now - pending.startTime >= rule.forDuration) {
            // Fire the alert
            await this.fireAlert(rule, value, labels);
            this.pendingAlerts.delete(alertKey);
          }
        } else {
          // Start pending
          this.pendingAlerts.set(alertKey, {
            rule,
            startTime: now,
            value,
          });
        }
      } else {
        // Condition not met - resolve if active
        this.pendingAlerts.delete(alertKey);

        const activeAlert = this.activeAlerts.get(alertKey);
        if (activeAlert) {
          await this.resolveAlert(alertKey);
        }
      }
    }
  }

  /**
   * Evaluate a condition
   */
  private evaluateCondition(condition: AlertCondition, value: number): boolean {
    switch (condition.operator) {
      case '>':
        return value > condition.value;
      case '<':
        return value < condition.value;
      case '>=':
        return value >= condition.value;
      case '<=':
        return value <= condition.value;
      case '==':
        return value === condition.value;
      case '!=':
        return value !== condition.value;
      default:
        return false;
    }
  }

  /**
   * Fire an alert
   */
  private async fireAlert(
    rule: AlertRule,
    value: number,
    labels: Record<string, string>
  ): Promise<void> {
    const alertKey = `${rule.id}:${JSON.stringify(labels)}`;

    // Check if already active
    if (this.activeAlerts.has(alertKey)) {
      return;
    }

    // Check cooldown
    const lastNotify = this.lastNotified.get(alertKey) || 0;
    if (Date.now() - lastNotify < rule.cooldownPeriod) {
      return;
    }

    // Check if silenced
    if (this.silencedRules.has(rule.id)) {
      return;
    }

    const alert: Alert = {
      id: `${rule.id}-${Date.now()}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      status: 'firing',
      labels: { ...rule.labels, ...labels },
      annotations: this.renderAnnotations(rule.annotations, { value, ...labels }),
      startsAt: new Date(),
      value,
    };

    this.activeAlerts.set(alertKey, alert);
    this.alertHistory.push(alert);
    this.lastNotified.set(alertKey, Date.now());

    // Notify
    await this.notify([alert]);

    console.log(`[ALERT] ${rule.severity.toUpperCase()}: ${rule.name} - Value: ${value}`);
  }

  /**
   * Resolve an alert
   */
  private async resolveAlert(alertKey: string): Promise<void> {
    const alert = this.activeAlerts.get(alertKey);
    if (!alert) return;

    alert.status = 'resolved';
    alert.endsAt = new Date();

    this.activeAlerts.delete(alertKey);

    // Notify resolution
    await this.notify([alert]);

    console.log(`[ALERT RESOLVED] ${alert.ruleName}`);
  }

  /**
   * Render annotations with values
   */
  private renderAnnotations(
    annotations: Record<string, string>,
    values: Record<string, unknown>
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, template] of Object.entries(annotations)) {
      let rendered = template;
      for (const [name, value] of Object.entries(values)) {
        rendered = rendered.replace(new RegExp(`\\{\\{${name}\\}\\}`, 'g'), String(value));
      }
      result[key] = rendered;
    }

    return result;
  }

  /**
   * Send notifications
   */
  private async notify(alerts: Alert[]): Promise<void> {
    for (const notifier of this.notifiers) {
      try {
        await notifier.notify(alerts);
      } catch (error) {
        console.error(`Notifier ${notifier.name} failed:`, error);
      }
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get all rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }
}

// Create manager
export const alertManager = new AlertManager();

// ==================== DEFAULT ALERT RULES ====================

// High error rate
alertManager.addRule({
  id: 'high_error_rate',
  name: 'High Error Rate',
  description: 'API error rate is above threshold',
  severity: 'critical',
  condition: {
    type: 'threshold',
    metric: 'http_error_rate',
    operator: '>',
    value: 0.05, // 5%
  },
  labels: { team: 'platform' },
  annotations: {
    summary: 'High error rate detected: {{value}}%',
    description: 'The API error rate has exceeded 5%',
  },
  forDuration: 60000, // 1 minute
  cooldownPeriod: 300000, // 5 minutes
  enabled: true,
});

// High latency
alertManager.addRule({
  id: 'high_latency',
  name: 'High API Latency',
  description: 'API p95 latency is above threshold',
  severity: 'warning',
  condition: {
    type: 'threshold',
    metric: 'http_latency_p95',
    operator: '>',
    value: 2000, // 2 seconds
  },
  labels: { team: 'platform' },
  annotations: {
    summary: 'High latency detected: {{value}}ms',
    description: 'API p95 latency has exceeded 2 seconds',
  },
  forDuration: 120000, // 2 minutes
  cooldownPeriod: 600000, // 10 minutes
  enabled: true,
});

// Low LINK balance
alertManager.addRule({
  id: 'low_link_balance',
  name: 'Low LINK Balance',
  description: 'LINK token balance for automation is low',
  severity: 'warning',
  condition: {
    type: 'threshold',
    metric: 'link_balance',
    operator: '<',
    value: 10, // 10 LINK
  },
  labels: { team: 'blockchain' },
  annotations: {
    summary: 'Low LINK balance: {{value}} LINK',
    description: 'The LINK balance for Chainlink services is running low',
  },
  forDuration: 0,
  cooldownPeriod: 3600000, // 1 hour
  enabled: true,
});

// Stale oracle data
alertManager.addRule({
  id: 'stale_oracle',
  name: 'Stale Oracle Data',
  description: 'Oracle price data is stale',
  severity: 'critical',
  condition: {
    type: 'threshold',
    metric: 'oracle_data_age_seconds',
    operator: '>',
    value: 3600, // 1 hour
  },
  labels: { team: 'blockchain' },
  annotations: {
    summary: 'Stale oracle data: {{value}}s old',
    description: 'Oracle price data has not been updated for over 1 hour',
  },
  forDuration: 300000, // 5 minutes
  cooldownPeriod: 1800000, // 30 minutes
  enabled: true,
});

// ==================== NOTIFIERS ====================

/**
 * Console notifier (for development)
 */
export const consoleNotifier: AlertNotifier = {
  name: 'console',
  async notify(alerts: Alert[]): Promise<void> {
    for (const alert of alerts) {
      const emoji = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
      const status = alert.status === 'resolved' ? '✅ RESOLVED' : '🔥 FIRING';
      console.log(`${emoji} [${status}] ${alert.ruleName}: ${alert.annotations.summary || ''}`);
    }
  },
};

alertManager.addNotifier(consoleNotifier);

/**
 * Webhook notifier factory
 */
export function createWebhookNotifier(webhookUrl: string, name: string = 'webhook'): AlertNotifier {
  return {
    name,
    async notify(alerts: Alert[]): Promise<void> {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alerts }),
      });
    },
  };
}

/**
 * Slack notifier factory
 */
export function createSlackNotifier(webhookUrl: string): AlertNotifier {
  return {
    name: 'slack',
    async notify(alerts: Alert[]): Promise<void> {
      for (const alert of alerts) {
        const color = alert.severity === 'critical' ? '#FF0000' : alert.severity === 'warning' ? '#FFA500' : '#0000FF';

        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attachments: [
              {
                color,
                title: `${alert.status === 'resolved' ? '✅ Resolved: ' : '🔥 '}${alert.ruleName}`,
                text: alert.annotations.description || '',
                fields: [
                  { title: 'Severity', value: alert.severity, short: true },
                  { title: 'Status', value: alert.status, short: true },
                  { title: 'Value', value: String(alert.value), short: true },
                ],
                ts: Math.floor(alert.startsAt.getTime() / 1000),
              },
            ],
          }),
        });
      }
    },
  };
}

export default alertManager;
