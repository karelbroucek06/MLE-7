/* ============================================================
   EVO7 EXPERIENCE — Admin panel logic
   ============================================================ */

// Supabase client — UMD CDN exposuje window.supabase.createClient
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Helpers ──────────────────────────────────────────────────

const EXP_LABEL = { okresky: 'Okresky', sosnova: 'Okruh Sosnová', all: 'Obě' };
const PKG_LABEL = {
  starter:    'Starter 15 min',
  street:     'Street 30 min',
  rally:      'Rally 60 min',
  '2-kola':   '2 kola (Sosnová)',
  'vice-kol': 'Více kol (Sosnová)',
};
const STATUS_LABEL = { confirmed: 'Potvrzena', cancelled: 'Zrušena' };

function dateCZ(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' });
}
function today() { return new Date().toISOString().slice(0, 10); }

function showToast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast--${type}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

// ── Auth ─────────────────────────────────────────────────────
async function checkAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) showDashboard();
  else showLogin();
}

function showLogin()     { document.getElementById('loginScreen').classList.remove('hidden'); document.getElementById('dashboard').classList.add('hidden'); }
function showDashboard() { document.getElementById('loginScreen').classList.add('hidden');    document.getElementById('dashboard').classList.remove('hidden'); loadReservations(); }

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  btn.disabled = true;
  btn.textContent = 'PŘIHLAŠUJI…';
  err.textContent = '';

  const { error } = await sb.auth.signInWithPassword({
    email:    document.getElementById('adminEmail').value.trim(),
    password: document.getElementById('adminPassword').value,
  });

  if (error) {
    err.textContent = 'Nesprávný e-mail nebo heslo.';
    btn.disabled = false;
    btn.textContent = 'PŘIHLÁSIT SE';
  } else {
    showDashboard();
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  showLogin();
});
// ── Navigation ────────────────────────────────────────────────

document.querySelectorAll('.admin-nav__btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.admin-nav__btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-${tab}`).classList.add('active');
    if (tab === 'dostupnost') initAvailability();
  });
});

// ── REZERVACE ────────────────────────────────────────────────

let allReservations = [];
let sortAsc = false;

async function loadReservations() {
  document.getElementById('resBody').innerHTML =
    '<tr><td colspan="9" class="table-loading">Načítám rezervace…</td></tr>';

  const { data, error } = await sb
    .from('reservations')
    .select('*')
    .order('date', { ascending: false })
    .order('start_time', { ascending: true });

  if (error) {
    document.getElementById('resBody').innerHTML =
      `<tr><td colspan="9" class="table-empty">Chyba: ${error.message}</td></tr>`;
    return;
  }

  allReservations = data || [];
  updateStats();
  renderTable();
}

function updateStats() {
  const td = today();
  document.getElementById('statTotal').textContent    = allReservations.length;
  document.getElementById('statUpcoming').textContent = allReservations.filter(r => r.date >= td && r.status === 'confirmed').length;
  document.getElementById('statToday').textContent    = allReservations.filter(r => r.date === td && r.status === 'confirmed').length;
  document.getElementById('statOkresky').textContent  = allReservations.filter(r => r.experience === 'okresky' && r.status === 'confirmed').length;
  document.getElementById('statSosnova').textContent  = allReservations.filter(r => r.experience === 'sosnova' && r.status === 'confirmed').length;
}

function getFiltered() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const exp    = document.getElementById('filterExp').value;
  const status = document.getElementById('filterStatus').value;
  const date   = document.getElementById('filterDate').value;

  return allReservations.filter(r => {
    if (search && !`${r.name} ${r.email} ${r.phone}`.toLowerCase().includes(search)) return false;
    if (exp    && r.experience !== exp)    return false;
    if (status && r.status !== status)     return false;
    if (date   && r.date !== date)         return false;
    return true;
  });
}

function renderTable() {
  const tbody = document.getElementById('resBody');
  const rows  = getFiltered();

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="table-empty">Žádné rezervace neodpovídají filtrům.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr class="${r.status === 'cancelled' ? 'row-cancelled' : ''}">
      <td><strong>${dateCZ(r.date)}</strong></td>
      <td>${r.start_time?.slice(0,5) || '—'}</td>
      <td><span class="badge badge--${r.experience}">${EXP_LABEL[r.experience] || r.experience}</span></td>
      <td>${PKG_LABEL[r.package] || r.package}</td>
      <td>${r.name}</td>
      <td><a href="tel:${r.phone}" style="color:inherit">${r.phone}</a></td>
      <td><a href="mailto:${r.email}" style="color:var(--text-muted);font-size:12px">${r.email}</a></td>
      <td><span class="badge badge--${r.status}">${STATUS_LABEL[r.status] || r.status}</span></td>
      <td>
        <button class="action-btn" data-id="${r.id}" ${r.status === 'cancelled' ? 'disabled' : ''}>
          Zrušit
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.action-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => openCancelModal(btn.dataset.id));
  });
}

