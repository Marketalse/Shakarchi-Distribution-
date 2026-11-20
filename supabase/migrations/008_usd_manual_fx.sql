-- USD is the canonical currency. Local cash is supporting settlement evidence.
begin;
set local lock_timeout='5s';
lock table public.products,public.orders,public.order_lines,public.payments,public.outlets,
 public.market_observations,public.survey_answers,public.survey_runs in access exclusive mode;
do $$
begin
  if exists(select 1 from public.products) or exists(select 1 from public.orders)
    or exists(select 1 from public.payments) or exists(select 1 from public.market_observations)
    or exists(select 1 from public.survey_answers) or exists(select 1 from public.survey_runs) or exists(select 1 from public.outlets where credit_limit<>0) then
    raise exception 'Existing monetary records require an approved currency conversion plan before USD cutover';
  end if;
end;
$$;
alter table public.products alter column currency set default 'USD';
alter table public.products add constraint products_usd_only check(currency='USD');
alter table public.orders add column currency text not null default 'USD' check(currency='USD');
alter table public.order_lines add column currency text not null default 'USD' check(currency='USD');
alter table public.payments add column currency text not null default 'USD' check(currency='USD');
alter table public.outlets add column currency text not null default 'USD' check(currency='USD');
alter table public.market_observations add column currency text not null default 'USD' check(currency='USD');
alter table public.survey_answers add column currency text not null default 'USD' check(currency='USD');
alter table public.survey_runs add column currency text not null default 'USD' check(currency='USD');
create or replace view public.solo_active_catalog with(security_invoker=true) as
select p.* from public.products p join public.survey_brands b on b.id=p.brand_id
where p.active and p.currency='USD' and p.is_own_brand and b.is_own and b.active;

create table public.fx_rate_versions(
 id uuid primary key,
 version bigint generated always as identity unique,
 base_currency text not null default 'USD' check(base_currency='USD'),
 quote_currency text not null default 'IQD' check(quote_currency='IQD'),
 exchange_rate_used numeric(20,8) not null check(exchange_rate_used>0 and exchange_rate_used<>'NaN'::numeric),
 rate_timestamp timestamptz not null,
 valid_until timestamptz not null,
 rate_source text not null check(length(trim(rate_source))>0),
 source_kind text not null default 'manual_parallel' check(source_kind='manual_parallel'),
 created_by uuid not null references public.profiles(id),
 recorded_at timestamptz not null default clock_timestamp(),
 policy_version integer not null default 1 check(policy_version=1),
 check(valid_until>rate_timestamp)
);
create trigger fx_rates_immutable before update or delete on public.fx_rate_versions
 for each row execute function public.forbid_change();
alter table public.fx_rate_versions enable row level security;
create policy owner_read on public.fx_rate_versions for select to authenticated
 using((select wsd_private.is_solo_owner()));
revoke all on public.fx_rate_versions from public,anon,authenticated;
grant select on public.fx_rate_versions to authenticated;

create table wsd_private.fx_current_rate(
 singleton boolean primary key default true check(singleton),
 rate_id uuid references public.fx_rate_versions(id)
);
insert into wsd_private.fx_current_rate(singleton) values(true);
revoke all on wsd_private.fx_current_rate from public,anon,authenticated;

create table public.payment_fx_snapshots(
 operation_id uuid primary key references wsd_private.operations(id),
 payment_id uuid unique references public.payments(id),
 source_currency text not null check(source_currency='IQD'),
 source_amount numeric(18,2) not null check(source_amount>=0 and source_amount<>'NaN'::numeric),
 usd_amount numeric(14,2) not null check(usd_amount>=0 and usd_amount<>'NaN'::numeric),
 rate_version_id uuid not null references public.fx_rate_versions(id),
 exchange_rate_used numeric(20,8) not null,
 rate_timestamp timestamptz not null,
 rate_source text not null,
 settled_at timestamptz not null,
 posted_at timestamptz not null default clock_timestamp(),
 policy_version integer not null check(policy_version=1),
 check(usd_amount=round(source_amount/exchange_rate_used,2))
);
create trigger fx_snapshots_immutable before update or delete on public.payment_fx_snapshots
 for each row execute function public.forbid_change();
