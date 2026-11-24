-- Apply after 005_handout_storage.sql, together with the corresponding app deployment.
begin;
create table if not exists public.market_conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(listing_id,buyer_id),
  check(buyer_id<>seller_id)
);
create table if not exists public.market_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.market_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check(length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists market_messages_conversation_time on public.market_messages(conversation_id,created_at);
alter table public.market_conversations enable row level security;
alter table public.market_messages enable row level security;
create policy conversation_participants on public.market_conversations for select to authenticated
  using(public.is_active() and auth.uid() in (buyer_id,seller_id));
create policy message_participants_read on public.market_messages for select to authenticated
  using(public.is_active() and exists(select 1 from public.market_conversations c where c.id=conversation_id and auth.uid() in (c.buyer_id,c.seller_id)));
create policy message_participants_send on public.market_messages for insert to authenticated
  with check(sender_id=auth.uid() and public.is_active() and exists(select 1 from public.market_conversations c where c.id=conversation_id and auth.uid() in (c.buyer_id,c.seller_id)));
revoke all on public.market_conversations,public.market_messages from anon,authenticated;
grant select on public.market_conversations,public.market_messages to authenticated;
grant insert(conversation_id,sender_id,body) on public.market_messages to authenticated;
create or replace function public.start_market_conversation(item_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare seller uuid; conversation uuid;
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Sign in required'; end if;
  select seller_id into seller from public.listings where id=item_id and status='active' and public.seller_active(seller_id);
  if seller is null then raise exception 'Listing unavailable'; end if;
  if seller=auth.uid() then raise exception 'You cannot message yourself'; end if;
  insert into public.market_conversations(listing_id,buyer_id,seller_id) values(item_id,auth.uid(),seller)
    on conflict(listing_id,buyer_id) do update set listing_id=excluded.listing_id returning id into conversation;
  return conversation;
end $$;
revoke all on function public.start_market_conversation(uuid) from public,anon;
grant execute on function public.start_market_conversation(uuid) to authenticated;

create table if not exists public.daily_visitors (
  visit_day date not null, visitor_id uuid not null,
  primary key(visit_day,visitor_id)
);
create table if not exists public.resource_downloads (
  id bigint generated always as identity primary key,
  resource_type text not null check(resource_type in ('past','handout')),
  resource_id uuid not null, user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.daily_visitors enable row level security;
alter table public.resource_downloads enable row level security;
revoke all on public.daily_visitors,public.resource_downloads from anon,authenticated;
create or replace function public.record_visit(visitor uuid) returns void
language sql security definer set search_path=public as $$
  insert into public.daily_visitors(visit_day,visitor_id) values((now() at time zone 'Africa/Lagos')::date,visitor) on conflict do nothing;
$$;
revoke all on function public.record_visit(uuid) from public;
grant execute on function public.record_visit(uuid) to anon,authenticated;
create or replace function public.record_resource_download(kind text,resource uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Sign in required'; end if;
  if kind='past' and not exists(select 1 from public.past_questions where id=resource) then raise exception 'Resource unavailable';
  elsif kind='handout' and not exists(select 1 from public.handouts where id=resource) then raise exception 'Resource unavailable';
  elsif kind not in ('past','handout') then raise exception 'Invalid resource'; end if;
  insert into public.resource_downloads(resource_type,resource_id,user_id) values(kind,resource,auth.uid());
end $$;
revoke all on function public.record_resource_download(text,uuid) from public,anon;
grant execute on function public.record_resource_download(text,uuid) to authenticated;
create or replace function public.market_metrics() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return jsonb_build_object(
    'visitors_today',(select count(*) from public.daily_visitors where visit_day=(now() at time zone 'Africa/Lagos')::date),
    'visitors_by_day',coalesce((select jsonb_agg(row_to_json(d) order by d.day desc) from (select visit_day as day,count(*) as visitors from public.daily_visitors group by visit_day order by visit_day desc limit 30) d),'[]'::jsonb),
    'registered_profiles',(select count(*) from public.profiles),
    'past_downloads',(select count(*) from public.resource_downloads where resource_type='past'),
    'handout_downloads',(select count(*) from public.resource_downloads where resource_type='handout')
  );
end $$;
revoke all on function public.market_metrics() from public,anon;
grant execute on function public.market_metrics() to authenticated;

commit;
