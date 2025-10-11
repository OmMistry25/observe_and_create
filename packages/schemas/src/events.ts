import { z } from 'zod';

/**
 * Event types as defined in the database schema
 */
export const EventTypeSchema = z.enum([
  'click',
  'search',
  'form',
  'nav',
  'focus',
  'blur',
  'idle',
  'error',
  'friction', // T11.1: Friction detection events
]);

export type EventType = z.infer<typeof EventTypeSchema>;

/**
 * Schema for a single event from the extension
 */
export const IngestEventSchema = z.object({
  device_id: z.string().min(1, 'device_id is required'),
  ts: z.string().datetime().or(z.date()),
  type: EventTypeSchema,
  url: z.string().url('url must be a valid URL'),
  title: z.string().optional(),
  dom_path: z.string().optional(),
  text: z.string().optional(),
  meta: z.record(z.any()).optional().default({}),
  dwell_ms: z.number().int().min(0).optional(),
  session_id: z.string().uuid().optional(),
  context_events: z.array(z.string()).optional().default([]),
});

export type IngestEvent = z.infer<typeof IngestEventSchema>;

/**
 * Schema for batch ingest request
 */
export const IngestBatchSchema = z.object({
  events: z.array(IngestEventSchema).min(1, 'At least one event is required').max(100, 'Maximum 100 events per batch'),
});

export type IngestBatch = z.infer<typeof IngestBatchSchema>;

/**
 * Schema for ingest response
 */
export const IngestResponseSchema = z.object({
  success: z.boolean(),
  inserted: z.number(),
  queued_embeddings: z.number(),
  errors: z.array(z.string()).optional(),
});

export type IngestResponse = z.infer<typeof IngestResponseSchema>;

