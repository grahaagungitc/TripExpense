let currentUser = null;
let currentView = 'dashboard';
let appData = { users: [], trips: [], categories: [], expenses: [], payments: [], selectedTripId: null };

// INITIALIZATION
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await db.auth.getSession();
  if (!session || !session.user) {
    window.location.href = 'login.html';
    return;
  }

  const email = session.user.email.toLowerCase().trim();
  const { data: userRecord } = await db.from('users').select('*').ilike('email', email).maybeSingle();

  if (!userRecord) {
    await db.auth.signOut();
    alert(`Akses Ditolak: Email ${email} belum terdaftar!`);
    window.location.href = 'login.html';
    return;
  }

  currentUser = userRecord;
  updateUserUI();

  await refreshAppData();
  hideLoader();
  navigateTo('dashboard');
});

function updateUserUI() {
  document.getElementById('userDisplayName').innerText = currentUser.nama;
  document.getElementById('userRoleBadge').innerText = currentUser.role;
  document.getElementById('userAvatar').innerText = (currentUser.nama || 'U').charAt(0).toUpperCase();

  if (currentUser.role === 'ADMIN') {
    document.getElementById('nav-setup').classList.remove('hidden');
  }
}

function hideLoader() {
  const loader = document.getElementById('appLoader');
  if (loader) {
    loader.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => loader.remove(), 300);
  }
}

async function refreshAppData() {
  const { data: users } = await db.from('users').select('*');
  const { data: trips } = await db.from('trips').select('*').order('created_at', { ascending: true });
  const { data: categories } = await db.from('categories').select('*').order('nama', { ascending: true });
  const { data: expenses } = await db.from('expenses').select('*').order('created_at', { ascending: false });
  const { data: payments } = await db.from('settlement_payments').select('*');

  appData.users = users || [];
  appData.trips = trips || [];
  appData.categories = categories || [];
  appData.expenses = expenses || [];
  appData.payments = payments || [];

  if (!appData.selectedTripId && appData.trips.length > 0) {
    appData.selectedTripId = appData.trips[appData.trips.length - 1].id;
  }
}

// CLIENT-SIDE SEAMLESS ROUTER
function navigateTo(viewName) {
  if (viewName === 'setup' && currentUser.role !== 'ADMIN') {
    alert('Halaman ini khusus Admin!');
    return;
  }

  currentView = viewName;

  // Active Menu Highlight
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('bg-white', 'text-blue-600', 'shadow-lg');
    btn.classList.add('text-blue-100');
  });

  const activeNav = document.getElementById('nav-' + viewName);
  if (activeNav) {
    activeNav.classList.add('bg-white', 'text-blue-600', 'shadow-lg');
    activeNav.classList.remove('text-blue-100');
  }

  const container = document.getElementById('mainContentView');
  container.classList.remove('view-animate-enter');
  void container.offsetWidth; // Trigger reflow for animation
  container.classList.add('view-animate-enter');

  if (viewName === 'dashboard') renderDashboardView();
  else if (viewName === 'expense') renderExpenseView();
  else if (viewName === 'settlement') renderSettlementView();
  else if (viewName === 'logs') renderLogsView();
  else if (viewName === 'setup') renderSetupView();
}

