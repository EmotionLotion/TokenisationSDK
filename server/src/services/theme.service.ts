/**
 * Theme Service - White-Label Theming
 *
 * Manages per-organisation theme configurations for white-label deployments.
 * Stores themes in the `org_themes` table and provides CRUD operations with
 * validation for colour values, URL formats, and CSS constraints.
 *
 * @module theme.service
 */

import { rawQuery } from '../config/database.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ThemeConfig {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  logoUrl?: string;
  fontFamily?: string;
  borderRadius?: string;
  customCss?: string;
  metadata?: Record<string, unknown>;
}

export interface OrgTheme {
  id: string;
  orgId: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  logoUrl: string | null;
  fontFamily: string;
  borderRadius: string;
  customCss: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Default Theme Values
// ============================================================================

const DEFAULT_THEME: Required<Omit<ThemeConfig, 'metadata'>> = {
  primaryColor: '#F8B032',
  secondaryColor: '#3B82F6',
  accentColor: '#8B5CF6',
  backgroundColor: '#0A0E1A',
  textColor: '#FFFFFF',
  logoUrl: '',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  borderRadius: '8px',
  customCss: '',
};

// ============================================================================
// Table Initialisation
// ============================================================================

let tableInitialised = false;

/**
 * Ensure the `org_themes` table exists. Called lazily on first access.
 */
async function ensureTable(): Promise<void> {
  if (tableInitialised) return;

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS org_themes (
      id            TEXT PRIMARY KEY DEFAULT ('thm_' || lower(hex(randomblob(16)))),
      org_id        TEXT NOT NULL UNIQUE,
      primary_color TEXT NOT NULL DEFAULT '#F8B032',
      secondary_color TEXT NOT NULL DEFAULT '#3B82F6',
      accent_color  TEXT NOT NULL DEFAULT '#8B5CF6',
      background_color TEXT NOT NULL DEFAULT '#0A0E1A',
      text_color    TEXT NOT NULL DEFAULT '#FFFFFF',
      logo_url      TEXT,
      font_family   TEXT NOT NULL DEFAULT '''Inter'', -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif',
      border_radius TEXT NOT NULL DEFAULT '8px',
      custom_css    TEXT,
      metadata      TEXT DEFAULT '{}',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  tableInitialised = true;
  logger.info('org_themes table ensured');
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Get the theme configuration for an organisation.
 * Returns `null` if no custom theme has been set.
 */
export async function getTheme(orgId: string): Promise<OrgTheme | null> {
  await ensureTable();

  const rows = await rawQuery<OrgTheme>(
    `SELECT
       id,
       org_id        AS "orgId",
       primary_color AS "primaryColor",
       secondary_color AS "secondaryColor",
       accent_color  AS "accentColor",
       background_color AS "backgroundColor",
       text_color    AS "textColor",
       logo_url      AS "logoUrl",
       font_family   AS "fontFamily",
       border_radius AS "borderRadius",
       custom_css    AS "customCss",
       metadata,
       created_at    AS "createdAt",
       updated_at    AS "updatedAt"
     FROM org_themes
     WHERE org_id = ?`,
    [orgId]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    ...row,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata as unknown as string) : (row.metadata || {}),
  };
}

/**
 * Create or update the theme for an organisation (upsert).
 */
export async function createOrUpdateTheme(orgId: string, config: ThemeConfig): Promise<OrgTheme> {
  await ensureTable();

  // Validate input
  validateTheme(config);

  const existing = await getTheme(orgId);

  if (existing) {
    // Update
    const fields: string[] = [];
    const values: unknown[] = [];

    if (config.primaryColor !== undefined) { fields.push('primary_color = ?'); values.push(config.primaryColor); }
    if (config.secondaryColor !== undefined) { fields.push('secondary_color = ?'); values.push(config.secondaryColor); }
    if (config.accentColor !== undefined) { fields.push('accent_color = ?'); values.push(config.accentColor); }
    if (config.backgroundColor !== undefined) { fields.push('background_color = ?'); values.push(config.backgroundColor); }
    if (config.textColor !== undefined) { fields.push('text_color = ?'); values.push(config.textColor); }
    if (config.logoUrl !== undefined) { fields.push('logo_url = ?'); values.push(config.logoUrl); }
    if (config.fontFamily !== undefined) { fields.push('font_family = ?'); values.push(config.fontFamily); }
    if (config.borderRadius !== undefined) { fields.push('border_radius = ?'); values.push(config.borderRadius); }
    if (config.customCss !== undefined) { fields.push('custom_css = ?'); values.push(config.customCss); }
    if (config.metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(config.metadata)); }

    fields.push("updated_at = datetime('now')");
    values.push(orgId);

    await rawQuery(
      `UPDATE org_themes SET ${fields.join(', ')} WHERE org_id = ?`,
      values
    );
  } else {
    // Insert
    await rawQuery(
      `INSERT INTO org_themes (org_id, primary_color, secondary_color, accent_color, background_color, text_color, logo_url, font_family, border_radius, custom_css, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        config.primaryColor ?? DEFAULT_THEME.primaryColor,
        config.secondaryColor ?? DEFAULT_THEME.secondaryColor,
        config.accentColor ?? DEFAULT_THEME.accentColor,
        config.backgroundColor ?? DEFAULT_THEME.backgroundColor,
        config.textColor ?? DEFAULT_THEME.textColor,
        config.logoUrl ?? null,
        config.fontFamily ?? DEFAULT_THEME.fontFamily,
        config.borderRadius ?? DEFAULT_THEME.borderRadius,
        config.customCss ?? null,
        config.metadata ? JSON.stringify(config.metadata) : '{}',
      ]
    );
  }

  const theme = await getTheme(orgId);
  if (!theme) {
    throw new Error('Failed to retrieve theme after upsert');
  }

  logger.info('Theme saved', { orgId, action: existing ? 'updated' : 'created' });
  return theme;
}

/**
 * Delete the custom theme for an organisation (reset to defaults).
 */
export async function deleteTheme(orgId: string): Promise<{ success: boolean }> {
  await ensureTable();

  const existing = await getTheme(orgId);
  if (!existing) {
    throw new NotFoundError('No custom theme found for this organisation');
  }

  await rawQuery('DELETE FROM org_themes WHERE org_id = ?', [orgId]);

  logger.info('Theme deleted (reset to default)', { orgId });
  return { success: true };
}

// ============================================================================
// Validation
// ============================================================================

/** Hex colour pattern: #RGB, #RRGGBB, or #RRGGBBAA */
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Acceptable URL pattern */
const URL_REGEX = /^https?:\/\/.+/;

/**
 * Validate a theme configuration object. Throws `ValidationError` on failure.
 */
export function validateTheme(config: ThemeConfig): void {
  const errors: string[] = [];

  // Validate hex colours
  const colorFields: Array<[keyof ThemeConfig, string]> = [
    ['primaryColor', 'Primary color'],
    ['secondaryColor', 'Secondary color'],
    ['accentColor', 'Accent color'],
    ['backgroundColor', 'Background color'],
    ['textColor', 'Text color'],
  ];

  for (const [field, label] of colorFields) {
    const value = config[field] as string | undefined;
    if (value !== undefined && !HEX_COLOR_REGEX.test(value)) {
      errors.push(`${label} must be a valid hex color (e.g. #FF5500 or #F50). Got: ${value}`);
    }
  }

  // Validate logo URL
  if (config.logoUrl !== undefined && config.logoUrl !== '' && config.logoUrl !== null) {
    if (!URL_REGEX.test(config.logoUrl)) {
      errors.push(`Logo URL must be a valid HTTP/HTTPS URL. Got: ${config.logoUrl}`);
    }
  }

  // Validate border radius
  if (config.borderRadius !== undefined) {
    if (!/^\d+(px|rem|em|%)$/.test(config.borderRadius)) {
      errors.push(`Border radius must include a valid CSS unit (px, rem, em, %). Got: ${config.borderRadius}`);
    }
  }

  // Validate font family (basic check - not empty)
  if (config.fontFamily !== undefined && config.fontFamily.trim() === '') {
    errors.push('Font family cannot be empty');
  }

  // Validate custom CSS length
  if (config.customCss !== undefined && config.customCss.length > 50_000) {
    errors.push('Custom CSS must be under 50,000 characters');
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join('; '));
  }
}
