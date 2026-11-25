-- View-once images are stored privately and consumed atomically per recipient.
begin;
create table if not exists public.student_view_once_images (
  message_id uuid primary key references public.student_messages(id) on delete cascade,
  image_data bytea not null,
  image_type text not null check (image_type in ('image/jpeg','image/png','image/webp'))
);
create table if not exists public.student_view_once_views (
  message_id uuid not null references public.student_view_once_images(message_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.student_view_once_images enable row level security;
alter table public.student_view_once_views enable row level security;
revoke all on public.student_view_once_images, public.student_view_once_views from public, anon, authenticated;

create or replace function public.send_student_view_once(image_data text, image_type text) returns uuid
language plpgsql security definer set search_path=public as $$
declare photo bytea; new_id uuid;
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Sign in required'; end if;
  if image_type not in ('image/jpeg','image/png','image/webp') or length(image_data) > 2796204 then raise exception 'Invalid photo'; end if;
  photo := decode(image_data, 'base64');
  if octet_length(photo) = 0 or octet_length(photo) > 2097152 then raise exception 'Invalid photo'; end if;
  insert into public.student_messages(user_id, body) values(auth.uid(), '[view-once]') returning id into new_id;
  insert into public.student_view_once_images values(new_id, photo, image_type);
  return new_id;
end $$;
revoke all on function public.send_student_view_once(text,text) from public, anon;
grant execute on function public.send_student_view_once(text,text) to authenticated;

create or replace function public.open_student_view_once(message_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare photo public.student_view_once_images%rowtype; inserted integer;
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Sign in required'; end if;
  select i.* into photo from public.student_view_once_images i join public.student_messages m on m.id=i.message_id
    where i.message_id=open_student_view_once.message_id and m.user_id<>auth.uid();
  if not found then return null; end if;
  insert into public.student_view_once_views values(photo.message_id, auth.uid(), now()) on conflict on constraint student_view_once_views_pkey do nothing;
  get diagnostics inserted = row_count;
  if inserted=0 then return null; end if;
  return jsonb_build_object('data', encode(photo.image_data,'base64'), 'type', photo.image_type);
end $$;
revoke all on function public.open_student_view_once(uuid) from public, anon;
grant execute on function public.open_student_view_once(uuid) to authenticated;

create or replace function public.student_room_messages() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Sign in required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', m.id, 'user_id', m.user_id, 'body', m.body, 'created_at', m.created_at,
    'viewed', exists(select 1 from public.student_view_once_views v where v.message_id=m.id and v.user_id=auth.uid()),
    'user', jsonb_build_object('username', coalesce(nullif(p.username,''), nullif(p.name,''), 'Student'), 'avatar_url', p.avatar_url)
  ) order by m.created_at, m.id) from (
    select id, user_id, body, created_at from public.student_messages order by created_at desc, id desc limit 100
  ) m join public.profiles p on p.id=m.user_id), '[]'::jsonb);
end $$;
commit;
