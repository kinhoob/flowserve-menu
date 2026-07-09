
CREATE OR REPLACE FUNCTION public.place_order(p_restaurant_id uuid, p_table_label text, p_customer_name text, p_customer_phone text, p_currency text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_oldest_phone timestamptz;
  v_oldest_table timestamptz;
  v_wait int;
BEGIN
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurante não informado.'
      USING ERRCODE='22023', HINT='Escaneie novamente o QR Code da mesa.', DETAIL='{"code":"missing_restaurant"}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant_id) THEN
    RAISE EXCEPTION 'Restaurante não encontrado.'
      USING ERRCODE='22023', HINT='Peça um QR Code atualizado ao estabelecimento.', DETAIL='{"code":"invalid_restaurant"}';
  END IF;

  v_name := btrim(coalesce(p_customer_name, ''));
  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Informe seu nome (entre 2 e 80 caracteres).'
      USING ERRCODE='22023', HINT='Preencha o campo Nome antes de enviar.', DETAIL='{"code":"invalid_name","field":"customer_name"}';
  END IF;

  v_table := NULLIF(btrim(coalesce(p_table_label, '')), '');
  IF v_table IS NOT NULL AND length(v_table) > 40 THEN
    RAISE EXCEPTION 'Identificação da mesa muito longa.'
      USING ERRCODE='22023', HINT='Use até 40 caracteres.', DETAIL='{"code":"invalid_table","field":"table_label"}';
  END IF;

  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  IF (length(v_phone) = 12 OR length(v_phone) = 13) AND left(v_phone, 2) = '55' THEN
    v_phone := substring(v_phone FROM 3);
  END IF;
  IF length(v_phone) NOT IN (10, 11) THEN
    RAISE EXCEPTION 'Telefone incompleto. Informe DDD + número (ex: 11 91234-5678).'
      USING ERRCODE='22023', HINT='Verifique o número e tente novamente.', DETAIL='{"code":"invalid_phone_length","field":"customer_phone"}';
  END IF;
  v_ddd := substring(v_phone FROM 1 FOR 2)::int;
  IF NOT (v_ddd = ANY(v_valid_ddds)) THEN
    RAISE EXCEPTION 'DDD % não é válido no Brasil.', v_ddd
      USING ERRCODE='22023', HINT='Confira o DDD do seu celular.', DETAIL='{"code":"invalid_ddd","field":"customer_phone"}';
  END IF;
  IF length(v_phone) = 11 AND substring(v_phone FROM 3 FOR 1) <> '9' THEN
    RAISE EXCEPTION 'Celular deve começar com 9 após o DDD.'
      USING ERRCODE='22023', HINT='Ex: (11) 9XXXX-XXXX.', DETAIL='{"code":"invalid_mobile","field":"customer_phone"}';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Não foi possível ler os itens do pedido.'
      USING ERRCODE='22023', HINT='Recarregue o cardápio e tente novamente.', DETAIL='{"code":"invalid_items"}';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Seu carrinho está vazio.'
      USING ERRCODE='22023', HINT='Adicione ao menos 1 item antes de enviar.', DETAIL='{"code":"empty_cart"}';
  END IF;
  IF v_count > 50 THEN
    RAISE EXCEPTION 'Máximo de 50 itens por pedido.'
      USING ERRCODE='22023', HINT='Divida em mais de um pedido.', DETAIL='{"code":"too_many_items","limit":50}';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    v_price := coalesce((v_item->>'price_snapshot')::numeric, -1);
    IF v_qty <= 0 OR v_qty > 99 THEN
      RAISE EXCEPTION 'Quantidade inválida em um dos itens (permitido 1 a 99).'
        USING ERRCODE='22023', HINT='Ajuste a quantidade no carrinho.', DETAIL='{"code":"invalid_quantity"}';
    END IF;
    IF v_price < 0 OR v_price > 100000 THEN
      RAISE EXCEPTION 'Preço inválido em um dos itens.'
        USING ERRCODE='22023', HINT='Recarregue o cardápio para atualizar os preços.', DETAIL='{"code":"invalid_price"}';
    END IF;
    IF coalesce(v_item->>'name_snapshot', '') = '' THEN
      RAISE EXCEPTION 'Um item do pedido está sem nome.'
        USING ERRCODE='22023', HINT='Recarregue o cardápio e refaça o pedido.', DETAIL='{"code":"missing_item_name"}';
    END IF;
    v_subtotal := v_subtotal + (v_qty * v_price);
  END LOOP;

  IF v_subtotal > 500000 THEN
    RAISE EXCEPTION 'Valor total excede o limite de R$ 5.000,00 por pedido.'
      USING ERRCODE='22023', HINT='Divida em mais de um pedido ou chame o garçom.', DETAIL='{"code":"amount_exceeded","limit":500000}';
  END IF;

  -- Rate limit: por telefone (5 em 2 min)
  SELECT count(*), min(created_at) INTO v_recent_phone, v_oldest_phone
  FROM public.orders
  WHERE customer_phone = v_phone
    AND restaurant_id = p_restaurant_id
    AND created_at > now() - interval '2 minutes';
  IF v_recent_phone >= 5 THEN
    v_wait := GREATEST(1, ceil(extract(epoch FROM (v_oldest_phone + interval '2 minutes' - now())))::int);
    RAISE EXCEPTION 'Você fez muitos pedidos em pouco tempo. Aguarde % segundos e tente novamente.', v_wait
      USING ERRCODE='P0001',
            HINT='Se precisar de ajuda, chame o garçom pelo botão do cardápio.',
            DETAIL=format('{"code":"rate_limit_phone","retry_after_seconds":%s,"limit":5,"window_seconds":120}', v_wait);
  END IF;

  -- Rate limit: por mesa (20 em 10 min)
  IF v_table IS NOT NULL THEN
    SELECT count(*), min(created_at) INTO v_recent_table, v_oldest_table
    FROM public.orders
    WHERE restaurant_id = p_restaurant_id
      AND table_label = v_table
      AND created_at > now() - interval '10 minutes';
    IF v_recent_table >= 20 THEN
      v_wait := GREATEST(1, ceil(extract(epoch FROM (v_oldest_table + interval '10 minutes' - now())))::int);
      RAISE EXCEPTION 'Esta mesa atingiu o limite de pedidos recentes. Aguarde % segundos.', v_wait
        USING ERRCODE='P0001',
              HINT='Chame o garçom para consolidar o pedido em conjunto.',
              DETAIL=format('{"code":"rate_limit_table","retry_after_seconds":%s,"limit":20,"window_seconds":600}', v_wait);
    END IF;
  END IF;

  INSERT INTO public.orders(
    restaurant_id, table_label, customer_name, customer_phone,
    subtotal, currency, status
  ) VALUES (
    p_restaurant_id, v_table, v_name, v_phone,
    v_subtotal, coalesce(NULLIF(p_currency,''), 'BRL'), 'pending'
  ) RETURNING id INTO v_order_id;

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
$function$;
