-- Student Block WhatsApp-style conversations.
-- Apply after 011_student_view_once.sql.

begin;

create table if not exists public.student_chats (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('group', 'direct')),
  name text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.student_chat_members (
  chat_id uuid not null references public.student_chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

alter table public.student_messages
  add column if not exists chat_id uuid references public.student_chats(id) on delete cascade;

create index if not exists student_messages_chat_created_idx
  on public.student_messages(chat_id, created_at desc);
create index if not exists student_chat_members_user_idx
  on public.student_chat_members(user_id, chat_id);

-- A stable group id lets the existing Student Block messages and media keep working.
insert into public.student_chats (id, kind, name)
values ('00000000-0000-4000-8000-000000000001'::uuid, 'group', 'Student Block')
on conflict (id) do update set name = excluded.name;

insert into public.student_chat_members (chat_id, user_id)
select '00000000-0000-4000-8000-000000000001'::uuid, p.id
from public.profiles p
on conflict (chat_id, user_id) do nothing;

update public.student_messages
set chat_id = '00000000-0000-4000-8000-000000000001'::uuid
where chat_id is null;

alter table public.student_chats enable row level security;
alter table public.student_chat_members enable row level security;

revoke all on public.student_chats from anon, authenticated;
revoke all on public.student_chat_members from anon, authenticated;

drop policy if exists student_messages_read on public.student_messages;
drop policy if exists student_messages_insert on public.student_messages;
drop policy if exists student_messages_delete_own on public.student_messages;
drop policy if exists student_messages_delete_own_member on public.student_messages;

create policy student_messages_member_read on public.student_messages
  for select to authenticated
  using (
    public.is_active()
    and exists (
      select 1 from public.student_chat_members m
      where m.chat_id = student_messages.chat_id and m.user_id = auth.uid()
    )
  );

create policy student_messages_member_insert on public.student_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_active()
    and exists (
      select 1 from public.student_chat_members m
      where m.chat_id = student_messages.chat_id and m.user_id = auth.uid()
    )
  );

create policy student_messages_delete_own_member on public.student_messages
  for delete to authenticated
  using (
    user_id = auth.uid()
    and public.is_active()
    and exists (
      select 1 from public.student_chat_members m
      where m.chat_id = student_messages.chat_id and m.user_id = auth.uid()
    )
  );

create or replace function public.student_chat_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or not public.is_active() then
    raise exception 'Not authorized';
  end if;

  insert into public.student_chat_members (chat_id, user_id)
  select '00000000-0000-4000-8000-000000000001'::uuid, p.id
  from public.profiles p
  on conflict (chat_id, user_id) do nothing;

  return jsonb_build_object(
    'user', (
      select jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'username', p.username,
        'avatar_url', p.avatar_url
      ) from public.profiles p where p.id = current_user_id
    ),
    'chats', coalesce((
      select jsonb_agg(to_jsonb(chat_row) order by chat_row.last_at desc nulls last)
      from (
        select
          c.id,
          c.kind,
          c.name,
          case
            when c.kind = 'group' then c.name
            else coalesce(
              (select nullif(p.username, '') from public.student_chat_members other_m
               join public.profiles p on p.id = other_m.user_id
               where other_m.chat_id = c.id and other_m.user_id <> current_user_id limit 1),
              (select p.name from public.student_chat_members other_m
               join public.profiles p on p.id = other_m.user_id
               where other_m.chat_id = c.id and other_m.user_id <> current_user_id limit 1),
              'Student'
            )
          end as display_name,
          (select p.avatar_url from public.student_chat_members other_m
           join public.profiles p on p.id = other_m.user_id
           where other_m.chat_id = c.id and other_m.user_id <> current_user_id limit 1) as avatar_url,
          (select count(*)::int from public.student_chat_members count_m where count_m.chat_id = c.id) as members_count,
          (select sm.body from public.student_messages sm where sm.chat_id = c.id order by sm.created_at desc limit 1) as last_body,
          (select max(sm.created_at) from public.student_messages sm where sm.chat_id = c.id) as last_at,
          (select count(*)::int from public.student_messages unread_sm
           where unread_sm.chat_id = c.id
             and unread_sm.user_id <> current_user_id
             and unread_sm.created_at > coalesce(my_m.last_read_at, 'epoch'::timestamptz)) as unread
        from public.student_chats c
        join public.student_chat_members my_m on my_m.chat_id = c.id and my_m.user_id = current_user_id
      ) chat_row
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'username', p.username,
        'avatar_url', p.avatar_url
      ) order by coalesce(nullif(p.username, ''), p.name))
      from public.profiles p
      where p.id <> current_user_id and coalesce(p.suspended, false) = false
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.student_chat_messages(target_chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or not public.is_active() then
    raise exception 'Not authorized';
  end if;
  if not exists (
    select 1 from public.student_chat_members m
    where m.chat_id = target_chat_id and m.user_id = current_user_id
  ) then
    raise exception 'Chat not found';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(message_row) order by message_row.created_at)
    from (
      select
        sm.id,
        sm.chat_id,
        sm.user_id,
        sm.body,
        sm.created_at,
        sm.body = '[view-once]' as viewed,
        jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username, 'avatar_url', p.avatar_url) as "user"
      from (
        select * from public.student_messages
        where chat_id = target_chat_id
        order by created_at desc
        limit 100
      ) sm
      join public.profiles p on p.id = sm.user_id
    ) message_row
  ), '[]'::jsonb);
