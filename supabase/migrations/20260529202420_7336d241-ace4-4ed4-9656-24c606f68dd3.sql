GRANT SELECT ON public.orders TO anon;

CREATE POLICY "Public can read orders for status tracking"
ON public.orders
FOR SELECT
TO anon
USING (true);

ALTER TABLE public.orders REPLICA IDENTITY FULL;