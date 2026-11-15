-- Apply after 001_marketplace.sql. This is additive and safe to reapply.
-- Validate inside the security-definer RPC as well as the Next.js API, because
-- authenticated clients can call Supabase directly with the public anon key.
begin;

create or replace function public.admin_action(action text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  target uuid;
  input_settings jsonb;
  validated_settings jsonb;
  category_values jsonb;
  field_name text;
  max_length integer;
  field_required boolean;
  support_reason text;
  audit_details jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Invalid admin payload';
  end if;

  if action in ('remove', 'suspend', 'impersonate', 'resolve') then
    if jsonb_typeof(payload->'id') is distinct from 'string'
      or (payload->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Provide a valid record ID';
    end if;
    target := (payload->>'id')::uuid;
    audit_details := jsonb_build_object('id', target);
  end if;

  if action = 'remove' then
    update public.listings set status = 'removed' where id = target;
    if not found then raise exception 'Listing not found'; end if;

  elsif action = 'suspend' then
    if target = auth.uid() then raise exception 'Cannot suspend yourself'; end if;
    if jsonb_typeof(payload->'suspended') is distinct from 'boolean' then
      raise exception 'Suspension must be true or false';
    end if;
    update public.profiles
      set suspended = (payload->>'suspended')::boolean
      where id = target and role = 'seller';
    if not found then raise exception 'Seller not found or protected account'; end if;
    audit_details := audit_details || jsonb_build_object('suspended', payload->'suspended');

  elsif action = 'settings' then
    input_settings := payload->'settings';
    if jsonb_typeof(input_settings) is distinct from 'object' then
      raise exception 'Provide website settings';
    end if;
    for field_name, max_length, field_required in
      select * from (values
        ('site_name', 80, true),
        ('hero_title', 200, true),
        ('hero_subtitle', 500, false),
        ('payment_instructions', 2000, false)
      ) as fields(name, max_chars, required)
    loop
      if jsonb_typeof(input_settings->field_name) is distinct from 'string'
        or length(input_settings->>field_name) > max_length
        or (field_required and length(btrim(input_settings->>field_name)) = 0) then
        raise exception 'Invalid %', replace(field_name, '_', ' ');
      end if;
    end loop;
    if coalesce(input_settings->>'payment_mode', '') not in ('seller', 'platform') then
      raise exception 'Invalid payment mode';
    end if;
    if jsonb_typeof(input_settings->'categories') is distinct from 'array' then
      raise exception 'Categories must be an array';
    end if;
    if jsonb_array_length(input_settings->'categories') not between 1 and 40 then
      raise exception 'Provide 1-40 categories';
    end if;
    if exists (
      select 1 from jsonb_array_elements(input_settings->'categories') category
      where jsonb_typeof(category) is distinct from 'string'
    ) then
      raise exception 'Categories must contain strings';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(input_settings->'categories') category
      where length(btrim(category)) = 0 or length(category) > 80
    ) then
      raise exception 'Provide categories of 1-80 characters';
    end if;
    if (
      select count(*) <> count(distinct lower(btrim(category)))
      from jsonb_array_elements_text(input_settings->'categories') category
    ) then
      raise exception 'Categories must be unique';
    end if;
    select jsonb_agg(btrim(category) order by position) into category_values
      from jsonb_array_elements_text(input_settings->'categories') with ordinality as categories(category, position);
    validated_settings := jsonb_build_object(
      'site_name', btrim(input_settings->>'site_name'),
      'hero_title', btrim(input_settings->>'hero_title'),
      'hero_subtitle', btrim(input_settings->>'hero_subtitle'),
      'payment_mode', input_settings->>'payment_mode',
      'payment_instructions', btrim(input_settings->>'payment_instructions'),
      'categories', category_values
    );
    update public.settings set data = validated_settings where id = 1;
    if not found then raise exception 'Website settings not initialized'; end if;
    audit_details := jsonb_build_object('fields', jsonb_build_array(
      'site_name', 'hero_title', 'hero_subtitle', 'categories', 'payment_mode', 'payment_instructions'
    ));

  elsif action = 'impersonate' then
    if jsonb_typeof(payload->'reason') is distinct from 'string' then
      raise exception 'A support reason is required';
    end if;
    support_reason := btrim(payload->>'reason');
    if length(support_reason) < 5 or length(payload->>'reason') > 1000 then
      raise exception 'Provide a support reason of 5-1000 characters';
    end if;
    select jsonb_build_object(
      'seller', to_jsonb(p) - 'role',
      'listings', coalesce((
        select jsonb_agg(l order by l.created_at desc) from public.listings l where l.seller_id = target
      ), '[]'::jsonb),
      'expires_at', now() + interval '15 minutes'
    ) into result from public.profiles p where p.id = target and p.role = 'seller';
    if not found then raise exception 'Seller not found or protected account'; end if;
    audit_details := audit_details || jsonb_build_object('reason', support_reason);

  elsif action = 'reports' then
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb)
      into result from public.reports r;

  elsif action = 'resolve' then
    update public.reports set status = 'resolved' where id = target;
    if not found then raise exception 'Report not found'; end if;

  else
    raise exception 'Unsupported action';
  end if;

  -- Mutations and their audit entries commit atomically.
  insert into public.audit_log(actor_id, action, details)
    values (auth.uid(), action, audit_details);
  return coalesce(result, '{"ok":true}'::jsonb);
end;
$$;

revoke all on function public.admin_action(text, jsonb) from public, anon;
grant execute on function public.admin_action(text, jsonb) to authenticated;

-- Leave space for multipart overhead within Vercel's request body limit.
update storage.buckets set file_size_limit = 4194304 where id = 'listings';

create index if not exists reports_status_created_at_idx on public.reports(status, created_at desc);
create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);

commit;
