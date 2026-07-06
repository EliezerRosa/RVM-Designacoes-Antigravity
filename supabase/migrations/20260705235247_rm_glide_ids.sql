-- RM: glide_id UNIQUE em congregations e field_groups para upsert idempotente
-- por chave natural do Glide (publishers já possui glide_id). Tabelas vazias.
-- Suporta o importador MER-aware (ACL Glide → rm.*) na sub-aba Sincronização.
ALTER TABLE rm.congregations ADD COLUMN glide_id text;
ALTER TABLE rm.congregations ADD CONSTRAINT congregations_glide_id_key UNIQUE (glide_id);

ALTER TABLE rm.field_groups ADD COLUMN glide_id text;
ALTER TABLE rm.field_groups ADD CONSTRAINT field_groups_glide_id_key UNIQUE (glide_id);
