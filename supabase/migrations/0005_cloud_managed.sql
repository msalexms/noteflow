-- NoteFlow — Fase 4.2 (NoteFlow Cloud): modo de cifrado dual (managed | e2ee).
--
-- Modelo Obsidian Sync: por DEFECTO el usuario entra en modo "managed" (estándar)
-- — no guarda ningún secreto; su DEK se deposita aquí envuelta por la KEK del
-- OPERADOR (secret CLOUD_MANAGED_KEK de la Edge Function cloud-keys), así que
-- NoteFlow podría técnicamente leer sus notas (se comunica honestamente en la UI).
-- El modo "e2ee" (privado, opt-in) es el flujo passphrase + recovery code de la
-- migración 0004: el servidor nunca ve la DEK. El upgrade managed → e2ee es
-- one-way (el cliente puebla las columnas de passphrase y anula dek_managed_ct);
-- no hay downgrade.

-- Las columnas de passphrase/recovery pasan a ser opcionales: una fila managed
-- no las tiene (la coherencia por modo la impone el CHECK de abajo).
alter table public.user_keys alter column dek_pass_ct drop not null;
alter table public.user_keys alter column pass_salt drop not null;
alter table public.user_keys alter column pass_iterations drop not null;
alter table public.user_keys alter column dek_recovery_ct drop not null;
alter table public.user_keys alter column recovery_salt drop not null;
alter table public.user_keys alter column recovery_iterations drop not null;

-- Modo de cifrado de la fila. Default 'e2ee' para que las filas EXISTENTES
-- (todas passphrase+recovery) queden correctas sin backfill.
alter table public.user_keys
  add column mode text not null default 'e2ee'
  check (mode in ('managed', 'e2ee'));

-- DEK envuelta por la KEK del operador (mismo formato de blob sellado:
-- base64url(iv 12 bytes || AES-256-GCM ct+tag)). NUNCA la DEK en claro.
--
-- Convención de escritura: dek_managed_ct lo escribe SOLO el service role (la
-- Edge Function cloud-keys, que es quien conoce CLOUD_MANAGED_KEK). PostgREST
-- no permite granularidad por columna en las policies de forma razonable, así
-- que la policy de ownership de la 0004 sigue permitiendo al cliente tocar la
-- columna — es inocuo: el cliente no conoce la KEK del servidor, así que un
-- write directo suyo no compromete nada (como mucho rompe su propio unlock).
-- El upgrade managed→e2ee del cliente la pone a NULL vía PATCH, y eso sí es
-- intencionado.
alter table public.user_keys add column dek_managed_ct text;

-- Coherencia por modo: una fila managed necesita la DEK envuelta por el
-- operador; una fila e2ee necesita el juego completo de passphrase + recovery.
alter table public.user_keys add constraint user_keys_mode_coherent check (
  (
    mode = 'managed'
    and dek_managed_ct is not null
  )
  or (
    mode = 'e2ee'
    and dek_pass_ct is not null
    and pass_salt is not null
    and pass_iterations is not null
    and dek_recovery_ct is not null
    and recovery_salt is not null
    and recovery_iterations is not null
  )
);

-- RLS: sin cambios — ownership en las cuatro operaciones (0004). El setup y el
-- unlock managed van por la Edge Function cloud-keys con el service role; el
-- upgrade a e2ee es un UPDATE del propio cliente que la policy ya permite.
