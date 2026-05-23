const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const RIDE_DURATION = { starter: 15, street: 30, rally: 60, '2-kola': 30, 'vice-kol': 60 };
const BUFFER        = 60;

// Výchozí provozní okno (přepsatelné custom_hours blokem)
const DEFAULT_START = 15 * 60; // 900 min
const DEFAULT_END   = 20 * 60; // 1200 min

function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}
function toTimeStr(minutes) {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}

function generateCandidates(rideDuration, dayStart, dayEnd) {
  const slots = [];
  const latestStart = dayEnd - rideDuration;
  for (let t = dayStart; t <= latestStart; t += 15) slots.push(t);
  return slots;
}

function hasConflict(candidateStart, candidateRideDur, existingReservations) {
  const candidateEnd = candidateStart + candidateRideDur + BUFFER;
  for (const res of existingReservations) {
    const resStart = toMinutes(res.start_time);
    const resEnd   = toMinutes(res.end_time);
    if (candidateStart < resEnd && candidateEnd > resStart) return true;
  }
  return false;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  const { date, package: pkg, experience = 'okresky' } = event.queryStringParameters || {};

  if (!date || !pkg) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Parametry date a package jsou povinné.' }) };
  }

  const rideDuration = RIDE_DURATION[pkg];
  if (!rideDuration) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Neplatný balíček: ${pkg}` }) };
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Chybí env proměnné: SUPABASE_URL nebo SUPABASE_SERVICE_KEY');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server není správně nakonfigurován.' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Načti rezervace a bloky paralelně
  const [resResult, blocksResult] = await Promise.all([
    supabase
      .from('reservations')
      .select('start_time, end_time')
      .eq('date', date)
      .eq('experience', experience)
      .eq('status', 'confirmed'),

    supabase
      .from('availability_blocks')
      .select('*')
      .eq('date', date)
      .in('experience', [experience, 'all']),
  ]);

  if (resResult.error) {
    console.error('Supabase reservations error:', resResult.error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Chyba při načítání rezervací.' }) };
  }

  const reservations = resResult.data || [];
  const blocks       = blocksResult.data || [];

  // 1. Celý den zablokován?
  if (blocks.some(b => b.block_type === 'full_day')) {
    return { statusCode: 200, headers, body: JSON.stringify({ slots: [], reason: 'full_day_block' }) };
  }

  // 2. Vlastní provozní hodiny?
  const customHours = blocks.find(b => b.block_type === 'custom_hours');
  const dayStart    = customHours ? toMinutes(customHours.start_time) : DEFAULT_START;
  const dayEnd      = customHours ? toMinutes(customHours.end_time)   : DEFAULT_END;

  // 3. Individuálně blokované časy
  const blockedSlots = new Set(
    blocks.filter(b => b.block_type === 'time_slot' && b.start_time)
          .map(b => b.start_time.slice(0, 5))
  );

  // 4. Generuj a filtruj kandidáty
  const candidates = generateCandidates(rideDuration, dayStart, dayEnd);
  const available  = candidates
    .filter(t => !blockedSlots.has(toTimeStr(t)))
    .filter(t => !hasConflict(t, rideDuration, reservations))
    .map(toTimeStr);

  return { statusCode: 200, headers, body: JSON.stringify({ slots: available }) };
};
