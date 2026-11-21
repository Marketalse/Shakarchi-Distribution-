-- New invoices: Cash due today, or explicit credit from4through10days.
-- Preserve the existing operation envelope and accepted invoice replay.
begin;
set local lock_timeout='5s';
alter function public.issue_solo_invoice_v2(uuid,jsonb) set schema wsd_private;
revoke all on function wsd_private.issue_solo_invoice_v2(uuid,jsonb) from public,anon,authenticated;
create function public.issue_solo_invoice_v2(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; days numeric;
begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','issue_v2','payload',p_request));
 if prior is not null then return prior; end if;
 days:=(p_request->>'terms_days')::numeric;
 if days is null or days<>trunc(days) or not(days=0 or days between 4 and 10) then
  raise exception 'Choose Cash due today or credit from 4 to 10 days. Saved requests are retained for review.' using errcode='55000';
 end if;
 return wsd_private.issue_solo_invoice_v2(p_operation,p_request);
end;
$$;
revoke all on function public.issue_solo_invoice_v2(uuid,jsonb) from public,anon;
grant execute on function public.issue_solo_invoice_v2(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
