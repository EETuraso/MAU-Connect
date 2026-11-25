-- Private voice recordings for authenticated, active student chat members.
begin;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('student-voice', 'student-voice', false, 4194304, array['audio/webm','audio/ogg','audio/mp4'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists student_voice_read on storage.objects;
create policy student_voice_read on storage.objects for select to authenticated using (bucket_id='student-voice' and public.is_active());
drop policy if exists student_voice_upload on storage.objects;
create policy student_voice_upload on storage.objects for insert to authenticated with check (bucket_id='student-voice' and (storage.foldername(name))[1]=auth.uid()::text and public.is_active());
drop policy if exists student_voice_delete on storage.objects;
create policy student_voice_delete on storage.objects for delete to authenticated using (bucket_id='student-voice' and (storage.foldername(name))[1]=auth.uid()::text and public.is_active());
commit;
