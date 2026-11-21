-- #48: additive owner settings only. Never rewrites existing outlet geography.
begin;
create table public.service_areas (
 id text primary key check(id in ('mosul','kirkuk','salah-aldin')),
 label text not null,
 province text not null,
 active boolean not null default true,
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 check((id='mosul' and label='Mosul' and province='Nineveh') or
       (id='kirkuk' and label='Kirkuk' and province='Kirkuk') or
       (id='salah-aldin' and label='Salah Aldin' and province='Saladin'))
);
insert into public.service_areas(id,label,province) values
 ('mosul','Mosul','Nineveh'),('kirkuk','Kirkuk','Kirkuk'),('salah-aldin','Salah Aldin','Saladin');
alter table public.service_areas enable row level security;
revoke all on public.service_areas from public,anon,authenticated;
grant select on public.service_areas to authenticated;
create policy service_areas_owner_read on public.service_areas for select to authenticated
 using ((select wsd_private.is_solo_owner()));
create function public.set_solo_service_area(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; area public.service_areas; result jsonb;
begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','service_area','payload',p_request));
 if prior is not null then return prior; end if;
 if p_request is null or jsonb_typeof(p_request)<>'object' or
    (p_request - array['id','active','expected_version'])<>'{}'::jsonb or
    jsonb_typeof(p_request->'active') is distinct from 'boolean' or
    jsonb_typeof(p_request->'expected_version') is distinct from 'number' then
  raise exception 'Area ID, active flag and expected version required' using errcode='22023';
 end if;
 select * into strict area from public.service_areas where id=p_request->>'id' for update;
 if area.version::numeric is distinct from (p_request->>'expected_version')::numeric then
  raise exception 'Area changed. Reload before editing.' using errcode='22023';
 end if;
 update public.service_areas set active=(p_request->>'active')::boolean,
  version=version+1,updated_at=clock_timestamp() where id=area.id returning to_jsonb(service_areas.*) into result;
 return wsd_private.finish_operation(p_operation,result);
end;
$$;
revoke all on function public.set_solo_service_area(uuid,jsonb) from public,anon;
grant execute on function public.set_solo_service_area(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
