-- Explicit API privileges for new projects. Row-level policies still apply.
grant select on profiles, products, survey_brands, payments to authenticated;
grant select, insert on outlets, orders, order_lines, visits, survey_answers to authenticated;
grant usage on sequence outlets_code_seq, orders_invoice_no_seq to authenticated;

alter table outlets add column staff_phone text;
alter table products add column brand text, add column sku text unique;
alter table orders alter column visit_id drop not null;
alter table orders add column next_visit date;
alter table order_lines add column unit_cost numeric(14,2);

create table market_observations (
  id uuid primary key,
  outlet_id uuid not null references outlets(id),
  created_by uuid not null default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('competitor_price', 'new_brand', 'promotion')),
  brand text not null check (length(trim(brand)) > 0),
  model text not null check (length(trim(model)) > 0),
  price numeric(14,2) check (price >= 0),
  offer text,
  photo_path text,
  check (
    (kind = 'promotion' and nullif(trim(offer), '') is not null and price is null)
    or (kind <> 'promotion' and price is not null and offer is null and photo_path is null)
  ),
  check (photo_path is null or photo_path = created_by::text || '/' || id::text)
);

alter table market_observations enable row level security;
grant select, insert on market_observations to authenticated;
create policy market_read on market_observations for select to authenticated
  using (exists (select 1 from outlets where id = outlet_id));
create policy market_insert on market_observations for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from outlets where id = outlet_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('market-surveys', 'market-surveys', false, 5242880, array['image/jpeg','image/png','image/webp']);
create policy market_photo_add on storage.objects for insert to authenticated
  with check (bucket_id = 'market-surveys' and (storage.foldername(name))[1] = auth.uid()::text);
create policy market_photo_read on storage.objects for select to authenticated
  using (bucket_id = 'market-surveys' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from market_observations where photo_path = name)
  ));
create policy market_photo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'market-surveys' and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (select 1 from market_observations where photo_path = name));

alter policy orders_insert on orders
  with check (rep_id = auth.uid() and exists (select 1 from outlets where id = outlet_id)
    and (visit_id is null or exists (
      select 1 from visits v where v.id = visit_id and v.outlet_id = orders.outlet_id and v.rep_id = auth.uid()
    )));

-- Invoker permissions apply to the entire transaction. Prices come from the catalog.
create function submit_retail_order(
  p_id uuid, p_outlet uuid, p_terms integer, p_next_visit date, p_items jsonb
) returns bigint language plpgsql security invoker set search_path = public as $$
declare
  invoice bigint;
  inserted_count integer;
begin
  if auth.uid() is null or p_terms is null or p_terms not between 0 and 365
    or p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Invalid order details';
  end if;

  insert into orders (id, outlet_id, rep_id, payment_type, due_date, next_visit)
  values (p_id, p_outlet, auth.uid(),
    case when p_terms = 0 then 'cash'::payment_type else 'credit'::payment_type end,
    (now() at time zone 'Asia/Baghdad')::date + p_terms, p_next_visit)
  on conflict (id) do nothing returning invoice_no into invoice;

  if invoice is null then
    select invoice_no into strict invoice from orders
    where id = p_id and outlet_id = p_outlet and rep_id = auth.uid() and visit_id is null;
    return invoice;
  end if;

  insert into order_lines (id, order_id, product_id, quantity, unit_price, unit_cost)
  select gen_random_uuid(), p_id, p.id, i.quantity, p.wholesale_price, p.cost_price
  from jsonb_to_recordset(p_items) as i(sku_id uuid, quantity integer, price numeric)
  join products p on p.id = i.sku_id and p.active and p.currency = 'IQD'
  where i.quantity > 0 and i.price = p.wholesale_price;
  get diagnostics inserted_count = row_count;
  if inserted_count <> jsonb_array_length(p_items) then
    raise exception 'SKU availability, price or quantity changed. Reload the catalog and review the order.';
  end if;
  return invoice;
end;
$$;

revoke execute on function submit_retail_order(uuid, uuid, integer, date, jsonb) from public;
grant execute on function submit_retail_order(uuid, uuid, integer, date, jsonb) to authenticated;

create view basic_invoice_totals with (security_invoker = true) as
select o.id, o.outlet_id, o.invoice_no, o.next_visit, s.total, s.investment,
  case when coalesce(p.paid, 0) >= s.total then 'Paid'
       when coalesce(p.paid, 0) > 0 then 'Partially paid' else 'Unpaid' end as payment_status
from orders o
join (
  select order_id, sum(line_total) as total,
    case when count(*) = count(unit_cost) then
      sum(quantity * unit_cost * case when kind = 'return' then -1 else 1 end) end as investment
  from order_lines group by order_id
) s on o.id = s.order_id
left join (select order_id, sum(amount) as paid from payments group by order_id) p on p.order_id = o.id;

create view basic_sku_sales with (security_invoker = true) as
select p.id, coalesce(p.brand, p.product_line) as brand,
  coalesce(p.sku, p.product_line || ' · ' || p.flavour) as sku, sum(l.line_total) as total
from order_lines l join products p on p.id = l.product_id
group by p.id;

grant select on basic_invoice_totals, basic_sku_sales to authenticated;
