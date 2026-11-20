-- Issue #23: inactive own definitions may be unpriced; never orderable until priced.
begin;
set local lock_timeout='5s';
alter table public.products drop constraint own_catalog_price_required;
alter table public.products add constraint own_catalog_price_required
 check(not is_own_brand or not active or wholesale_price is not null);
alter table public.products validate constraint catalog_valid_prices;
alter table public.products add constraint catalog_metadata_valid check(
 (puffs is null or puffs>0) and (units_per_carton is null or units_per_carton>0)
 and (retail_price is null or (retail_price>=0 and retail_price<>'NaN'::numeric))
);
-- Reject sub-cent metadata and fractional counts rather than silently rounding them.
create function wsd_private.check_product_metadata(p_request jsonb) returns void
language plpgsql set search_path='' as $$
declare key text; value numeric;
begin
 foreach key in array array['retail_price','puffs','units_per_carton'] loop
  value:=nullif(p_request->>key,'')::numeric;
  if value is not null then
   if value='NaN'::numeric or value<0 or (key='retail_price' and value<>round(value,2))
     or (key<>'retail_price' and (value<=0 or value<>trunc(value))) then
    raise exception 'Use USD cents and positive whole-number product counts' using errcode='22023';
   end if;
  end if;
 end loop;
end;
$$;
revoke all on function wsd_private.check_product_metadata(jsonb) from public,anon,authenticated;
create or replace function public.import_solo_data(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; row jsonb; kind text; brand public.survey_brands; visit uuid; count integer:=0;
begin
  prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','import','payload',p_request));
  if prior is not null then return prior; end if;
  kind:=p_request->>'kind';
  if kind in ('products','observations') and p_request->>'currency' is distinct from 'USD' then
    raise exception 'USD currency confirmation required. Refresh the app.' using errcode='22023';
  end if;
  if kind is null or kind not in ('brands','products','observations') or jsonb_typeof(p_request->'rows') is distinct from 'array' then
    raise exception 'Supported import kind and rows required'; end if;
  if jsonb_array_length(p_request->'rows') not between 1 and 500 then raise exception 'Import 1 to 500 rows'; end if;
  for row in select * from jsonb_array_elements(p_request->'rows') loop
    if kind='brands' then
      if nullif(trim(row->>'name'),'') is null then raise exception 'Brand name required'; end if;
      insert into public.survey_brands(name,is_own,active) values(trim(row->>'name'),coalesce((row->>'is_own')::boolean,false),
        coalesce((row->>'active')::boolean,true));
    elsif kind='products' then
      perform wsd_private.check_product_metadata(row);
      select * into strict brand from public.survey_brands where id=(row->>'brand_id')::uuid;
      if nullif(trim(row->>'sku'),'') is null or nullif(trim(row->>'product_line'),'') is null
        or nullif(trim(row->>'flavour'),'') is null or (brand.is_own and coalesce((row->>'active')::boolean,true) and (row->>'wholesale_price')::numeric is null)
        or (row->>'wholesale_price')::numeric<0 or (row->>'wholesale_price')::numeric='NaN'::numeric or (row->>'cost_price')::numeric<0 or (row->>'cost_price')::numeric='NaN'::numeric
        or round((row->>'wholesale_price')::numeric,2) is distinct from (row->>'wholesale_price')::numeric
        or round((row->>'cost_price')::numeric,2) is distinct from (row->>'cost_price')::numeric then raise exception 'Valid SKU, name, variant and prices required'; end if;
      insert into public.products(sku,product_line,flavour,brand_id,brand,is_own_brand,cost_price,wholesale_price,retail_price,puffs,units_per_carton,active)
        values(trim(row->>'sku'),trim(row->>'product_line'),trim(row->>'flavour'),brand.id,brand.name,brand.is_own,
          (row->>'cost_price')::numeric,(row->>'wholesale_price')::numeric,(row->>'retail_price')::numeric,(row->>'puffs')::integer,(row->>'units_per_carton')::integer,coalesce((row->>'active')::boolean,true));
    else
      visit:=(row->>'visit_id')::uuid;
      perform public.start_solo_visit(visit,(row->>'outlet_id')::uuid,'survey');
      insert into public.market_observations(id,outlet_id,created_by,visit_id,kind,brand,model,price,offer,available,facings,shelf_width_cm,brand_id,product_id)
      values(gen_random_uuid(),(row->>'outlet_id')::uuid,auth.uid(),visit,row->>'kind',row->>'brand',row->>'model',
        (row->>'price')::numeric,row->>'offer',(row->>'available')::boolean,(row->>'facings')::integer,(row->>'shelf_width_cm')::numeric,(row->>'brand_id')::uuid,(row->>'product_id')::uuid);
    end if;
    count:=count+1;
  end loop;
  return wsd_private.finish_operation(p_operation,jsonb_build_object('imported',count));
end;
$$;

create or replace function public.update_solo_product(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; product public.products; brand public.survey_brands;
  price numeric(14,2); cost numeric(14,2);
begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','update_usd_product','payload',p_request));
 if prior is not null then return prior; end if;
 if p_request->>'currency' is distinct from 'USD' then raise exception 'USD currency confirmation required. Refresh the app.' using errcode='22023'; end if;
 perform wsd_private.check_product_metadata(p_request);
 select * into strict product from public.products where id=(p_request->>'id')::uuid for update;
 select * into strict brand from public.survey_brands where id=(p_request->>'brand_id')::uuid for share;
 if nullif(trim(p_request->>'sku'),'') is null or nullif(trim(p_request->>'product_line'),'') is null
   or nullif(trim(p_request->>'flavour'),'') is null then raise exception 'SKU, product line and variant required'; end if;
 if brand.is_own then
   price:=(p_request->>'wholesale_price')::numeric; cost:=(p_request->>'cost_price')::numeric;
   if (price is null and coalesce((p_request->>'active')::boolean,product.active)) or price<0 or price='NaN'::numeric or price<>(p_request->>'wholesale_price')::numeric
     or (cost is not null and (cost<0 or cost='NaN'::numeric or cost<>(p_request->>'cost_price')::numeric)) then
     raise exception 'USD prices must be nonnegative amounts with at most two decimal places';
   end if;
 end if;
 update public.products set sku=trim(p_request->>'sku'),product_line=trim(p_request->>'product_line'),
   flavour=trim(p_request->>'flavour'),brand_id=brand.id,brand=brand.name,is_own_brand=brand.is_own,
   wholesale_price=price,cost_price=cost,
   retail_price=case when p_request ? 'retail_price' then (p_request->>'retail_price')::numeric else product.retail_price end,
   puffs=case when p_request ? 'puffs' then (p_request->>'puffs')::integer else product.puffs end,
   units_per_carton=case when p_request ? 'units_per_carton' then (p_request->>'units_per_carton')::integer else product.units_per_carton end,active=coalesce((p_request->>'active')::boolean,product.active),currency='USD'
 where id=product.id;
 return wsd_private.finish_operation(p_operation,jsonb_build_object('product_id',product.id));
end;
$$;
revoke all on function public.update_solo_product(uuid,jsonb) from public,anon;
grant execute on function public.update_solo_product(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
