-- Add consent support to profiles table
-- This migration adds consent_data and consent_given_at columns to the profiles table

-- Add consent columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS consent_data JSONB,
ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ;

-- Add index for consent queries
CREATE INDEX IF NOT EXISTS idx_profiles_consent_given_at ON profiles(consent_given_at);

-- Add comment explaining the consent_data structure
COMMENT ON COLUMN profiles.consent_data IS 'User consent preferences including data collection categories, privacy settings, and domain allowlists';
COMMENT ON COLUMN profiles.consent_given_at IS 'Timestamp when user last gave consent';

-- Example consent_data structure:
-- {
--   "domains": ["example.com", "github.com"],
--   "categories": {
--     "clicks": true,
--     "searches": true,
--     "forms": true,
--     "navigation": true,
--     "dwell": true
--   },
--   "privacy": {
--     "dataRetention": 30,
--     "allowAnalytics": true,
--     "allowSharing": false
--   }
-- }