end;
$$;

create or replace function public.student_chat_message(target_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null or not public.is_active() then
    raise exception 'Not authorized';
  end if;
  select jsonb_build_object(
    'id', sm.id,
    'chat_id', sm.chat_id,
    'user_id', sm.user_id,
    'body', sm.body,
    'created_at', sm.created_at
  ) into result
  from public.student_messages sm
  where sm.id = target_message_id
    and exists (
      select 1 from public.student_chat_members m
      where m.chat_id = sm.chat_id and m.user_id = current_user_id
    );
  if result is null then raise exception 'Message not found'; end if;
  return result;
end;
$$;

create or replace function public.student_chat_send(target_chat_id uuid, message_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  message_id uuid;
begin
  if current_user_id is null or not public.is_active() then raise exception 'Not authorized'; end if;
  if message_body is null or length(trim(message_body)) = 0 or length(message_body) > 1000 then raise exception 'Invalid message'; end if;
  if not exists (select 1 from public.student_chat_members m where m.chat_id = target_chat_id and m.user_id = current_user_id) then raise exception 'Chat not found'; end if;
  insert into public.student_messages (user_id, chat_id, body)
  values (current_user_id, target_chat_id, trim(message_body))
  returning id into message_id;
  return message_id;
end;
$$;

create or replace function public.student_chat_get_or_create_direct(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  direct_id uuid;
begin
  if current_user_id is null or not public.is_active() or other_user_id is null or other_user_id = current_user_id then raise exception 'Invalid contact'; end if;
  if not exists (select 1 from public.profiles p where p.id = other_user_id and coalesce(p.suspended, false) = false) then raise exception 'Contact not found'; end if;

  select c.id into direct_id
  from public.student_chats c
  where c.kind = 'direct'
    and exists (select 1 from public.student_chat_members m where m.chat_id = c.id and m.user_id = current_user_id)
    and exists (select 1 from public.student_chat_members m where m.chat_id = c.id and m.user_id = other_user_id)
    and (select count(*) from public.student_chat_members m where m.chat_id = c.id) = 2
  limit 1;

  if direct_id is null then
    insert into public.student_chats (kind, name, created_by) values ('direct', '', current_user_id) returning id into direct_id;
    insert into public.student_chat_members (chat_id, user_id) values (direct_id, current_user_id), (direct_id, other_user_id);
  end if;
  return direct_id;
end;
$$;

create or replace function public.student_chat_mark_read(target_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Not authorized'; end if;
  update public.student_chat_members set last_read_at = now()
  where chat_id = target_chat_id and user_id = auth.uid();
  if not found then raise exception 'Chat not found'; end if;
end;
$$;

create or replace function public.send_student_view_once_in_chat(image_data text, image_type text, target_chat_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  message_id uuid;
begin
  if current_user_id is null or not public.is_active() then raise exception 'Not authorized'; end if;
  if image_data is null or image_type not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'Invalid image'; end if;
  if not exists (select 1 from public.student_chat_members m where m.chat_id = target_chat_id and m.user_id = current_user_id) then raise exception 'Chat not found'; end if;
  insert into public.student_messages (user_id, chat_id, body) values (current_user_id, target_chat_id, '[view-once]') returning id into message_id;
  insert into public.student_view_once_images (message_id, image_data, image_type)
  values (message_id, decode(image_data, 'base64'), image_type);
  return message_id;
end;
$$;

-- Keep the old RPC compatible while associating new view-once posts with Student Block.
create or replace function public.send_student_view_once(image_data text, image_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.send_student_view_once_in_chat(image_data, image_type, '00000000-0000-4000-8000-000000000001'::uuid);
end;
$$;

drop function if exists public.open_student_view_once(uuid);

create function public.open_student_view_once(target_message_id uuid)
returns table(image_data text, image_type text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Not authorized'; end if;
  if not exists (
    select 1 from public.student_messages sm
    join public.student_chat_members cm on cm.chat_id = sm.chat_id and cm.user_id = auth.uid()
    where sm.id = target_message_id and sm.user_id <> auth.uid() and sm.body = '[view-once]'
  ) then raise exception 'Message not found'; end if;
  if exists (select 1 from public.student_view_once_views v where v.message_id = target_message_id and v.user_id = auth.uid()) then raise exception 'Already viewed'; end if;
  insert into public.student_view_once_views (message_id, user_id) values (target_message_id, auth.uid());
  return query select encode(i.image_data, 'base64'), i.image_type from public.student_view_once_images i where i.message_id = target_message_id;
end;
$$;

grant execute on function public.student_chat_bootstrap() to authenticated;
grant execute on function public.student_chat_messages(uuid) to authenticated;
grant execute on function public.student_chat_message(uuid) to authenticated;
grant execute on function public.student_chat_send(uuid, text) to authenticated;
grant execute on function public.student_chat_get_or_create_direct(uuid) to authenticated;
grant execute on function public.student_chat_mark_read(uuid) to authenticated;
grant execute on function public.send_student_view_once_in_chat(text, text, uuid) to authenticated;
grant execute on function public.send_student_view_once(text, text) to authenticated;
grant execute on function public.open_student_view_once(uuid) to authenticated;

commit;
