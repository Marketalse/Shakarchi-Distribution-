-- #38/#52: additive FMCG contract; historical lines and operation requests stay immutable.
begin;
set local lock_timeout='5s';
alter table public.products add column selling_price numeric(14,2),
 add column items_per_half_pack integer not null default 5 check(items_per_half_pack between 1 and 10000),
 add column packs_per_box integer not null default 10 check(packs_per_box between 1 and 10000),
 add column product_line_id uuid;
-- Existing retail and cost are per-item. Do not use wholesale as a fallback.
update public.products set selling_price=retail_price;
alter table public.products add constraint selling_price_valid check(selling_price is null or (selling_price>=0 and selling_price<>'NaN'::numeric));
-- Unknown active prices need review; do not invent a price or change active flags.
do $$ begin if exists(select 1 from public.products where active and is_own_brand and selling_price is null) then
 raise exception 'Reconcile active products without per-item retail prices before cutover'; end if; end $$;
alter table public.products drop constraint own_catalog_price_required;
alter table public.products add constraint own_catalog_price_required check(not is_own_brand or not active or selling_price is not null);
create table public.product_lines(
 id uuid primary key default gen_random_uuid(), brand_id uuid not null references public.survey_brands(id),
 name text not null check(length(trim(name))>0), unique(brand_id,name),unique(id,brand_id));
alter table public.product_lines enable row level security;
create policy solo_line_read on public.product_lines for select to authenticated using(wsd_private.is_solo_owner());
revoke all on public.product_lines from public,anon,authenticated;
grant select on public.product_lines to authenticated;
insert into public.product_lines(brand_id,name) select distinct brand_id,trim(product_line) from public.products;
update public.products p set product_line_id=l.id from public.product_lines l where l.brand_id=p.brand_id and l.name=trim(p.product_line);
alter table public.products alter column product_line_id set not null;
alter table public.products add constraint product_line_brand_fk foreign key(product_line_id,brand_id) references public.product_lines(id,brand_id);
create function wsd_private.resolve_product_line() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if nullif(trim(new.product_line),'') is null then raise exception 'Product line required' using errcode='22023'; end if;
 new.product_line:=trim(new.product_line);
 insert into public.product_lines(brand_id,name) values(new.brand_id,new.product_line)
 on conflict(brand_id,name) do update set name=excluded.name returning id into new.product_line_id;
 return new;
end; $$;
revoke all on function wsd_private.resolve_product_line() from public,anon,authenticated;
create trigger product_line_registry before insert or update of brand_id,product_line,product_line_id on public.products
 for each row execute function wsd_private.resolve_product_line();
create view public.solo_order_catalog_v2 with(security_invoker=true) as
 select p.id,p.brand,p.brand_id,p.sku,l.name as product_line,p.product_line_id,p.flavour,p.selling_price,
 p.items_per_half_pack,p.packs_per_box,p.currency,p.active from public.products p
 join public.survey_brands b on b.id=p.brand_id join public.product_lines l on l.id=p.product_line_id and l.brand_id=p.brand_id
 where p.active and p.is_own_brand and b.active and b.is_own and p.currency='USD' and p.selling_price is not null;
grant select on public.solo_order_catalog_v2 to authenticated;
create function wsd_private.check_product_metadata_v2(p_request jsonb) returns void
language plpgsql set search_path='' as $$
declare key text; value numeric;
begin
 if p_request ? 'retail_price' or p_request ? 'wholesale_price' then raise exception 'Use selling_price per item in USD; legacy price keys are not accepted' using errcode='22023'; end if;
 foreach key in array array['selling_price','puffs','units_per_carton','items_per_half_pack','packs_per_box'] loop
  value:=nullif(p_request->>key,'')::numeric;
  if value is not null then
   if value='NaN'::numeric or value<0 or (key='selling_price' and value<>round(value,2))
     or (key<>'selling_price' and (value<=0 or value<>trunc(value))) then
    raise exception 'Use USD cents and positive whole-number product counts' using errcode='22023';
   end if;
  end if;
 end loop;
