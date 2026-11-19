begin;

alter table public.orders add column recipient_snapshot jsonb;
alter table public.order_lines add column product_snapshot jsonb;
alter table public.payments
  add column entry_type text not null default 'legacy'
    check (entry_type in ('legacy','receipt','refund','reversal')),
  add column original_receipt_id uuid references public.payments(id),
  add column operation_id uuid;

create table wsd_private.operations (
  id uuid primary key,
  request jsonb not null,
  result jsonb,
  created_at timestamptz not null default now()
);
revoke all on wsd_private.operations from public, anon, authenticated;

create table public.collection_reminders (
  order_id uuid primary key references public.orders(id),
  scheduled_at timestamptz,
  status text not null check (status in ('pending','settled')),
  updated_at timestamptz not null default now(),
  check ((status = 'pending' and scheduled_at is not null) or status = 'settled')
);
create table public.reminder_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  operation_id uuid not null,
  scheduled_at timestamptz,
  status text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create trigger reminder_history_append_only before update or delete on public.reminder_history
  for each row execute function public.forbid_change();
alter table public.collection_reminders enable row level security;
alter table public.reminder_history enable row level security;
create policy solo_read on public.collection_reminders for select to authenticated
  using ((select wsd_private.is_solo_owner()));
create policy solo_read on public.reminder_history for select to authenticated
  using ((select wsd_private.is_solo_owner()));
revoke all on public.collection_reminders, public.reminder_history from public, anon, authenticated;
grant select on public.collection_reminders, public.reminder_history to authenticated;
create index collection_reminders_due on public.collection_reminders(scheduled_at) where status='pending';
create index payments_order_events on public.payments(order_id, collected_at);

create view public.solo_invoice_balances with (security_invoker=true) as
select o.id, o.invoice_no, o.outlet_id, o.created_at, o.due_date, o.recipient_snapshot,
  s.total, coalesce(p.collected,0) as collected,
  greatest(s.total-coalesce(p.collected,0),0) as outstanding,
  greatest(coalesce(p.collected,0)-s.total,0) as overpayment,
  case when coalesce(p.collected,0)>=s.total then 'Paid'
    when coalesce(p.collected,0)>0 then 'Partially paid' else 'Unpaid' end as payment_status,
  s.snapshot_complete
from public.orders o
join (select order_id, sum(line_total) as total,
  bool_and(product_snapshot is not null) as snapshot_complete from public.order_lines group by order_id) s on s.order_id=o.id
left join (select order_id,sum(amount) as collected from public.payments
  where order_id is not null group by order_id) p on p.order_id=o.id;
grant select on public.solo_invoice_balances to authenticated;