alter table public.payment_fx_snapshots enable row level security;
create policy owner_read on public.payment_fx_snapshots for select to authenticated
 using((select wsd_private.is_solo_owner()));
revoke all on public.payment_fx_snapshots from public,anon,authenticated;
grant select on public.payment_fx_snapshots to authenticated;

create function public.publish_solo_fx_rate(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; rate numeric(20,8); expires timestamptz; source text; stamp timestamptz;
begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','manual_parallel_rate','payload',p_request));
 if prior is not null then return prior; end if;
 perform 1 from wsd_private.fx_current_rate where singleton for update;
 stamp:=clock_timestamp();
 rate:=(p_request->>'exchange_rate_used')::numeric;
 expires:=(p_request->>'valid_until')::timestamptz;
 source:=nullif(trim(p_request->>'rate_source'),'');
 if rate is null or rate<=0 or rate='NaN'::numeric or rate<>(p_request->>'exchange_rate_used')::numeric
   or expires is null or expires<=stamp or source is null then raise exception 'Enter a positive IQD-per-USD rate, source and future expiry'; end if;
 insert into public.fx_rate_versions(id,exchange_rate_used,rate_timestamp,valid_until,rate_source,created_by)
 values(p_operation,rate,stamp,expires,source,auth.uid());
 update wsd_private.fx_current_rate set rate_id=p_operation where singleton;
 return wsd_private.finish_operation(p_operation,jsonb_build_object('rate_version_id',p_operation));
end;
$$;
revoke all on function public.publish_solo_fx_rate(uuid,jsonb) from public,anon;
grant execute on function public.publish_solo_fx_rate(uuid,jsonb) to authenticated;

create function wsd_private.resolve_manual_rate(p_id uuid) returns public.fx_rate_versions
language plpgsql security definer set search_path='' as $$
declare current_id uuid; rate public.fx_rate_versions;
begin
 select rate_id into current_id from wsd_private.fx_current_rate where singleton for share;
 if p_id is null or p_id is distinct from current_id then raise exception 'Rate changed. Reload and confirm the current rate.'; end if;
 select * into strict rate from public.fx_rate_versions where id=p_id;
 if rate.valid_until<=clock_timestamp() then raise exception 'Rate expired. Admin must publish a fresh parallel-market rate.'; end if;
 return rate;
end;
$$;
revoke all on function wsd_private.resolve_manual_rate(uuid) from public,anon,authenticated;

create or replace function public.issue_solo_invoice(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; outlet public.outlets; invoice public.orders; product public.products;
  item jsonb; item_count integer; total numeric(14,2):=0; qty integer;
  initial_amount numeric(14,2); method public.payment_method; terms integer; visit uuid;
begin
  prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','issue','payload',p_request));
  if prior is not null then return prior; end if;
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
    qty:=(item->>'quantity')::integer;
    if qty is null or qty<=0 or qty::numeric<>(item->>'quantity')::numeric
      or product.wholesale_price='NaN'::numeric or (item->>'price')::numeric is distinct from product.wholesale_price then
      raise exception 'SKU price or quantity changed. Reload and review.'; end if;
    total:=total+qty*product.wholesale_price;
    insert into public.order_lines(id,order_id,product_id,quantity,unit_price,unit_cost,product_snapshot)
    values(gen_random_uuid(),invoice.id,product.id,qty,product.wholesale_price,product.cost_price,
      jsonb_build_object('sku',product.sku,'product_line',product.product_line,'flavour',product.flavour,'brand',product.brand,'currency','USD'));
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

create or replace function public.post_solo_collection(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; invoice public.orders; original public.payments;
  amount numeric(14,2); method public.payment_method; kind text; reason text; due numeric;
  remaining numeric; receipt_id uuid:=gen_random_uuid();
  rate public.fx_rate_versions; source_amount numeric(18,2); source_currency text;
  original_fx public.payment_fx_snapshots; settlement_time timestamptz:=clock_timestamp();
begin
  prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','collection','payload',p_request));
  if prior is not null then return prior; end if;
  if p_request->>'currency' is distinct from 'USD' then raise exception 'USD currency confirmation required. Refresh the app.' using errcode='22023'; end if;
  select * into strict invoice from public.orders where id=(p_request->>'order_id')::uuid for update;
  if invoice.outlet_id is distinct from (p_request->>'outlet_id')::uuid then raise exception 'Invoice and outlet mismatch'; end if;
  if exists(select 1 from public.payments p where p.order_id=invoice.id
      and p.entry_type='legacy' and p.amount<0 and p.original_receipt_id is null) then
    raise exception 'Reconcile legacy unlinked negative payments before posting collections';
  end if;
  source_currency:=coalesce(p_request->>'settlement_currency','USD');
  if source_currency not in ('USD','IQD') then raise exception 'Unsupported settlement currency'; end if;
  if source_currency='IQD' then
    source_amount:=(p_request->>'source_amount')::numeric;
    if source_amount is null or source_amount<0 or source_amount='NaN'::numeric
      or source_amount<>(p_request->>'source_amount')::numeric then raise exception 'Valid local cash amount required'; end if;
    if p_request->>'kind'='correction' then
      select * into strict original_fx from public.payment_fx_snapshots
        where payment_id=(p_request->>'receipt_id')::uuid;
      select * into strict rate from public.fx_rate_versions where id=original_fx.rate_version_id;
      if rate.id is distinct from (p_request->>'rate_version_id')::uuid then
        raise exception 'Correct local cash using its original rate snapshot'; end if;
      settlement_time:=original_fx.settled_at;
    else
      rate:=wsd_private.resolve_manual_rate((p_request->>'rate_version_id')::uuid);
      settlement_time:=clock_timestamp();
      if rate.valid_until<=settlement_time then raise exception 'Rate expired before settlement confirmation'; end if;
    end if;
    amount:=round(source_amount/rate.exchange_rate_used,2);
    if nullif(p_request->>'amount','') is not null and amount<>(p_request->>'amount')::numeric then
      raise exception 'USD amount differs from the locked settlement conversion'; end if;
  else
    if p_request->>'kind'='correction' and exists(
      select 1 from public.payment_fx_snapshots where payment_id=(p_request->>'receipt_id')::uuid
    ) then raise exception 'Correct local cash in its original currency and rate'; end if;
    amount:=(p_request->>'amount')::numeric;
  end if;
  method:=(p_request->>'method')::public.payment_method;
  kind:=p_request->>'kind'; reason:=nullif(trim(p_request->>'reason'),'');
  if amount is null or amount<0 or amount='NaN'::numeric or (source_currency='USD' and amount<>(p_request->>'amount')::numeric) or method is null
    or kind is null or kind not in ('receipt','refund','correction') then raise exception 'Invalid collection'; end if;
  select outstanding into strict due from public.solo_invoice_balances where id=invoice.id;
  if kind='receipt' then
    if amount<=0 or amount>due then raise exception 'Receipt exceeds outstanding balance'; end if;
  else
    if reason is null then raise exception 'Reason required'; end if;
    select p.* into strict original from public.payments p
      where p.id=(p_request->>'receipt_id')::uuid and p.order_id=invoice.id
      and p.outlet_id=invoice.outlet_id and p.amount>0 and p.entry_type in ('receipt','legacy') for update;
    select original.amount+coalesce(sum(p.amount),0) into remaining from public.payments p
      where p.original_receipt_id=original.id;
    if kind='refund' then
      if amount<=0 or amount>remaining then raise exception 'Refund exceeds refundable receipt'; end if;
    else
      if exists(select 1 from public.payments where original_receipt_id=original.id) then
        raise exception 'Correct only a receipt with no refund or prior correction'; end if;
      if amount>original.amount+due then raise exception 'Replacement receipt exceeds invoice balance'; end if;
      insert into public.payments(id,outlet_id,order_id,amount,method,note,collected_at,entry_type,original_receipt_id,operation_id)
      values(gen_random_uuid(),invoice.outlet_id,invoice.id,-original.amount,original.method,reason,now(),'reversal',original.id,p_operation);
    end if;
  end if;
  if amount>0 then
    insert into public.payments(id,outlet_id,order_id,amount,method,note,collected_at,entry_type,original_receipt_id,operation_id)
    values(receipt_id,invoice.outlet_id,invoice.id,case when kind='refund' then -amount else amount end,
      method,reason,now(),case when kind='refund' then 'refund' else 'receipt' end,
      case when kind='refund' then original.id else null end,p_operation);
  end if;
  perform wsd_private.refresh_reminder(invoice.id,p_operation,kind);
  if source_currency='IQD' then
    insert into public.payment_fx_snapshots(operation_id,payment_id,source_amount,source_currency,usd_amount,
      rate_version_id,exchange_rate_used,rate_timestamp,rate_source,settled_at,policy_version)
    values(p_operation,case when amount>0 then receipt_id end,source_amount,'IQD',amount,
      rate.id,rate.exchange_rate_used,rate.rate_timestamp,rate.rate_source,settlement_time,1);
  end if;
  return wsd_private.finish_operation(p_operation,jsonb_build_object('order_id',invoice.id,'entry_id',case when amount>0 then receipt_id end));
end;
$$;

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
      select * into strict brand from public.survey_brands where id=(row->>'brand_id')::uuid;
      if nullif(trim(row->>'sku'),'') is null or nullif(trim(row->>'product_line'),'') is null
        or nullif(trim(row->>'flavour'),'') is null or (brand.is_own and (row->>'wholesale_price')::numeric is null)
        or (row->>'wholesale_price')::numeric<0 or (row->>'wholesale_price')::numeric='NaN'::numeric or (row->>'cost_price')::numeric<0 or (row->>'cost_price')::numeric='NaN'::numeric
        or round((row->>'wholesale_price')::numeric,2) is distinct from (row->>'wholesale_price')::numeric
        or round((row->>'cost_price')::numeric,2) is distinct from (row->>'cost_price')::numeric then raise exception 'Valid SKU, name, variant and prices required'; end if;
      insert into public.products(sku,product_line,flavour,brand_id,brand,is_own_brand,cost_price,wholesale_price,active)
        values(trim(row->>'sku'),trim(row->>'product_line'),trim(row->>'flavour'),brand.id,brand.name,brand.is_own,
          (row->>'cost_price')::numeric,(row->>'wholesale_price')::numeric,coalesce((row->>'active')::boolean,true));
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

create function public.update_solo_product(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; product public.products; brand public.survey_brands;
  price numeric(14,2); cost numeric(14,2);
begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','update_usd_product','payload',p_request));
 if prior is not null then return prior; end if;
 if p_request->>'currency' is distinct from 'USD' then raise exception 'USD currency confirmation required. Refresh the app.' using errcode='22023'; end if;
 select * into strict product from public.products where id=(p_request->>'id')::uuid for update;
 select * into strict brand from public.survey_brands where id=(p_request->>'brand_id')::uuid for share;
 if nullif(trim(p_request->>'sku'),'') is null or nullif(trim(p_request->>'product_line'),'') is null
   or nullif(trim(p_request->>'flavour'),'') is null then raise exception 'SKU, product line and variant required'; end if;
 if brand.is_own then
   price:=(p_request->>'wholesale_price')::numeric; cost:=(p_request->>'cost_price')::numeric;
   if price is null or price<0 or price='NaN'::numeric or price<>(p_request->>'wholesale_price')::numeric
     or (cost is not null and (cost<0 or cost='NaN'::numeric or cost<>(p_request->>'cost_price')::numeric)) then
     raise exception 'USD prices must be nonnegative amounts with at most two decimal places';
   end if;
 end if;
 update public.products set sku=trim(p_request->>'sku'),product_line=trim(p_request->>'product_line'),
   flavour=trim(p_request->>'flavour'),brand_id=brand.id,brand=brand.name,is_own_brand=brand.is_own,
   wholesale_price=price,cost_price=cost,active=coalesce((p_request->>'active')::boolean,product.active),currency='USD'
 where id=product.id;
 return wsd_private.finish_operation(p_operation,jsonb_build_object('product_id',product.id));
end;
$$;
revoke all on function public.update_solo_product(uuid,jsonb) from public,anon;
grant execute on function public.update_solo_product(uuid,jsonb) to authenticated;

-- Direct authenticated price writes bypass currency-intent validation.
revoke insert,update on public.products from public,anon,authenticated;
grant update(active) on public.products to authenticated;
notify pgrst, 'reload schema';
commit;
