-- Issue #25: preserve identity and retry safety for profile edits and market capture.
begin;
create function public.update_solo_client(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; current public.outlets; changed public.outlets; fields jsonb; key text;
begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','update_client','payload',p_request));
 if prior is not null then return prior; end if;
 select * into strict current from public.outlets where id=(p_request->>'outlet_id')::uuid and archived_at is null for update;
 if (p_request->>'expected_updated_at')::timestamptz is distinct from current.updated_at then
  raise exception 'Client changed. Reload before editing.' using errcode='22023'; end if;
 fields:=p_request->'fields';
 if jsonb_typeof(fields) is distinct from 'object' then raise exception 'Client fields required' using errcode='22023'; end if;
 for key in select jsonb_object_keys(fields) loop
  if key not in ('retail_name','owner_name','owner_phone','shop_phone','staff_name','staff_phone','address','province','area','outlet_type','relationship') then
   raise exception 'Unsupported client field' using errcode='22023'; end if;
 end loop;
 changed:=jsonb_populate_record(current,fields);
 if nullif(trim(changed.retail_name),'') is null or nullif(trim(changed.province),'') is null
  or nullif(trim(changed.area),'') is null or nullif(trim(changed.outlet_type),'') is null or changed.relationship is null then
  raise exception 'Client name, province, area, type and relationship required' using errcode='22023'; end if;
 update public.outlets set retail_name=trim(changed.retail_name),owner_name=changed.owner_name,owner_phone=changed.owner_phone,
  shop_phone=changed.shop_phone,staff_name=changed.staff_name,staff_phone=changed.staff_phone,address=changed.address,
  province=trim(changed.province),area=trim(changed.area),outlet_type=trim(changed.outlet_type),relationship=changed.relationship
 where id=current.id;
 return wsd_private.finish_operation(p_operation,jsonb_build_object('outlet_id',current.id));
end;
$$;
revoke all on function public.update_solo_client(uuid,jsonb) from public,anon;
grant execute on function public.update_solo_client(uuid,jsonb) to authenticated;

create function public.submit_solo_observation(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; price numeric;
begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','market_observation','payload',p_request));
 if prior is not null then return prior; end if;
 if p_request->>'currency' is distinct from 'USD' then raise exception 'USD confirmation required' using errcode='22023'; end if;
 price:=(p_request->>'price')::numeric;
 if price is not null and (price<0 or price='NaN'::numeric or price<>round(price,2)) then
  raise exception 'Use a nonnegative USD price with at most two decimals' using errcode='22023'; end if;
 if (p_request->>'facings')::numeric<0 or (p_request->>'facings')::numeric<>trunc((p_request->>'facings')::numeric) then
  raise exception 'Facings must be a nonnegative whole number' using errcode='22023'; end if;
 perform public.start_solo_visit((p_request->>'visit_id')::uuid,(p_request->>'outlet_id')::uuid,'survey');
 insert into public.market_observations(id,outlet_id,visit_id,created_by,kind,brand_id,product_id,brand,model,
  price,offer,available,facings,shelf_width_cm,photo_path,currency)
 values(p_operation,(p_request->>'outlet_id')::uuid,(p_request->>'visit_id')::uuid,auth.uid(),p_request->>'kind',
  (p_request->>'brand_id')::uuid,(p_request->>'product_id')::uuid,'','',price,p_request->>'offer',
  (p_request->>'available')::boolean,(p_request->>'facings')::integer,(p_request->>'shelf_width_cm')::numeric,
  p_request->>'photo_path','USD');
 return wsd_private.finish_operation(p_operation,jsonb_build_object('observation_id',p_operation));
end;
$$;
revoke all on function public.submit_solo_observation(uuid,jsonb) from public,anon;
grant execute on function public.submit_solo_observation(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
