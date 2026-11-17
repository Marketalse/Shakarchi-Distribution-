begin;

create schema wsd_private;
revoke all on schema wsd_private from public;

create table wsd_private.solo_owner (
  singleton boolean primary key default true check (singleton),
  profile_id uuid not null unique references public.profiles(id)
);

-- Existing projects with multiple active owners require a DBA decision.
-- A fresh installation remains closed until a DBA provisions its owner.
insert into wsd_private.solo_owner (profile_id)
select id from public.profiles where role = 'owner' and active;

create function wsd_private.is_solo_owner()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from wsd_private.solo_owner owner
    join public.profiles profile on profile.id = owner.profile_id
    where profile.id = auth.uid() and profile.role = 'owner' and profile.active
  );
$$;

-- Restrictive policies are combined with the existing operation-specific policies.
do $$
declare
  relation text;
begin
  foreach relation in array array[
    'profiles', 'outlets', 'products', 'survey_brands', 'visits',
    'survey_answers', 'orders', 'order_lines', 'payments', 'market_observations'
  ] loop
    execute format(
      'create policy solo_owner_only on public.%I as restrictive for all
       using ((select wsd_private.is_solo_owner()))
       with check ((select wsd_private.is_solo_owner()))',
      relation
    );
  end loop;
end;
$$;

create policy solo_market_storage on storage.objects as restrictive for all
  using (bucket_id <> 'market-surveys' or (select wsd_private.is_solo_owner()))
  with check (bucket_id <> 'market-surveys' or (select wsd_private.is_solo_owner()));

-- This legacy definer function otherwise bypasses the new outlet policy.
alter function public.nearby_outlets(double precision, double precision, integer)
  security invoker;
revoke execute on function public.nearby_outlets(double precision, double precision, integer)
  from public, anon;
grant execute on function public.nearby_outlets(double precision, double precision, integer)
  to authenticated;

alter table public.profiles
  add column phone text,
  add column updated_at timestamptz not null default now();
alter table public.outlets add column archived_at timestamptz;

create function wsd_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function wsd_private.touch_updated_at();
create trigger outlets_touch_updated_at before update on public.outlets
  for each row execute function wsd_private.touch_updated_at();

revoke insert, update, delete, truncate on public.profiles from public, anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
create policy solo_profile_self_update on public.profiles as restrictive for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant update on public.outlets to authenticated;

alter table public.visits alter column outcome drop not null;
alter table public.visits add column start_source text;
alter table public.visits add constraint visit_start_source_or_outcome
  check (
    (start_source is null or start_source in ('order', 'survey'))
    and (outcome is not null or start_source is not null)
  );

create function public.start_solo_visit(p_id uuid, p_outlet uuid, p_source text)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
begin
  if p_id is null or p_outlet is null or p_source is null or p_source not in ('order', 'survey') then
    raise exception 'A visit ID, outlet and valid start source are required' using errcode = '22023';
  end if;

  -- Resume an existing visit even if the second activity has a different source.
  if exists (
    select 1 from public.visits
    where id = p_id and outlet_id = p_outlet and rep_id = auth.uid() and checked_out_at is null
  ) then
    return p_id;
  end if;

  insert into public.visits (id, outlet_id, rep_id, checked_in_at, start_source)
  select p_id, outlet.id, auth.uid(), now(), p_source
  from public.outlets outlet where outlet.id = p_outlet and outlet.archived_at is null
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.visits
    where id = p_id and outlet_id = p_outlet and rep_id = auth.uid() and checked_out_at is null
  ) then
    raise exception 'Cannot start or resume this visit' using errcode = '22023';
  end if;
  return p_id;
end;
$$;
revoke execute on function public.start_solo_visit(uuid, uuid, text) from public, anon;
grant execute on function public.start_solo_visit(uuid, uuid, text) to authenticated;

commit;
