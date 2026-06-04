
CREATE TABLE public.staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX staff_members_restaurant_id_idx ON public.staff_members(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_members TO authenticated;
GRANT ALL ON public.staff_members TO service_role;

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their staff"
ON public.staff_members FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = staff_members.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "Owners can insert staff"
ON public.staff_members FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = staff_members.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "Owners can update staff"
ON public.staff_members FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = staff_members.restaurant_id AND r.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = staff_members.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "Owners can delete staff"
ON public.staff_members FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = staff_members.restaurant_id AND r.owner_id = auth.uid()));

CREATE TRIGGER set_staff_members_updated_at
BEFORE UPDATE ON public.staff_members
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
