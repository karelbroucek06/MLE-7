const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Ride duration in minutes per package
const RIDE_DURATION = { starter: 15, street: 30, rally: 60 };

// After each ride, the car needs this buffer (minutes)
const BUFFER = 60;

// Operating window: 15:00 – 20:00
const DAY_START = 15 * 60; // 900 minutes from midnight
const DAY_END   = 20 * 60; // 1200 minutes from midnight

function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function toTimeStr(minutes) {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Generate candidate start times every 15 min within the operating window.
 * The ride must END by DAY_END (20:00).
 */
function generateCandidates(rideDuration) {
  const slots = [];
  // Last possible start so ride ends exactly at 20:00
  const latestStart = DAY_END - rideDuration;
  for (let t = DAY_START; t <= latestStart; t += 15) {
    slots.push(t);
  }
  return slots;
}

/**
 * Check if a candidate start time conflicts with any existing reservation.
 * A reservation blocks from its start_time until start_time + ride_duration + BUFFER.
 */
function hasConflict(candidateStart, candidateRideDur, existingReservations) {
  const candidateEnd = candidateStart + candidateRideDur + BUFFER;

  for (const res of existingReservations) {
    const resStart = toMinutes(res.start_time);
    const resEnd   = toMinutes(res.end_time); // stored as start + ride + buffer

    // Overlap if candidate starts before existing ends AND candidate ends after existing starts
    if (candidateStart < resEnd && candidateEnd > resStart) {
      return true;
    }
  }
  return false;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const { date, package: pkg } = event.queryStringParameters || {};

  if (!date || !pkg) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Parametry date a package jsou povinné.' }),
    };
  }

  const rideDuration = RIDE_DURATION[pkg];
  if (!rideDuration) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: `Neplatný balíček: ${pkg}` }),
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('start_time, end_time')
    .eq('date', date)
    .eq('status', 'confirmed');

  if (error) {
    console.error('Supabase error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Chyba při načítání rezervací.' }),
    };
  }

  const candidates = generateCandidates(rideDuration);
  const available  = candidates
    .filter(t => !hasConflict(t, rideDuration, reservations))
    .map(toTimeStr);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ slots: available }),
  };
};
