
DROP POLICY IF EXISTS "Anyone can create orders for an existing restaurant" ON public.orders;
DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;

REVOKE INSERT ON public.orders FROM anon;
REVOKE INSERT ON public.order_items FROM anon;
