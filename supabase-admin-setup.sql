-- ============================================================
-- EVO7 EXPERIENCE — Admin rozšíření Supabase
-- Spusť v Supabase → SQL Editor (po supabase-setup.sql)
-- ============================================================

-- ── 1. Tabulka availability_blocks ──────────────────────────
CREATE TABLE IF NOT EXISTS availability_blocks (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  experience  TEXT        NOT NULL DEFAULT 'all'
                CHECK (experience IN ('okresky', 'sosnova', 'all')),
  date        DATE        NOT NULL,
  block_type  TEXT        NOT NULL
                CHECK (block_type IN ('full_day', 'time_slot', 'custom_hours')),
  start_time  TIME,   -- time_slot: blokovaný čas; custom_hours: nový začátek provozu
  end_time    TIME,   -- custom_hours: nový konec provozu
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blocks_date_exp_idx
  ON availability_blocks (date, experience);

-- ── 2. Row Level Security ────────────────────────────────────

-- availability_blocks: čtení = kdokoliv (Netlify funkce), zápis = jen přihlášený admin
ALTER TABLE availability_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocks_public_read"  ON availability_blocks
  FOR SELECT USING (true);

CREATE POLICY "blocks_admin_insert" ON availability_blocks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "blocks_admin_update" ON availability_blocks
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "blocks_admin_delete" ON availability_blocks
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── 3. RLS pro tabulku reservations ─────────────────────────
-- (Pokud ještě nemáš RLS zapnuté na reservations)
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Anon může přidávat rezervace (online formulář)
CREATE POLICY "reservations_public_insert" ON reservations
  FOR INSERT WITH CHECK (true);

-- Anon může číst dostupnost (get-availability Netlify funkce používá service_role, takže toto není potřeba)
-- Přihlášený admin může vše
CREATE POLICY "reservations_admin_all" ON reservations
  FOR ALL USING (auth.role() = 'authenticated');

-- ── 4. Vytvoření admin uživatele ─────────────────────────────
-- NEDĚLÁŠ to přes SQL! Jdi do:
-- Supabase Dashboard → Authentication → Users → Add user
-- Zadej e-mail a heslo → Create user
-- Tento uživatel se přihlásí do /admin.html

-- ── 5. Kontrola ─────────────────────────────────────────────
-- Po spuštění ověř:
-- SELECT * FROM availability_blocks LIMIT 5;
-- SELECT * FROM reservations LIMIT 5;
