begin;
alter table public.products add constraint catalog_valid_prices check (
  wholesale_price >= 0 and wholesale_price <> 'NaN'::numeric
  and (cost_price is null or (cost_price >= 0 and cost_price <> 'NaN'::numeric))
) not valid;
-- Existing bad catalog rows remain visible for reconciliation. New writes are checked.
-- Reuse the existing brands table as the normalized catalog brand registry.
alter table public.products add column brand_id uuid references public.survey_brands(id);
insert into public.survey_brands(name,is_own)
select distinct trim(brand),true from public.products where nullif(trim(brand),'') is not null
on conflict(name) do nothing;
update public.products p set brand_id=b.id from public.survey_brands b where b.name=trim(p.brand);
grant insert,update on public.products,public.survey_brands to authenticated;
create view public.solo_active_catalog with (security_invoker=true) as
select p.* from public.products p left join public.survey_brands b on b.id=p.brand_id
where p.active and p.currency='IQD' and (p.brand_id is null or b.active);
grant select on public.solo_active_catalog to authenticated;
create function wsd_private.check_order_brand() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.products p join public.survey_brands b on b.id=p.brand_id
    where p.id=new.product_id and not b.active) then raise exception 'Brand is inactive'; end if;
  return new;
end;
$$;
create trigger order_brand_active before insert on public.order_lines
  for each row execute function wsd_private.check_order_brand();

create table public.survey_versions (
  id uuid primary key,
  title text not null check(length(trim(title))>0),
  questions jsonb not null check(jsonb_typeof(questions)='array' and jsonb_array_length(questions) between 1 and 50),
  created_at timestamptz not null default now()
);
create table public.survey_runs (
  id uuid primary key,
  version_id uuid not null references public.survey_versions(id),
  outlet_id uuid not null references public.outlets(id),
  visit_id uuid not null references public.visits(id),
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create trigger survey_versions_append_only before update or delete on public.survey_versions
  for each row execute function public.forbid_change();
create trigger survey_runs_append_only before update or delete on public.survey_runs
  for each row execute function public.forbid_change();

alter table public.market_observations
  add column visit_id uuid references public.visits(id),
  add column available boolean,
  add column facings integer check(facings>=0),
  add column shelf_width_cm numeric(10,2) check(shelf_width_cm>=0);
create trigger observations_append_only before update or delete on public.market_observations
  for each row execute function public.forbid_change();
alter table public.survey_versions enable row level security;
alter table public.survey_runs enable row level security;
create policy solo_read on public.survey_versions for select to authenticated
  using ((select wsd_private.is_solo_owner()));
create policy solo_read on public.survey_runs for select to authenticated
  using ((select wsd_private.is_solo_owner()));
revoke all on public.survey_versions, public.survey_runs from public,anon,authenticated;
grant select on public.survey_versions,public.survey_runs to authenticated;

create function public.publish_solo_survey(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; q jsonb; seen text[]:='{}'; title text;
begin
  prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','publish_survey','payload',p_request));
  if prior is not null then return prior; end if;
  title:=nullif(trim(p_request->>'title'),'');
  if title is null or jsonb_typeof(p_request->'questions') is distinct from 'array'
    or jsonb_array_length(p_request->'questions') not between 1 and 50 then raise exception 'Title and 1 to 50 questions required'; end if;
  for q in select * from jsonb_array_elements(p_request->'questions') loop
    if nullif(trim(q->>'id'),'') is null or nullif(trim(q->>'label'),'') is null
      or q->>'id'=any(seen) or q->>'type' is null or q->>'type' not in ('text','number','boolean','choice')
      or jsonb_typeof(q->'required') is distinct from 'boolean' then raise exception 'Invalid or duplicate question'; end if;
    if q->>'type'='choice' and (jsonb_typeof(q->'options') is distinct from 'array') then raise exception 'Choice options required'; end if;
    if q->>'type'='choice' then
      if jsonb_array_length(q->'options')=0 or exists(select 1 from jsonb_array_elements(q->'options') x
        where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}'))=0) then raise exception 'Nonempty text options required'; end if;
    end if;
    seen:=array_append(seen,q->>'id');
  end loop;
  insert into public.survey_versions(id,title,questions) values(p_operation,title,p_request->'questions');
  return wsd_private.finish_operation(p_operation,jsonb_build_object('version_id',p_operation));
end;
$$;
create function public.submit_solo_survey(p_operation uuid,p_request jsonb) returns jsonb
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

-- The client previews rows first. The entire accepted batch commits or rolls back.
create function public.import_solo_data(p_operation uuid,p_request jsonb) returns jsonb
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
revoke all on function public.publish_solo_survey(uuid,jsonb),public.submit_solo_survey(uuid,jsonb),
  public.import_solo_data(uuid,jsonb) from public,anon;
grant execute on function public.publish_solo_survey(uuid,jsonb),public.submit_solo_survey(uuid,jsonb),
  public.import_solo_data(uuid,jsonb) to authenticated;
commit;
