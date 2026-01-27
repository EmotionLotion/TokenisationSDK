import { createHash } from 'crypto';

// ============================================================================
// Policy Compiler Service - Declarative Policy Layer (P0 - Compliance)
// ============================================================================

/**
 * Policy Schema Types
 */
export interface PolicySchema {
  $schema?: string;
  id: string;
  name: string;
  version: number;
  description?: string;
  jurisdiction: JurisdictionSpec;
  rules: PolicyRule[];
  metadata?: Record<string, unknown>;
}

export interface JurisdictionSpec {
  primary: string; // ISO country code (e.g., "AE", "US", "SG")
  overlay?: string[]; // Overlay jurisdictions (e.g., ["DUBAI_DLD", "ADGM"])
}

export interface PolicyRule {
  id: string;
  type: RuleType;
  name?: string;
  description?: string;
  condition: RuleCondition;
  onFail?: FailureAction;
  severity?: 'error' | 'warning' | 'info';
  priority?: number;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export type RuleType =
  | 'require' // Must be true to proceed
  | 'forbid' // Must be false to proceed
  | 'assert' // Log warning if false but allow
  | 'limit' // Numeric threshold check
  | 'cooldown' // Time-based restriction
  | 'allowlist' // Must be in list
  | 'blocklist' // Must not be in list
  | 'custom'; // Custom evaluator

export interface RuleCondition {
  field: string; // Dot-notation path (e.g., "actor.kycStatus", "transfer.amount")
  operator: ConditionOperator;
  value: unknown;
  not?: boolean; // Negate the condition
  and?: RuleCondition[]; // All must pass
  or?: RuleCondition[]; // At least one must pass
}

export type ConditionOperator =
  | 'eq' // Equal
  | 'ne' // Not equal
  | 'gt' // Greater than
  | 'gte' // Greater than or equal
  | 'lt' // Less than
  | 'lte' // Less than or equal
  | 'in' // Value in array
  | 'nin' // Value not in array
  | 'contains' // String contains
  | 'starts_with' // String starts with
  | 'ends_with' // String ends with
  | 'matches' // Regex match
  | 'exists' // Field exists
  | 'is_null' // Field is null
  | 'is_type' // Type check
  | 'age_days' // Date field age in days
  | 'between' // Value between two values
  | 'custom'; // Custom evaluator function name

export interface FailureAction {
  code: string;
  message: string;
  suggestedAction?: string;
  links?: Record<string, string>;
}

/**
 * Compiled Policy - Optimized for fast evaluation
 */
export interface CompiledPolicy {
  id: string;
  name: string;
  version: number;
  hash: string;
  jurisdiction: JurisdictionSpec;
  rules: CompiledRule[];
  compiledAt: Date;
  metadata: Record<string, unknown>;
}

export interface CompiledRule {
  id: string;
  type: RuleType;
  priority: number;
  evaluator: (context: EvaluationContext) => RuleEvaluationResult;
  condition: RuleCondition;
  onFail?: FailureAction;
  severity: 'error' | 'warning' | 'info';
}

export interface EvaluationContext {
  actor: ActorContext;
  subject: SubjectContext;
  action: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface ActorContext {
  id: string;
  type: 'user' | 'api_key' | 'system' | 'webhook';
  kycStatus?: string;
  kycLevel?: string;
  accreditedStatus?: string;
  jurisdiction?: string;
  permissions?: string[];
  metadata?: Record<string, unknown>;
}

export interface SubjectContext {
  type: string; // token, transfer, investor, asset
  id: string;
  state?: string;
  amount?: string;
  fromParty?: PartyContext;
  toParty?: PartyContext;
  metadata?: Record<string, unknown>;
}

export interface PartyContext {
  id: string;
  kycStatus?: string;
  jurisdiction?: string;
  isFrozen?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RuleEvaluationResult {
  ruleId: string;
  passed: boolean;
  message?: string;
  code?: string;
  severity: 'error' | 'warning' | 'info';
  suggestedAction?: string;
  evaluationTimeMs?: number;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  policyId: string;
  policyHash: string;
  rulesEvaluated: number;
  rulesPassed: number;
  rulesFailed: number;
  violations: RuleEvaluationResult[];
  warnings: RuleEvaluationResult[];
  partnerExplanation?: PartnerExplanation;
  evaluationTimeMs: number;
  timestamp: Date;
}

export interface PartnerExplanation {
  summary: string;
  violations: ViolationExplanation[];
  suggestedActions: SuggestedAction[];
  links?: Record<string, string>;
}

export interface ViolationExplanation {
  code: string;
  message: string;
  field?: string;
}

export interface SuggestedAction {
  action: string;
  endpoint?: string;
  description: string;
}

/**
 * Validation Result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
}

// ============================================================================
// Policy Compiler Class
// ============================================================================

export class PolicyCompiler {
  private readonly supportedSchemaVersions = ['1.0', '2.0'];

  /**
   * Validate a policy JSON against the schema
   */
  validate(policyJson: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Type check
    if (!policyJson || typeof policyJson !== 'object') {
      errors.push({
        path: '$',
        message: 'Policy must be a non-null object',
        code: 'INVALID_TYPE',
      });
      return { valid: false, errors, warnings };
    }

    const policy = policyJson as Record<string, unknown>;

    // Required fields
    if (!policy.id || typeof policy.id !== 'string') {
      errors.push({
        path: '$.id',
        message: 'Policy ID is required and must be a string',
        code: 'MISSING_ID',
      });
    }

    if (!policy.name || typeof policy.name !== 'string') {
      errors.push({
        path: '$.name',
        message: 'Policy name is required and must be a string',
        code: 'MISSING_NAME',
      });
    }

    if (typeof policy.version !== 'number' || policy.version < 1) {
      errors.push({
        path: '$.version',
        message: 'Policy version is required and must be a positive integer',
        code: 'INVALID_VERSION',
      });
    }

    // Jurisdiction validation
    if (!policy.jurisdiction || typeof policy.jurisdiction !== 'object') {
      errors.push({
        path: '$.jurisdiction',
        message: 'Jurisdiction specification is required',
        code: 'MISSING_JURISDICTION',
      });
    } else {
      const jurisdiction = policy.jurisdiction as Record<string, unknown>;
      if (!jurisdiction.primary || typeof jurisdiction.primary !== 'string') {
        errors.push({
          path: '$.jurisdiction.primary',
          message: 'Primary jurisdiction is required',
          code: 'MISSING_PRIMARY_JURISDICTION',
        });
      }
    }

    // Rules validation
    if (!Array.isArray(policy.rules)) {
      errors.push({
        path: '$.rules',
        message: 'Rules must be an array',
        code: 'INVALID_RULES',
      });
    } else {
      policy.rules.forEach((rule, index) => {
        const ruleErrors = this.validateRule(rule, `$.rules[${index}]`);
        errors.push(...ruleErrors);
      });
    }

    // Schema version check
    if (policy.$schema) {
      const schemaVersion = this.extractSchemaVersion(policy.$schema as string);
      if (schemaVersion && !this.supportedSchemaVersions.includes(schemaVersion)) {
        warnings.push({
          path: '$.$schema',
          message: `Schema version ${schemaVersion} may not be fully supported`,
          code: 'UNSUPPORTED_SCHEMA_VERSION',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Compile a validated policy into an optimized form
   */
  compile(policyJson: PolicySchema): CompiledPolicy {
    const validation = this.validate(policyJson);
    if (!validation.valid) {
      throw new PolicyCompilationError(
        'Policy validation failed',
        validation.errors
      );
    }

    const hash = this.computePolicyHash(policyJson);
    const compiledRules = policyJson.rules
      .filter(rule => rule.enabled !== false)
      .map(rule => this.compileRule(rule))
      .sort((a, b) => b.priority - a.priority); // Higher priority first

    return {
      id: policyJson.id,
      name: policyJson.name,
      version: policyJson.version,
      hash,
      jurisdiction: policyJson.jurisdiction,
      rules: compiledRules,
      compiledAt: new Date(),
      metadata: policyJson.metadata || {},
    };
  }

  /**
   * Apply jurisdiction overlays to a compiled policy
   */
  applyOverlays(
    base: CompiledPolicy,
    overlayJurisdictions: string[]
  ): CompiledPolicy {
    // For each overlay jurisdiction, we would load and merge additional rules
    // This is a simplified implementation - in production, you'd load overlays from DB
    const overlayRules: CompiledRule[] = [];

    for (const overlay of overlayJurisdictions) {
      const additionalRules = this.getOverlayRules(overlay);
      overlayRules.push(...additionalRules);
    }

    // Merge rules, with overlays taking precedence
    const mergedRules = [...base.rules, ...overlayRules]
      .sort((a, b) => b.priority - a.priority);

    // Recompute hash with overlays
    const combinedHash = this.computeCombinedHash(
      base.hash,
      overlayJurisdictions.join(',')
    );

    return {
      ...base,
      hash: combinedHash,
      jurisdiction: {
        ...base.jurisdiction,
        overlay: [
          ...(base.jurisdiction.overlay || []),
          ...overlayJurisdictions,
        ],
      },
      rules: mergedRules,
      compiledAt: new Date(),
    };
  }

  /**
   * Evaluate a compiled policy against a context
   */
  evaluate(
    policy: CompiledPolicy,
    context: EvaluationContext
  ): PolicyEvaluationResult {
    const startTime = Date.now();
    const violations: RuleEvaluationResult[] = [];
    const warnings: RuleEvaluationResult[] = [];
    let rulesPassed = 0;

    for (const rule of policy.rules) {
      const result = rule.evaluator(context);

      if (result.passed) {
        rulesPassed++;
      } else {
        if (result.severity === 'error') {
          violations.push(result);
        } else {
          warnings.push(result);
        }
      }
    }

    const allowed = violations.length === 0;
    const evaluationTimeMs = Date.now() - startTime;

    return {
      allowed,
      policyId: policy.id,
      policyHash: policy.hash,
      rulesEvaluated: policy.rules.length,
      rulesPassed,
      rulesFailed: violations.length,
      violations,
      warnings,
      partnerExplanation: allowed
        ? undefined
        : this.generatePartnerExplanation(violations, warnings),
      evaluationTimeMs,
      timestamp: new Date(),
    };
  }

  /**
   * Compute SHA256 hash of policy content
   */
  computePolicyHash(policy: PolicySchema): string {
    // Create canonical JSON (sorted keys)
    const canonical = JSON.stringify(policy, Object.keys(policy).sort());
    return createHash('sha256').update(canonical).digest('hex');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private validateRule(rule: unknown, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!rule || typeof rule !== 'object') {
      errors.push({
        path,
        message: 'Rule must be an object',
        code: 'INVALID_RULE',
      });
      return errors;
    }

    const r = rule as Record<string, unknown>;

    if (!r.id || typeof r.id !== 'string') {
      errors.push({
        path: `${path}.id`,
        message: 'Rule ID is required',
        code: 'MISSING_RULE_ID',
      });
    }

    if (!r.type || typeof r.type !== 'string') {
      errors.push({
        path: `${path}.type`,
        message: 'Rule type is required',
        code: 'MISSING_RULE_TYPE',
      });
    }

    if (!r.condition || typeof r.condition !== 'object') {
      errors.push({
        path: `${path}.condition`,
        message: 'Rule condition is required',
        code: 'MISSING_CONDITION',
      });
    } else {
      const conditionErrors = this.validateCondition(
        r.condition,
        `${path}.condition`
      );
      errors.push(...conditionErrors);
    }

    return errors;
  }

  private validateCondition(
    condition: unknown,
    path: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!condition || typeof condition !== 'object') {
      errors.push({
        path,
        message: 'Condition must be an object',
        code: 'INVALID_CONDITION',
      });
      return errors;
    }

    const c = condition as Record<string, unknown>;

    // Compound conditions
    if (c.and && !Array.isArray(c.and)) {
      errors.push({
        path: `${path}.and`,
        message: 'AND conditions must be an array',
        code: 'INVALID_AND_CONDITIONS',
      });
    }

    if (c.or && !Array.isArray(c.or)) {
      errors.push({
        path: `${path}.or`,
        message: 'OR conditions must be an array',
        code: 'INVALID_OR_CONDITIONS',
      });
    }

    // Simple condition validation
    if (!c.and && !c.or) {
      if (!c.field || typeof c.field !== 'string') {
        errors.push({
          path: `${path}.field`,
          message: 'Condition field is required',
          code: 'MISSING_FIELD',
        });
      }

      if (!c.operator || typeof c.operator !== 'string') {
        errors.push({
          path: `${path}.operator`,
          message: 'Condition operator is required',
          code: 'MISSING_OPERATOR',
        });
      }
    }

    return errors;
  }

  private extractSchemaVersion(schemaUri: string): string | null {
    const match = schemaUri.match(/\/v(\d+\.\d+)/);
    return match ? match[1] : null;
  }

  private compileRule(rule: PolicyRule): CompiledRule {
    const evaluator = this.createEvaluator(rule);

    return {
      id: rule.id,
      type: rule.type,
      priority: rule.priority || 0,
      evaluator,
      condition: rule.condition,
      onFail: rule.onFail,
      severity: rule.severity || 'error',
    };
  }

  private createEvaluator(
    rule: PolicyRule
  ): (context: EvaluationContext) => RuleEvaluationResult {
    return (context: EvaluationContext): RuleEvaluationResult => {
      const startTime = Date.now();

      try {
        const passed = this.evaluateCondition(rule.condition, context);
        const effectivePassed = rule.type === 'forbid' ? !passed : passed;

        return {
          ruleId: rule.id,
          passed: effectivePassed,
          message: effectivePassed ? undefined : rule.onFail?.message,
          code: effectivePassed ? undefined : rule.onFail?.code,
          severity: rule.severity || 'error',
          suggestedAction: effectivePassed
            ? undefined
            : rule.onFail?.suggestedAction,
          evaluationTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          ruleId: rule.id,
          passed: false,
          message: `Rule evaluation error: ${(error as Error).message}`,
          code: 'EVALUATION_ERROR',
          severity: 'error',
          evaluationTimeMs: Date.now() - startTime,
        };
      }
    };
  }

  private evaluateCondition(
    condition: RuleCondition,
    context: EvaluationContext
  ): boolean {
    // Handle compound conditions
    if (condition.and) {
      return condition.and.every(c => this.evaluateCondition(c, context));
    }

    if (condition.or) {
      return condition.or.some(c => this.evaluateCondition(c, context));
    }

    // Get field value from context
    const fieldValue = this.getFieldValue(condition.field, context);

    // Evaluate operator
    let result = this.evaluateOperator(
      condition.operator,
      fieldValue,
      condition.value
    );

    // Apply negation if specified
    if (condition.not) {
      result = !result;
    }

    return result;
  }

  private getFieldValue(path: string, context: EvaluationContext): unknown {
    const parts = path.split('.');
    let value: unknown = context;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = (value as Record<string, unknown>)[part];
    }

    return value;
  }

  private evaluateOperator(
    operator: ConditionOperator,
    actual: unknown,
    expected: unknown
  ): boolean {
    switch (operator) {
      case 'eq':
        return actual === expected;

      case 'ne':
        return actual !== expected;

      case 'gt':
        return Number(actual) > Number(expected);

      case 'gte':
        return Number(actual) >= Number(expected);

      case 'lt':
        return Number(actual) < Number(expected);

      case 'lte':
        return Number(actual) <= Number(expected);

      case 'in':
        return Array.isArray(expected) && expected.includes(actual);

      case 'nin':
        return Array.isArray(expected) && !expected.includes(actual);

      case 'contains':
        return (
          typeof actual === 'string' &&
          typeof expected === 'string' &&
          actual.includes(expected)
        );

      case 'starts_with':
        return (
          typeof actual === 'string' &&
          typeof expected === 'string' &&
          actual.startsWith(expected)
        );

      case 'ends_with':
        return (
          typeof actual === 'string' &&
          typeof expected === 'string' &&
          actual.endsWith(expected)
        );

      case 'matches':
        return (
          typeof actual === 'string' &&
          typeof expected === 'string' &&
          new RegExp(expected).test(actual)
        );

      case 'exists':
        return actual !== undefined;

      case 'is_null':
        return actual === null || actual === undefined;

      case 'is_type':
        return typeof actual === expected;

      case 'age_days':
        if (actual instanceof Date) {
          const ageMs = Date.now() - actual.getTime();
          const ageDays = ageMs / (1000 * 60 * 60 * 24);
          return ageDays <= Number(expected);
        }
        return false;

      case 'between':
        if (Array.isArray(expected) && expected.length === 2) {
          const [min, max] = expected;
          const num = Number(actual);
          return num >= Number(min) && num <= Number(max);
        }
        return false;

      case 'custom':
        // Custom evaluators would be registered separately
        return true;

      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  private getOverlayRules(jurisdiction: string): CompiledRule[] {
    // In production, this would load from database
    // For now, return built-in overlays
    const overlays: Record<string, CompiledRule[]> = {
      DUBAI_DLD: [
        {
          id: 'dld_title_verified',
          type: 'require',
          priority: 100,
          condition: {
            field: 'subject.metadata.dldStatus',
            operator: 'eq',
            value: 'verified',
          },
          evaluator: this.createEvaluator({
            id: 'dld_title_verified',
            type: 'require',
            condition: {
              field: 'subject.metadata.dldStatus',
              operator: 'eq',
              value: 'verified',
            },
            onFail: {
              code: 'DLD_TITLE_NOT_VERIFIED',
              message: 'DLD title verification required',
              suggestedAction: 'Submit property for DLD verification',
            },
          }),
          severity: 'error',
        },
      ],
      ADGM: [],
      DIFC: [],
    };

    return overlays[jurisdiction] || [];
  }

  private computeCombinedHash(baseHash: string, overlays: string): string {
    const combined = `${baseHash}:${overlays}`;
    return createHash('sha256').update(combined).digest('hex');
  }

  private generatePartnerExplanation(
    violations: RuleEvaluationResult[],
    warnings: RuleEvaluationResult[]
  ): PartnerExplanation {
    const violationExplanations: ViolationExplanation[] = violations.map(v => ({
      code: v.code || 'UNKNOWN',
      message: v.message || 'Compliance check failed',
    }));

    const suggestedActions: SuggestedAction[] = violations
      .filter(v => v.suggestedAction)
      .map(v => ({
        action: v.ruleId,
        description: v.suggestedAction!,
      }));

    // Add warnings as informational items
    warnings.forEach(w => {
      if (w.suggestedAction) {
        suggestedActions.push({
          action: w.ruleId,
          description: `(Warning) ${w.suggestedAction}`,
        });
      }
    });

    const summary =
      violations.length === 1
        ? violations[0].message || 'Compliance check failed'
        : `${violations.length} compliance requirements not met`;

    return {
      summary,
      violations: violationExplanations,
      suggestedActions,
    };
  }
}

// ============================================================================
// Errors
// ============================================================================

export class PolicyCompilationError extends Error {
  public readonly code = 'POLICY_COMPILATION_ERROR';
  public readonly errors: ValidationError[];

  constructor(message: string, errors: ValidationError[]) {
    super(message);
    this.name = 'PolicyCompilationError';
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const policyCompiler = new PolicyCompiler();
