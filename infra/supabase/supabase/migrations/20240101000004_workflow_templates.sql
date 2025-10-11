-- T16: Workflow Template Library
-- Insert 15 common workflow templates for pattern matching

-- Email to Spreadsheet workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Email to Spreadsheet',
  'Extract data from emails and add to a spreadsheet',
  ARRAY[
    '{"type": "click", "domain": "mail.google.com", "intent": "communication"}',
    '{"type": "click", "text_contains": ["copy", "select"]}',
    '{"type": "nav", "domain": "sheets.google.com"}',
    '{"type": "click", "text_contains": ["paste", "cell"]}'
  ]::jsonb[],
  'data_transfer',
  ARRAY['email', 'spreadsheet', 'data_entry', 'gmail', 'sheets']
);

-- Dashboard Check workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Daily Dashboard Check',
  'Regular monitoring of analytics or admin dashboards',
  ARRAY[
    '{"type": "nav", "url_contains": "dashboard"}',
    '{"type": "click", "text_contains": ["refresh", "reload", "update"]}',
    '{"type": "idle", "min_dwell_ms": 5000}'
  ]::jsonb[],
  'monitoring',
  ARRAY['dashboard', 'analytics', 'admin', 'monitoring']
);

-- Form Auto-fill workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Repetitive Form Fill',
  'Filling out similar forms with recurring data',
  ARRAY[
    '{"type": "click", "tagName": "INPUT"}',
    '{"type": "click", "tagName": "INPUT"}',
    '{"type": "click", "tagName": "INPUT"}',
    '{"type": "form", "action": "submit"}'
  ]::jsonb[],
  'data_entry',
  ARRAY['form', 'input', 'data_entry', 'repetitive']
);

-- Download and Upload workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Download and Re-upload',
  'Download files from one service and upload to another',
  ARRAY[
    '{"type": "click", "text_contains": ["download", "export"]}',
    '{"type": "nav", "url_change": true}',
    '{"type": "click", "text_contains": ["upload", "import", "attach"]}'
  ]::jsonb[],
  'data_transfer',
  ARRAY['download', 'upload', 'file_transfer', 'export', 'import']
);

-- Weekly Report Generation workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Weekly Report Generation',
  'Generate and send weekly status or analytics reports',
  ARRAY[
    '{"type": "nav", "url_contains": "analytics"}',
    '{"type": "click", "text_contains": ["export", "download", "report"]}',
    '{"type": "nav", "domain": "mail.google.com"}',
    '{"type": "click", "text_contains": ["compose", "new"]}',
    '{"type": "click", "text_contains": ["attach"]}',
    '{"type": "form", "action": "submit"}'
  ]::jsonb[],
  'reporting',
  ARRAY['report', 'email', 'weekly', 'analytics', 'export']
);

-- Research to Document workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Research to Document',
  'Collect research from multiple sources and compile into a document',
  ARRAY[
    '{"type": "search", "intent": "research"}',
    '{"type": "click", "text_contains": ["copy"]}',
    '{"type": "nav", "domain": "docs.google.com"}',
    '{"type": "click", "text_contains": ["paste"]}'
  ]::jsonb[],
  'content_creation',
  ARRAY['research', 'documentation', 'writing', 'notes']
);

-- Social Media Posting workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Cross-platform Posting',
  'Post the same content across multiple social media platforms',
  ARRAY[
    '{"type": "click", "text_contains": ["post", "compose", "new"]}',
    '{"type": "form", "action": "submit"}',
    '{"type": "nav", "domain_change": true}',
    '{"type": "click", "text_contains": ["post", "compose", "new"]}',
    '{"type": "form", "action": "submit"}'
  ]::jsonb[],
  'social_media',
  ARRAY['social_media', 'posting', 'marketing', 'content']
);

-- Bug Report Workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Bug Report Creation',
  'Document bugs and create tickets in issue tracker',
  ARRAY[
    '{"type": "click", "text_contains": ["screenshot", "capture"]}',
    '{"type": "nav", "url_contains": ["jira", "github", "issues"]}',
    '{"type": "click", "text_contains": ["new", "create", "issue"]}',
    '{"type": "form", "fieldCount_gt": 3}',
    '{"type": "click", "text_contains": ["upload", "attach"]}',
    '{"type": "form", "action": "submit"}'
  ]::jsonb[],
  'development',
  ARRAY['bug', 'issue', 'ticket', 'jira', 'github']
);

