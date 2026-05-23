const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GMAIL_USER  = process.env.GMAIL_USER;
const GMAIL_PASS  = process.env.GMAIL_PASS;
const OWNER_EMAIL = process.env.OWNER_EMAIL || GMAIL_USER;

const RIDE_DURATION = { starter: 15, street: 30, rally: 60, '2-kola': 30, 'vice-kol': 60 };
const BUFFER = 60;

const PACKAGE_LABELS = {
  starter:    'STARTER — 15 min — 1 490 Kč',
  street:     'STREET — 30 min — 2 990 Kč',
  rally:      'RALLY — 60 min — 5 990 Kč',
  '2-kola':   '2 KOLA — 2 × 1,6 km — 4 000 Kč',
  'vice-kol': 'VÍCE KOL — individuální dohoda',
};

function timeStrToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTimeStr(m) {
  return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
}

function formatDateCZ(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  return d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function createTransporter() {
  if (!GMAIL_USER || !GMAIL_PASS) {
    console.warn('GMAIL_USER / GMAIL_PASS nejsou nastaveny — email se neodesílá.');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
}

async function sendEmail({ to, subject, html }) {
  const transporter = createTransporter();
  if (!transporter) return;
  await transporter.sendMail({ from: `"EVO7 Experience" <${GMAIL_USER}>`, to, subject, html });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Neplatný JSON.' }) };
  }

  const { experience = 'okresky', package: pkg, date, time, name, email, phone, note } = body;

  if (!pkg || !date || !time || !name || !email || !phone) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Chybí povinná pole.' }) };
  }

  const rideDuration = RIDE_DURATION[pkg];
  if (!rideDuration) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Neplatný balíček: ${pkg}` }) };
  }

  const startMin = timeStrToMinutes(time);
  const endMin   = startMin + rideDuration + BUFFER;
  const endTime  = minutesToTimeStr(endMin);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Double-check availability (guard against race conditions)
  const { data: conflicts, error: checkErr } = await supabase
    .from('reservations')
    .select('id')
    .eq('date', date)
    .eq('experience', experience)
    .eq('status', 'confirmed')
    .lt('start_time', endTime)
    .gt('end_time', time);

  if (checkErr) {
    console.error('Supabase check error:', checkErr);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Chyba serveru při kontrole dostupnosti.' }) };
  }

  if (conflicts.length > 0) {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'Tento termín byl právě zabrán. Vyberte jiný čas.' }) };
  }

  // Insert reservation
  const { data: reservation, error: insertErr } = await supabase
    .from('reservations')
    .insert([{
      experience,
      package:    pkg,
      date,
      start_time: time,
      end_time:   endTime,
      name,
      email,
      phone,
      note:       note || null,
      status:     'confirmed',
    }])
    .select()
    .single();

  if (insertErr) {
    console.error('Supabase insert error:', insertErr);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Rezervaci se nepodařilo uložit.' }) };
  }

  const EXP_LABELS  = { okresky: 'Okresky — Severní Čechy', sosnova: 'Okruh Sosnová' };
  const dateCZ      = formatDateCZ(date);
  const pkgLabel    = PACKAGE_LABELS[pkg] || pkg;
  const expLabel    = EXP_LABELS[experience] || experience;

  // Email zákazníkovi
  const customerHtml = `
    <div style="background:#0a0a0a;color:#fff;font-family:Arial,sans-serif;padding:40px;max-width:560px;margin:0 auto;">
      <h1 style="font-size:28px;font-weight:900;letter-spacing:2px;margin:0 0 4px;">
        EVO<span style="color:#FFE600;">7</span> EXPERIENCE
      </h1>
      <p style="color:#777;font-size:13px;margin:0 0 32px;letter-spacing:1px;">ZÁŽITKOVÁ JÍZDA S MITSUBISHI LANCER EVO 7</p>
      <h2 style="color:#FFE600;font-size:20px;margin:0 0 24px;letter-spacing:1px;">✓ REZERVACE POTVRZENA</h2>
      <table style="width:100%;border-collapse:collapse;">
        ${[
          ['Zážitek', expLabel],
          ['Balíček', pkgLabel],
          ['Datum',   dateCZ],
          ['Čas',     time],
          ['Jméno',   name],
          ['Telefon', phone],
          ...(note ? [['Poznámka', note]] : []),
        ].map(([k, v]) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #222;color:#777;font-size:12px;letter-spacing:1px;width:100px;">${k.toUpperCase()}</td>
            <td style="padding:10px 0;border-bottom:1px solid #222;font-size:14px;font-weight:600;">${v}</td>
          </tr>
        `).join('')}
      </table>
      <p style="margin:32px 0 0;color:#777;font-size:13px;line-height:1.6;">
        Těšíme se na tebe! V případě dotazů nás kontaktuj na <a href="tel:+420778533518" style="color:#FFE600;">+420 778 533 518</a>.
      </p>
      <p style="margin:8px 0 0;color:#444;font-size:11px;">Rezervace je závazná. Místo konání obdržíš před jízdou.</p>
    </div>
  `;

  // Notifikace majiteli
  const ownerHtml = `
    <div style="font-family:Arial,sans-serif;padding:24px;background:#f9f9f9;">
      <h2 style="color:#000;">Nová rezervace EVO7 Experience</h2>
      <table style="border-collapse:collapse;width:100%;">
        ${[
          ['Zážitek',  expLabel],
          ['Balíček',  pkgLabel],
          ['Datum',    dateCZ],
          ['Čas',      time],
          ['Jméno',    name],
          ['E-mail',   email],
          ['Telefon',  phone],
          ...(note ? [['Poznámka', note]] : []),
        ].map(([k, v]) => `
          <tr>
            <td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;background:#f0f0f0;width:100px;">${k}</td>
            <td style="padding:8px 12px;border:1px solid #ddd;">${v}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;

  try {
    await Promise.all([
      sendEmail({ to: email, subject: `Potvrzení rezervace EVO7 Experience — ${dateCZ}, ${time}`, html: customerHtml }),
      sendEmail({ to: OWNER_EMAIL, subject: `[REZERVACE] ${name} — ${dateCZ} ${time} — ${pkg.toUpperCase()}`, html: ownerHtml }),
    ]);
  } catch (emailErr) {
    // Rezervace je uložena, email selhal — nechceme vrátit chybu zákazníkovi
    console.error('Email chyba:', emailErr);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, id: reservation.id }),
  };
};
