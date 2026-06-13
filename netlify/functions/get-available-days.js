const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  const { experience = 'okresky', year, month } = event.queryStringParameters || {};

  if (!year || !month) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Chybí parametry year a month.' }) };
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server není nakonfigurován.' }) };
  }

  const y        = parseInt(year, 10);
  const m        = parseInt(month, 10);
  const lastDay  = new Date(y, m, 0).getDate();
  const pad      = (n) => String(n).padStart(2, '0');
  const startDate = `${y}-${pad(m)}-01`;
  const endDate   = `${y}-${pad(m)}-${pad(lastDay)}`;

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: blocks } = await supabase
    .from('availability_blocks')
    .select('date, block_type, experience')
    .gte('date', startDate)
    .lte('date', endDate)
    .in('experience', [experience, 'all']);

  const todayISO = new Date().toISOString().slice(0, 10);
  const available = [];

  for (let d = 1; d <= lastDay; d++) {
    const date = `${y}-${pad(m)}-${pad(d)}`;
    if (date <= todayISO) continue;

    const dayBlocks    = (blocks || []).filter(b => b.date === date);
    const isFullBlocked = dayBlocks.some(b => b.block_type === 'full_day');
    const isOpenDay     = dayBlocks.some(b => b.block_type === 'open_day');

    if (experience === 'sosnova') {
      if (isOpenDay && !isFullBlocked) available.push(date);
    } else {
      if (!isFullBlocked) available.push(date);
    }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ available }) };
};
