-- Apply after 004_student_hub.sql.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('handouts','handouts',true,10485760,array['application/pdf'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create policy handouts_files_read on storage.objects for select using(bucket_id='handouts');
create policy handouts_files_admin_upload on storage.objects for insert to authenticated with check(bucket_id='handouts' and public.is_admin());
create policy handouts_files_admin_delete on storage.objects for delete to authenticated using(bucket_id='handouts' and public.is_admin());

commit;
