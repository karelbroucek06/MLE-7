/* ============================================================
   EVO7 EXPERIENCE — frontend logic
   ============================================================ */

const PACKAGES = {
  // Okresky
  starter:       { label: 'STARTER',        duration: 15, price: '1 690 Kč', exp: 'okresky' },
  street:        { label: 'STREET',          duration: 30, price: '2 990 Kč', exp: 'okresky' },
  rally:         { label: 'RALLY',           duration: 60, price: '5 490 Kč', exp: 'okresky' },
  // Sosnová
  '2-kola':   { label: '2 KOLA',    duration: 30, price: '3 490 Kč',     exp: 'sosnova' },
  'vice-kol': { label: 'VÍCE KOL',  duration: 60, price: 'Individuální', exp: 'sosnova' },
};

const EXP_LABELS = {
  okresky: 'Okresky — Severní Čechy',
  sosnova: 'Okruh Sosnová',
};

/* ── State ────────────────────────────────────────────────── */
const state = {
  step:       1,
  experience: 'okresky',
  package:    null,
  date:       null,
  time:       null,
  name:       '',
  email:      '',
  phone:      '',
  note:       '',
};

/* ── Navigation ───────────────────────────────────────────── */
const nav          = document.getElementById('nav');
const navHamburger = document.getElementById('navHamburger');
const navMenu      = document.getElementById('navMenu');

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20);
});

navHamburger.addEventListener('click', () => {
  const open = navMenu.classList.toggle('open');
  navHamburger.classList.toggle('open', open);
});

document.querySelectorAll('.nav__link').forEach(link => {
  link.addEventListener('click', () => {
    navMenu.classList.remove('open');
    navHamburger.classList.remove('open');
  });
});

/* ── Experience tabs (globální přepínač) ──────────────────── */
/**
 * Synchronizuje všechny skupiny záložek podle aktuální experience.
 * Skupiny: #carTabs, #pkgTabs, #wizardTabs — každá sdílí stejný data-exp
 */
function syncExpTabs(exp) {
  // Záložky
  document.querySelectorAll('.exp-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.exp === exp);
  });

  // Panely v sekci O autech a Balíčky
  document.querySelectorAll('[data-exp-panel]').forEach(panel => {
    const panelExp = panel.dataset.expPanel.replace('-wizard', '');
    panel.classList.toggle('active', panelExp === exp);
  });
}

document.querySelectorAll('.exp-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const exp = tab.dataset.exp;

    // Reset balíčku a slotů při přepnutí experience
    if (exp !== state.experience) {
      state.experience = exp;
      state.package    = null;
      state.time       = null;
      document.querySelectorAll('.wizard__pkg').forEach(el => el.classList.remove('selected'));
      document.getElementById('btn1Next').disabled = true;
      if (state.date) fetchSlots(state.date);
      refreshAvailDays();
    }

    syncExpTabs(exp);
  });
});

/* ── Package cards → pre-select v wizardu ─────────────────── */
document.querySelectorAll('[data-select]').forEach(btn => {
  btn.addEventListener('click', () => {
    const pkg = btn.dataset.select;
    const exp = btn.dataset.exp;
    // Přepni experience a balíček
    state.experience = exp;
    syncExpTabs(exp);
    refreshAvailDays();
    selectPackage(pkg);
  });
});

