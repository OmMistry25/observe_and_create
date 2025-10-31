# API Documentation

## POST /api/ingest

Ingest a batch of browser activity events from the extension.

### Authentication

Requires a valid Supabase JWT token in the `Authorization` header:

```
Authorization: Bearer <session_access_token>
```

### Request Body

```typescript
{
  events: Array<{
    device_id: string;
    ts: string; // ISO 8601 datetime
    type: 'click' | 'search' | 'form' | 'nav' | 'focus' | 'blur' | 'idle' | 'error';
    url: string; // Valid URL
    title?: string;
    dom_path?: string;
    text?: string;
    meta?: Record<string, any>;
    dwell_ms?: number;
    session_id?: string; // UUID
    context_events?: string[]; // Array of event IDs
  }>
}
```

### Constraints

- Minimum 1 event per batch
- Maximum 100 events per batch
- All events must be valid according to the schema

### Response

#### Success (200)

```json
{
  "success": true,
  "inserted": 2,
  "queued_embeddings": 2
}
```

#### Validation Error (400)

```json
{
  "success": false,
  "error": "Validation failed",
  "errors": [
    "events.0.type: Invalid enum value. Expected 'click' | 'search' | 'form' | 'nav' | 'focus' | 'blur' | 'idle' | 'error', received 'invalid-type'",
    "events.0.url: Invalid url"
  ]
}
```

#### Unauthorized (401)

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

#### Server Error (500)

```json
{
  "success": false,
  "error": "Database error",
  "details": "..."
}
```

### Testing

Visit `/test-ingest` to test the API with valid and invalid payloads.

### Notes

- Events are automatically associated with the authenticated user
- Embedding jobs are queued for processing (implemented in T06)
- RLS policies ensure users can only insert their own events

