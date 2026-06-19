
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_plan(text) FROM PUBLIC, authenticated;
-- get_restaurant_plan is used by the public menu page (anon), keep anon execute
GRANT EXECUTE ON FUNCTION public.get_restaurant_plan(text) TO anon;
