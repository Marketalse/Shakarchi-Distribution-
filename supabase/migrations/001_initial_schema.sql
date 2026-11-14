-- Wholesale Distribution App: initial schema (draft v1, from Blueprint v1)
-- Not applied yet. Apply after the blueprint is approved.
-- All ids are generated on the phone (uuid) so a visit can be saved offline
-- and uploaded later without creating duplicates.

-- ---------- Users ----------
create type user_role as enum ('owner', 'rep');

create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'rep',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'owner' and active
  );
$$;

-- ---------- Outlets ----------
create type outlet_relationship as enum ('customer', 'prospect');

create table outlets (
  id              uuid primary key,
  code            bigint generated always as identity unique,
  retail_name     text not null,
  owner_name      text,
  staff_name      text,
  owner_phone     text,
  shop_phone      text,
  lat             double precision not null,
  lng             double precision not null,
  address         text,
  province        text not null,
  area            text not null,
  outlet_type     text not null,
  relationship    outlet_relationship not null default 'prospect',
  credit_limit    numeric(14,2) not null default 0,
  payment_terms_days integer not null default 0,
  assigned_rep    uuid not null references profiles (id),
  created_by      uuid not null references profiles (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index outlets_assigned_rep_idx on outlets (assigned_rep);
create index outlets_area_idx on outlets (province, area);

-- ---------- Products ----------
create table products (
  id               uuid primary key default gen_random_uuid(),
  product_line     text not null,   -- e.g. 'Lost Mary MTL', 'KNZ Bar 60K'
  flavour          text not null,   -- e.g. 'Cola Ice'
  puffs            integer,
  units_per_carton integer,
  cost_price       numeric(14,2),
  wholesale_price  numeric(14,2) not null,
  retail_price     numeric(14,2),
  currency         text not null default 'IQD',
  is_own_brand     boolean not null default true,
  active           boolean not null default true,
  unique (product_line, flavour)
);

-- Brands tracked in the shelf survey (ours and competitors)
create table survey_brands (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  is_own    boolean not null default false,
  active    boolean not null default true
);

-- ---------- Visits ----------
create type visit_outcome as enum
  ('order_taken', 'survey_only', 'collection_only', 'shop_closed', 'refused');

create table visits (
  id             uuid primary key,
  outlet_id      uuid not null references outlets (id),
  rep_id         uuid not null references profiles (id) default auth.uid(),
  checked_in_at  timestamptz not null,
  checked_out_at timestamptz,
  lat            double precision,
  lng            double precision,
  outcome        visit_outcome not null,
  note           text,
  photo_path     text,
  synced_at      timestamptz not null default now()
);
create index visits_outlet_idx on visits (outlet_id, checked_in_at desc);
create index visits_rep_idx on visits (rep_id, checked_in_at desc);

-- ---------- Survey answers (one row per brand seen at a visit) ----------
create table survey_answers (
  id                  uuid primary key,
  visit_id            uuid not null references visits (id),
  brand_id            uuid not null references survey_brands (id),
  present             boolean not null,
  facings             integer,
  shelf_price         numeric(14,2),
  out_of_stock        boolean,
  est_weekly_sales    integer,
  unique (visit_id, brand_id)
);

-- ---------- Orders ----------
create type payment_type as enum ('cash', 'credit');
create type line_kind as enum ('sale', 'return');

create table orders (
  id            uuid primary key,
  invoice_no    bigint generated always as identity unique,
  visit_id      uuid not null unique references visits (id),
  outlet_id     uuid not null references outlets (id),
  rep_id        uuid not null references profiles (id) default auth.uid(),
  payment_type  payment_type not null,
  due_date      date,
  created_at    timestamptz not null default now()
);
create index orders_outlet_idx on orders (outlet_id, created_at desc);

create table order_lines (
  id          uuid primary key,
  order_id    uuid not null references orders (id),
  product_id  uuid not null references products (id),
  kind        line_kind not null default 'sale',
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(14,2) not null check (unit_price >= 0),
  line_total  numeric(14,2) generated always as
              (case when kind = 'return' then -1 else 1 end * quantity * unit_price) stored
);
create index order_lines_order_idx on order_lines (order_id);
create index order_lines_product_idx on order_lines (product_id);

-- ---------- Payments (append-only) ----------
create type payment_method as enum ('cash', 'transfer');

create table payments (
  id            uuid primary key,
  outlet_id     uuid not null references outlets (id),
  visit_id      uuid references visits (id),
  order_id      uuid references orders (id),
  amount        numeric(14,2) not null check (amount <> 0),
  method        payment_method not null default 'cash',
  note          text,
  collected_by  uuid not null references profiles (id) default auth.uid(),
  collected_at  timestamptz not null,
  synced_at     timestamptz not null default now(),
  check (amount > 0 or note is not null)
);
create index payments_outlet_idx on payments (outlet_id, collected_at desc);

-- Money rows can never be changed or removed. Mistakes are corrected with a new row.
create or replace function forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception '% rows are append-only', tg_table_name;
end;
$$;

create trigger payments_append_only before update or delete on payments
  for each row execute function forbid_change();
create trigger order_lines_append_only before update or delete on order_lines
  for each row execute function forbid_change();
create trigger orders_append_only before update or delete on orders
  for each row execute function forbid_change();

-- ---------- Duplicate-outlet check ----------
-- Returns outlets within a radius of a point, whoever they belong to,
-- but only name and distance, so a rep can avoid creating a duplicate.
create or replace function nearby_outlets(p_lat double precision, p_lng double precision,
                                          p_radius_m integer default 50)
returns table (id uuid, retail_name text, distance_m double precision)
language sql stable security definer set search_path = public as $$
  select o.id, o.retail_name, d.m
  from outlets o
  cross join lateral (
    select 6371000 * 2 * asin(sqrt(
      power(sin(radians(o.lat - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(o.lat)) *
      power(sin(radians(o.lng - p_lng) / 2), 2))) as m
  ) d
  where d.m <= p_radius_m
  order by d.m;
$$;

-- ---------- Calculated views ----------
create view outlet_balances with (security_invoker = true) as
select
  o.id as outlet_id,
  coalesce(s.total_sales, 0)                              as total_sales,
  coalesce(p.total_paid, 0)                               as total_paid,
  coalesce(s.total_sales, 0) - coalesce(p.total_paid, 0)  as balance,
  o.credit_limit,
  coalesce(s.order_count, 0)                              as order_count,
  s.first_order_at,
  s.last_order_at
from outlets o
left join (
  select ord.outlet_id,
         sum(l.line_total)       as total_sales,
         count(distinct ord.id)  as order_count,
         min(ord.created_at)     as first_order_at,
         max(ord.created_at)     as last_order_at
  from orders ord join order_lines l on l.order_id = ord.id
  group by ord.outlet_id
) s on s.outlet_id = o.id
left join (
  select outlet_id, sum(amount) as total_paid from payments group by outlet_id
) p on p.outlet_id = o.id;

create view overdue_invoices with (security_invoker = true) as
select
  ord.id as order_id, ord.invoice_no, ord.outlet_id, ord.due_date,
  t.invoice_total,
  coalesce(pd.paid, 0)                    as paid,
  t.invoice_total - coalesce(pd.paid, 0)  as outstanding,
  current_date - ord.due_date             as days_overdue
from orders ord
join (select order_id, sum(line_total) as invoice_total
      from order_lines group by order_id) t on t.order_id = ord.id
left join (select order_id, sum(amount) as paid
           from payments where order_id is not null group by order_id) pd
       on pd.order_id = ord.id
where ord.due_date is not null
  and ord.due_date < current_date
  and t.invoice_total - coalesce(pd.paid, 0) > 0;

-- ---------- Row-level security ----------
alter table profiles        enable row level security;
alter table outlets         enable row level security;
alter table products        enable row level security;
alter table survey_brands   enable row level security;
alter table visits          enable row level security;
alter table survey_answers  enable row level security;
alter table orders          enable row level security;
alter table order_lines     enable row level security;
alter table payments        enable row level security;

-- Profiles: everyone reads their own; the owner reads and manages all.
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_owner());
create policy profiles_owner_write on profiles for all to authenticated
  using (is_owner()) with check (is_owner());

-- Products and survey brands: all signed-in users read; the owner writes.
create policy products_select on products for select to authenticated using (true);
create policy products_owner_write on products for all to authenticated
  using (is_owner()) with check (is_owner());
create policy survey_brands_select on survey_brands for select to authenticated using (true);
create policy survey_brands_owner_write on survey_brands for all to authenticated
  using (is_owner()) with check (is_owner());

-- Outlets: a rep sees and edits only their own; the owner sees all.
create policy outlets_select on outlets for select to authenticated
  using (assigned_rep = auth.uid() or is_owner());
create policy outlets_insert on outlets for insert to authenticated
  with check (assigned_rep = auth.uid() or is_owner());
create policy outlets_update on outlets for update to authenticated
  using (assigned_rep = auth.uid() or is_owner())
  with check (assigned_rep = auth.uid() or is_owner());

-- Visits
create policy visits_select on visits for select to authenticated
  using (rep_id = auth.uid() or is_owner());
create policy visits_insert on visits for insert to authenticated
  with check (rep_id = auth.uid());

-- Survey answers follow their visit.
create policy survey_select on survey_answers for select to authenticated
  using (exists (select 1 from visits v where v.id = visit_id
                 and (v.rep_id = auth.uid() or is_owner())));
create policy survey_insert on survey_answers for insert to authenticated
  with check (exists (select 1 from visits v where v.id = visit_id
                      and v.rep_id = auth.uid()));

-- Orders and lines: insert and read only. No update or delete policy exists.
create policy orders_select on orders for select to authenticated
  using (rep_id = auth.uid() or is_owner());
create policy orders_insert on orders for insert to authenticated
  with check (rep_id = auth.uid());
create policy order_lines_select on order_lines for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id
                 and (o.rep_id = auth.uid() or is_owner())));
create policy order_lines_insert on order_lines for insert to authenticated
  with check (exists (select 1 from orders o where o.id = order_id
                      and o.rep_id = auth.uid()));

-- Payments: insert and read only.
create policy payments_select on payments for select to authenticated
  using (collected_by = auth.uid() or is_owner());
create policy payments_insert on payments for insert to authenticated
  with check (collected_by = auth.uid() or is_owner());
