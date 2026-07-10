-- Migration para adicionar motivo de desativação

ALTER TABLE rm.publishers ADD COLUMN deactivation_reason text;
