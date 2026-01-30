import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as themeService from '../services/theme.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const themeRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const hexColorSchema = z.string().regex(
  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
  'Must be a valid hex color (e.g. #FF5500)'
);

const themeSchema = z.object({
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),
  accentColor: hexColorSchema.optional(),
  backgroundColor: hexColorSchema.optional(),
  textColor: hexColorSchema.optional(),
  logoUrl: z.string().url().or(z.literal('')).optional(),
  fontFamily: z.string().min(1).optional(),
  borderRadius: z.string().regex(/^\d+(px|rem|em|%)$/, 'Must include a valid CSS unit').optional(),
  customCss: z.string().max(50_000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Theme Routes
// ============================================================================

/**
 * GET /api/v1/themes
 *
 * Retrieve the theme configuration for the authenticated organisation.
 * Returns the default theme values if no custom theme has been set.
 */
themeRouter.get('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const theme = await themeService.getTheme(req.apiKey.orgId);

    if (!theme) {
      // Return defaults
      res.json({
        data: {
          orgId: req.apiKey.orgId,
          primaryColor: '#F8B032',
          secondaryColor: '#3B82F6',
          accentColor: '#8B5CF6',
          backgroundColor: '#0A0E1A',
          textColor: '#FFFFFF',
          logoUrl: null,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          borderRadius: '8px',
          customCss: null,
          metadata: {},
          isDefault: true,
        },
      });
      return;
    }

    res.json({ data: { ...theme, isDefault: false } });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/themes
 *
 * Create or update the theme for the authenticated organisation.
 */
themeRouter.put('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = themeSchema.parse(req.body);
    const theme = await themeService.createOrUpdateTheme(req.apiKey.orgId, input);

    res.json({ data: theme });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

/**
 * DELETE /api/v1/themes
 *
 * Delete the custom theme for the authenticated organisation (reset to default).
 */
themeRouter.delete('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await themeService.deleteTheme(req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