// Filtry
['searchInput', 'filterExp', 'filterStatus', 'filterDate'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderTable);
});
document.getElementById('clearFilters').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterExp').value   = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterDate').value  = '';
  renderTable();
});

// Řazení podle data
document.querySelector('th[data-sort="date"]').addEventListener('click', () => {
  sortAsc = !sortAsc;
  allReservations.sort((a, b) => sortAsc
    ? a.date.localeCompare(b.date)
    : b.date.localeCompare(a.date)
  );
  renderTable();
});

// ── Zrušit rezervaci ─────────────────────────────────────────

let cancelTargetId = null;

function openCancelModal(id) {
  const r = allReservations.find(x => x.id === id);
  if (!r) return;
  cancelTargetId = id;
  document.getElementById('cancelDetail').innerHTML = `
    <strong>${r.name}</strong><br>
    ${dateCZ(r.date)} · ${r.start_time?.slice(0,5)}<br>
    ${EXP_LABEL[r.experience]} · ${PKG_LABEL[r.package] || r.package}<br>
    <span style="color:var(--text-muted);font-size:12px">${r.email} · ${r.phone}</span>
  `;
  document.getElementById('cancelModal').classList.remove('hidden');
}

document.getElementById('cancelModalClose').addEventListener('click', () => {
  document.getElementById('cancelModal').classList.add('hidden');
  cancelTargetId = null;
});

document.getElementById('cancelModalConfirm').addEventListener('click', async () => {
  if (!cancelTargetId) return;
  const btn = document.getElementById('cancelModalConfirm');
  btn.disabled = true;
  btn.textContent = 'RUŠÍM…';

  const { error } = await sb
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', cancelTargetId);

  btn.disabled = false;
  btn.textContent = 'ANO, ZRUŠIT';
  document.getElementById('cancelModal').classList.add('hidden');
  cancelTargetId = null;

  if (error) {
    showToast('Chyba při rušení rezervace.', 'err');
  } else {
    showToast('Rezervace byla zrušena.', 'ok');
    await loadReservations();
  }
});

// ── DOSTUPNOST ───────────────────────────────────────────────

let availState = { exp: 'okresky', date: null };

function initAvailability() {
  if (document.getElementById('availDatePicker')._flatpickr) return;
  flatpickr('#availDatePicker', {
    locale: 'cs',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'j. F Y (l)',
    onChange: ([date]) => {
      availState.date = date ? date.toISOString().slice(0, 10) : null;
      loadAvailDay();
    },
  });
}

document.querySelectorAll('.avail-exp').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.avail-exp').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    availState.exp = btn.dataset.exp;
    if (availState.date) loadAvailDay();
  });
});

async function loadAvailDay() {
  const { exp, date } = availState;
  if (!date) return;

  const actionsEl = document.getElementById('availActions');
  actionsEl.innerHTML = '<div class="avail-empty"><p>NAČÍTÁM…</p></div>';

  // Fetch blocks pro tento den + experience
  const expFilter = exp === 'all' ? ['okresky', 'sosnova', 'all'] : [exp, 'all'];
  const { data: blocks } = await sb
    .from('availability_blocks')
    .select('*')
    .eq('date', date)
    .in('experience', expFilter);

  // Fetch rezervace pro tento den
  const resQuery = sb.from('reservations').select('start_time, package, name, experience').eq('date', date).eq('status', 'confirmed');
  if (exp !== 'all') resQuery.eq('experience', exp);
  const { data: reservations } = await resQuery;

  renderAvailDay(date, exp, blocks || [], reservations || []);
}