end;
$$;
revoke all on function wsd_private.check_product_metadata_v2(jsonb) from public,anon,authenticated;
create or replace function public.import_solo_data_v2(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; row jsonb; kind text; brand public.survey_brands; visit uuid; count integer:=0;
begin
  prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','import_v2','payload',p_request));
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
      perform wsd_private.check_product_metadata_v2(row);
      select * into strict brand from public.survey_brands where id=(row->>'brand_id')::uuid;
      if nullif(trim(row->>'sku'),'') is null or nullif(trim(row->>'product_line'),'') is null
        or nullif(trim(row->>'flavour'),'') is null or (brand.is_own and coalesce((row->>'active')::boolean,true) and (row->>'selling_price')::numeric is null)
        or (row->>'selling_price')::numeric<0 or (row->>'selling_price')::numeric='NaN'::numeric or (row->>'cost_price')::numeric<0 or (row->>'cost_price')::numeric='NaN'::numeric
        or round((row->>'selling_price')::numeric,2) is distinct from (row->>'selling_price')::numeric
        or round((row->>'cost_price')::numeric,2) is distinct from (row->>'cost_price')::numeric then raise exception 'Valid SKU, name, variant and prices required'; end if;
      insert into public.products(sku,product_line,flavour,brand_id,brand,is_own_brand,cost_price,selling_price,puffs,units_per_carton,items_per_half_pack,packs_per_box,active)
        values(trim(row->>'sku'),trim(row->>'product_line'),trim(row->>'flavour'),brand.id,brand.name,brand.is_own,
          (row->>'cost_price')::numeric,(row->>'selling_price')::numeric,(row->>'puffs')::integer,(row->>'units_per_carton')::integer,coalesce((row->>'items_per_half_pack')::integer,5),coalesce((row->>'packs_per_box')::integer,10),coalesce((row->>'active')::boolean,true));
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

create or replace function public.update_solo_product_v2(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; product public.products; brand public.survey_brands;
  price numeric(14,2); cost numeric(14,2);
begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','update_product_v2','payload',p_request));
 if prior is not null then return prior; end if;
 if p_request->>'currency' is distinct from 'USD' then raise exception 'USD currency confirmation required. Refresh the app.' using errcode='22023'; end if;
 perform wsd_private.check_product_metadata_v2(p_request);
 select * into strict product from public.products where id=(p_request->>'id')::uuid for update;
 select * into strict brand from public.survey_brands where id=(p_request->>'brand_id')::uuid for share;
 if nullif(trim(p_request->>'sku'),'') is null or nullif(trim(p_request->>'product_line'),'') is null
   or nullif(trim(p_request->>'flavour'),'') is null then raise exception 'SKU, product line and variant required'; end if;
 if brand.is_own then
   price:=(p_request->>'selling_price')::numeric; cost:=(p_request->>'cost_price')::numeric;
   if (price is null and coalesce((p_request->>'active')::boolean,product.active)) or price<0 or price='NaN'::numeric or price<>(p_request->>'selling_price')::numeric
     or (cost is not null and (cost<0 or cost='NaN'::numeric or cost<>(p_request->>'cost_price')::numeric)) then
     raise exception 'USD prices must be nonnegative amounts with at most two decimal places';
   end if;
 end if;
 update public.products set sku=trim(p_request->>'sku'),product_line=trim(p_request->>'product_line'),
   flavour=trim(p_request->>'flavour'),brand_id=brand.id,brand=brand.name,is_own_brand=brand.is_own,
   selling_price=price,cost_price=cost,
   puffs=case when p_request ? 'puffs' then (p_request->>'puffs')::integer else product.puffs end,
   units_per_carton=case when p_request ? 'units_per_carton' then (p_request->>'units_per_carton')::integer else product.units_per_carton end,active=coalesce((p_request->>'active')::boolean,product.active),currency='USD'
 ,items_per_half_pack=coalesce((p_request->>'items_per_half_pack')::integer,product.items_per_half_pack),packs_per_box=coalesce((p_request->>'packs_per_box')::integer,product.packs_per_box) where id=product.id;
 return wsd_private.finish_operation(p_operation,jsonb_build_object('product_id',product.id));
end;
$$;
create or replace function public.issue_solo_invoice_v2(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; outlet public.outlets; invoice public.orders; product public.products;
  item jsonb; item_count integer; total numeric(14,2):=0; qty integer;
  initial_amount numeric(14,2); method public.payment_method; terms integer; visit uuid; half_price numeric(14,2); half_cost numeric(14,2);
begin
  prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','issue_v2','payload',p_request));
  if prior is not null then return prior; end if;
  if p_request->>'contract_version' is distinct from '2' then raise exception 'Order contract version 2 required' using errcode='22023'; end if;
  if p_request->>'currency' is distinct from 'USD' then raise exception 'USD currency confirmation required. Refresh the app.' using errcode='22023'; end if;
  if p_request is null or jsonb_typeof(p_request)<>'object' then raise exception 'Invoice payload required'; end if;
  select * into strict outlet from public.outlets where id=(p_request->>'outlet_id')::uuid and archived_at is null for update;
  terms:=(p_request->>'terms_days')::integer;
  if terms is null or terms not between 0 and 365 then raise exception 'Valid terms required'; end if;
  visit:=(p_request->>'visit_id')::uuid;
  if visit is not null then
    perform public.start_solo_visit(visit,outlet.id,'order');
  end if;
  if jsonb_typeof(p_request->'items') is distinct from 'array' then raise exception 'Items required'; end if;
  item_count:=jsonb_array_length(p_request->'items');
  if item_count not between 1 and 100 then raise exception 'Use 1 to 100 items'; end if;
  if (select count(distinct x->>'sku_id') from jsonb_array_elements(p_request->'items') x)<>item_count then
    raise exception 'Duplicate SKU'; end if;
  initial_amount:=(p_request->>'initial_amount')::numeric;
  method:=(p_request->>'method')::public.payment_method;
  if initial_amount is null or initial_amount<0 or method is null
    or initial_amount<>(p_request->>'initial_amount')::numeric then raise exception 'Valid initial amount and method required'; end if;
  insert into public.orders(id,outlet_id,rep_id,visit_id,payment_type,due_date,next_visit,recipient_snapshot)
  values(p_operation,outlet.id,auth.uid(),visit,case when terms=0 then 'cash'::public.payment_type else 'credit'::public.payment_type end,
    (now() at time zone 'Asia/Baghdad')::date+terms,(p_request->>'next_visit')::date,
    jsonb_build_object('name',outlet.retail_name,'code',outlet.code,'address',outlet.address,
      'province',outlet.province,'area',outlet.area,'owner_name',outlet.owner_name,'owner_phone',outlet.owner_phone))
  returning * into invoice;
  for item in select * from jsonb_array_elements(p_request->'items') loop
    select * into strict product from public.products where id=(item->>'sku_id')::uuid and active and currency='USD' for share;
    qty:=((item->>'quantity')::numeric*2)::integer;
    half_price:=product.selling_price*product.items_per_half_pack;
    half_cost:=product.cost_price*product.items_per_half_pack;
    if qty is null or qty<=0 or qty::numeric<>(item->>'quantity')::numeric*2 or qty>200000 or item->>'uom' is distinct from 'pack' or (item->>'items_per_half_pack')::numeric is distinct from product.items_per_half_pack::numeric or (item->>'packs_per_box')::numeric is distinct from product.packs_per_box::numeric
      or product.selling_price is null or (item->>'price')::numeric is distinct from product.selling_price then
      raise exception 'SKU price or quantity changed. Reload and review.'; end if;
    total:=total+qty*half_price;
    insert into public.order_lines(id,order_id,product_id,quantity,unit_price,unit_cost,product_snapshot)
    values(gen_random_uuid(),invoice.id,product.id,qty,half_price,half_cost,
      jsonb_build_object('sku',product.sku,'product_line',product.product_line,'flavour',product.flavour,'brand',product.brand,'currency','USD','contract_version',2,'base_uom','half_pack','selected_uom','pack','selected_quantity',(item->>'quantity')::numeric,'items_per_half_pack',product.items_per_half_pack,'packs_per_box',product.packs_per_box,'item_selling_price',product.selling_price,'product_line_id',product.product_line_id,'brand_id',product.brand_id));
  end loop;
  if total<=0 or initial_amount>total then raise exception 'Initial receipt exceeds invoice total or invoice has no value'; end if;
  if initial_amount>0 then
    insert into public.payments(id,outlet_id,order_id,visit_id,amount,method,collected_at,entry_type,operation_id)
    values(gen_random_uuid(),outlet.id,invoice.id,visit,initial_amount,method,now(),'receipt',p_operation);
  end if;
  perform wsd_private.refresh_reminder(invoice.id,p_operation,'issued');
  return wsd_private.finish_operation(p_operation,jsonb_build_object('order_id',invoice.id,'invoice_no',invoice.invoice_no));
end;
$$;


-- Replay accepted old commands exactly; retain unposted legacy requests for review.
create or replace function public.issue_solo_invoice(p_operation uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior jsonb; begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','issue','payload',p_request));
 if prior is not null then return prior; end if;
 raise exception 'Legacy catalog/order contract retained for review. Refresh and create a new reviewed operation; do not reinterpret saved quantities.' using errcode='55000';
end; $$;

-- Replay accepted old commands exactly; retain unposted legacy requests for review.
create or replace function public.update_solo_product(p_operation uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior jsonb; begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','update_usd_product','payload',p_request));
 if prior is not null then return prior; end if;
 raise exception 'Legacy catalog/order contract retained for review. Refresh and create a new reviewed operation; do not reinterpret saved quantities.' using errcode='55000';
end; $$;

-- Replay accepted old commands exactly; retain unposted legacy requests for review.
create or replace function public.import_solo_data(p_operation uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior jsonb; begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','import','payload',p_request));
 if prior is not null then return prior; end if;
 raise exception 'Legacy catalog/order contract retained for review. Refresh and create a new reviewed operation; do not reinterpret saved quantities.' using errcode='55000';
end; $$;
revoke all on function public.import_solo_data_v2(uuid,jsonb) from public,anon;
grant execute on function public.import_solo_data_v2(uuid,jsonb) to authenticated;
revoke all on function public.update_solo_product_v2(uuid,jsonb) from public,anon;
grant execute on function public.update_solo_product_v2(uuid,jsonb) to authenticated;
revoke all on function public.issue_solo_invoice_v2(uuid,jsonb) from public,anon;
grant execute on function public.issue_solo_invoice_v2(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
