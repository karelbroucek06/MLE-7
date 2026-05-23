/**
 * generate-config.js
 * Spouští se automaticky při Netlify buildu.
 * Vytvoří js/supabase-config.js z env proměnných.
 */

const fs  = require('fs');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('❌ Chybí env proměnné: SUPABASE_URL a/nebo SUPABASE_ANON_KEY');
  process.exit(1);
}

const content = `const SUPABASE_URL      = '${url}';\nconst SUPABASE_ANON_KEY = '${key}';\n`;

fs.writeFileSync('js/supabase-config.js', content, 'utf8');
console.log('✅ js/supabase-config.js vygenerován z env proměnných.');
