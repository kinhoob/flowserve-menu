
CREATE OR REPLACE FUNCTION public.validate_order_phone_br()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  digits text;
  ddd int;
  valid_ddds int[] := ARRAY[
    11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,
    41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,
    71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99
  ];
BEGIN
  IF NEW.customer_phone IS NULL OR btrim(NEW.customer_phone) = '' THEN
    RAISE EXCEPTION 'customer_phone é obrigatório' USING ERRCODE = '22023';
  END IF;

  digits := regexp_replace(NEW.customer_phone, '\D', '', 'g');

  -- Remove código do país (55) se presente
  IF (length(digits) = 12 OR length(digits) = 13) AND left(digits, 2) = '55' THEN
    digits := substring(digits FROM 3);
  END IF;

  IF length(digits) NOT IN (10, 11) THEN
    RAISE EXCEPTION 'Telefone inválido: deve ter 10 (fixo) ou 11 (celular) dígitos com DDD' USING ERRCODE = '22023';
  END IF;

  ddd := substring(digits FROM 1 FOR 2)::int;
  IF NOT (ddd = ANY(valid_ddds)) THEN
    RAISE EXCEPTION 'DDD % inválido', ddd USING ERRCODE = '22023';
  END IF;

  -- Celular (11 dígitos) precisa começar por 9 após o DDD
  IF length(digits) = 11 AND substring(digits FROM 3 FOR 1) <> '9' THEN
    RAISE EXCEPTION 'Celular deve começar com 9 após o DDD' USING ERRCODE = '22023';
  END IF;

  NEW.customer_phone := digits;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_order_phone_br_trigger ON public.orders;
CREATE TRIGGER validate_order_phone_br_trigger
BEFORE INSERT OR UPDATE OF customer_phone ON public.orders
FOR EACH ROW
WHEN (NEW.customer_phone IS NOT NULL)
EXECUTE FUNCTION public.validate_order_phone_br();
