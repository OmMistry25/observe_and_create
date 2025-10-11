-- T16: Workflow Template Library
-- Insert 15 common workflow templates for pattern matching

-- Email to Spreadsheet workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Email to Spreadsheet',
  'Extract data from emails and add to a spreadsheet',
  '{"sequence": [
    {"type": "click", "domain_contains": "mail.google.com"},
    {"type": "click", "text_contains": "copy"},
    {"type": "nav", "domain_contains": "sheets.google.com"},
    {"type": "click", "text_contains": "paste"}
  ]}'::jsonb,
  '{"min_support": 3, "min_confidence": 0.7, "fuzzy_match": true}'::jsonb,
  'data_transfer'
);

-- Dashboard Check workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Daily Dashboard Check',
  'Regular monitoring of analytics or admin dashboards',
  '{"sequence": [
    {"type": "nav", "url_contains": "dashboard"},
    {"type": "click", "text_contains": "refresh"},
    {"type": "idle", "min_dwell_ms": 5000}
  ]}'::jsonb,
  '{"min_support": 5, "min_confidence": 0.8, "fuzzy_match": true}'::jsonb,
  'monitoring'
);

-- Form Auto-fill workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Repetitive Form Fill',
  'Filling out similar forms with recurring data',
  '{"sequence": [
    {"type": "click", "tagName": "INPUT"},
    {"type": "click", "tagName": "INPUT"},
    {"type": "click", "tagName": "INPUT"},
    {"type": "form", "action": "submit"}
  ]}'::jsonb,
  '{"min_support": 3, "min_confidence": 0.7, "fuzzy_match": true}'::jsonb,
  'data_entry'
);

-- Download and Upload workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Download and Re-upload',
  'Download files from one service and upload to another',
  '{"sequence": [
    {"type": "click", "text_contains": "download"},
    {"type": "nav", "url_change": true},
    {"type": "click", "text_contains": "upload"}
  ]}'::jsonb,
  '{"min_support": 3, "min_confidence": 0.7, "fuzzy_match": true}'::jsonb,
  'data_transfer'
);

-- Weekly Report Generation workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Weekly Report Generation',
  'Generate and send weekly status or analytics reports',
  '{"sequence": [
    {"type": "nav", "url_contains": "analytics"},
    {"type": "click", "text_contains": "export"},
    {"type": "nav", "domain_contains": "mail.google.com"},
    {"type": "click", "text_contains": "compose"},
    {"type": "click", "text_contains": "attach"},
    {"type": "form", "action": "submit"}
  ]}'::jsonb,
  '{"min_support": 3, "min_confidence": 0.7, "temporal_pattern": "weekly"}'::jsonb,
  'reporting'
);

-- Research to Document workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Research to Document',
  'Collect research from multiple sources and compile into a document',
  '{"sequence": [
    {"type": "search", "intent": "research"},
    {"type": "click", "text_contains": "copy"},
    {"type": "nav", "domain_contains": "docs.google.com"},
    {"type": "click", "text_contains": "paste"}
  ]}'::jsonb,
  '{"min_support": 3, "min_confidence": 0.7, "fuzzy_match": true}'::jsonb,
  'content_creation'
);

-- Social Media Posting workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Cross-platform Posting',
  'Post the same content across multiple social media platforms',
  '{"sequence": [
    {"type": "click", "text_contains": "post"},
    {"type": "form", "action": "submit"},
    {"type": "nav", "domain_change": true},
    {"type": "click", "text_contains": "post"},
    {"type": "form", "action": "submit"}
  ]}'::jsonb,
  '{"min_support": 3, "min_confidence": 0.7, "fuzzy_match": true}'::jsonb,
  'social_media'
);

-- Bug Report Workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Bug Report Creation',
  'Document bugs and create tickets in issue tracker',
  '{"sequence": [
    {"type": "click", "text_contains": "screenshot"},
    {"type": "nav", "url_contains": "issues"},
    {"type": "click", "text_contains": "new"},
    {"type": "form", "fieldCount_gt": 3},
    {"type": "click", "text_contains": "upload"},
    {"type": "form", "action": "submit"}
  ]}'::jsonb,
  '{"min_support": 3, "min_confidence": 0.7, "fuzzy_match": true}'::jsonb,
  'development'
);

