
-- 1) Trigger interno — nunca deve ser executável via API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2) Funções acessadas por não autenticados (cardápio público + PIN da equipe)
--    Restringimos ao mínimo: anon (menu público / login por PIN) e authenticated.
--    Removemos o grant implícito do grupo PUBLIC.

REVOKE ALL ON FUNCTION public.get_restaurant_plan(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_plan(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.staff_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_login(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.staff_logout(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_logout(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.staff_session_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_session_info(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.staff_list_orders(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_list_orders(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.staff_update_order_status(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_update_order_status(text, uuid, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.staff_archive_orders(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_archive_orders(text, uuid[]) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.staff_list_tables(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_list_tables(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.staff_list_members(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_list_members(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.staff_list_calls(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_list_calls(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.staff_resolve_call(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_resolve_call(text, uuid) TO anon, authenticated;
