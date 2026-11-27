-- Bind a newly issued invoice to the immutable manual IQD rate active at issue time.
-- Existing orders remain NULL and are deliberately not backfilled.
begin;
set local lock_timeout='5s';

alter table public.orders
  add column fx_rate_version_id uuid references public.fx_rate_versions(id);
comment on column public.orders.fx_rate_version_id is
  'Immutable manual USD-to-IQD rate version captured when this invoice was issued; NULL means no reliable order-date rate is available.';

create function wsd_private.capture_order_fx_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
declare stamp timestamptz:=clock_timestamp(); captured_rate uuid;
begin
  if not wsd_private.is_solo_owner() then
    raise exception 'Owner access required' using errcode='42501';
  end if;

  -- created_at and the selected rate use one timestamp. A pending/replayed
  -- accepted command exits before this insert and retains its original result.
  new.created_at:=stamp;
  new.fx_rate_version_id:=null;
  select r.id into captured_rate
    from wsd_private.fx_current_rate c
    join public.fx_rate_versions r on r.id=c.rate_id
   where c.singleton and r.rate_timestamp<=stamp and r.valid_until>stamp
   for share of c;
  new.fx_rate_version_id:=captured_rate;
  return new;
end;
$$;
revoke all on function wsd_private.capture_order_fx_snapshot() from public,anon,authenticated;
create trigger orders_capture_fx_snapshot
  before insert on public.orders
  for each row execute function wsd_private.capture_order_fx_snapshot();

create or replace view public.solo_invoice_balances with (security_invoker=true) as
select o.id, o.invoice_no, o.outlet_id, o.created_at, o.due_date, o.recipient_snapshot,
  s.total, coalesce(p.collected,0) as collected,
  greatest(s.total-coalesce(p.collected,0),0) as outstanding,
  greatest(coalesce(p.collected,0)-s.total,0) as overpayment,
  case when coalesce(p.collected,0)>=s.total then 'Paid'
    when coalesce(p.collected,0)>0 then 'Partially paid' else 'Unpaid' end as payment_status,
  s.snapshot_complete,
  fx.exchange_rate_used as fx_exchange_rate_used,
  fx.rate_timestamp as fx_rate_timestamp
from public.orders o
join (select order_id, sum(line_total) as total,
  bool_and(product_snapshot is not null) as snapshot_complete
  from public.order_lines group by order_id) s on s.order_id=o.id
left join (select order_id,sum(amount) as collected from public.payments
  where order_id is not null group by order_id) p on p.order_id=o.id
left join public.fx_rate_versions fx on fx.id=o.fx_rate_version_id;

notify pgrst,'reload schema';
commit;