-- E-commerce Price Comparison workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Price Comparison Shopping',
  'Compare prices across multiple e-commerce sites',
  '{"sequence": [
    {"type": "search", "intent": "comparison"},
    {"type": "click", "url_contains": "product"},
    {"type": "nav", "domain_change": true},
    {"type": "search", "intent": "comparison"},
    {"type": "click", "url_contains": "product"}
  ]}'::jsonb,
  '{"min_support": 2, "min_confidence": 0.6, "fuzzy_match": true}'::jsonb,
  'shopping'
);

-- Meeting Scheduler workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Meeting Coordination',
  'Check calendars and send meeting invites',
  '{"sequence": [
    {"type": "nav", "domain_contains": "calendar.google.com"},
    {"type": "click", "text_contains": "create"},
    {"type": "form", "fields_contain": "title"},
    {"type": "click", "text_contains": "add guests"},
    {"type": "form", "action": "submit"}
  ]}'::jsonb,
  '{"min_support": 3, "min_confidence": 0.7, "fuzzy_match": true}'::jsonb,
  'scheduling'
);

-- Customer Support Response workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Customer Support Reply',
  'Check support tickets and send templated responses',
  '{"sequence": [
    {"type": "nav", "url_contains": "support"},
    {"type": "click", "url_contains": "ticket"},
    {"type": "click", "text_contains": "reply"},
    {"type": "form", "action": "submit"},
    {"type": "click", "text_contains": "close"}
  ]}'::jsonb,
  '{"min_support": 5, "min_confidence": 0.8, "fuzzy_match": true}'::jsonb,
  'support'
);

-- Content Publishing workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Content Publishing Pipeline',
  'Write, review, and publish content to CMS',
  '{"sequence": [
    {"type": "nav", "domain_contains": "docs.google.com"},
    {"type": "click", "text_contains": "copy"},
    {"type": "nav", "url_contains": "cms"},
    {"type": "click", "text_contains": "new post"},
    {"type": "click", "text_contains": "paste"},
    {"type": "click", "text_contains": "publish"}
  ]}'::jsonb,
  '{"min_support": 3, "min_confidence": 0.7, "fuzzy_match": true}'::jsonb,
  'content_creation'
);

-- Invoice Processing workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Invoice Download and Entry',
  'Download invoices and enter data into accounting system',
  '{"sequence": [
    {"type": "nav", "domain_contains": "mail.google.com"},
    {"type": "click", "text_contains": "invoice"},
    {"type": "click", "text_contains": "download"},
    {"type": "nav", "url_contains": "accounting"},
    {"type": "click", "text_contains": "new"},
    {"type": "form", "action": "submit"}
  ]}'::jsonb,
  '{"min_support": 3, "min_confidence": 0.7, "fuzzy_match": true}'::jsonb,
  'accounting'
);

-- Code Review workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Code Review Process',
  'Review pull requests and provide feedback',
  '{"sequence": [
    {"type": "nav", "domain_contains": "github.com"},
    {"type": "click", "url_contains": "pull"},
    {"type": "click", "text_contains": "files"},
    {"type": "click", "text_contains": "comment"},
    {"type": "form", "action": "submit"},
    {"type": "click", "text_contains": "approve"}
  ]}'::jsonb,
  '{"min_support": 5, "min_confidence": 0.8, "fuzzy_match": true}'::jsonb,
  'development'
);

-- Data Entry from Multiple Sources workflow
INSERT INTO pattern_templates (name, description, template_pattern, match_criteria, category)
VALUES (
  'Multi-source Data Aggregation',
  'Collect data from various sources and consolidate',
  '{"sequence": [
    {"type": "nav", "url_change": true},
    {"type": "click", "text_contains": "copy"},
    {"type": "nav", "domain_contains": "sheets.google.com"},
    {"type": "click", "text_contains": "paste"},
    {"type": "nav", "url_change": true},
    {"type": "click", "text_contains": "copy"},
    {"type": "nav", "domain_contains": "sheets.google.com"},
    {"type": "click", "text_contains": "paste"}
  ]}'::jsonb,
  '{"min_support": 3, "min_confidence": 0.7, "fuzzy_match": true}'::jsonb,
  'data_transfer'
);

-- Add comment
COMMENT ON TABLE pattern_templates IS 'Pre-built workflow templates for pattern matching and automation suggestions (T16)';