function renderAvailDay(date, exp, blocks, reservations) {
  const actionsEl = document.getElementById('availActions');
  const isFullBlocked = blocks.some(b => b.block_type === 'full_day');
  const customHours   = blocks.find(b => b.block_type === 'custom_hours');
  const timeBlocks    = blocks.filter(b => b.block_type === 'time_slot').map(b => b.start_time?.slice(0,5));

  const startH = customHours ? customHours.start_time?.slice(0,5) : '15:00';
  const endH   = customHours ? customHours.end_time?.slice(0,5)   : '20:00';

  actionsEl.innerHTML = `
    <div class="avail-day-header">
      <div>
        <div class="avail-day-title">${dateCZ(date)}</div>
        <div class="avail-day-exp">${EXP_LABEL[exp]}</div>
      </div>
    </div>
    <div class="avail-content">

      <!-- 1. Blokování celého dne -->
      <div class="avail-section">
        <div class="avail-section-title">BLOKOVÁNÍ DNE</div>
        <div class="avail-toggle ${isFullBlocked ? 'blocked' : ''}">
          <div class="avail-toggle__info">
            <div class="avail-toggle__label">${isFullBlocked ? '🔴 Den je zablokován' : '🟢 Den je dostupný'}</div>
            <div class="avail-toggle__sub">${isFullBlocked ? 'Žádné rezervace nelze přijmout' : 'Rezervace jsou možné'}</div>
          </div>
          ${isFullBlocked
            ? `<button class="avail-btn avail-btn--unblock" id="btnUnblockDay">ODBLOKOVAT</button>`
            : `<button class="avail-btn avail-btn--danger" id="btnBlockDay">ZABLOKOVAT DEN</button>`
          }
        </div>
      </div>

      <!-- 2. Provozní hodiny -->
      <div class="avail-section">
        <div class="avail-section-title">PROVOZNÍ HODINY</div>
        <div class="hours-row">
          <span class="hours-badge">${startH} — ${endH}</span>
          <button class="avail-btn avail-btn--outline" id="btnCustomHours">Upravit hodiny</button>
          ${customHours ? `<button class="avail-btn avail-btn--unblock" id="btnResetHours">Obnovit výchozí</button>` : ''}
        </div>
      </div>

      <!-- 3. Blokovat konkrétní časy -->
      <div class="avail-section">
        <div class="avail-section-title">BLOKOVAT KONKRÉTNÍ ČASY</div>
        <button class="avail-btn avail-btn--outline" id="btnBlockTimes">
          Otevřít přehled časů${timeBlocks.length ? ` (${timeBlocks.length} blokováno)` : ''}
        </button>
      </div>

      <!-- 4. Rezervace v daném dni -->
      ${reservations.length ? `
      <div class="avail-section">
        <div class="avail-section-title">REZERVACE V TENTO DEN (${reservations.length})</div>
        <div class="avail-reservations">
          ${reservations.map(r => `
            <div class="avail-res-item">
              <span class="avail-res-time">${r.start_time?.slice(0,5)}</span>
              <span class="avail-res-name">${r.name}</span>
              <span class="avail-res-pkg">${PKG_LABEL[r.package] || r.package}</span>
            </div>
          `).join('')}
        </div>
      </div>` : ''}

    </div>
  `;

  // Blokovat / Odblokovat celý den
  document.getElementById('btnBlockDay')?.addEventListener('click', () => blockDay(date, exp));
  document.getElementById('btnUnblockDay')?.addEventListener('click', () => unblockDay(date, exp));

  // Vlastní hodiny
  document.getElementById('btnCustomHours')?.addEventListener('click', () => openCustomHoursModal(date, exp, startH, endH, !!customHours));
  document.getElementById('btnResetHours')?.addEventListener('click', () => resetHours(date, exp));

  // Blokovat časy
  document.getElementById('btnBlockTimes')?.addEventListener('click', () =>
    openBlockTimesModal(date, exp, timeBlocks, reservations.map(r => r.start_time?.slice(0,5)))
  );
}

// Blokovat celý den
async function blockDay(date, exp) {
  const { error } = await sb.from('availability_blocks').insert([{
    experience: exp, date, block_type: 'full_day',
  }]);
  if (error) showToast('Chyba při blokování.', 'err');
  else { showToast('Den byl zablokován.', 'ok'); loadAvailDay(); }
}

async function unblockDay(date, exp) {
  const expFilter = exp === 'all' ? ['okresky', 'sosnova', 'all'] : [exp, 'all'];
  const { error } = await sb.from('availability_blocks')
    .delete()
    .eq('date', date)
    .eq('block_type', 'full_day')
    .in('experience', expFilter);
  if (error) showToast('Chyba při odblokování.', 'err');
  else { showToast('Den byl odblokován.', 'ok'); loadAvailDay(); }
}

