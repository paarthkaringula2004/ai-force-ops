ALTER TABLE account_profiles
  ADD COLUMN IF NOT EXISTS profile_image text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS banner_image text NOT NULL DEFAULT '';
