-- WhatsApp-style Student Block upgrades: chat info, per-user deletion, video media and member access.
-- Apply after 012_student_whatsapp_chat.sql.

begin;

create table if not exists public.student_message_deletions (
  message_id uuid not null references public.student_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists student_message_deletions_user_idx
  on public.student_message_deletions(user_id, message_id);

alter table public.student_message_deletions enable row level security;
revoke all on public.student_message_deletions from public, anon, authenticated;

-- Members can read the member rows for chats they belong to and update only their own read marker.
create or replace function public.student_chat_member_access(target_chat_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select target_user_id is not null
    and exists (
      select 1
      from public.student_chat_members viewer
      where viewer.chat_id = target_chat_id
        and viewer.user_id = target_user_id
    );
$$;

revoke all on function public.student_chat_member_access(uuid, uuid) from public, anon;
grant execute on function public.student_chat_member_access(uuid, uuid) to authenticated;

grant select on public.student_chat_members to authenticated;
grant update(last_read_at) on public.student_chat_members to authenticated;

drop policy if exists student_chat_members_read on public.student_chat_members;
create policy student_chat_members_read on public.student_chat_members
  for select to authenticated
  using (
    public.is_active()
    and public.student_chat_member_access(chat_id, auth.uid())
  );

drop policy if exists student_chat_members_update on public.student_chat_members;
create policy student_chat_members_update on public.student_chat_members
  for update to authenticated
  using (user_id = auth.uid() and public.is_active())
  with check (user_id = auth.uid() and public.is_active());

create or replace function public.student_chat_info(target_chat_id uuid)
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
    'id', c.id,
    'kind', c.kind,
    'name', c.name,
    'created_at', c.created_at,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'username', p.username,
        'avatar_url', p.avatar_url,
        'joined_at', m.joined_at
      ) order by coalesce(nullif(p.username, ''), nullif(p.name, ''), 'Student'))
      from public.student_chat_members m
      join public.profiles p on p.id = m.user_id
      where m.chat_id = c.id and coalesce(p.suspended, false) = false
    ), '[]'::jsonb)
  ) into result
  from public.student_chats c
  where c.id = target_chat_id
    and exists (
      select 1 from public.student_chat_members member_row
      where member_row.chat_id = c.id and member_row.user_id = current_user_id
    );

  if result is null then raise exception 'Chat not found'; end if;
  return result;
end;
$$;

create or replace function public.student_chat_delete(target_message_id uuid, delete_for text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  owner_id uuid;
begin
  if current_user_id is null or not public.is_active() then raise exception 'Not authorized'; end if;
  if delete_for not in ('me', 'everyone') then raise exception 'Invalid delete option'; end if;

  select sm.user_id into owner_id
  from public.student_messages sm
  where sm.id = target_message_id
    and exists (
      select 1 from public.student_chat_members member_row
      where member_row.chat_id = sm.chat_id and member_row.user_id = current_user_id
    );

  if owner_id is null then raise exception 'Message not found'; end if;

  if delete_for = 'everyone' then
    if owner_id <> current_user_id then raise exception 'Only the sender can delete for everyone'; end if;
    delete from public.student_messages where id = target_message_id;
  else
    insert into public.student_message_deletions(message_id, user_id)
    values (target_message_id, current_user_id)
    on conflict (message_id, user_id) do nothing;
  end if;
end;
$$;

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
          (select sm.body from public.student_messages sm
           where sm.chat_id = c.id
             and not exists (select 1 from public.student_message_deletions hidden where hidden.message_id = sm.id and hidden.user_id = current_user_id)
           order by sm.created_at desc limit 1) as last_body,
          (select max(sm.created_at) from public.student_messages sm
           where sm.chat_id = c.id
             and not exists (select 1 from public.student_message_deletions hidden where hidden.message_id = sm.id and hidden.user_id = current_user_id)) as last_at,
          (select count(*)::int from public.student_messages unread_sm
           where unread_sm.chat_id = c.id
             and unread_sm.user_id <> current_user_id
             and unread_sm.created_at > coalesce(my_m.last_read_at, 'epoch'::timestamptz)
             and not exists (select 1 from public.student_message_deletions hidden where hidden.message_id = unread_sm.id and hidden.user_id = current_user_id)) as unread
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
        exists (
          select 1
          from public.student_view_once_views viewed_row
          where viewed_row.message_id = sm.id and viewed_row.user_id = current_user_id
        ) as viewed,
        jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username, 'avatar_url', p.avatar_url) as "user"
      from (
        select base_sm.* from public.student_messages base_sm
        where base_sm.chat_id = target_chat_id
          and not exists (
            select 1 from public.student_message_deletions hidden
            where hidden.message_id = base_sm.id and hidden.user_id = current_user_id
          )
        order by base_sm.created_at desc
        limit 100
      ) sm
      join public.profiles p on p.id = sm.user_id
    ) message_row
  ), '[]'::jsonb);
end;
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('student-chat-videos', 'student-chat-videos', false, 16777216, array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_chat_videos_read on storage.objects;
create policy student_chat_videos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'student-chat-videos' and public.is_active());

drop policy if exists student_chat_videos_upload on storage.objects;
create policy student_chat_videos_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-chat-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active()
  );

drop policy if exists student_chat_videos_delete on storage.objects;
create policy student_chat_videos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'student-chat-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active()
  );

revoke all on function public.student_chat_info(uuid) from public, anon;
revoke all on function public.student_chat_delete(uuid, text) from public, anon;
grant execute on function public.student_chat_info(uuid) to authenticated;
grant execute on function public.student_chat_delete(uuid, text) to authenticated;
grant execute on function public.student_chat_bootstrap() to authenticated;
grant execute on function public.student_chat_messages(uuid) to authenticated;

commit;