/* ── Wizard helpers ───────────────────────────────────────── */
function goToPanel(n) {
  document.querySelectorAll('.wizard__panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel${n}`).classList.add('active');

  document.querySelectorAll('.wizard__prog-step').forEach(s => {
    const sn = parseInt(s.dataset.step);
    s.classList.remove('active', 'done');
    if (sn === n) s.classList.add('active');
    if (sn < n)  s.classList.add('done');
  });

  document.querySelectorAll('.wizard__prog-line').forEach((l, i) => {
    l.classList.toggle('done', i < n - 1);
  });

  state.step = n;
}

/* ── Step 1: Balíček ──────────────────────────────────────── */
function selectPackage(pkg) {
  state.package = pkg;
  state.time    = null;

  document.querySelectorAll('.wizard__pkg').forEach(el => {
    el.classList.toggle('selected', el.dataset.pkg === pkg);
  });

  document.getElementById('btn1Next').disabled = false;

  if (state.date) fetchSlots(state.date);
}

document.querySelectorAll('.wizard__pkg').forEach(el => {
  el.addEventListener('click', () => {
    // Pokud se klikne na balíček v jiném exp panelu, ignoruj (je skrytý)
    selectPackage(el.dataset.pkg);
  });
});

document.getElementById('btn1Next').addEventListener('click', () => {
  if (!state.package) return;
  goToPanel(2);
  document.querySelector('#rezervace').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ── Announcement banner ──────────────────────────────────── */
(async () => {
  try {
    const res  = await fetch('/.netlify/functions/get-announcement');
    const { text } = await res.json();
    if (text) {
      document.getElementById('announcementText').textContent = text;
      document.getElementById('announcement').classList.remove('hidden');
    }
  } catch { /* silently ignore */ }
})();

document.getElementById('announcementClose').addEventListener('click', () => {
  document.getElementById('announcement').classList.add('hidden');
});

/* ── Step 2: Datum & Čas ──────────────────────────────────── */
const today = new Date();
today.setHours(0, 0, 0, 0);

let availableDays = new Set();
let fpInst = null;

async function fetchAvailableDays(exp, year, month) {
  try {
    const res  = await fetch(`/.netlify/functions/get-available-days?experience=${exp}&year=${year}&month=${month}`);
    const data = await res.json();
    availableDays = new Set(data.available || []);
    if (fpInst) fpInst.redraw();
  } catch { /* ignore */ }
}

function refreshAvailDays() {
  if (!fpInst) return;
  fetchAvailableDays(state.experience, fpInst.currentYear, fpInst.currentMonth + 1);
}

fpInst = flatpickr('#datePicker', {
  locale: 'cs',
  minDate: new Date(today.getTime() + 86400000),
  dateFormat: 'Y-m-d',
  altInput: true,
  altFormat: 'j. F Y',
  disableMobile: false,
  onReady:       () => refreshAvailDays(),
  onMonthChange: () => refreshAvailDays(),
  onYearChange:  () => refreshAvailDays(),
  onDayCreate: (dObj, dStr, fp, dayElem) => {
    const d = dayElem.dateObj;
    if (d && availableDays.has(formatDate(d))) {
      dayElem.classList.add('avail-dot');
    }
  },
  onChange: ([date]) => {
    const iso = formatDate(date);
    state.date = iso;
    state.time = null;
    document.getElementById('btn2Next').disabled = true;
    fetchSlots(iso);
  },
});

function formatDate(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function fetchSlots(date) {
  const list = document.getElementById('slotsList');
  list.innerHTML = '<p class="slots__loading">Načítám dostupné časy…</p>';

  try {
    const res  = await fetch(
      `/.netlify/functions/get-availability?date=${date}&package=${state.package}&experience=${state.experience}`
    );
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Chyba serveru');

    if (!data.slots || data.slots.length === 0) {
      list.innerHTML = '<p class="slots__empty">Na tento den nejsou volné termíny. Zkuste jiné datum.</p>';
      return;
    }

    list.innerHTML = '';
    data.slots.forEach(slot => {
      const btn = document.createElement('button');
      btn.className = 'slot-btn';
      btn.textContent = slot;
      btn.dataset.time = slot;
      btn.addEventListener('click', () => {
        state.time = slot;
        document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('btn2Next').disabled = false;
      });
      list.appendChild(btn);
    });
  } catch (err) {
    list.innerHTML = `<p class="slots__empty">Nepodařilo se načíst termíny. Zkuste to znovu nebo zavolejte na +420 778 533 518.</p>`;
    console.error(err);
  }
}

document.getElementById('btn2Back').addEventListener('click', () => goToPanel(1));
document.getElementById('btn2Next').addEventListener('click', () => {
  if (!state.date || !state.time) return;
  goToPanel(3);
});

/* ── Step 3: Kontakt ──────────────────────────────────────── */
document.getElementById('btn3Back').addEventListener('click', () => goToPanel(2));
document.getElementById('btn3Next').addEventListener('click', () => {
  if (!validateContact()) return;
  state.name  = document.getElementById('inputName').value.trim();
  state.email = document.getElementById('inputEmail').value.trim();
  state.phone = document.getElementById('inputPhone').value.trim();
  state.note  = document.getElementById('inputNote').value.trim();
  buildSummary();
  goToPanel(4);
});

function validateContact() {
  const name  = document.getElementById('inputName');
  const email = document.getElementById('inputEmail');
  const phone = document.getElementById('inputPhone');
  let ok = true;

  [name, email, phone].forEach(f => f.classList.remove('error'));

  if (!name.value.trim())                              { name.classList.add('error');  ok = false; }
  if (!email.value.trim() || !email.value.includes('@')) { email.classList.add('error'); ok = false; }
  if (!phone.value.trim())                             { phone.classList.add('error'); ok = false; }

  return ok;
}

/* ── Step 4: Shrnutí ──────────────────────────────────────── */
function buildSummary() {
  const pkg     = PACKAGES[state.package];
  const dateObj = new Date(state.date + 'T12:00:00');
  const dateStr = dateObj.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });

  const rows = [
    ['ZÁŽITEK',  EXP_LABELS[state.experience]],
    ['BALÍČEK',  `${pkg.label} — ${pkg.duration} min`],
    ['DATUM',    dateStr],
    ['ČAS',      state.time],
    ['CENA',     pkg.price],
    ['JMÉNO',    state.name],
    ['E-MAIL',   state.email],
    ['TELEFON',  state.phone],
    ...(state.note ? [['POZNÁMKA', state.note]] : []),
  ];

  document.getElementById('summary').innerHTML = rows.map(([k, v], i) => `
    <div class="summary__row">
      <span class="summary__key">${k}</span>
      <span class="summary__val${i === 4 ? ' summary__val--accent' : ''}">${v}</span>
    </div>
  `).join('');
}

document.getElementById('btn4Back').addEventListener('click', () => goToPanel(3));
document.getElementById('btnSubmit').addEventListener('click', submitReservation);

async function submitReservation() {
  const btn = document.getElementById('btnSubmit');
  btn.disabled = true;
  btn.textContent = 'ODESÍLÁM…';

  try {
    const res = await fetch('/.netlify/functions/create-reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        experience: state.experience,
        package:    state.package,
        date:       state.date,
        time:       state.time,
        name:       state.name,
        email:      state.email,
        phone:      state.phone,
        note:       state.note,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chyba serveru');

    goToPanel(5);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'ODESLAT REZERVACI';
    alert('Rezervaci se nepodařilo odeslat. Zavolejte nám na +420 778 533 518 nebo to zkuste znovu.');
    console.error(err);
  }
}

/* ── Reset ────────────────────────────────────────────────── */
document.getElementById('btnReset').addEventListener('click', () => {
  state.step       = 1;
  state.experience = 'okresky';
  state.package    = null;
  state.date       = null;
  state.time       = null;
  state.name       = '';
  state.email      = '';
  state.phone      = '';
  state.note       = '';

  document.querySelectorAll('.wizard__pkg').forEach(el => el.classList.remove('selected'));
  document.getElementById('btn1Next').disabled = true;
  document.getElementById('btn2Next').disabled = true;
  document.getElementById('slotsList').innerHTML = '<p class="slots__hint">Nejprve vyberte datum</p>';
  document.getElementById('datePicker')._flatpickr.clear();

  ['inputName', 'inputEmail', 'inputPhone', 'inputNote'].forEach(id => {
    document.getElementById(id).value = '';
    document.getElementById(id).classList.remove('error');
  });

  syncExpTabs('okresky');
  goToPanel(1);
  document.querySelector('#rezervace').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
