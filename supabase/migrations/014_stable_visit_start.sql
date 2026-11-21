-- #59: persist candidate-to-resolved visit identity, including reused stops.
-- Source-only until reviewed; no existing visits, invoices or survey rows rewritten.
begin;
create or replace function public.open_solo_visit_v2(p_id uuid,p_outlet uuid,p_source text) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior jsonb; resolved uuid; candidate public.visits;
begin
 if p_id is null or p_outlet is null or p_source is null or p_source not in ('order','survey') then
  raise exception 'Visit ID, client and valid start source required' using errcode='22023'; end if;
 prior:=wsd_private.begin_operation(p_id,jsonb_build_object('action','open_shared_visit','outlet_id',p_outlet,'source',p_source));
 -- Replay is resolved before looking for a newer open visit. Closed results stay closed.
 if prior is not null then return (prior->>'visit_id')::uuid; end if;
 perform 1 from public.outlets where id=p_outlet and archived_at is null for update;
 if not found then raise exception 'Sync or select an active client first' using errcode='22023'; end if;
 select * into candidate from public.visits where id=p_id;
 if found then
  if candidate.outlet_id is distinct from p_outlet or candidate.rep_id is distinct from auth.uid() then
   raise exception 'Visit identity does not match this client' using errcode='22023'; end if;
  if candidate.checked_out_at is not null then
   raise exception 'This visit has ended. Saved records must be reviewed before starting another.' using errcode='22023'; end if;
  resolved:=candidate.id;
 else
  select id into resolved from public.visits where outlet_id=p_outlet and rep_id=auth.uid()
   and checked_out_at is null order by checked_in_at,id limit 1;
  if resolved is null then resolved:=public.start_solo_visit(p_id,p_outlet,p_source); end if;
 end if;
 perform wsd_private.finish_operation(p_id,jsonb_build_object('visit_id',resolved));
 return resolved;
end;
$$;
-- Existing clients retain their entry point; updated clients require the v2 RPC
-- so a frontend preview cannot silently use the unpatched server implementation.
create or replace function public.open_solo_visit(p_id uuid,p_outlet uuid,p_source text) returns uuid
language sql security invoker set search_path='' as $$
 select public.open_solo_visit_v2(p_id,p_outlet,p_source);
$$;
revoke all on function public.open_solo_visit_v2(uuid,uuid,text) from public,anon;
grant execute on function public.open_solo_visit_v2(uuid,uuid,text) to authenticated;
revoke all on function public.open_solo_visit(uuid,uuid,text) from public,anon;
grant execute on function public.open_solo_visit(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
