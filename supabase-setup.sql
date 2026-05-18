-- ============================================================
-- EVO7 EXPERIENCE — Supabase databázové schéma
-- Spusť v Supabase → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS reservations (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  package    TEXT        NOT NULL CHECK (package IN ('starter', 'street', 'rally')),
  date       DATE        NOT NULL,
  start_time TIME        NOT NULL,
  end_time   TIME        NOT NULL,  -- start + jízda + 60 min buffer
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  phone      TEXT        NOT NULL,
  note       TEXT,
  status     TEXT        NOT NULL DEFAULT 'confirmed'
               CHECK (status IN ('confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pro rychlé hledání podle data
CREATE INDEX IF NOT EXISTS reservations_date_idx
  ON reservations (date, status);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Netlify funkce používají SERVICE_KEY (obcházejí RLS) → žádná policy pro anon.
-- Pokud chceš v budoucnu admin dashboard, přidej policy pro authenticated roli.

-- ── Ukázkový záznam (smaž před produkčním nasazením) ───────
-- INSERT INTO reservations (package, date, start_time, end_time, name, email, phone)
-- VALUES ('street', CURRENT_DATE + 1, '15:00', '16:30', 'Test Testovič', 'test@test.cz', '+420 123 456 789');
