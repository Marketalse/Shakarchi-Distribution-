-- Keep classification enforcement, with actionable errors for Table Editor entry.
begin;
create or replace function wsd_private.check_product_classification()
returns trigger language plpgsql security definer set search_path='' as $$
declare brand public.survey_brands;
begin
  if new.brand_id is null then
    raise exception 'Choose a brand in brand_id before saving. Create the brand in survey_brands first; typing its name in brand does not link it.'
      using errcode='23502', column='brand_id';
  end if;
  select * into brand from public.survey_brands where id=new.brand_id for share;
  if not found then
    raise exception 'The selected brand_id does not exist. Choose an existing brand from survey_brands.'
      using errcode='23503', column='brand_id';
  end if;
  if new.is_own_brand is distinct from brand.is_own then
    raise exception 'Product classification must match its brand';
  end if;
  new.brand:=brand.name;
  return new;
end;
$$;
comment on column public.products.brand_id is
  'Required link to survey_brands.id. Create the brand first and select its UUID. Product classification must match the selected brand.';
comment on column public.products.brand is
  'Display name populated from brand_id. Typing here does not create or select a brand.';
notify pgrst, 'reload schema';
commit;
