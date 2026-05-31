/**
 * send-reminders.js
 * Netlify Scheduled Function — spouští se každý den v 8:00 UTC (9:00 CET / 10:00 CEST)
 * Pošle připomínací e-mail každému zákazníkovi s rezervací na ZÍTŘEK.
 */

const { createClient } = require('@supabase/supabase-js');
const nodemailer        = require('nodemailer');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GMAIL_USER   = process.env.GMAIL_USER;
const GMAIL_PASS   = process.env.GMAIL_PASS;

const EXP_LABELS = {
  okresky: 'Okresky — Severní Čechy',
  sosnova: 'Okruh Sosnová',
};

const PACKAGE_LABELS = {
  starter:    'STARTER — 15 min — 1 690 Kč',
  street:     'STREET — 30 min — 2 990 Kč',
  rally:      'RALLY — 60 min — 5 490 Kč',
  '2-kola':   '2 KOLA — 2 × 1,6 km — 3 490 Kč',
  'vice-kol': 'VÍCE KOL — individuální dohoda',
};

function getTomorrowISO() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
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

function buildReminderHtml({ name, expLabel, pkgLabel, dateCZ, time }) {
  return `
    <div style="background:#0a0a0a;color:#fff;font-family:Arial,sans-serif;padding:40px;max-width:560px;margin:0 auto;">
      <h1 style="font-size:28px;font-weight:900;letter-spacing:2px;margin:0 0 4px;">
        EVO<span style="color:#FFE600;">7</span> EXPERIENCE
      </h1>
      <p style="color:#777;font-size:13px;margin:0 0 32px;letter-spacing:1px;">ZÁŽITKOVÁ JÍZDA S MITSUBISHI LANCER EVO 7</p>

      <h2 style="color:#FFE600;font-size:20px;margin:0 0 8px;letter-spacing:1px;">⏰ PRÁVE TANKUJEME, ZÍTRA JEDEME!</h2>
      <p style="color:#aaa;font-size:14px;margin:0 0 28px;line-height:1.6;">
        Ahoj ${name}, připomínáme tvou rezervaci na <strong style="color:#fff;">zítra</strong>. Těšíme se na tebe!
      </p>

      <table style="width:100%;border-collapse:collapse;">
        ${[
          ['Zážitek', expLabel],
          ['Balíček', pkgLabel],
          ['Datum',   dateCZ],
          ['Čas',     time],
        ].map(([k, v]) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #222;color:#777;font-size:12px;letter-spacing:1px;width:100px;">${k.toUpperCase()}</td>
            <td style="padding:10px 0;border-bottom:1px solid #222;font-size:14px;font-weight:600;">${v}</td>
          </tr>
        `).join('')}
      </table>

      <div style="margin:32px 0;padding:20px;background:#111;border-left:3px solid #FFE600;">
        <p style="margin:0;color:#aaa;font-size:13px;line-height:1.8;">
          📍 <strong style="color:#fff;">Místo srazu:</strong> upřesníme dle zážitku<br>
          ⏱ <strong style="color:#fff;">Dostavení:</strong> prosím přijď 10 minut před časem rezervace<br>
          👟 <strong style="color:#fff;">Oblečení:</strong> pohodlné, sportovní obuv
        </p>
      </div>

      <p style="margin:0;color:#777;font-size:13px;line-height:1.6;">
        Dotazy? Zavolej nám na <a href="tel:+420778533518" style="color:#FFE600;">+420 778 533 518</a>.
      </p>
      <p style="margin:16px 0 0;color:#444;font-size:11px;">
        Tuto zprávu obdržuješ jako potvrzenou rezervaci EVO7 Experience.
      </p>
    </div>
  `;
}

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Chybí Supabase env proměnné.');
    return { statusCode: 500, body: 'Chybí konfigurace.' };
  }

  const tomorrow  = getTomorrowISO();
  const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('date', tomorrow)
    .eq('status', 'confirmed');

  if (error) {
    console.error('Supabase chyba:', error);
    return { statusCode: 500, body: 'Chyba při načítání rezervací.' };
  }

  if (!reservations || reservations.length === 0) {
    console.log(`Žádné rezervace na zítra (${tomorrow}).`);
    return { statusCode: 200, body: 'Žádné rezervace.' };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return { statusCode: 500, body: 'Chybí Gmail konfigurace.' };
  }

  let sent = 0;
  for (const res of reservations) {
    const dateCZ   = formatDateCZ(res.date);
    const expLabel = EXP_LABELS[res.experience]   || res.experience;
    const pkgLabel = PACKAGE_LABELS[res.package]  || res.package;

    const html = buildReminderHtml({
      name:     res.name,
      expLabel,
      pkgLabel,
      dateCZ,
      time:     res.start_time,
    });

    try {
      await transporter.sendMail({
        from:    `"EVO7 Experience" <${GMAIL_USER}>`,
        to:      res.email,
        subject: `Připomínka — zítra jedeme! EVO7 Experience ${dateCZ}, ${res.start_time}`,
        html,
      });
      console.log(`Reminder odeslán: ${res.email} (${res.date} ${res.start_time})`);
      sent++;
    } catch (err) {
      console.error(`Chyba při odesílání na ${res.email}:`, err.message);
    }
  }

  return { statusCode: 200, body: `Odesláno ${sent}/${reservations.length} reminderů.` };
};
