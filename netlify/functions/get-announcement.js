const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 200, headers, body: JSON.stringify({ text: null }) };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'announcement')
      .maybeSingle();

    return { statusCode: 200, headers, body: JSON.stringify({ text: data?.value || null }) };
  } catch {
    return { statusCode: 200, headers, body: JSON.stringify({ text: null }) };
  }
};
