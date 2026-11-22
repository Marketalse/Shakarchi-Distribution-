-- M6.Q1: read-only owner-authorized snapshot. Never publish its live result in Git.
with clock as (
 select now() as at, (now() at time zone 'Asia/Baghdad')::date as day
), report_window as (
 select *, ((day-6)::timestamp at time zone 'Asia/Baghdad') as starts,
 ((day+1)::timestamp at time zone 'Asia/Baghdad') as ends from clock
), invoice as (select * from public.solo_invoice_balances),
line_totals as (select order_id,sum(line_total) as amount from public.order_lines group by order_id),
cash_totals as (select order_id,sum(amount) as amount from public.payments group by order_id),
review as (
 select 'Client '||dense_rank()over(order by i.outlet_id) as client_alias,
 'INV-'||lpad(i.invoice_no::text,4,'0') as invoice_label,
 '/admin/orders?invoice='||i.id::text as route,
 i.outstanding::text as amount,i.due_date,r.scheduled_at,
 case when i.due_date<w.day then 'overdue' when r.scheduled_at<=w.at then 'reminder_due' else 'upcoming' end as reason,
 case when i.due_date<w.day then 0 when r.scheduled_at<=w.at then 1 else 2 end as priority
 from invoice i cross join report_window w
 left join public.collection_reminders r on r.order_id=i.id and r.status='pending'
 where i.outstanding>0 and (i.due_date<w.day or r.scheduled_at<=w.at+interval '7 days')
)
select jsonb_build_object(
 'source','M6.Q1 / solo_invoice_balances + payments + collection_reminders',
 'migration_head',(select max(version) from supabase_migrations.schema_migrations),
 'as_of',w.at,'timezone','Asia/Baghdad','period_start',w.starts,'period_end',w.ends,'today_partial',true,
 'metrics',jsonb_build_object(
  'invoice_count',(select count(*) from invoice where created_at>=w.starts and created_at<w.ends),
  'invoiced_sales',(select coalesce(sum(total),0)::text from invoice where created_at>=w.starts and created_at<w.ends),
  'net_collections',(select coalesce(sum(amount),0)::text from public.payments where collected_at>=w.starts and collected_at<w.ends),
  'current_outstanding',(select coalesce(sum(outstanding),0)::text from invoice),
  'current_overpayments',(select coalesce(sum(overpayment),0)::text from invoice),
  'current_overdue',(select coalesce(sum(outstanding),0)::text from invoice where due_date<w.day),
  'unknown_aging',(select coalesce(sum(outstanding),0)::text from invoice where due_date is null),
  'unallocated_cash',(select coalesce(sum(p.amount),0)::text from public.payments p left join invoice i on i.id=p.order_id where i.id is null),
  'unallocated_entries',(select count(*) from public.payments p left join invoice i on i.id=p.order_id where i.id is null),
  'reminders_due',(select count(*) from public.collection_reminders r join invoice i on i.id=r.order_id where r.status='pending' and r.scheduled_at<=w.at and i.outstanding>0)
 ),
 'checks',jsonb_build_object(
  'line_totals_match',not exists(select 1 from invoice i left join line_totals l on l.order_id=i.id where i.total is distinct from l.amount),
  'cash_reconciles',not exists(select 1 from invoice i left join cash_totals p on p.order_id=i.id where i.collected is distinct from coalesce(p.amount,0)),
  'balances_valid',not exists(select 1 from invoice where outstanding is distinct from greatest(total-collected,0) or overpayment is distinct from greatest(collected-total,0)),
  'all_orders_reportable',not exists(select 1 from public.orders o left join invoice i on i.id=o.id where i.id is null)
 ),
 'candidates',coalesce((select jsonb_agg(to_jsonb(r)-'priority' order by priority,due_date nulls last,amount::numeric desc,invoice_label) from review r),'[]'::jsonb)
) as snapshot from report_window w;
