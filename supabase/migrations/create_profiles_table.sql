/*
  # Create profiles table

  This migration sets up the `profiles` table to store user-specific public data,
  linking it directly to the `auth.users` table. It establishes the necessary
  security policies to ensure users can only access and manage their own data.

  1. New Tables
     - `public.profiles`
       - `id` (uuid, primary key): A foreign key that references `auth.users.id`. Ensures data integrity and cascades deletes.
       - `username` (text, unique): The user's public display name. Must be unique.
       - `created_at` (timestamptz): A timestamp that defaults to the current time when a profile is created.

  2. Security
     - **Row Level Security (RLS)**: RLS is enabled on the `profiles` table to enforce data access rules at the database level.
     - **Policy for INSERT**: Allows an authenticated user to create their own profile.
     - **Policy for SELECT**: Allows an authenticated user to read only their own profile.
     - **Policy for UPDATE**: Allows an authenticated user to update only their own profile.
*/

-- 1. Create the profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT username_length CHECK (username IS NULL OR (char_length(username) >= 3 AND char_length(username) <= 50))
);

COMMENT ON TABLE public.profiles IS 'Stores public profile information for each user.';
COMMENT ON COLUMN public.profiles.id IS 'Links to the corresponding user in auth.users.';
COMMENT ON COLUMN public.profiles.username IS 'User''s public display name.';

-- 2. Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS policies
CREATE POLICY "Users can insert their own profile."
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read their own profile."
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile."
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);
