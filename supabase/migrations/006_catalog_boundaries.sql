-- Shared registries retain their IDs. This migration changes classification guards only.
-- Rollback instructions are in the existing database handbook.
begin;

-- Reject ambiguous existing assignments instead of relabelling records.
do $$
begin
  if exists (
    select 1 from public.products p left join public.survey_brands b on b.id=p.brand_id
    where b.id is null or p.is_own_brand is distinct from b.is_own
  ) then
    raise exception 'Classify existing product brands before applying catalog boundaries';
  end if;
end;
$$;
alter table public.products alter column brand_id set not null;
alter table public.products alter column wholesale_price drop not null;
alter table public.products add constraint own_catalog_price_required
  check (not is_own_brand or wholesale_price is not null);

create function wsd_private.check_product_classification()
returns trigger language plpgsql security definer set search_path='' as $$
declare brand public.survey_brands;
begin
  select * into strict brand from public.survey_brands where id=new.brand_id for share;
  if new.is_own_brand is distinct from brand.is_own then
    raise exception 'Product classification must match its brand';
  end if;
  new.brand:=brand.name;
  return new;
end;
$$;
create trigger product_classification before insert or update on public.products
  for each row execute function wsd_private.check_product_classification();

create function wsd_private.check_brand_reclassification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.is_own is distinct from old.is_own and exists(
    select 1 from public.products where brand_id=old.id
  ) then
    raise exception 'Move associated products to a matching brand before changing this classification';
  end if;
  return new;
end;
$$;
create trigger brand_reclassification before update of is_own on public.survey_brands
  for each row execute function wsd_private.check_brand_reclassification();

create or replace view public.solo_active_catalog with (security_invoker=true) as
select p.* from public.products p join public.survey_brands b on b.id=p.brand_id
where p.active and p.currency='IQD' and p.is_own_brand and b.is_own and b.active;

create view public.solo_competitor_catalog with (security_invoker=true) as
select p.* from public.products p join public.survey_brands b on b.id=p.brand_id
where p.active and not p.is_own_brand and not b.is_own and b.active;
grant select on public.solo_competitor_catalog to authenticated;

create or replace function wsd_private.check_order_brand() returns trigger
language plpgsql security definer set search_path='' as $$
declare product public.products; brand public.survey_brands;
begin
  select * into strict product from public.products where id=new.product_id for share;
  select * into strict brand from public.survey_brands where id=product.brand_id for share;
  if not product.is_own_brand or not brand.is_own then
    raise exception 'Competitor products cannot be ordered';
  end if;
  if not product.active or not brand.active then raise exception 'Product or brand is inactive'; end if;
  return new;
end;
$$;

alter table public.market_observations
  add column brand_id uuid references public.survey_brands(id),
  add column product_id uuid references public.products(id);
alter table public.survey_runs
  add column brand_id uuid references public.survey_brands(id),
  add column product_id uuid references public.products(id);

create function wsd_private.check_competitor_target()
returns trigger language plpgsql security definer set search_path='' as $$
declare brand public.survey_brands; product public.products;
begin
  if new.brand_id is null then raise exception 'Choose an approved competitor brand'; end if;
  select * into strict brand from public.survey_brands where id=new.brand_id for share;
  if brand.is_own or not brand.active then raise exception 'Survey target must be an active competitor'; end if;
  if tg_table_name='market_observations' and new.product_id is null then
    raise exception 'Choose an approved competitor product';
  end if;
  if new.product_id is not null then
    select * into strict product from public.products where id=new.product_id for share;
    if product.brand_id<>brand.id or product.is_own_brand or not product.active then
      raise exception 'Choose an active product belonging to this competitor';
    end if;
  end if;
  if tg_table_name='market_observations' then
    new.brand:=brand.name;
    new.model:=product.product_line || ' · ' || product.flavour;
  end if;
  return new;
end;
$$;
create trigger observation_competitor before insert on public.market_observations
  for each row execute function wsd_private.check_competitor_target();
create trigger survey_run_competitor before insert on public.survey_runs
  for each row execute function wsd_private.check_competitor_target();

create function wsd_private.check_legacy_survey_brand()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.survey_brands where id=new.brand_id and not is_own and active) then
    raise exception 'Survey target must be an active competitor';
  end if;
  return new;
end;
$$;
create trigger survey_answer_competitor before insert or update on public.survey_answers
  for each row execute function wsd_private.check_legacy_survey_brand();

revoke all on function wsd_private.check_product_classification(),
 wsd_private.check_brand_reclassification(),wsd_private.check_competitor_target(),
 wsd_private.check_legacy_survey_brand() from public,anon,authenticated;

create or replace function public.import_solo_data(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; row jsonb; kind text; brand public.survey_brands; visit uuid; count integer:=0;
begin
  prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','import','payload',p_request));
  if prior is not null then return prior; end if;
  kind:=p_request->>'kind';
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
        or (row->>'wholesale_price')::numeric<0 or (row->>'wholesale_price')::numeric='NaN'::numeric or (row->>'cost_price')::numeric<0 or (row->>'cost_price')::numeric='NaN'::numeric then raise exception 'Valid SKU, name, variant and prices required'; end if;
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
create or replace function public.submit_solo_survey(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; version public.survey_versions; q jsonb; answer jsonb; answers jsonb; key text;
begin
  prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','survey_run','payload',p_request));
  if prior is not null then return prior; end if;
  select * into strict version from public.survey_versions where id=(p_request->>'version_id')::uuid;
  perform public.start_solo_visit((p_request->>'visit_id')::uuid,(p_request->>'outlet_id')::uuid,'survey');
  answers:=p_request->'answers';
  if jsonb_typeof(answers) is distinct from 'object' then raise exception 'Answer object required'; end if;
  for key in select jsonb_object_keys(answers) loop
    if not exists(select 1 from jsonb_array_elements(version.questions) x where x->>'id'=key) then
      raise exception 'Unknown question'; end if;
  end loop;
  for q in select * from jsonb_array_elements(version.questions) loop
    answer:=answers->(q->>'id');
    if answer is null or answer='null'::jsonb or answer='""'::jsonb then
      if (q->>'required')::boolean then raise exception 'Required answer missing'; end if;
      continue;
    end if;
    if (q->>'type'='text' and jsonb_typeof(answer)<>'string')
      or (q->>'type'='number' and jsonb_typeof(answer)<>'number')
      or (q->>'type'='boolean' and jsonb_typeof(answer)<>'boolean')
      or (q->>'type'='choice' and not (q->'options' @> jsonb_build_array(answer))) then
      raise exception 'Invalid answer type or choice'; end if;
  end loop;
  insert into public.survey_runs(id,version_id,outlet_id,visit_id,answers,brand_id,product_id)
  values(p_operation,version.id,(p_request->>'outlet_id')::uuid,(p_request->>'visit_id')::uuid,answers,(p_request->>'brand_id')::uuid,(p_request->>'product_id')::uuid);
  return wsd_private.finish_operation(p_operation,jsonb_build_object('run_id',p_operation));
end;
$$;

notify pgrst, 'reload schema';
commit;
