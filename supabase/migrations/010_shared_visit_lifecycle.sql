-- Issue #24: one open shop stop per owner/outlet, with explicit completion.
begin;
create function public.open_solo_visit(p_id uuid,p_outlet uuid,p_source text) returns uuid
language plpgsql security definer set search_path='' as $$
declare visit uuid;
begin
 if not wsd_private.is_solo_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if p_id is null or p_source is null or p_source not in ('order','survey') then
  raise exception 'Visit ID and valid start source required' using errcode='22023'; end if;
 perform 1 from public.outlets where id=p_outlet and archived_at is null for update;
 if not found then raise exception 'Sync or select an active client first' using errcode='22023'; end if;
 select id into visit from public.visits where outlet_id=p_outlet and rep_id=auth.uid()
  and checked_out_at is null order by checked_in_at,id limit 1;
 if visit is not null then return visit; end if;
 -- A replay of an old start must not silently create a new shop stop.
 if exists(select 1 from public.visits where id=p_id) then
  raise exception 'This visit has ended. Start a new visit.' using errcode='22023'; end if;
 return public.start_solo_visit(p_id,p_outlet,p_source);
end;
$$;
revoke all on function public.open_solo_visit(uuid,uuid,text) from public,anon;
grant execute on function public.open_solo_visit(uuid,uuid,text) to authenticated;

create function public.finish_solo_visit(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; visit public.visits; result public.visit_outcome;
begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','finish_visit','payload',p_request));
 if prior is not null then return prior; end if;
 select * into strict visit from public.visits where id=(p_request->>'visit_id')::uuid and rep_id=auth.uid() for update;
 if visit.checked_out_at is null then
  result:=case when exists(select 1 from public.orders where visit_id=visit.id) then 'order_taken'::public.visit_outcome
    else coalesce((p_request->>'outcome')::public.visit_outcome,'survey_only'::public.visit_outcome) end;
  update public.visits set checked_out_at=clock_timestamp(),outcome=result where id=visit.id;
 end if;
 return wsd_private.finish_operation(p_operation,jsonb_build_object('visit_id',visit.id));
end;
$$;
revoke all on function public.finish_solo_visit(uuid,jsonb) from public,anon;
grant execute on function public.finish_solo_visit(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
