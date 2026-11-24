-- Additive product media only. Prices, financial snapshots and existing posting APIs are untouched.
begin;
set local lock_timeout='5s';
alter table public.products add column image_path text;
alter table public.products add constraint product_image_path_valid check(image_path is null or
 (split_part(image_path,'/',2)=id::text and image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('product-images','product-images',false,524288,array['image/webp']);
create policy product_image_read on storage.objects for select to authenticated
 using(bucket_id='product-images' and wsd_private.is_solo_owner() and split_part(name,'/',1)=auth.uid()::text);
create policy product_image_add on storage.objects for insert to authenticated
 with check(bucket_id='product-images' and wsd_private.is_solo_owner() and split_part(name,'/',1)=auth.uid()::text
 and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
 and exists(select 1 from public.products p where p.id::text=split_part(name,'/',2)));
-- Objects are immutable versions; no update/delete policy is granted by this migration.
create function public.set_solo_product_image(p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb; product public.products; path text;
begin
 prior:=wsd_private.begin_operation(p_operation,jsonb_build_object('action','product_image','payload',p_request));
 if prior is not null then return prior; end if;
 if not (p_request ? 'id' and p_request ? 'expected_image_path' and p_request ? 'image_path')
   or exists(select 1 from jsonb_object_keys(p_request) k where k not in('id','expected_image_path','image_path')) then
  raise exception 'Image identity, expected version and image path required' using errcode='22023';
 end if;
 select * into strict product from public.products where id=(p_request->>'id')::uuid for update;
 if product.image_path is distinct from (p_request->>'expected_image_path') then
  raise exception 'Product image changed. Reload before replacing it.' using errcode='40001';
 end if;
 path:=p_request->>'image_path';
 if path is not null and (path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
   or split_part(path,'/',1)<>auth.uid()::text or split_part(path,'/',2)<>product.id::text
   or not exists(select 1 from storage.objects where bucket_id='product-images' and name=path)) then
  raise exception 'Upload a valid private image for this product first' using errcode='22023';
 end if;
 update public.products set image_path=path where id=product.id;
 return wsd_private.finish_operation(p_operation,jsonb_build_object('product_id',product.id,'image_path',path));
end; $$;
revoke all on function public.set_solo_product_image(uuid,jsonb) from public,anon;
grant execute on function public.set_solo_product_image(uuid,jsonb) to authenticated;
-- Appending a view column preserves existing consumers, filters and column order.
create or replace view public.solo_order_catalog_v2 with(security_invoker=true) as
 select p.id,p.brand,p.brand_id,p.sku,l.name as product_line,p.product_line_id,p.flavour,p.selling_price,
 p.items_per_half_pack,p.packs_per_box,p.currency,p.active,p.image_path from public.products p
 join public.survey_brands b on b.id=p.brand_id join public.product_lines l on l.id=p.product_line_id and l.brand_id=p.brand_id
 where p.active and p.is_own_brand and b.active and b.is_own and p.currency='USD' and p.selling_price is not null;
notify pgrst,'reload schema';
commit;
