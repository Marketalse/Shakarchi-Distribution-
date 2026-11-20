-- #29: client location is captured once; only the explicit correction RPC replaces it.
begin;
set local lock_timeout='5s';
alter table public.outlets
 add column location_accuracy double precision,
 add column location_captured_at timestamptz,
 add column location_source text,
 add constraint client_coordinate_bounds check(lat between -90 and 90 and lng between -180 and 180),
 add constraint client_location_evidence check(
  (location_accuracy is null or (location_accuracy>=0 and location_accuracy<'Infinity'::double precision))
  and (location_source is null or location_source='device_gps')
  and (location_source is null or (location_accuracy is not null and location_captured_at is not null))
 );

-- Keep ordinary profile updates available, but coordinates/quality require a named operation.
revoke update on public.outlets from public,anon,authenticated;
do $$
declare columns text;
begin
 select string_agg(quote_ident(column_name),',') into columns from information_schema.columns
 where table_schema='public' and table_name='outlets'
 and column_name not in ('lat','lng','location_accuracy','location_captured_at','location_source');
 execute 'grant update('||columns||') on public.outlets to authenticated';
end;
$$;

create function public.correct_solo_client_location(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; client public.outlets; v_lat double precision; v_lng double precision;
 accuracy double precision; stamp timestamptz; reason text;
begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','correct_client_location','payload',p_request));
 if prior is not null then return prior; end if;
 select * into strict client from public.outlets where id=(p_request->>'outlet_id')::uuid and archived_at is null for update;
 if client.updated_at is distinct from (p_request->>'expected_updated_at')::timestamptz then
  raise exception 'Client changed. Sync and reload before correcting its location.' using errcode='22023'; end if;
 v_lat:=(p_request->>'lat')::double precision; v_lng:=(p_request->>'lng')::double precision;
 accuracy:=(p_request->>'location_accuracy')::double precision;
 stamp:=(p_request->>'location_captured_at')::timestamptz;
 reason:=nullif(trim(p_request->>'reason'),'');
 if v_lat is null or v_lng is null or not(v_lat between -90 and 90 and v_lng between -180 and 180)
  or accuracy is null or not(accuracy>=0 and accuracy<'Infinity'::double precision) or stamp is null or reason is null then
  raise exception 'Valid captured coordinates, accuracy, capture time and correction reason required' using errcode='22023'; end if;
 update public.outlets set lat=v_lat,lng=v_lng,location_accuracy=accuracy,location_captured_at=stamp,location_source='device_gps'
 where id=client.id;
 return wsd_private.finish_operation(p_operation,jsonb_build_object('outlet_id',client.id,
  'previous_location',jsonb_build_object('lat',client.lat,'lng',client.lng,'accuracy',client.location_accuracy),
  'location',jsonb_build_object('lat',v_lat,'lng',v_lng,'accuracy',accuracy)));
end;
$$;
revoke all on function public.correct_solo_client_location(uuid,jsonb) from public,anon;
grant execute on function public.correct_solo_client_location(uuid,jsonb) to authenticated;

create function wsd_private.prevent_visit_location_capture() returns trigger
language plpgsql set search_path='' as $$
begin
 if (tg_op='INSERT' and (new.lat is not null or new.lng is not null))
  or (tg_op='UPDATE' and (new.lat is distinct from old.lat or new.lng is distinct from old.lng)) then
  raise exception 'Visits reuse the client location. Refresh the app; no new visit coordinates are accepted.' using errcode='22023';
 end if;
 return new;
end;
$$;
create trigger visits_no_new_coordinates before insert or update on public.visits
 for each row execute function wsd_private.prevent_visit_location_capture();
notify pgrst,'reload schema';
commit;