create function wsd_private.begin_operation(p_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior wsd_private.operations;
begin
  if not wsd_private.is_solo_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if p_id is null or p_request is null or jsonb_typeof(p_request)<>'object' then
    raise exception 'Operation UUID and object payload required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('wsd.operation.'||p_id::text,0));
  select * into prior from wsd_private.operations where id=p_id;
  if found then
    if prior.request<>p_request then raise exception 'Operation UUID reused with a different payload' using errcode='22023'; end if;
    return prior.result;
  end if;
  insert into wsd_private.operations(id,request) values(p_id,p_request);
  return null;
end;
$$;
create function wsd_private.finish_operation(p_id uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  update wsd_private.operations set result=p_result where id=p_id;
  return p_result;
end;
$$;
create function wsd_private.refresh_reminder(p_order uuid,p_operation uuid,p_reason text,p_schedule timestamptz default null)
returns void language plpgsql security definer set search_path='' as $$
declare due numeric; old public.collection_reminders; target timestamptz; state text;
begin
  select outstanding into strict due from public.solo_invoice_balances where id=p_order;
  select * into old from public.collection_reminders where order_id=p_order;
  state:=case when due=0 then 'settled' else 'pending' end;
  target:=case when due=0 then null else coalesce(p_schedule,
    case when old.status='pending' then old.scheduled_at end,
    ((now() at time zone 'Asia/Baghdad') + interval '4 days') at time zone 'Asia/Baghdad') end;
  insert into public.collection_reminders(order_id,scheduled_at,status)
    values(p_order,target,state) on conflict(order_id) do update
    set scheduled_at=excluded.scheduled_at,status=excluded.status,updated_at=now();
  insert into public.reminder_history(order_id,operation_id,scheduled_at,status,reason)
    values(p_order,p_operation,target,state,p_reason);
end;
$$;
revoke all on function wsd_private.begin_operation(uuid,jsonb),
  wsd_private.finish_operation(uuid,jsonb),
  wsd_private.refresh_reminder(uuid,uuid,text,timestamptz) from public,anon,authenticated;

-- One call issues the invoice, snapshots lines, posts its receipt and schedules its reminder.
create function public.issue_solo_invoice(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; outlet public.outlets; invoice public.orders; product public.products;
  item jsonb; item_count integer; total numeric(14,2):=0; qty integer;
  initial_amount numeric(14,2); method public.payment_method; terms integer; visit uuid;
begin
  prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','issue','payload',p_request));
  if prior is not null then return prior; end if;
  if p_request is null or jsonb_typeof(p_request)<>'object' then raise exception 'Invoice payload required'; end if;
  select * into strict outlet from public.outlets where id=(p_request->>'outlet_id')::uuid and archived_at is null for update;
  terms:=(p_request->>'terms_days')::integer;
  if terms is null or terms not between 0 and 365 then raise exception 'Valid terms required'; end if;
  visit:=(p_request->>'visit_id')::uuid;
  if visit is not null then
    perform public.start_solo_visit(visit,outlet.id,'order');
  end if;
  if jsonb_typeof(p_request->'items') is distinct from 'array' then raise exception 'Items required'; end if;
  item_count:=jsonb_array_length(p_request->'items');
  if item_count not between 1 and 100 then raise exception 'Use 1 to 100 items'; end if;
  if (select count(distinct x->>'sku_id') from jsonb_array_elements(p_request->'items') x)<>item_count then
    raise exception 'Duplicate SKU'; end if;
  initial_amount:=(p_request->>'initial_amount')::numeric;
  method:=(p_request->>'method')::public.payment_method;
  if initial_amount is null or initial_amount<0 or method is null
    or initial_amount<>(p_request->>'initial_amount')::numeric then raise exception 'Valid initial amount and method required'; end if;
  insert into public.orders(id,outlet_id,rep_id,visit_id,payment_type,due_date,next_visit,recipient_snapshot)
  values(p_operation,outlet.id,auth.uid(),visit,case when terms=0 then 'cash'::public.payment_type else 'credit'::public.payment_type end,
    (now() at time zone 'Asia/Baghdad')::date+terms,(p_request->>'next_visit')::date,
    jsonb_build_object('name',outlet.retail_name,'code',outlet.code,'address',outlet.address,
      'province',outlet.province,'area',outlet.area,'owner_name',outlet.owner_name,'owner_phone',outlet.owner_phone))
  returning * into invoice;
  for item in select * from jsonb_array_elements(p_request->'items') loop
    select * into strict product from public.products where id=(item->>'sku_id')::uuid and active and currency='IQD' for share;
    qty:=(item->>'quantity')::integer;
    if qty is null or qty<=0 or qty::numeric<>(item->>'quantity')::numeric
      or product.wholesale_price='NaN'::numeric or (item->>'price')::numeric is distinct from product.wholesale_price then
      raise exception 'SKU price or quantity changed. Reload and review.'; end if;
    total:=total+qty*product.wholesale_price;
    insert into public.order_lines(id,order_id,product_id,quantity,unit_price,unit_cost,product_snapshot)
    values(gen_random_uuid(),invoice.id,product.id,qty,product.wholesale_price,product.cost_price,
      jsonb_build_object('sku',product.sku,'product_line',product.product_line,'flavour',product.flavour,'brand',product.brand));
  end loop;
  if total<=0 or initial_amount>total then raise exception 'Initial receipt exceeds invoice total or invoice has no value'; end if;
  if initial_amount>0 then
    insert into public.payments(id,outlet_id,order_id,visit_id,amount,method,collected_at,entry_type,operation_id)
    values(gen_random_uuid(),outlet.id,invoice.id,visit,initial_amount,method,now(),'receipt',p_operation);
  end if;
  perform wsd_private.refresh_reminder(invoice.id,p_operation,'issued');
  return wsd_private.finish_operation(p_operation,jsonb_build_object('order_id',invoice.id,'invoice_no',invoice.invoice_no));
end;
$$;

-- Receipt, refund and correction serialize on the same invoice row.
create function public.post_solo_collection(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; invoice public.orders; original public.payments;
  amount numeric(14,2); method public.payment_method; kind text; reason text; due numeric;
  remaining numeric; receipt_id uuid:=gen_random_uuid();
begin
  prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','collection','payload',p_request));
  if prior is not null then return prior; end if;
  select * into strict invoice from public.orders where id=(p_request->>'order_id')::uuid for update;
  if invoice.outlet_id is distinct from (p_request->>'outlet_id')::uuid then raise exception 'Invoice and outlet mismatch'; end if;
  if exists(select 1 from public.payments p where p.order_id=invoice.id
      and p.entry_type='legacy' and p.amount<0 and p.original_receipt_id is null) then
    raise exception 'Reconcile legacy unlinked negative payments before posting collections';
  end if;
  amount:=(p_request->>'amount')::numeric;
  method:=(p_request->>'method')::public.payment_method;
  kind:=p_request->>'kind'; reason:=nullif(trim(p_request->>'reason'),'');
  if amount is null or amount<0 or amount<>(p_request->>'amount')::numeric or method is null
    or kind is null or kind not in ('receipt','refund','correction') then raise exception 'Invalid collection'; end if;
  select outstanding into strict due from public.solo_invoice_balances where id=invoice.id;
  if kind='receipt' then
    if amount<=0 or amount>due then raise exception 'Receipt exceeds outstanding balance'; end if;
  else
    if reason is null then raise exception 'Reason required'; end if;
    select p.* into strict original from public.payments p
      where p.id=(p_request->>'receipt_id')::uuid and p.order_id=invoice.id
      and p.outlet_id=invoice.outlet_id and p.amount>0 and p.entry_type in ('receipt','legacy') for update;
    select original.amount+coalesce(sum(p.amount),0) into remaining from public.payments p
      where p.original_receipt_id=original.id;
    if kind='refund' then
      if amount<=0 or amount>remaining then raise exception 'Refund exceeds refundable receipt'; end if;
    else
      if exists(select 1 from public.payments where original_receipt_id=original.id) then
        raise exception 'Correct only a receipt with no refund or prior correction'; end if;
      if amount>original.amount+due then raise exception 'Replacement receipt exceeds invoice balance'; end if;
      insert into public.payments(id,outlet_id,order_id,amount,method,note,collected_at,entry_type,original_receipt_id,operation_id)
      values(gen_random_uuid(),invoice.outlet_id,invoice.id,-original.amount,original.method,reason,now(),'reversal',original.id,p_operation);
    end if;
  end if;
  if amount>0 then
    insert into public.payments(id,outlet_id,order_id,amount,method,note,collected_at,entry_type,original_receipt_id,operation_id)
    values(receipt_id,invoice.outlet_id,invoice.id,case when kind='refund' then -amount else amount end,
      method,reason,now(),case when kind='refund' then 'refund' else 'receipt' end,
      case when kind='refund' then original.id else null end,p_operation);
  end if;
  perform wsd_private.refresh_reminder(invoice.id,p_operation,kind);
  return wsd_private.finish_operation(p_operation,jsonb_build_object('order_id',invoice.id,'entry_id',case when amount>0 then receipt_id end));
end;
$$;

create function public.reschedule_solo_reminder(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; invoice public.orders; schedule timestamptz; due numeric;
begin
  prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','reschedule','payload',p_request));
  if prior is not null then return prior; end if;
  select * into strict invoice from public.orders where id=(p_request->>'order_id')::uuid for update;
  select outstanding into strict due from public.solo_invoice_balances where id=invoice.id;
  schedule:=(p_request->>'scheduled_at')::timestamptz;
  if due<=0 or schedule is null or schedule<=now() then raise exception 'Future reminder and outstanding invoice required'; end if;
  perform wsd_private.refresh_reminder(invoice.id,p_operation,'rescheduled',schedule);
  return wsd_private.finish_operation(p_operation,jsonb_build_object('order_id',invoice.id,'scheduled_at',schedule));
end;
$$;
revoke all on function public.issue_solo_invoice(uuid,jsonb),public.post_solo_collection(uuid,jsonb),
  public.reschedule_solo_reminder(uuid,jsonb) from public,anon;
grant execute on function public.issue_solo_invoice(uuid,jsonb),public.post_solo_collection(uuid,jsonb),
  public.reschedule_solo_reminder(uuid,jsonb) to authenticated;

-- Retain the legacy entry point while routing it through the same transaction.
create or replace function public.submit_retail_order(p_id uuid,p_outlet uuid,p_terms integer,p_next_visit date,p_items jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare result jsonb; legacy public.orders; expected jsonb; stored jsonb;
begin
  if not wsd_private.is_solo_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  select * into legacy from public.orders where id=p_id;
  if found and not exists(select 1 from wsd_private.operations where id=p_id) then
    select jsonb_agg(jsonb_build_object('sku_id',l.product_id,'quantity',l.quantity,'price',l.unit_price) order by l.product_id)
      into stored from public.order_lines l where l.order_id=p_id;
    select jsonb_agg(jsonb_build_object('sku_id',(x->>'sku_id')::uuid,'quantity',(x->>'quantity')::integer,
      'price',(x->>'price')::numeric) order by (x->>'sku_id')::uuid) into expected from jsonb_array_elements(p_items) x;
    if legacy.outlet_id is distinct from p_outlet or legacy.rep_id is distinct from auth.uid()
      or legacy.visit_id is not null or stored is distinct from expected or p_terms is null
      or legacy.due_date is distinct from ((legacy.created_at at time zone 'Asia/Baghdad')::date+p_terms)
      or legacy.next_visit is distinct from p_next_visit then raise exception 'Legacy order retry payload mismatch'; end if;
    return legacy.invoice_no;
  end if;
  result:=public.issue_solo_invoice(p_id,jsonb_build_object('outlet_id',p_outlet,'terms_days',p_terms,
    'items',p_items,'next_visit',p_next_visit,'initial_amount',0,'method','cash'));
  return (result->>'invoice_no')::bigint;
end;
$$;
revoke insert,update,delete,truncate on public.orders,public.order_lines,public.payments from public,anon,authenticated;
commit;