// -------------------------------------------------------------
// 1. DASHBOARD VIEW (LENGKAP DENGAN DATA SARAN TAMBAHAN)
// -------------------------------------------------------------
function renderDashboardView() {
  const selectedTrip = appData.trips.find(t => t.id === appData.selectedTripId) || appData.trips[0];
  const tripExpenses = appData.expenses.filter(e => selectedTrip && e.trip_id === selectedTrip.id);
  
  // Total Stat Event
  const totalEventNominal = tripExpenses.reduce((sum, e) => sum + parseFloat(e.nominal || 0), 0);
  const activeParticipantsCount = (selectedTrip && selectedTrip.active_participant_emails) ? selectedTrip.active_participant_emails.length : appData.users.length;
  const avgPerPerson = activeParticipantsCount > 0 ? (totalEventNominal / activeParticipantsCount) : 0;

  // Personal Utang/Piutang
  let totalPiutang = 0;
  let totalUtang = 0;
  let breakdownMap = {};

  appData.expenses.forEach(exp => {
    const perOrang = exp.nominal / (exp.peserta_emails.length || 1);
    const pembayar = exp.pembayar_email.toLowerCase();

    exp.peserta_emails.forEach(pEmail => {
      const peserta = pEmail.toLowerCase();
      if (peserta !== pembayar) {
        const pay = appData.payments.find(p => p.expense_id === exp.id && p.dari_email.toLowerCase() === peserta);
        const isLunas = pay && pay.status === 'APPROVED';

        if (!isLunas) {
          if (pembayar === currentUser.email.toLowerCase()) {
            totalPiutang += perOrang;
            if (!breakdownMap[peserta]) breakdownMap[peserta] = { piutang: 0, utang: 0 };
            breakdownMap[peserta].piutang += perOrang;
          } else if (peserta === currentUser.email.toLowerCase()) {
            totalUtang += perOrang;
            if (!breakdownMap[pembayar]) breakdownMap[pembayar] = { piutang: 0, utang: 0 };
            breakdownMap[pembayar].utang += perOrang;
          }
        }
      }
    });
  });

  // Kategori Stat Breakdown
  let categoryMap = {};
  tripExpenses.forEach(e => {
    const cat = e.kategori || 'Umum';
    categoryMap[cat] = (categoryMap[cat] || 0) + parseFloat(e.nominal);
  });

  const html = `
    <!-- HEADER & QUICK TRIP SELECTOR -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-black tracking-tight text-slate-900 brand-font">Dashboard Overview</h2>
        <p class="text-xs font-extrabold text-slate-400 mt-0.5">Ringkasan kewajiban & statistik event aktif</p>
      </div>

      <div class="flex items-center gap-3">
        <label class="text-xs font-bold text-slate-500">Pilih Event:</label>
        <select onchange="onDashboardTripChange(this.value)" class="px-4 py-2 bg-white border border-slate-200 rounded-2xl text-xs font-extrabold text-blue-600 shadow-sm focus:outline-none">
          ${appData.trips.map(t => `<option value="${t.id}" ${selectedTrip && selectedTrip.id === t.id ? 'selected' : ''}>${t.judul}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- METRIC CARDS GRID -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-5">
      <div class="bg-blue-600 text-white p-6 rounded-[24px] ui-card-shadow space-y-2">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-blue-200">Total Piutang Saya</span>
        <p class="text-3xl font-black">${'Rp ' + totalPiutang.toLocaleString('id-ID')}</p>
        <p class="text-[11px] text-blue-100 font-semibold">Hak tagihan Anda ke peserta lain</p>
      </div>

      <div class="bg-white p-6 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-2">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Utang Saya</span>
        <p class="text-3xl font-black text-rose-600">${'Rp ' + totalUtang.toLocaleString('id-ID')}</p>
        <p class="text-[11px] text-slate-400 font-semibold">Kewajiban bayar yang belum lunas</p>
      </div>

      <div class="bg-white p-6 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-2">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Pengeluaran Event</span>
        <p class="text-3xl font-black text-slate-900">${'Rp ' + totalEventNominal.toLocaleString('id-ID')}</p>
        <p class="text-[11px] text-slate-400 font-semibold">${tripExpenses.length} transaksi di event ini</p>
      </div>

      <div class="bg-white p-6 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-2">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Estimasi Rata-rata / Orang</span>
        <p class="text-3xl font-black text-emerald-600">${'Rp ' + Math.round(avgPerPerson).toLocaleString('id-ID')}</p>
        <p class="text-[11px] text-slate-400 font-semibold">${activeParticipantsCount} Anggota berpartisipasi</p>
      </div>
    </div>

    <!-- LOWER SECTION: CATEGORY STATS & RINCIAN TAGIHAN -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <!-- RINCIAN UTANG/PIUTANG PER ANGGOTA -->
      <div class="lg:col-span-2 bg-white p-6 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="font-extrabold text-slate-900 text-sm brand-font">Rincian Tagihan Per Anggota</h3>
          <span class="text-[11px] font-bold text-slate-400">Status Terbaru</span>
        </div>
        <div class="divide-y divide-slate-100">
          ${Object.keys(breakdownMap).length === 0 
            ? `<p class="py-6 text-center text-xs text-slate-400 font-semibold">Tidak ada utang atau piutang aktif saat ini.</p>`
            : Object.keys(breakdownMap).map(email => {
                const item = breakdownMap[email];
                const selisih = item.piutang - item.utang;
                return `
                  <div class="py-3.5 flex items-center justify-between text-xs">
                    <div>
                      <p class="font-extrabold text-slate-900">${email}</p>
                      <p class="text-[11px] text-slate-400 font-semibold">Piutang: Rp ${item.piutang.toLocaleString('id-ID')} • Utang: Rp ${item.utang.toLocaleString('id-ID')}</p>
                    </div>
                    <div>
                      ${selisih > 0 
                        ? `<span class="text-emerald-600 bg-emerald-50 font-extrabold px-3 py-1 rounded-full text-[11px]">+ Menagih Rp ${selisih.toLocaleString('id-ID')}</span>`
                        : selisih < 0 
                        ? `<span class="text-rose-600 bg-rose-50 font-extrabold px-3 py-1 rounded-full text-[11px]">- Harus Bayar Rp ${Math.abs(selisih).toLocaleString('id-ID')}</span>`
                        : `<span class="text-slate-400 bg-slate-100 font-semibold px-3 py-1 rounded-full text-[11px]">Lunas</span>`}
                    </div>
                  </div>
                `;
              }).join('')}
        </div>
      </div>

      <!-- WIDGET PROPORSI KATEGORI EXPENSE -->
      <div class="bg-white p-6 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-4">
        <div class="border-b border-slate-100 pb-3">
          <h3 class="font-extrabold text-slate-900 text-sm brand-font">Pengeluaran Per Kategori</h3>
        </div>
        <div class="space-y-3">
          ${Object.keys(categoryMap).length === 0
            ? `<p class="py-6 text-center text-xs text-slate-400 font-semibold">Belum ada pengeluaran.</p>`
            : Object.keys(categoryMap).map(cat => {
                const val = categoryMap[cat];
                const pct = totalEventNominal > 0 ? Math.round((val / totalEventNominal) * 100) : 0;
                return `
                  <div class="space-y-1">
                    <div class="flex justify-between text-xs font-bold">
                      <span class="text-slate-700">${cat}</span>
                      <span class="text-slate-900">Rp ${val.toLocaleString('id-ID')} (${pct}%)</span>
                    </div>
                    <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div class="h-full bg-blue-600 rounded-full" style="width: ${pct}%"></div>
                    </div>
                  </div>
                `;
              }).join('')}
        </div>
      </div>

    </div>
  `;

  document.getElementById('mainContentView').innerHTML = html;
}

function onDashboardTripChange(tripId) {
  appData.selectedTripId = tripId;
  renderDashboardView();
}

// -------------------------------------------------------------
// 2. INPUT EXPENSE VIEW
// -------------------------------------------------------------
function renderExpenseView() {
  const html = `
    <div class="border-b border-slate-200/80 pb-4">
      <h2 class="text-2xl font-black text-slate-900 brand-font">Input Expense Baru</h2>
      <p class="text-xs text-slate-400 mt-0.5">Catat item transaksi baru beserta pembayar dan anggotanya</p>
    </div>

    <section class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-5">
      <form onsubmit="handleExpenseSubmitSPA(event)" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 uppercase">Judul Trip / Event</label>
            <select id="expTripSelect" onchange="onTripSelectChangeSPA(this.value)" required class="w-full px-4 py-2.5 text-xs border border-slate-200 rounded-xl font-bold text-blue-600 bg-slate-50 focus:outline-none">
              ${appData.trips.map(t => `<option value="${t.id}" ${appData.selectedTripId === t.id ? 'selected' : ''}>${t.judul}</option>`).join('')}
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 uppercase">Kategori Expense</label>
            <select id="expKategoriSelect" required class="w-full px-4 py-2.5 text-xs border border-slate-200 rounded-xl font-semibold text-slate-700 bg-slate-50 focus:outline-none">
              ${appData.categories.map(c => `<option value="${c.nama}">${c.nama}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="md:col-span-2 space-y-1">
            <label class="text-xs font-bold text-slate-700 uppercase">Nama Item / Pengeluaran</label>
            <input type="text" id="expNamaItem" required placeholder="Misal: Bensin, Dinner, Tiket Masuk" class="w-full px-4 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none font-bold">
          </div>
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 uppercase">Total Nominal (Rp)</label>
            <input type="number" id="expNominal" required placeholder="500000" class="w-full px-4 py-2.5 text-xs border border-slate-200 rounded-xl font-black text-slate-900 bg-slate-50 focus:outline-none">
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 uppercase">Pembayar Awal:</label>
            <select id="expPembayarSelect" required class="w-full px-4 py-2.5 text-xs border border-slate-200 rounded-xl font-bold text-blue-600 bg-slate-50 focus:outline-none">
              ${appData.users.map(u => `<option value="${u.email}" ${u.email.toLowerCase() === currentUser.email.toLowerCase() ? 'selected' : ''}>${u.nama} (${u.email})</option>`).join('')}
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 uppercase">Foto Struk / Nota</label>
            <input type="file" id="expBuktiFile" accept="image/*,application/pdf" class="w-full text-xs text-slate-500 border border-slate-200 rounded-xl p-2 bg-slate-50">
          </div>
        </div>

        <div class="space-y-2 pt-2 border-t border-slate-100">
          <label class="text-xs font-bold text-slate-700 uppercase">Anggota Yang Menanggung Tagihan Ini:</label>
          <div id="expPesertaChecklistContainer" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2"></div>
        </div>

        <button type="submit" id="btnSaveExpense" class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2">
          <i class="ri-save-line text-sm"></i> Simpan Sub-Expense
        </button>
      </form>
    </section>

    <!-- LOG HISTORI EXPENSE -->
    <section class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 class="font-extrabold text-slate-900 text-sm brand-font">Log Transaksi Pengeluaran</h3>
        <span class="px-3 py-1 bg-blue-50 text-blue-600 rounded-full font-black text-xs">${appData.expenses.length} Transaksi</span>
      </div>
      <div class="divide-y divide-slate-100">
        ${appData.expenses.length === 0
          ? `<p class="py-4 text-center text-xs text-slate-400 font-semibold">Belum ada riwayat transaksi.</p>`
          : appData.expenses.map(e => `
              <div class="py-3 flex items-center justify-between text-xs">
                <div>
                  <span class="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-black text-[10px]">${e.kategori || 'Umum'}</span>
                  <p class="font-black text-slate-900 mt-1">${e.nama_item}</p>
                  <p class="text-slate-400 text-[11px] font-semibold">Dibayar oleh: <strong>${e.pembayar_email}</strong> • ${e.peserta_emails.length} Peserta</p>
                </div>
                <div class="text-right">
                  <p class="font-black text-slate-900 text-sm">Rp ${parseFloat(e.nominal).toLocaleString('id-ID')}</p>
                  ${e.bukti_url ? `<a href="${e.bukti_url}" target="_blank" class="text-blue-600 font-bold hover:underline text-[10px]">Lihat Struk</a>` : ''}
                </div>
              </div>
            `).join('')}
      </div>
    </section>
  `;

  document.getElementById('mainContentView').innerHTML = html;
  onTripSelectChangeSPA(document.getElementById('expTripSelect').value);
}

function onTripSelectChangeSPA(tripId) {
  const targetTrip = appData.trips.find(t => t.id === tripId);
  const activeEmails = targetTrip ? (targetTrip.active_participant_emails || []) : [];
  const eligibleUsers = activeEmails.length > 0 ? appData.users.filter(u => activeEmails.includes(u.email)) : appData.users;

  document.getElementById('expPesertaChecklistContainer').innerHTML = eligibleUsers.map(u => `
    <label class="flex items-center p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl cursor-pointer">
      <input type="checkbox" value="${u.email}" checked class="exp-chk-peserta w-4 h-4 text-blue-600 rounded">
      <span class="ml-2 text-xs font-bold text-slate-700 truncate">${u.nama}</span>
    </label>
  `).join('');
}

async function handleExpenseSubmitSPA(e) {
  e.preventDefault();
  const btn = id => document.getElementById(id);
  const selectedPeserta = Array.from(document.querySelectorAll('.exp-chk-peserta:checked')).map(c => c.value);
  if (!selectedPeserta.length) return alert('Pilih minimal 1 peserta!');

  const tripId = btn('expTripSelect').value;
  const kategori = btn('expKategoriSelect').value;
  const item = btn('expNamaItem').value;
  const nominal = parseFloat(btn('expNominal').value);
  const pembayarEmail = btn('expPembayarSelect').value;
  const fileInput = btn('expBuktiFile');

  let buktiUrl = '';
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const fileName = `${Date.now()}_${file.name}`;
    const { data } = await db.storage.from('receipts').upload(fileName, file);
    if (data) {
      const { data: pubData } = db.storage.from('receipts').getPublicUrl(fileName);
      buktiUrl = pubData.publicUrl;
    }
  }

  const { error } = await db.from('expenses').insert([{
    trip_id: tripId, kategori, nama_item: item, nominal, pembayar_email: pembayarEmail, peserta_emails: selectedPeserta, bukti_url: buktiUrl
  }]);

  if (error) return alert('Gagal menyimpan: ' + error.message);

  await db.from('activity_logs').insert([{
    user_email: currentUser.email, action: 'CREATE_EXPENSE', details: `Menambahkan sub-expense "${item}" senilai Rp ${nominal.toLocaleString('id-ID')}`
  }]);

  await refreshAppData();
  renderExpenseView(); // Re-render tanpa reload halaman
}

// -------------------------------------------------------------
// 3. SETTLEMENT VIEW
// -------------------------------------------------------------
function renderSettlementView() {
  const containerHtml = appData.trips.map(trip => {
    const tripExpenses = appData.expenses.filter(e => e.trip_id === trip.id);
    let summaryMap = {};

    tripExpenses.forEach(exp => {
      const perOrang = exp.nominal / (exp.peserta_emails.length || 1);
      exp.peserta_emails.forEach(pEmail => {
        if (pEmail.toLowerCase() !== exp.pembayar_email.toLowerCase()) {
          const pairKey = `${pEmail.toLowerCase()}->${exp.pembayar_email.toLowerCase()}`;
          if (!summaryMap[pairKey]) {
            summaryMap[pairKey] = { dariEmail: pEmail, keEmail: exp.pembayar_email, totalNominal: 0 };
          }
          summaryMap[pairKey].totalNominal += perOrang;
        }
      });
    });

    return `
      <div class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="font-extrabold text-slate-900 text-sm brand-font">${trip.judul}</h3>
          <span class="text-xs font-bold text-slate-400">${tripExpenses.length} Sub-Expense</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${Object.values(summaryMap).map(s => {
            const isPengutang = currentUser.email.toLowerCase() === s.dariEmail.toLowerCase();
            const isPembayar = currentUser.email.toLowerCase() === s.keEmail.toLowerCase();
            const isAdmin = currentUser.role === 'ADMIN';

            return `
              <div class="p-4 bg-slate-50 border border-slate-200/70 rounded-2xl space-y-3 text-xs">
                <div class="flex items-center justify-between font-black text-slate-900">
                  <span>${s.dariEmail.split('@')[0]} ➔ ${s.keEmail.split('@')[0]}</span>
                  <span class="text-blue-600">Rp ${s.totalNominal.toLocaleString('id-ID')}</span>
                </div>
                <div class="flex items-center justify-between pt-2 border-t border-slate-200/70">
                  ${(isPengutang || isAdmin) ? `
                    <label class="cursor-pointer text-[10px] bg-white border border-blue-300 text-blue-600 px-3 py-1 rounded-full font-bold shadow-sm">
                      Upload Bukti TF
                      <input type="file" accept="image/*,application/pdf" class="hidden" onchange="uploadBulkProofSPA(event, '${trip.id}', '${s.dariEmail}', '${s.keEmail}')">
                    </label>
                  ` : ''}
                  ${(isPembayar || isAdmin) ? `
                    <button onclick="approveSettlementSPA('${trip.id}', '${s.dariEmail}', '${s.keEmail}')" class="text-[10px] bg-emerald-600 text-white px-3 py-1 rounded-full font-bold shadow-md">
                      Approve Lunas
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('mainContentView').innerHTML = `
    <div class="border-b border-slate-200/80 pb-4">
      <h2 class="text-2xl font-black text-slate-900 brand-font">Split & Settlement</h2>
      <p class="text-xs text-slate-400 mt-0.5">Kelola konfirmasi pelunasan antar anggota</p>
    </div>
    <div class="space-y-6">${containerHtml}</div>
  `;
}

async function uploadBulkProofSPA(event, tripId, dariEmail, keEmail) {
  const file = event.target.files[0];
  if (!file) return;

  const fileName = `bulk_${Date.now()}_${file.name}`;
  await db.storage.from('receipts').upload(fileName, file);

  await db.from('activity_logs').insert([{
    user_email: currentUser.email, action: 'UPLOAD_PROOF', details: `Upload bukti bayar ke ${keEmail}`
  }]);

  alert('Bukti transfer berhasil diunggah!');
  await refreshAppData();
  renderSettlementView();
}

async function approveSettlementSPA(tripId, dariEmail, keEmail) {
  if (!confirm(`Setujui pelunasan dari ${dariEmail}?`)) return;

  await db.from('activity_logs').insert([{
    user_email: currentUser.email, action: 'APPROVE_SETTLEMENT', details: `Menyetujui pelunasan dari ${dariEmail}`
  }]);

  alert('Pelunasan berhasil disetujui!');
  await refreshAppData();
  renderSettlementView();
}

// -------------------------------------------------------------
// 4. ACTIVITY LOGS VIEW
// -------------------------------------------------------------
async function renderLogsView() {
  const { data: logs } = await db.from('activity_logs').select('*').order('created_at', { ascending: false });

  document.getElementById('mainContentView').innerHTML = `
    <div class="border-b border-slate-200/80 pb-4">
      <h2 class="text-2xl font-black text-slate-900 brand-font">Log Aktivitas Sistem</h2>
      <p class="text-xs text-slate-400 mt-0.5">Audit trail aktivitas pengguna di aplikasi</p>
    </div>
    <div class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow">
      <div class="divide-y divide-slate-100">
        ${(!logs || logs.length === 0) 
          ? `<p class="py-4 text-center text-xs text-slate-400 font-semibold">Belum ada log aktivitas.</p>`
          : logs.map(l => `
              <div class="py-3.5 flex items-center justify-between text-xs">
                <div>
                  <span class="font-extrabold text-slate-900">${l.user_email}</span>
                  <p class="text-slate-500 font-semibold mt-0.5">${l.details}</p>
                </div>
                <div class="text-right">
                  <span class="px-3 py-1 bg-blue-50 text-blue-600 rounded-full font-black text-[10px]">${l.action}</span>
                  <p class="text-[10px] text-slate-400 font-semibold mt-1">${new Date(l.created_at).toLocaleString('id-ID')}</p>
                </div>
              </div>
            `).join('')}
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// 5. MASTER SETUP VIEW (ADMIN ONLY)
// -------------------------------------------------------------
function renderSetupView() {
  document.getElementById('mainContentView').innerHTML = `
    <div class="border-b border-slate-200/80 pb-4">
      <h2 class="text-2xl font-black text-amber-600 brand-font">Master Setup (Admin Only)</h2>
      <p class="text-xs text-slate-400 mt-0.5">Kelola trip dan user terdaftar</p>
    </div>

    <section class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-3">
      <h3 class="text-xs font-bold uppercase text-slate-700">1. Buat Judul Trip Baru</h3>
      <div class="flex gap-3">
        <input type="text" id="newTripTitle" placeholder="Misal: Outing Bali 2026" class="flex-1 px-4 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none">
        <button onclick="handleCreateTripSPA()" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-md">Buat Trip</button>
      </div>
    </section>

    <section class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-3">
      <h3 class="text-xs font-bold uppercase text-slate-700">2. Tambah Data User Sistem</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input type="text" id="newUserName" placeholder="Nama Lengkap" class="px-4 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none">
        <input type="email" id="newUserEmail" placeholder="email@favehotels.com" class="px-4 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none">
        <div class="flex gap-2">
          <select id="newUserRole" class="px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700">
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <button onclick="handleAddUserSPA()" class="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md">+ Tambah</button>
        </div>
      </div>
    </section>
  `;
}

async function handleCreateTripSPA() {
  const judul = document.getElementById('newTripTitle').value.trim();
  if (!judul) return alert('Masukkan judul trip!');

  await db.from('trips').insert([{ judul, created_by: currentUser.email }]);
  await refreshAppData();
  alert('Trip baru berhasil dibuat!');
  renderSetupView();
}

async function handleAddUserSPA() {
  const nama = document.getElementById('newUserName').value.trim();
  const email = document.getElementById('newUserEmail').value.trim().toLowerCase();
  const role = document.getElementById('newUserRole').value;

  if (!nama || !email) return alert('Lengkapi data user!');

  await db.from('users').insert([{ nama, email, role }]);
  await refreshAppData();
  alert('User baru berhasil ditambahkan!');
  renderSetupView();
}

async function doLogout() {
  localStorage.removeItem('gh_user_session');
  await db.auth.signOut();
  window.location.href = 'login.html';
}
