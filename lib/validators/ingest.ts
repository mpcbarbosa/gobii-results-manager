import { z } from 'zod';

// Source schema
export const sourceSchema = z.object({
  key: z.string().min(1, 'Source key is required'),
});

// Company schema
export const companySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  country: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  tax_id: z.string().optional(),
  name_normalized: z.string().optional(),
});

// Contact schema
export const contactSchema = z.object({
  full_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  role: z.string().optional(),
});

// Lead schema
export const leadSchema = z.object({
  external_id: z.string().optional(),
  company: companySchema,
  contact: contactSchema.optional(),
  trigger: z.string().min(1, 'Trigger is required'),
  probability: z.number().min(0).max(1),
  score_trigger: z.number().min(0).max(80),
  score_probability: z.number().min(0).max(20),
  score_final: z.number().min(0).max(100),
  summary: z.string().optional(),
  raw: z.record(z.any()).optional(),
});

// Batch ingestion schema
export const ingestBatchSchema = z.object({
  source: sourceSchema,
  leads: z.array(leadSchema).min(1, 'At least one lead is required'),
});

// Type exports
export type IngestBatchInput = z.infer<typeof ingestBatchSchema>;
export type LeadInput = z.infer<typeof leadSchema>;
export type CompanyInput = z.infer<typeof companySchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type SourceInput = z.infer<typeof sourceSchema>;