-- E-commerce Price Comparison workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Price Comparison Shopping',
  'Compare prices across multiple e-commerce sites',
  ARRAY[
    '{"type": "search", "intent": "comparison"}',
    '{"type": "click", "url_contains": "product"}',
    '{"type": "nav", "domain_change": true}',
    '{"type": "search", "intent": "comparison"}',
    '{"type": "click", "url_contains": "product"}'
  ]::jsonb[],
  'shopping',
  ARRAY['shopping', 'comparison', 'ecommerce', 'price']
);

-- Meeting Scheduler workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Meeting Coordination',
  'Check calendars and send meeting invites',
  ARRAY[
    '{"type": "nav", "domain": "calendar.google.com"}',
    '{"type": "click", "text_contains": ["create", "new"]}',
    '{"type": "form", "fields_contain": ["title", "time"]}',
    '{"type": "click", "text_contains": ["add guests", "invite"]}',
    '{"type": "form", "action": "submit"}'
  ]::jsonb[],
  'scheduling',
  ARRAY['meeting', 'calendar', 'scheduling', 'coordination']
);

-- Customer Support Response workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Customer Support Reply',
  'Check support tickets and send templated responses',
  ARRAY[
    '{"type": "nav", "url_contains": ["support", "zendesk", "tickets"]}',
    '{"type": "click", "url_contains": "ticket"}',
    '{"type": "click", "text_contains": ["reply", "respond"]}',
    '{"type": "form", "action": "submit"}',
    '{"type": "click", "text_contains": ["close", "resolve"]}'
  ]::jsonb[],
  'support',
  ARRAY['support', 'customer_service', 'tickets', 'help_desk']
);

-- Content Publishing workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Content Publishing Pipeline',
  'Write, review, and publish content to CMS',
  ARRAY[
    '{"type": "nav", "domain": "docs.google.com"}',
    '{"type": "click", "text_contains": ["copy"]}',
    '{"type": "nav", "url_contains": ["wordpress", "cms", "admin"]}',
    '{"type": "click", "text_contains": ["new post", "create"]}',
    '{"type": "click", "text_contains": ["paste"]}',
    '{"type": "click", "text_contains": ["publish", "post"]}'
  ]::jsonb[],
  'content_creation',
  ARRAY['publishing', 'cms', 'wordpress', 'blogging', 'content']
);

-- Invoice Processing workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Invoice Download and Entry',
  'Download invoices and enter data into accounting system',
  ARRAY[
    '{"type": "nav", "domain": "mail.google.com"}',
    '{"type": "click", "text_contains": ["invoice", "billing"]}',
    '{"type": "click", "text_contains": ["download", "pdf"]}',
    '{"type": "nav", "url_contains": ["quickbooks", "accounting"]}',
    '{"type": "click", "text_contains": ["new", "create", "invoice"]}',
    '{"type": "form", "action": "submit"}'
  ]::jsonb[],
  'accounting',
  ARRAY['invoice', 'accounting', 'billing', 'finance']
);

-- Code Review workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Code Review Process',
  'Review pull requests and provide feedback',
  ARRAY[
    '{"type": "nav", "domain": "github.com"}',
    '{"type": "click", "url_contains": "pull"}',
    '{"type": "click", "text_contains": ["files", "changes"]}',
    '{"type": "click", "text_contains": ["comment", "review"]}',
    '{"type": "form", "action": "submit"}',
    '{"type": "click", "text_contains": ["approve", "request changes"]}'
  ]::jsonb[],
  'development',
  ARRAY['code_review', 'github', 'pull_request', 'development']
);

-- Data Entry from Multiple Sources workflow
INSERT INTO pattern_templates (name, description, event_sequence, category, tags)
VALUES (
  'Multi-source Data Aggregation',
  'Collect data from various sources and consolidate',
  ARRAY[
    '{"type": "nav", "url_change": true}',
    '{"type": "click", "text_contains": ["copy", "export"]}',
    '{"type": "nav", "domain": "sheets.google.com"}',
    '{"type": "click", "text_contains": ["paste"]}',
    '{"type": "nav", "url_change": true}',
    '{"type": "click", "text_contains": ["copy", "export"]}',
    '{"type": "nav", "domain": "sheets.google.com"}',
    '{"type": "click", "text_contains": ["paste"]}'
  ]::jsonb[],
  'data_transfer',
  ARRAY['data_entry', 'aggregation', 'spreadsheet', 'consolidation']
);

-- Add comment
COMMENT ON TABLE pattern_templates IS 'Pre-built workflow templates for pattern matching and automation suggestions (T16)';

