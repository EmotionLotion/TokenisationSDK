import { z } from 'zod';

export const RealEstateMetadataSchema = z.object({
  assetType: z.literal('REAL_ESTATE'),
  propertyType: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'LAND']),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string().optional(),
    postalCode: z.string(),
    country: z.string().length(2),
  }),
  area: z.object({
    value: z.number().positive(),
    unit: z.enum(['SQM', 'SQFT']),
  }),
  deedNumber: z.string().optional(),
  registryId: z.string().optional(),
  valuationAmount: z.string().optional(),
  valuationCurrency: z.string().length(3).optional(),
  valuationDate: z.string().datetime().optional(),
  annualRentYield: z.number().min(0).max(100).optional(),
});

export type RealEstateMetadata = z.infer<typeof RealEstateMetadataSchema>;
