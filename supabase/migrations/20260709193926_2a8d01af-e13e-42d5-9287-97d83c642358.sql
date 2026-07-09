
CREATE OR REPLACE FUNCTION public.place_order(
  p_restaurant_id uuid,
  p_table_label text,
  p_customer_name text,
  p_customer_phone text,
  p_currency text,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_ddd int;
  v_valid_ddds int[] := ARRAY[
    11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,
    41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,
    71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99
  ];
  v_name text;
  v_table text;
  v_item jsonb;
  v_count int;
  v_subtotal numeric := 0;
  v_qty int;
  v_price numeric;
  v_order_id uuid;
  v_recent_phone int;
  v_recent_table int;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurante obrigatório' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant_id) THEN
    RAISE EXCEPTION 'Restaurante inválido' USING ERRCODE = '22023';
  END IF;

  v_name := btrim(coalesce(p_customer_name, ''));
  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Nome inválido' USING ERRCODE = '22023';
  END IF;

  v_table := NULLIF(btrim(coalesce(p_table_label, '')), '');
  IF v_table IS NOT NULL AND length(v_table) > 40 THEN
    RAISE EXCEPTION 'Identificação da mesa inválida' USING ERRCODE = '22023';
  END IF;

  -- Phone: BR validation + normalization
  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  IF (length(v_phone) = 12 OR length(v_phone) = 13) AND left(v_phone, 2) = '55' THEN
    v_phone := substring(v_phone FROM 3);
  END IF;
  IF length(v_phone) NOT IN (10, 11) THEN
    RAISE EXCEPTION 'Telefone inválido: informe DDD + número' USING ERRCODE = '22023';
  END IF;
  v_ddd := substring(v_phone FROM 1 FOR 2)::int;
  IF NOT (v_ddd = ANY(v_valid_ddds)) THEN
    RAISE EXCEPTION 'DDD % inválido', v_ddd USING ERRCODE = '22023';
  END IF;
  IF length(v_phone) = 11 AND substring(v_phone FROM 3 FOR 1) <> '9' THEN
    RAISE EXCEPTION 'Celular deve começar com 9 após o DDD' USING ERRCODE = '22023';
  END IF;

  -- Items validation
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Itens inválidos' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio' USING ERRCODE = '22023';
  END IF;
  IF v_count > 50 THEN
    RAISE EXCEPTION 'Máximo de 50 itens por pedido' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    v_price := coalesce((v_item->>'price_snapshot')::numeric, -1);
    IF v_qty <= 0 OR v_qty > 99 THEN
      RAISE EXCEPTION 'Quantidade inválida' USING ERRCODE = '22023';
    END IF;
    IF v_price < 0 OR v_price > 100000 THEN
      RAISE EXCEPTION 'Preço inválido' USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_item->>'name_snapshot', '') = '' THEN
      RAISE EXCEPTION 'Nome do item obrigatório' USING ERRCODE = '22023';
    END IF;
    v_subtotal := v_subtotal + (v_qty * v_price);
  END LOOP;

  IF v_subtotal > 500000 THEN
    RAISE EXCEPTION 'Valor total excede o limite permitido' USING ERRCODE = '22023';
  END IF;

  -- Rate limiting: por telefone (5 em 2 min)
  SELECT count(*) INTO v_recent_phone
  FROM public.orders
  WHERE customer_phone = v_phone
    AND restaurant_id = p_restaurant_id
    AND created_at > now() - interval '2 minutes';
  IF v_recent_phone >= 5 THEN
    RAISE EXCEPTION 'Muitos pedidos deste telefone. Aguarde alguns minutos.' USING ERRCODE = 'P0001';
  END IF;

  -- Rate limiting: por mesa (20 em 10 min)
  IF v_table IS NOT NULL THEN
    SELECT count(*) INTO v_recent_table
    FROM public.orders
    WHERE restaurant_id = p_restaurant_id
      AND table_label = v_table
      AND created_at > now() - interval '10 minutes';
    IF v_recent_table >= 20 THEN
      RAISE EXCEPTION 'Muitos pedidos nesta mesa. Aguarde alguns minutos.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Insert order
  INSERT INTO public.orders(
    restaurant_id, table_label, customer_name, customer_phone,
    subtotal, currency, status
  ) VALUES (
    p_restaurant_id, v_table, v_name, v_phone,
    v_subtotal, coalesce(NULLIF(p_currency,''), 'BRL'), 'pending'
  ) RETURNING id INTO v_order_id;

  -- Insert items
  INSERT INTO public.order_items(
    order_id, menu_item_id, name_snapshot, price_snapshot, quantity, notes, modifiers_snapshot
  )
  SELECT
    v_order_id,
    NULLIF(x->>'menu_item_id','')::uuid,
    x->>'name_snapshot',
    (x->>'price_snapshot')::numeric,
    (x->>'quantity')::int,
    NULLIF(x->>'notes',''),
    coalesce(x->'modifiers_snapshot', '[]'::jsonb)
  FROM jsonb_array_elements(p_items) AS x;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(uuid, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, text, text, text, text, jsonb) TO anon, authenticated;
