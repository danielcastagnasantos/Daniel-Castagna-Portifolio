-- =====================================================================
-- 0008_storage — buckets PRIVADOS para boletos e comprovantes
-- =====================================================================
-- Estrutura do caminho: {organization_id}/{bill_id}/{uuid}-{arquivo}
-- Somente proprietário/gerente da MESMA empresa lê ou envia. Não existe
-- política de update; remoção só de arquivos órfãos (nunca de anexos já
-- registrados em bill_files), preservando a trilha de auditoria.
-- Os links de leitura são URLs assinadas e temporárias (120 s).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('boletos', 'boletos', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg']),
  ('comprovantes', 'comprovantes', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy financeiro_files_read on storage.objects for select to authenticated
using (bucket_id in ('boletos', 'comprovantes')
  and (select private.is_admin())
  and (storage.foldername(name))[1] = (select private.current_org_id())::text);

create policy financeiro_files_insert on storage.objects for insert to authenticated
with check (bucket_id in ('boletos', 'comprovantes')
  and (select private.is_admin())
  and (storage.foldername(name))[1] = (select private.current_org_id())::text
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$');

create policy financeiro_files_delete_orphans on storage.objects for delete to authenticated
using (bucket_id in ('boletos', 'comprovantes')
  and (select private.is_admin())
  and (storage.foldername(name))[1] = (select private.current_org_id())::text
  and not exists (select 1 from public.bill_files f where f.path = name));
