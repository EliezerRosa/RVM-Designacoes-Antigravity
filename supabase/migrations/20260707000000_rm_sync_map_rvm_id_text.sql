-- rvm_publisher_id deve ser TEXT pois public.publishers.id é TEXT (não UUID).
-- Auto-match falhava com "invalid input syntax for type uuid" ao gravar o ID do publicador RVM.
ALTER TABLE rm.publisher_sync_map
  ALTER COLUMN rvm_publisher_id TYPE text USING rvm_publisher_id::text;
