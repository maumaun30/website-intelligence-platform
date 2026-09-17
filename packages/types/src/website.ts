import { z } from 'zod';

export const VERIFICATION_METHODS = ['dns', 'meta'] as const;
export const VERIFICATION_STATUSES = ['pending', 'verified', 'failed'] as const;
export const SCAN_FREQUENCIES = ['manual', 'daily', 'weekly'] as const;

const pathList = z.array(z.string().min(1).max(200)).max(100);

/** How a website will be crawled. Stored now; consumed by the crawler in a later slice. */
export const scanConfigSchema = z.object({
  maxDepth: z.number().int().min(1).max(10),
  maxPages: z.number().int().min(1).max(5000),
  includePaths: pathList,
  excludePaths: pathList,
  scanFrequency: z.enum(SCAN_FREQUENCIES),
  respectRobotsTxt: z.boolean(),
});

/** Client input to register a website. Token and status are server-issued, never accepted here. */
export const createWebsiteInputSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.url({ protocol: /^https?$/ }),
});

/** Partial update: name and/or any scan-config field. `url` is immutable after create. */
export const updateWebsiteInputSchema = scanConfigSchema
  .partial()
  .extend({ name: z.string().min(1).max(100).optional() });

export const verifyWebsiteInputSchema = z.object({
  method: z.enum(VERIFICATION_METHODS),
});

/** Full website as returned by the API. Dates are ISO strings over the wire. */
export const websiteSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  createdById: z.string(),
  name: z.string(),
  url: z.string(),
  domain: z.string(),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  verificationMethod: z.enum(VERIFICATION_METHODS).nullable(),
  verificationToken: z.string(),
  verifiedAt: z.string().nullable(),
  maxDepth: z.number().int(),
  maxPages: z.number().int(),
  includePaths: z.array(z.string()),
  excludePaths: z.array(z.string()),
  scanFrequency: z.enum(SCAN_FREQUENCIES),
  respectRobotsTxt: z.boolean(),
  nextScanAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type ScanFrequency = (typeof SCAN_FREQUENCIES)[number];
export type ScanConfig = z.infer<typeof scanConfigSchema>;
export type CreateWebsiteInput = z.infer<typeof createWebsiteInputSchema>;
export type UpdateWebsiteInput = z.infer<typeof updateWebsiteInputSchema>;
export type VerifyWebsiteInput = z.infer<typeof verifyWebsiteInputSchema>;
export type Website = z.infer<typeof websiteSchema>;
