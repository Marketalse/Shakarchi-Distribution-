-- Reviewed behavioral rollback for migration 006. Never run automatically.
-- First revert compatible application code and deactivate competitor products.
-- Rows, new columns, UUIDs, financial snapshots and migration history are retained.
-- Ship the approved rollback as a NEW forward migration to keep history truthful.
begin;
do $$
begin
  if exists(select 1 from public.products where not is_own_brand and active) then
    raise exception 'Deactivate competitor products before restoring the earlier catalog behavior';
  end if;
end;
$$;
drop trigger product_classification on public.products;
drop trigger brand_reclassification on public.survey_brands;
drop trigger observation_competitor on public.market_observations;
drop trigger survey_run_competitor on public.survey_runs;
drop trigger survey_answer_competitor on public.survey_answers;
alter table public.products alter column brand_id drop not null;
alter table public.products drop constraint own_catalog_price_required;
drop function wsd_private.check_product_classification();
drop function wsd_private.check_brand_reclassification();
drop function wsd_private.check_competitor_target();
drop function wsd_private.check_legacy_survey_brand();

create or replace view public.solo_active_catalog with (security_invoker=true) as
select p.* from public.products p left join public.survey_brands b on b.id=p.brand_id
where p.active and p.currency='IQD' and (p.brand_id is null or b.active);
grant select on public.solo_active_catalog to authenticated;
create or replace function wsd_private.check_order_brand() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.products p join public.survey_brands b on b.id=p.brand_id
    where p.id=new.product_id and not b.active) then raise exception 'Brand is inactive'; end if;
  return new;
end;
$$;

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
        or nullif(trim(row->>'flavour'),'') is null or (row->>'wholesale_price')::numeric is null
        or (row->>'wholesale_price')::numeric<0 or (row->>'wholesale_price')::numeric='NaN'::numeric or (row->>'cost_price')::numeric<0 or (row->>'cost_price')::numeric='NaN'::numeric then raise exception 'Valid SKU, name, variant and prices required'; end if;
      insert into public.products(sku,product_line,flavour,brand_id,brand,cost_price,wholesale_price,active)
        values(trim(row->>'sku'),trim(row->>'product_line'),trim(row->>'flavour'),brand.id,brand.name,
          (row->>'cost_price')::numeric,(row->>'wholesale_price')::numeric,coalesce((row->>'active')::boolean,true));
    else
      visit:=(row->>'visit_id')::uuid;
      perform public.start_solo_visit(visit,(row->>'outlet_id')::uuid,'survey');
      insert into public.market_observations(id,outlet_id,created_by,visit_id,kind,brand,model,price,offer,available,facings,shelf_width_cm)
      values(gen_random_uuid(),(row->>'outlet_id')::uuid,auth.uid(),visit,row->>'kind',row->>'brand',row->>'model',
        (row->>'price')::numeric,row->>'offer',(row->>'available')::boolean,(row->>'facings')::integer,(row->>'shelf_width_cm')::numeric);
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
  insert into public.survey_runs(id,version_id,outlet_id,visit_id,answers)
  values(p_operation,version.id,(p_request->>'outlet_id')::uuid,(p_request->>'visit_id')::uuid,answers);
  return wsd_private.finish_operation(p_operation,jsonb_build_object('run_id',p_operation));
end;
$$;

notify pgrst, 'reload schema';
commit;
