-- Allow each authenticated user to read only their own role profile.
-- The backend still performs its own profile lookup and role enforcement.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;

CREATE POLICY profiles_select_own
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);
