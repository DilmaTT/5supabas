/*
  # Create user_settings table

  This migration creates the `user_settings` table to store all user-specific application data,
  such as folders, charts, and training sessions. This enables data synchronization across devices.

  1. New Tables
     - `public.user_settings`
       - `user_id` (uuid, primary key): Foreign key to `auth.users.id`.
       - `folders` (jsonb): Stores the user's folder structure and ranges.
       - `action_buttons` (jsonb): Stores custom action buttons.
       - `trainings` (jsonb): Stores training session configurations.
       - `statistics` (jsonb): Stores training statistics.
       - `charts` (jsonb): Stores user-created charts.
       - `updated_at` (timestamptz): Automatically updates when the row is modified.

  2. Security
     - **Row Level Security (RLS)**: Enabled on the table.
     - **Policies**:
       - Users can only view their own settings.
       - Users can only insert their own settings (one row per user).
       - Users can only update their own settings.

  3. Functions &amp; Triggers
     - A trigger is added to automatically update the `updated_at` timestamp on any change to the row.
*/

-- 1. Create the user_settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  folders jsonb DEFAULT '[]'::jsonb,
  action_buttons jsonb DEFAULT '[]'::jsonb,
  trainings jsonb DEFAULT '[]'::jsonb,
  statistics jsonb DEFAULT '[]'::jsonb,
  charts jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.user_settings IS 'Stores application settings for each user.';

-- 2. Function and Trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_user_settings_update' AND tgrelid = 'public.user_settings'::regclass
  ) THEN
    CREATE TRIGGER on_user_settings_update
      BEFORE UPDATE ON public.user_settings
      FOR EACH ROW
      EXECUTE PROCEDURE public.handle_updated_at();
  END IF;
END $$;


-- 3. Enable Row Level Security
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
DROP POLICY IF EXISTS "Users can view their own settings." ON public.user_settings;
CREATE POLICY "Users can view their own settings."
  ON public.user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own settings." ON public.user_settings;
CREATE POLICY "Users can insert their own settings."
  ON public.user_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own settings." ON public.user_settings;
CREATE POLICY "Users can update their own settings."
  ON public.user_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