// Vlastní hodiny
function openCustomHoursModal(date, exp, currentStart, currentEnd, hasCustom) {
  document.getElementById('customHoursModalDesc').textContent =
    `${dateCZ(date)} · ${EXP_LABEL[exp]}`;
  document.getElementById('customStart').value = currentStart;
  document.getElementById('customEnd').value   = currentEnd;
  document.getElementById('customHoursModal').classList.remove('hidden');

  document.getElementById('customHoursModalSave').onclick = async () => {
    const start = document.getElementById('customStart').value;
    const end   = document.getElementById('customEnd').value;
    if (!start || !end || start >= end) {
      showToast('Neplatný časový rozsah.', 'err'); return;
    }
    // Smaž stávající custom_hours pro tento den
    await sb.from('availability_blocks').delete().eq('date', date).eq('block_type', 'custom_hours').in('experience', exp === 'all' ? ['okresky','sosnova','all'] : [exp,'all']);
    const { error } = await sb.from('availability_blocks').insert([{
      experience: exp, date, block_type: 'custom_hours', start_time: start, end_time: end,
    }]);
    document.getElementById('customHoursModal').classList.add('hidden');
    if (error) showToast('Chyba při ukládání hodin.', 'err');
    else { showToast('Provozní hodiny uloženy.', 'ok'); loadAvailDay(); }
  };
}

document.getElementById('customHoursModalClose').addEventListener('click', () => {
  document.getElementById('customHoursModal').classList.add('hidden');
});

async function resetHours(date, exp) {
  const expFilter = exp === 'all' ? ['okresky','sosnova','all'] : [exp,'all'];
  const { error } = await sb.from('availability_blocks').delete().eq('date', date).eq('block_type', 'custom_hours').in('experience', expFilter);
  if (error) showToast('Chyba.', 'err');
  else { showToast('Hodiny obnoveny na výchozí (15:00–20:00).', 'ok'); loadAvailDay(); }
}

// Blokovat konkrétní časy
function openBlockTimesModal(date, exp, currentBlocks, reservedTimes) {
  document.getElementById('blockTimeModalDesc').textContent =
    `${dateCZ(date)} · ${EXP_LABEL[exp]} — kliknutím zablokuješ / odblokovuješ čas`;

  // Generuj sloty každých 15 min od 15:00 do 19:45
  const slots = [];
  for (let m = 15*60; m < 20*60; m += 15) {
    const h = Math.floor(m/60).toString().padStart(2,'0');
    const mm = (m%60).toString().padStart(2,'0');
    slots.push(`${h}:${mm}`);
  }

  const grid = document.getElementById('slotGrid');
  grid.innerHTML = slots.map(t => {
    const isBlocked  = currentBlocks.includes(t);
    const hasRes     = reservedTimes.includes(t);
    return `<button class="slot-toggle ${isBlocked ? 'blocked' : ''} ${hasRes ? 'has-res' : ''}"
      data-time="${t}" ${hasRes ? 'disabled title="Tady je rezervace"' : ''}>
      ${t}
    </button>`;
  }).join('');

  grid.querySelectorAll('.slot-toggle:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('blocked'));
  });

  document.getElementById('blockTimeModal').classList.remove('hidden');

  document.getElementById('blockTimeModalSave').onclick = async () => {
    const nowBlocked = [...grid.querySelectorAll('.slot-toggle.blocked:not(.has-res)')].map(b => b.dataset.time);
    const expFilter  = exp === 'all' ? ['okresky','sosnova','all'] : [exp,'all'];

    // Smaž stávající time_slot bloky pro tento den
    await sb.from('availability_blocks').delete().eq('date', date).eq('block_type', 'time_slot').in('experience', expFilter);

    // Vlož nové
    if (nowBlocked.length) {
      const rows = nowBlocked.map(t => ({
        experience: exp, date, block_type: 'time_slot', start_time: t,
      }));
      const { error } = await sb.from('availability_blocks').insert(rows);
      if (error) { showToast('Chyba při ukládání bloků.', 'err'); return; }
    }

    document.getElementById('blockTimeModal').classList.add('hidden');
    showToast(`Uloženo. Zablokováno ${nowBlocked.length} časů.`, 'ok');
    loadAvailDay();
  };
}

document.getElementById('blockTimeModalClose').addEventListener('click', () => {
  document.getElementById('blockTimeModal').classList.add('hidden');
});

// Backdrop klik zavře modál
document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.add('hidden'); });
});

// ── Init ─────────────────────────────────────────────────────
checkAuth();
