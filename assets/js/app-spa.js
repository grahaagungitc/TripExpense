let currentUser = null;
let currentView = 'dashboard';
let appData = { users: [], trips: [], categories: [], expenses: [], payments: [], selectedTripId: null };

// -------------------------------------------------------------
// HELPER UTILS: USER AVATAR & NAME MATCHING
// -------------------------------------------------------------
function getUserByEmail(email) {
  if (!email) return null;
  return appData.users.find(u => u.email.toLowerCase().trim() === email.toLowerCase().trim()) || null;
}

function getUserNameByEmail(email) {
  const u = getUserByEmail(email);
  return u ? u.nama : (email ? email.split('@')[0] : 'Unknown');
}

function getUserAvatarHTML(email, sizeClasses = 'w-7 h-7 text-xs') {
  const u = getUserByEmail(email);
  const name = u ? u.nama : (email ? email.split('@')[0] : 'U');
  const avatarUrl = u && u.avatar_url ? u.avatar_url : null;

  if (avatarUrl) {
    return `<img src="${avatarUrl}" alt="${name}" class="${sizeClasses} rounded-full object-cover border border-slate-200/80 shadow-sm shrink-0" referrerpolicy="no-referrer" onError="this.onerror=null; this.outerHTML='<div class=\\'${sizeClasses} rounded-full bg-blue-600 text-white font-extrabold flex items-center justify-center border border-white/40 shrink-0 shadow-sm\\'>${name.charAt(0).toUpperCase()}</div>';">`;
  }

  const initial = name.charAt(0).toUpperCase();
  return `<div class="${sizeClasses} rounded-full bg-blue-600 text-white font-extrabold flex items-center justify-center border border-white/40 shrink-0 shadow-sm">${initial}</div>`;
}

// -------------------------------------------------------------
// NOTIFICATION & MODAL SYSTEM
// -------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColors = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white',
    info: 'bg-slate-900 text-white',
    warning: 'bg-amber-500 text-white'
  };

  toast.className = `pointer-events-auto px-4 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 transform transition-all duration-300 translate-y-4 opacity-0 ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.remove('translate-y-4', 'opacity-0'), 10);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

let modalResolver = null;
function showCustomConfirm(title, message) {
  return new Promise((resolve) => {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMessage').innerText = message;
    document.getElementById('modalInputContainer').classList.add('hidden');
    document.getElementById('modalBtnCancel').classList.remove('hidden');
    
    const confirmBtn = document.getElementById('modalBtnConfirm');
    confirmBtn.innerText = 'Ya, Lanjutkan';
    confirmBtn.onclick = () => { closeCustomModal(true); };

    modalResolver = resolve;
    document.getElementById('customModal').classList.remove('hidden');
  });
}

function closeCustomModal(result) {
  document.getElementById('customModal').classList.add('hidden');
  if (modalResolver) {
    modalResolver(result);
    modalResolver = null;
  }
}

// -------------------------------------------------------------
// 0. AUTHENTICATION & INITIALIZATION
// -------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session }, error: sessionError } = await db.auth.getSession();
  
  if (sessionError || !session || !session.user) {
    await forceLogoutAndRedirect();
    return;
  }

  const email = session.user.email ? session.user.email.toLowerCase().trim() : '';
  const googleAvatar = session.user.user_metadata ? session.user.user_metadata.avatar_url : null;

  if (!email) {
    await forceLogoutAndRedirect('Format email autentikasi tidak valid.');
    return;
  }

  try {
    const { data: userRecord, error: dbError } = await db
      .from('users')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    if (dbError || !userRecord) {
      await forceLogoutAndRedirect(`Akses Ditolak: Email (${email}) belum terdaftar di sistem. Hubungi Admin!`);
      return;
    }

    if (userRecord.status === 'INACTIVE') {
      await forceLogoutAndRedirect(`Akses Ditolak: Akun Anda (${email}) sedang dinonaktifkan oleh Admin.`);
      return;
    }

    // Update avatar_url dari Google Auth jika ada
    if (googleAvatar && userRecord.avatar_url !== googleAvatar) {
      await db.from('users').update({ avatar_url: googleAvatar }).eq('id', userRecord.id);
      userRecord.avatar_url = googleAvatar;
    }

    currentUser = userRecord;
    localStorage.setItem('gh_user_session', JSON.stringify(currentUser));
    
    updateUserUI();
    await refreshAppData();
    hideLoader();
    navigateTo('dashboard');

  } catch (err) {
    console.error("Auth Guard Error:", err);
    await forceLogoutAndRedirect("Terjadi kesalahan sistem saat memverifikasi akses Anda.");
  }
});

async function forceLogoutAndRedirect(errorMessage = null) {
  hideLoader();
  localStorage.removeItem('gh_user_session');
  currentUser = null;

  try { await db.auth.signOut(); } catch (e) {}

  if (errorMessage) alert(errorMessage);
  window.location.replace('login.html');
}

function updateUserUI() {
  document.getElementById('userDisplayName').innerText = currentUser.nama;
  document.getElementById('userRoleBadge').innerText = currentUser.role;
  
  const avatarContainer = document.getElementById('userAvatar');
  if (avatarContainer) {
    avatarContainer.outerHTML = getUserAvatarHTML(currentUser.email, 'w-9 h-9 id="userAvatar"');
  }

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
  const { data: users } = await db.from('users').select('*').order('created_at', { ascending: true });
  const { data: trips } = await db.from('trips').select('*').order('created_at', { ascending: true });
  const { data: categories } = await db.from('categories').select('*').order('nama', { ascending: true });
  const { data: expenses } = await db.from('expenses').select('*').order('created_at', { ascending: false });
  const { data: payments } = await db.from('settlement_payments').select('*');

  appData.users = users || [];
  appData.trips = trips || [];
  appData.categories = categories || [];
  appData.expenses = expenses || [];
  appData.payments = payments || [];

  const activeTrips = appData.trips.filter(t => t.status !== 'INACTIVE');

  if (activeTrips.length > 0) {
    const isStillActive = activeTrips.some(t => t.id === appData.selectedTripId);
    if (!isStillActive) {
      appData.selectedTripId = activeTrips[activeTrips.length - 1].id;
    }
  } else {
    appData.selectedTripId = appData.trips.length > 0 ? appData.trips[0].id : null;
  }
}

// -------------------------------------------------------------
// CLIENT ROUTER & HEADER SELECTOR
// -------------------------------------------------------------
function navigateTo(viewName) {
  if (viewName === 'setup' && currentUser.role !== 'ADMIN') {
    showToast('Halaman ini khusus Admin!', 'warning');
    return;
  }

  currentView = viewName;

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
  void container.offsetWidth;
  container.classList.add('view-animate-enter');

  if (viewName === 'dashboard') renderDashboardView();
  else if (viewName === 'expense') renderExpenseView();
  else if (viewName === 'settlement') renderSettlementView();
  else if (viewName === 'history') renderHistoryView();
  else if (viewName === 'logs') renderLogsView();
  else if (viewName === 'setup') renderSetupView();
}

function renderGlobalTripSelectorHTML() {
  const activeTrips = appData.trips.filter(t => t.status !== 'INACTIVE');
  if (activeTrips.length === 0) return `<p class="text-xs text-rose-500 font-bold">Tidak ada Event Aktif</p>`;

  return `
    <div class="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-sm">
      <i class="ri-map-pin-line text-blue-600 text-sm"></i>
      <span class="text-xs font-bold text-slate-500">Trip Aktif:</span>
      <select onchange="onGlobalTripChange(this.value)" class="bg-transparent text-xs font-extrabold text-blue-600 focus:outline-none cursor-pointer">
        ${activeTrips.map(t => `<option value="${t.id}" ${appData.selectedTripId === t.id ? 'selected' : ''}>${t.judul}</option>`).join('')}
      </select>
    </div>
  `;
}

function onGlobalTripChange(tripId) {
  appData.selectedTripId = tripId;
  navigateTo(currentView);
}

// -------------------------------------------------------------
// 1. DASHBOARD VIEW WITH USER AVATARS
// -------------------------------------------------------------
function renderDashboardView() {
  const selectedTrip = appData.trips.find(t => t.id === appData.selectedTripId);
  const tripExpenses = appData.expenses.filter(e => selectedTrip && e.trip_id === selectedTrip.id);
  const totalEventNominal = tripExpenses.reduce((sum, e) => sum + parseFloat(e.nominal || 0), 0);
  
  const assignedTripEmails = (selectedTrip && selectedTrip.active_participant_emails && selectedTrip.active_participant_emails.length > 0)
    ? selectedTrip.active_participant_emails
    : appData.users.filter(u => u.status !== 'INACTIVE').map(u => u.email);

  const activeParticipantsCount = assignedTripEmails.length;
  const avgPerPerson = activeParticipantsCount > 0 ? (totalEventNominal / activeParticipantsCount) : 0;

  let totalPiutang = 0;
  let totalUtang = 0;
  let breakdownMap = {};
  const myEmail = currentUser.email.toLowerCase().trim();

  tripExpenses.forEach(exp => {
    const pesertaList = exp.peserta_emails || [];
    if (!pesertaList.length) return;

    const perOrang = parseFloat(exp.nominal) / pesertaList.length;
    const pembayar = exp.pembayar_email.toLowerCase().trim();

    pesertaList.forEach(pEmailRaw => {
      const peserta = pEmailRaw.toLowerCase().trim();
      if (peserta !== pembayar) {
        const pay = appData.payments.find(p => p.trip_id === exp.trip_id && p.dari_email.toLowerCase().trim() === peserta && p.ke_email.toLowerCase().trim() === pembayar);
        const isLunas = pay && pay.status === 'APPROVED';

        if (!isLunas) {
          if (pembayar === myEmail) {
            totalPiutang += perOrang;
            if (!breakdownMap[peserta]) breakdownMap[peserta] = { piutang: 0, utang: 0 };
            breakdownMap[peserta].piutang += perOrang;
          } else if (peserta === myEmail) {
            totalUtang += perOrang;
            if (!breakdownMap[pembayar]) breakdownMap[pembayar] = { piutang: 0, utang: 0 };
            breakdownMap[pembayar].utang += perOrang;
          }
        }
      }
    });
  });

  let categoryMap = {};
  tripExpenses.forEach(e => {
    const cat = e.kategori || 'Umum';
    categoryMap[cat] = (categoryMap[cat] || 0) + parseFloat(e.nominal);
  });

  const html = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-black tracking-tight text-slate-900 brand-font">Dashboard Overview</h2>
        <p class="text-xs font-extrabold text-slate-400 mt-0.5">Ringkasan transaksi trip "${selectedTrip ? selectedTrip.judul : 'Tidak Ada Trip'}"</p>
      </div>
      <div>${renderGlobalTripSelectorHTML()}</div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-5">
      <div class="bg-blue-600 text-white p-6 rounded-[24px] ui-card-shadow space-y-2">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-blue-200">Total Piutang Saya</span>
        <p class="text-3xl font-black">${'Rp ' + Math.round(totalPiutang).toLocaleString('id-ID')}</p>
        <p class="text-[11px] text-blue-100 font-semibold">Hak tagihan Anda pada trip ini</p>
      </div>

      <div class="bg-white p-6 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-2">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Utang Saya</span>
        <p class="text-3xl font-black text-rose-600">${'Rp ' + Math.round(totalUtang).toLocaleString('id-ID')}</p>
        <p class="text-[11px] text-slate-400 font-semibold">Kewajiban bayar pada trip ini</p>
      </div>

      <div class="bg-white p-6 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-2">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Pengeluaran Trip</span>
        <p class="text-3xl font-black text-slate-900">${'Rp ' + Math.round(totalEventNominal).toLocaleString('id-ID')}</p>
        <p class="text-[11px] text-slate-400 font-semibold">${tripExpenses.length} transaksi di trip ini</p>
      </div>

      <div class="bg-white p-6 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-2">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Estimasi Rata-rata / Orang</span>
        <p class="text-3xl font-black text-emerald-600">${'Rp ' + Math.round(avgPerPerson).toLocaleString('id-ID')}</p>
        <p class="text-[11px] text-slate-400 font-semibold">${activeParticipantsCount} Anggota Terdaftar Trip</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 bg-white p-6 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="font-extrabold text-slate-900 text-sm brand-font">Rincian Tagihan Per Anggota</h3>
          <span class="text-[11px] font-bold text-slate-400">Status Terbaru</span>
        </div>
        <div class="divide-y divide-slate-100">
          ${Object.keys(breakdownMap).length === 0 
            ? `<p class="py-6 text-center text-xs text-slate-400 font-semibold">Tidak ada utang atau piutang aktif pada trip ini.</p>`
            : Object.keys(breakdownMap).map(email => {
                const item = breakdownMap[email];
                const selisih = Math.round(item.piutang - item.utang);
                const namaUser = getUserNameByEmail(email);

                return `
                  <div class="py-3.5 flex items-center justify-between text-xs">
                    <div class="flex items-center gap-3">
                      ${getUserAvatarHTML(email, 'w-8 h-8 text-xs')}
                      <div>
                        <p class="font-extrabold text-slate-900">${namaUser} <span class="text-[10px] text-slate-400 font-semibold">(${email})</span></p>
                        <p class="text-[11px] text-slate-400 font-semibold">Piutang: Rp ${Math.round(item.piutang).toLocaleString('id-ID')} • Utang: Rp ${Math.round(item.utang).toLocaleString('id-ID')}</p>
                      </div>
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
                      <span class="text-slate-900">Rp ${Math.round(val).toLocaleString('id-ID')} (${pct}%)</span>
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

// -------------------------------------------------------------
// 2. INPUT EXPENSE VIEW
// -------------------------------------------------------------
function renderExpenseView() {
  const selectedTrip = appData.trips.find(t => t.id === appData.selectedTripId);
  const activeCategories = appData.categories.filter(c => c.status !== 'INACTIVE');
  
  const assignedTripEmails = (selectedTrip && selectedTrip.active_participant_emails && selectedTrip.active_participant_emails.length > 0)
    ? selectedTrip.active_participant_emails
    : appData.users.filter(u => u.status !== 'INACTIVE').map(u => u.email);

  const eligibleUsers = appData.users.filter(u => u.status !== 'INACTIVE' && assignedTripEmails.includes(u.email));
  const scopedExpenses = appData.expenses.filter(e => selectedTrip && e.trip_id === selectedTrip.id);

  const html = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
      <div>
        <h2 class="text-2xl font-black text-slate-900 brand-font">Input Expense Baru</h2>
        <p class="text-xs text-slate-400 mt-0.5">Menambahkan transaksi untuk trip: <strong>${selectedTrip ? selectedTrip.judul : 'Pilih Trip'}</strong></p>
      </div>
      <div>${renderGlobalTripSelectorHTML()}</div>
    </div>

    <section class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-5">
      <form onsubmit="handleExpenseSubmitSPA(event)" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 uppercase">Kategori Expense</label>
            <select id="expKategoriSelect" required class="w-full px-4 py-2.5 text-xs border border-slate-200 rounded-xl font-semibold text-slate-700 bg-slate-50 focus:outline-none">
              ${activeCategories.length > 0 
                ? activeCategories.map(c => `<option value="${c.nama}">${c.nama}</option>`).join('')
                : `<option value="Umum">Umum</option>`}
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 uppercase">Nama Item / Pengeluaran</label>
            <input type="text" id="expNamaItem" required placeholder="Misal: Bensin, Dinner, Tiket Masuk" class="w-full px-4 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none font-bold">
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 uppercase">Total Nominal (Rp)</label>
            <input type="number" id="expNominal" required placeholder="500000" class="w-full px-4 py-2.5 text-xs border border-slate-200 rounded-xl font-black text-slate-900 bg-slate-50 focus:outline-none">
          </div>
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 uppercase">Pembayar Awal:</label>
            <select id="expPembayarSelect" required class="w-full px-4 py-2.5 text-xs border border-slate-200 rounded-xl font-bold text-blue-600 bg-slate-50 focus:outline-none">
              ${eligibleUsers.length > 0 
                ? eligibleUsers.map(u => `<option value="${u.email}" ${u.email.toLowerCase() === currentUser.email.toLowerCase() ? 'selected' : ''}>${u.nama} (${u.email})</option>`).join('')
                : `<option value="">Belum ada peserta di-assign ke trip ini</option>`}
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 uppercase">Foto Struk / Nota Pembayaran Awal</label>
            <input type="file" id="expBuktiFile" accept="image/*,application/pdf" class="w-full text-xs text-slate-500 border border-slate-200 rounded-xl p-2 bg-slate-50">
          </div>
        </div>

        <div class="space-y-2 pt-2 border-t border-slate-100">
          <label class="text-xs font-bold text-slate-700 uppercase">Anggota Yang Menanggung Tagihan Ini:</label>
          <div id="expPesertaChecklistContainer" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            ${eligibleUsers.length === 0 
              ? `<p class="text-xs text-slate-400 italic col-span-4">Belum ada anggota yang di-assign ke trip ini.</p>`
              : eligibleUsers.map(u => `
                  <label class="flex items-center p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl cursor-pointer gap-2">
                    <input type="checkbox" value="${u.email}" checked class="exp-chk-peserta w-4 h-4 text-blue-600 rounded">
                    ${getUserAvatarHTML(u.email, 'w-6 h-6 text-[10px]')}
                    <span class="text-xs font-bold text-slate-700 truncate">${u.nama}</span>
                  </label>
                `).join('')}
          </div>
        </div>

        <button type="submit" id="btnSaveExpense" class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2">
          <i class="ri-save-line text-sm"></i> Simpan Sub-Expense
        </button>
      </form>
    </section>

    <section class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 class="font-extrabold text-slate-900 text-sm brand-font">Log Transaksi: ${selectedTrip ? selectedTrip.judul : ''}</h3>
        <span class="px-3 py-1 bg-blue-50 text-blue-600 rounded-full font-black text-xs">${scopedExpenses.length} Transaksi</span>
      </div>
      <div class="divide-y divide-slate-100">
        ${scopedExpenses.length === 0
          ? `<p class="py-4 text-center text-xs text-slate-400 font-semibold">Belum ada transaksi dicatat untuk trip ini.</p>`
          : scopedExpenses.map(e => `
              <div class="py-3 flex items-center justify-between text-xs">
                <div class="flex items-center gap-3">
                  ${getUserAvatarHTML(e.pembayar_email, 'w-8 h-8 text-xs')}
                  <div>
                    <span class="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-black text-[10px]">${e.kategori || 'Umum'}</span>
                    <p class="font-black text-slate-900 mt-1">${e.nama_item}</p>
                    <p class="text-slate-400 text-[11px] font-semibold">Dibayar oleh: <strong>${getUserNameByEmail(e.pembayar_email)}</strong> • ${e.peserta_emails.length} Peserta</p>
                  </div>
                </div>
                <div class="text-right flex items-center gap-3">
                  ${e.bukti_url ? `
                    <a href="${e.bukti_url}" target="_blank" class="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition flex items-center gap-1 text-[11px]">
                      <i class="ri-file-text-line"></i> Struk Awal
                    </a>
                  ` : ''}
                  <div>
                    <p class="font-black text-slate-900 text-sm">Rp ${parseFloat(e.nominal).toLocaleString('id-ID')}</p>
                  </div>
                </div>
              </div>
            `).join('')}
      </div>
    </section>
  `;

  document.getElementById('mainContentView').innerHTML = html;
}

async function handleExpenseSubmitSPA(e) {
  e.preventDefault();
  const btn = id => document.getElementById(id);
  const selectedPeserta = Array.from(document.querySelectorAll('.exp-chk-peserta:checked')).map(c => c.value);
  if (!selectedPeserta.length) return showToast('Pilih minimal 1 peserta!', 'warning');

  const tripId = appData.selectedTripId;
  if (!tripId) return showToast('Pilih trip aktif terlebih dahulu!', 'warning');

  const kategori = btn('expKategoriSelect').value;
  const item = btn('expNamaItem').value;
  const nominal = parseFloat(btn('expNominal').value);
  const pembayarEmail = btn('expPembayarSelect').value;
  const fileInput = btn('expBuktiFile');

  let buktiUrl = '';
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const fileName = `struk_${Date.now()}_${file.name}`;
    const { data } = await db.storage.from('receipts').upload(fileName, file);
    if (data) {
      const { data: pubData } = db.storage.from('receipts').getPublicUrl(fileName);
      buktiUrl = pubData.publicUrl;
    }
  }

  const { error } = await db.from('expenses').insert([{
    trip_id: tripId, kategori, nama_item: item, nominal, pembayar_email: pembayarEmail, peserta_emails: selectedPeserta, bukti_url: buktiUrl
  }]);

  if (error) return showToast('Gagal menyimpan: ' + error.message, 'error');

  await db.from('activity_logs').insert([{
    user_email: currentUser.email, action: 'CREATE_EXPENSE', details: `Menambahkan sub-expense "${item}" senilai Rp ${nominal.toLocaleString('id-ID')}`
  }]);

  showToast('Transaksi berhasil disimpan!', 'success');
  await refreshAppData();
  renderExpenseView();
}

// -------------------------------------------------------------
// 3. SETTLEMENT VIEW (APPROVAL, REJECT, BUKTI TF & EDIT FILE)
// -------------------------------------------------------------
function renderSettlementView() {
  const selectedTrip = appData.trips.find(t => t.id === appData.selectedTripId);
  const tripExpenses = appData.expenses.filter(e => selectedTrip && e.trip_id === selectedTrip.id);
  
  let summaryMap = {};

  // 1. Hitung utang-piutang antar anggota
  tripExpenses.forEach(exp => {
    const totalPeserta = (exp.peserta_emails && exp.peserta_emails.length) ? exp.peserta_emails.length : 1;
    const perOrang = parseFloat(exp.nominal || 0) / totalPeserta;
    const pembayarLower = (exp.pembayar_email || '').toLowerCase().trim();

    (exp.peserta_emails || []).forEach(pEmailRaw => {
      const pesertaLower = (pEmailRaw || '').toLowerCase().trim();

      if (pesertaLower !== pembayarLower) {
        const pairKey = `${pesertaLower}->${pembayarLower}`;

        if (!summaryMap[pairKey]) {
          summaryMap[pairKey] = { 
            dariEmail: pesertaLower, 
            keEmail: pembayarLower, 
            totalNominal: 0,
            expenseStruks: []
          };
        }

        summaryMap[pairKey].totalNominal += perOrang;
      }
    });
  });

  // 2. Kumpulkan SEMUA foto nota/struk dari transaksi yang dibayar oleh Penagih (keEmail) pada trip ini
  Object.keys(summaryMap).forEach(pairKey => {
    const keEmail = summaryMap[pairKey].keEmail;

    const penagihExpenses = tripExpenses.filter(e => 
      (e.pembayar_email || '').toLowerCase().trim() === keEmail
    );

    penagihExpenses.forEach(exp => {
      // Cek variasi nama kolom URL bukti struk
      const strukUrl = exp.bukti_url || exp.bukti_foto || exp.bukti_transfer || exp.receipt_url || null;

      if (strukUrl) {
        const isExist = summaryMap[pairKey].expenseStruks.some(s => s.url === strukUrl);
        if (!isExist) {
          summaryMap[pairKey].expenseStruks.push({
            item: exp.nama_item || 'Expense',
            url: strukUrl,
            nominal: exp.nominal
          });
        }
      }
    });
  });

  const cardsHtml = Object.values(summaryMap).length === 0
    ? `<div class="bg-white p-8 rounded-[24px] text-center text-xs text-slate-400 font-bold border border-slate-200/70">Tidak ada utang/piutang gantung pada trip "${selectedTrip ? selectedTrip.judul : ''}".</div>`
    : Object.values(summaryMap).map(s => {
        const dariNama = getUserNameByEmail(s.dariEmail);
        const keNama = getUserNameByEmail(s.keEmail);
        const isPengutang = currentUser.email.toLowerCase().trim() === s.dariEmail;
        const isPembayar = currentUser.email.toLowerCase().trim() === s.keEmail;
        const isAdmin = currentUser.role === 'ADMIN';

        // Cari record bukti pelunasan transfer dari settlement_payments
        const paymentRecord = appData.payments.find(p => 
          p.trip_id === selectedTrip.id && 
          (p.dari_email || '').toLowerCase().trim() === s.dariEmail && 
          (p.ke_email || '').toLowerCase().trim() === s.keEmail
        );

        const status = paymentRecord ? paymentRecord.status : 'PENDING';
        const buktiTfUrl = paymentRecord ? (paymentRecord.bukti_url || paymentRecord.bukti_tf) : null;
        const hasBuktiTF = !!buktiTfUrl;

        return `
          <div class="p-5 bg-slate-50 border border-slate-200/80 rounded-[20px] space-y-4 text-xs ui-card-shadow">
            
            <!-- INFORMASI USER -->
            <div class="flex items-center justify-between pb-3 border-b border-slate-200/60">
              <div class="flex items-center gap-2">
                ${getUserAvatarHTML(s.dariEmail, 'w-8 h-8 text-xs')}
                <i class="ri-arrow-right-line text-slate-400 text-sm"></i>
                ${getUserAvatarHTML(s.keEmail, 'w-8 h-8 text-xs')}
                <div class="ml-1">
                  <p class="font-extrabold text-slate-900">${dariNama} <span class="text-slate-400 font-normal">➔</span> ${keNama}</p>
                  <p class="text-[10px] text-slate-400 font-semibold">${s.dariEmail}</p>
                </div>
              </div>
              <span class="text-base font-black text-blue-600">Rp ${Math.round(s.totalNominal).toLocaleString('id-ID')}</span>
            </div>

            <!-- BERKAS PEMBAYARAN (BUKTI TF + NOTA EXPENSE AWAL) -->
            <div class="space-y-2 bg-white p-3.5 rounded-xl border border-slate-200/60">
              <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Berkas / Lampiran Pembayaran:</p>
              
              <div class="flex flex-wrap items-center gap-2">
                <!-- BUKTI TRANSFER (PELUNASAN) -->
                ${hasBuktiTF ? `
                  <div class="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl font-bold text-[11px]">
                    <i class="ri-checkbox-circle-fill text-emerald-600"></i>
                    <a href="${buktiTfUrl}" target="_blank" class="hover:underline">Lihat Bukti TF</a>
                    ${(isPengutang || isAdmin) && status !== 'APPROVED' ? `
                      <label class="cursor-pointer ml-1 text-slate-400 hover:text-blue-600" title="Ganti Bukti TF">
                        <i class="ri-edit-line"></i>
                        <input type="file" accept="image/*,application/pdf" class="hidden" onchange="uploadBulkProofSPA(event, '${selectedTrip.id}', '${s.dariEmail}', '${s.keEmail}')">
                      </label>
                    ` : ''}
                  </div>
                ` : `
                  <span class="text-[11px] text-slate-400 font-semibold italic">Belum ada Bukti TF</span>
                `}

                <span class="text-slate-300">•</span>

                <!-- NOTA STRUK EXPENSE AWAL DARI PENAGIH -->
                ${s.expenseStruks.length > 0 ? s.expenseStruks.map(st => `
                  <a href="${st.url}" target="_blank" class="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-xl font-bold text-[11px] hover:bg-blue-100 transition shadow-sm">
                    <i class="ri-file-text-line text-blue-600 text-sm"></i> Struk Awal (${st.item})
                  </a>
                `).join('') : `
                  <span class="text-[11px] text-slate-400 font-semibold italic">Tidak ada foto nota expense</span>
                `}
              </div>
            </div>

            <!-- STATUS BADGE & ACTION BUTTONS -->
            <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div>
                ${status === 'APPROVED' ? `
                  <span class="px-3 py-1 bg-emerald-100 text-emerald-700 font-black text-[11px] rounded-full flex items-center gap-1">
                    <i class="ri-check-double-line"></i> LUNAS (Approved)
                  </span>
                ` : status === 'REJECTED' ? `
                  <span class="px-3 py-1 bg-rose-100 text-rose-700 font-black text-[11px] rounded-full flex items-center gap-1">
                    <i class="ri-close-circle-line"></i> DITOLAK (Upload Ulang)
                  </span>
                ` : `
                  <span class="px-3 py-1 bg-amber-100 text-amber-700 font-black text-[11px] rounded-full flex items-center gap-1">
                    <i class="ri-time-line"></i> MENUNGGU PROSES
                  </span>
                `}
              </div>

              <div class="flex items-center gap-2">
                ${(isPengutang || isAdmin) && status !== 'APPROVED' ? `
                  <label class="cursor-pointer text-[11px] bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl font-bold shadow-md transition flex items-center gap-1">
                    <i class="ri-upload-2-line"></i> ${hasBuktiTF ? 'Ganti Bukti TF' : 'Upload Bukti TF'}
                    <input type="file" accept="image/*,application/pdf" class="hidden" onchange="uploadBulkProofSPA(event, '${selectedTrip.id}', '${s.dariEmail}', '${s.keEmail}')">
                  </label>
                ` : ''}

                ${(isPembayar || isAdmin) && hasBuktiTF && status !== 'APPROVED' ? `
                  <button onclick="updateSettlementStatusSPA('${selectedTrip.id}', '${s.dariEmail}', '${s.keEmail}', 'APPROVED')" class="text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl font-bold shadow-md transition">
                    Approve Lunas
                  </button>
                  <button onclick="updateSettlementStatusSPA('${selectedTrip.id}', '${s.dariEmail}', '${s.keEmail}', 'REJECTED')" class="text-[11px] bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl font-bold shadow-md transition">
                    Reject
                  </button>
                ` : ''}
              </div>
            </div>

          </div>
        `;
      }).join('');

  document.getElementById('mainContentView').innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
      <div>
        <h2 class="text-2xl font-black text-slate-900 brand-font">Split & Settlement</h2>
        <p class="text-xs text-slate-400 mt-0.5">Konfirmasi pelunasan & rekap nota untuk trip: <strong>${selectedTrip ? selectedTrip.judul : 'Pilih Trip'}</strong></p>
      </div>
      <div>${renderGlobalTripSelectorHTML()}</div>
    </div>

    <div class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 class="font-extrabold text-slate-900 text-sm brand-font">${selectedTrip ? selectedTrip.judul : ''}</h3>
        <span class="text-xs font-bold text-slate-400">${tripExpenses.length} Sub-Expense</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${cardsHtml}</div>
    </div>
  `;
}
// UPLOAD ATAU GANTI BUKTI TF
async function uploadBulkProofSPA(event, tripId, dariEmail, keEmail) {
  const file = event.target.files[0];
  if (!file) return;

  const fileName = `tf_${Date.now()}_${file.name}`;
  const { data, error: uploadError } = await db.storage.from('receipts').upload(fileName, file);

  if (uploadError) return showToast('Gagal upload bukti: ' + uploadError.message, 'error');

  const { data: pubData } = db.storage.from('receipts').getPublicUrl(fileName);
  const buktiUrl = pubData.publicUrl;

  const dariClean = dariEmail.toLowerCase().trim();
  const keClean = keEmail.toLowerCase().trim();

  // 1. Cek apakah record sudah ada
  const { data: existingRecords } = await db.from('settlement_payments')
    .select('id')
    .eq('trip_id', tripId)
    .eq('dari_email', dariClean)
    .eq('ke_email', keClean);

  let dbError = null;

  if (existingRecords && existingRecords.length > 0) {
    // Update jika record sudah ada
    const res = await db.from('settlement_payments').update({
      bukti_url: buktiUrl,
      status: 'PENDING',
      updated_at: new Date().toISOString()
    }).eq('id', existingRecords[0].id);
    dbError = res.error;
  } else {
    // Insert jika record belum ada
    const res = await db.from('settlement_payments').insert([{
      trip_id: tripId,
      dari_email: dariClean,
      ke_email: keClean,
      bukti_url: buktiUrl,
      status: 'PENDING'
    }]);
    dbError = res.error;
  }

  if (dbError) return showToast('Gagal update database: ' + dbError.message, 'error');

  await db.from('activity_logs').insert([{
    user_email: currentUser.email, action: 'UPLOAD_PROOF', details: `Unggah bukti TF dari ${dariEmail} ke ${keEmail}`
  }]);

  showToast('Bukti transfer berhasil diunggah! Menunggu approval.', 'success');
  await refreshAppData();
  renderSettlementView();
}

// UPDATE STATUS APPROVAL / REJECT DENGAN AMAN
async function updateSettlementStatusSPA(tripId, dariEmail, keEmail, newStatus) {
  const title = newStatus === 'APPROVED' ? 'Approve Pelunasan' : 'Tolak / Reject Bukti TF';
  const msg = newStatus === 'APPROVED' 
    ? `Apakah Anda yakin menyetujui pelunasan dari ${getUserNameByEmail(dariEmail)}?`
    : `Tolak bukti transfer dari ${getUserNameByEmail(dariEmail)}? Pengutang harus mengunggah bukti baru.`;

  const isConfirmed = await showCustomConfirm(title, msg);
  if (!isConfirmed) return;

  const dariClean = dariEmail.toLowerCase().trim();
  const keClean = keEmail.toLowerCase().trim();

  const { data: existingRecords } = await db.from('settlement_payments')
    .select('id')
    .eq('trip_id', tripId)
    .eq('dari_email', dariClean)
    .eq('ke_email', keClean);

  let dbError = null;

  if (existingRecords && existingRecords.length > 0) {
    const res = await db.from('settlement_payments').update({
      status: newStatus,
      updated_at: new Date().toISOString()
    }).eq('id', existingRecords[0].id);
    dbError = res.error;
  } else {
    const res = await db.from('settlement_payments').insert([{
      trip_id: tripId,
      dari_email: dariClean,
      ke_email: keClean,
      status: newStatus
    }]);
    dbError = res.error;
  }

  if (dbError) return showToast('Gagal mengubah status: ' + dbError.message, 'error');

  await db.from('activity_logs').insert([{
    user_email: currentUser.email, action: `SETTLEMENT_${newStatus}`, details: `${newStatus === 'APPROVED' ? 'Menyetujui' : 'Menolak'} pelunasan dari ${dariEmail}`
  }]);

  showToast(newStatus === 'APPROVED' ? 'Pelunasan disetujui (LUNAS)!' : 'Bukti transfer ditolak!', newStatus === 'APPROVED' ? 'success' : 'warning');
  await refreshAppData();
  renderSettlementView();
}

// -------------------------------------------------------------
// 4. HISTORY TRIP VIEW
// -------------------------------------------------------------
function renderHistoryView() {
  const allTrips = appData.trips;

  const html = `
    <div class="border-b border-slate-200/80 pb-4">
      <h2 class="text-2xl font-black text-slate-900 brand-font">History Trip & Arsip</h2>
      <p class="text-xs text-slate-400 mt-0.5">Daftar seluruh trip yang pernah dibuat beserta trip yang sudah di-nonaktifkan</p>
    </div>

    <div class="space-y-6">
      ${allTrips.length === 0
        ? `<p class="p-8 text-center text-xs text-slate-400 font-bold bg-white rounded-[24px]">Belum ada data trip di sistem.</p>`
        : allTrips.map(trip => {
            const isInactive = trip.status === 'INACTIVE';
            const tripExpenses = appData.expenses.filter(e => e.trip_id === trip.id);
            const totalNominal = tripExpenses.reduce((sum, e) => sum + parseFloat(e.nominal || 0), 0);

            return `
              <div class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-4 ${isInactive ? 'opacity-85 bg-slate-50/50' : ''}">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 class="font-extrabold text-slate-900 text-base brand-font flex items-center gap-2">
                      ${trip.judul}
                      ${isInactive 
                        ? `<span class="px-2.5 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-black">INACTIVE / SELESAI</span>` 
                        : `<span class="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black">AKTIF</span>`}
                    </h3>
                    <div class="flex items-center gap-1.5 mt-1">
                      ${getUserAvatarHTML(trip.created_by, 'w-4 h-4 text-[9px]')}
                      <p class="text-[11px] text-slate-400 font-semibold">Dibuat oleh: ${getUserNameByEmail(trip.created_by)}</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <span class="text-xs font-bold text-slate-400">Total Pengeluaran:</span>
                    <p class="text-lg font-black text-blue-600">Rp ${Math.round(totalNominal).toLocaleString('id-ID')}</p>
                  </div>
                </div>

                <div class="space-y-2">
                  <p class="text-xs font-bold text-slate-700 uppercase tracking-wider">Riwayat Sub-Expense (${tripExpenses.length}):</p>
                  <div class="divide-y divide-slate-100 max-h-48 overflow-y-auto custom-scrollbar">
                    ${tripExpenses.length === 0
                      ? `<p class="py-2 text-xs text-slate-400 italic">Tidak ada transaksi.</p>`
                      : tripExpenses.map(e => `
                          <div class="py-2 flex justify-between items-center text-xs">
                            <div class="flex items-center gap-2">
                              ${getUserAvatarHTML(e.pembayar_email, 'w-5 h-5 text-[9px]')}
                              <span class="font-bold text-slate-800">${e.nama_item}</span>
                              <span class="text-[10px] text-slate-400">(${e.kategori || 'Umum'})</span>
                            </div>
                            <span class="font-black text-slate-900">Rp ${parseFloat(e.nominal).toLocaleString('id-ID')}</span>
                          </div>
                        `).join('')}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
    </div>
  `;

  document.getElementById('mainContentView').innerHTML = html;
}

// -------------------------------------------------------------
// 5. ACTIVITY LOGS VIEW
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
                <div class="flex items-center gap-3">
                  ${getUserAvatarHTML(l.user_email, 'w-7 h-7 text-xs')}
                  <div>
                    <span class="font-extrabold text-slate-900">${getUserNameByEmail(l.user_email)} (${l.user_email})</span>
                    <p class="text-slate-500 font-semibold mt-0.5">${l.details}</p>
                  </div>
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
// 6. MASTER SETUP VIEW
// -------------------------------------------------------------
function renderSetupView() {
  const activeUsers = appData.users.filter(u => u.status !== 'INACTIVE');

  document.getElementById('mainContentView').innerHTML = `
    <div class="border-b border-slate-200/80 pb-4">
      <h2 class="text-2xl font-black text-amber-600 brand-font">Master Setup (Khusus Admin)</h2>
      <p class="text-xs text-slate-400 mt-0.5">Kelola trip, user terdaftar, dan kategori pengeluaran</p>
    </div>

    <!-- 1. TRIP MANAGEMENT WITH USER ASSIGNMENT -->
    <section class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-4">
      <h3 class="text-xs font-bold uppercase text-slate-700">1. Buat & Kelola Judul Trip</h3>
      
      <div class="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
        <div class="flex gap-3">
          <input type="text" id="newTripTitle" placeholder="Misal: Outing Bali 2026" class="flex-1 px-4 py-2.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none font-bold">
          <button onclick="handleCreateTripSPA()" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-md">Buat Trip</button>
        </div>
        <div class="space-y-1">
          <label class="text-[11px] font-bold text-slate-500 uppercase">Pilih Anggota yang Di-assign ke Trip Ini:</label>
          <div id="newTripUsersChecklist" class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            ${activeUsers.map(u => `
              <label class="flex items-center p-2 bg-white border border-slate-200 rounded-xl cursor-pointer gap-2">
                <input type="checkbox" value="${u.email}" checked class="trip-new-chk-user w-3.5 h-3.5 text-blue-600 rounded">
                ${getUserAvatarHTML(u.email, 'w-5 h-5 text-[9px]')}
                <span class="text-xs font-bold text-slate-700 truncate">${u.nama}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="pt-2">
        <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Daftar Trip Terdaftar:</p>
        <div class="space-y-2">
          ${appData.trips.length === 0 
            ? `<p class="text-xs text-slate-400 italic">Belum ada trip.</p>`
            : appData.trips.map(t => {
                const isInactive = t.status === 'INACTIVE';
                const assignedCount = (t.active_participant_emails || []).length;
                return `
                  <div class="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs flex justify-between items-center ${isInactive ? 'opacity-60' : ''}">
                    <div>
                      <span class="font-bold text-slate-800">${t.judul}</span>
                      <span class="text-[10px] text-blue-600 font-bold ml-2">(${assignedCount} Anggota Ter-assign)</span>
                      ${isInactive ? '<span class="text-[9px] px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full font-bold ml-1">INACTIVE</span>' : ''}
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                      <button onclick="openAssignUsersModalSPA('${t.id}')" class="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 rounded-lg text-[10px] font-bold">Edit Anggota</button>
                      <button onclick="handleEditTripSPA('${t.id}', '${t.judul.replace(/'/g, "\\'")}')" class="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold">Edit Judul</button>
                      <button onclick="handleToggleTripStatusSPA('${t.id}', '${t.status || 'ACTIVE'}')" class="px-2.5 py-1 ${isInactive ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'} rounded-lg text-[10px] font-bold">${isInactive ? 'Aktifkan' : 'Nonaktif'}</button>
                      <button onclick="handleDeleteTripSPA('${t.id}', '${t.judul.replace(/'/g, "\\'")}')" class="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 rounded-lg text-[10px] font-bold">Hapus</button>
                    </div>
                  </div>
                `;
              }).join('')}
        </div>
      </div>
    </section>

    <!-- 2. USER MANAGEMENT -->
    <section class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-4">
      <h3 class="text-xs font-bold uppercase text-slate-700">2. Tambah & Kelola User Sistem</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input type="text" id="newUserName" placeholder="Nama Lengkap" class="px-4 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none font-bold">
        <input type="email" id="newUserEmail" placeholder="email@favehotels.com" class="px-4 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none">
        <div class="flex gap-2">
          <select id="newUserRole" class="px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700">
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <button onclick="handleAddUserSPA()" class="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md">+ Tambah</button>
        </div>
      </div>
      <div class="pt-2">
        <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Daftar User Terdaftar Database:</p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          ${appData.users.length === 0 
            ? `<p class="text-xs text-slate-400 italic">Belum ada user di database.</p>`
            : appData.users.map(u => {
                const isInactive = u.status === 'INACTIVE';
                return `
                  <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 ${isInactive ? 'opacity-60' : ''}">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                      ${getUserAvatarHTML(u.email, 'w-9 h-9 text-xs')}
                      <div class="min-w-0 flex-1">
                        <p class="font-bold text-slate-900 truncate">${u.nama} <span class="text-[9px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold ml-1">${u.role}</span> ${isInactive ? '<span class="text-[9px] px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full font-bold">INACTIVE</span>' : ''}</p>
                        <p class="text-[10px] text-slate-400 truncate mt-0.5">${u.email}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                      <button onclick="openEditUserModalSPA('${u.id}')" class="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold">Edit Full</button>
                      <button onclick="handleToggleUserStatusSPA('${u.id}', '${u.status || 'ACTIVE'}')" class="px-2.5 py-1 ${isInactive ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'} rounded-lg text-[10px] font-bold">${isInactive ? 'Aktifkan' : 'Nonaktif'}</button>
                      <button onclick="handleDeleteUserSPA('${u.id}', '${u.email}')" class="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 rounded-lg text-[10px] font-bold">Hapus</button>
                    </div>
                  </div>
                `;
              }).join('')}
        </div>
      </div>
    </section>

    <!-- 3. KATEGORI EXPENSE -->
    <section class="bg-white p-7 rounded-[24px] border border-slate-200/70 ui-card-shadow space-y-4">
      <h3 class="text-xs font-bold uppercase text-slate-700">3. Kelola Kategori Expense</h3>
      <div class="flex gap-3">
        <input type="text" id="newCategoryName" placeholder="Misal: Konsumsi, Bensin, Tiket" class="flex-1 px-4 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none">
        <button onclick="handleAddCategorySPA()" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md">+ Tambah Kategori</button>
      </div>
      <div class="pt-2">
        <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Daftar Kategori Terdaftar:</p>
        <div class="flex flex-wrap gap-2.5">
          ${appData.categories.length === 0
            ? `<p class="text-xs text-slate-400 italic">Belum ada kategori kustom.</p>`
            : appData.categories.map(c => {
                const isInactive = c.status === 'INACTIVE';
                return `
                  <div class="px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-2 ${isInactive ? 'opacity-50' : ''}">
                    <span>${c.nama} ${isInactive ? '(Nonaktif)' : ''}</span>
                    <button onclick="handleToggleCategoryStatusSPA('${c.id}', '${c.status || 'ACTIVE'}')" class="text-[10px] px-1.5 py-0.5 rounded ${isInactive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}">
                      ${isInactive ? 'Aktifkan' : 'Nonaktif'}
                    </button>
                    <button onclick="handleDeleteCategorySPA('${c.id}', '${c.nama.replace(/'/g, "\\'")}')" class="text-rose-500 hover:text-rose-700 text-xs ml-1">
                      <i class="ri-close-circle-fill"></i>
                    </button>
                  </div>
                `;
              }).join('')}
        </div>
      </div>
    </section>
  `;
}

// SETUP HANDLERS
async function handleCreateTripSPA() {
  const judul = document.getElementById('newTripTitle').value.trim();
  if (!judul) return showToast('Masukkan judul trip!', 'warning');

  const selectedUsers = Array.from(document.querySelectorAll('.trip-new-chk-user:checked')).map(c => c.value);

  const { error } = await db.from('trips').insert([{
    judul, 
    created_by: currentUser.email, 
    status: 'ACTIVE',
    active_participant_emails: selectedUsers
  }]);

  if (error) return showToast('Gagal membuat trip: ' + error.message, 'error');

  await db.from('activity_logs').insert([{ user_email: currentUser.email, action: 'CREATE_TRIP', details: `Membuat trip: ${judul} dengan ${selectedUsers.length} anggota` }]);
  showToast('Trip baru berhasil dibuat!', 'success');
  await refreshAppData();
  renderSetupView();
}

function openAssignUsersModalSPA(tripId) {
  const trip = appData.trips.find(t => t.id === tripId);
  if (!trip) return;

  const currentAssigned = trip.active_participant_emails || [];
  const activeUsers = appData.users.filter(u => u.status !== 'INACTIVE');

  document.getElementById('modalTitle').innerText = `Edit Anggota: ${trip.judul}`;
  document.getElementById('modalMessage').innerText = 'Pilih peserta yang berpartisipasi pada trip ini:';
  
  const container = document.getElementById('modalInputContainer');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 custom-scrollbar">
      ${activeUsers.map(u => `
        <label class="flex items-center p-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer gap-2">
          <input type="checkbox" value="${u.email}" ${currentAssigned.includes(u.email) ? 'checked' : ''} class="trip-edit-assign-user w-4 h-4 text-blue-600 rounded">
          ${getUserAvatarHTML(u.email, 'w-6 h-6 text-[10px]')}
          <span class="text-xs font-bold text-slate-700 truncate">${u.nama}</span>
        </label>
      `).join('')}
    </div>
  `;

  document.getElementById('modalBtnCancel').classList.remove('hidden');
  const confirmBtn = document.getElementById('modalBtnConfirm');
  confirmBtn.innerText = 'Simpan Anggota';
  confirmBtn.onclick = async () => {
    const newAssigned = Array.from(document.querySelectorAll('.trip-edit-assign-user:checked')).map(c => c.value);
    const { error } = await db.from('trips').update({ active_participant_emails: newAssigned }).eq('id', tripId);

    if (error) {
      showToast('Gagal update anggota: ' + error.message, 'error');
    } else {
      showToast('Anggota trip berhasil diperbarui!', 'success');
      await refreshAppData();
      closeCustomModal(true);
      renderSetupView();
    }
  };

  document.getElementById('customModal').classList.remove('hidden');
}

async function handleEditTripSPA(id, oldJudul) {
  const trip = appData.trips.find(t => t.id === id);
  if (!trip) return;

  document.getElementById('modalTitle').innerText = 'Edit Judul Trip';
  document.getElementById('modalMessage').innerText = '';
  
  const container = document.getElementById('modalInputContainer');
  container.classList.remove('hidden');
  container.innerHTML = `<input type="text" id="modalTripEditTitleInput" value="${oldJudul}" class="w-full px-4 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 font-bold focus:outline-none">`;

  document.getElementById('modalBtnCancel').classList.remove('hidden');
  const confirmBtn = document.getElementById('modalBtnConfirm');
  confirmBtn.innerText = 'Simpan Judul';
  confirmBtn.onclick = async () => {
    const newJudul = document.getElementById('modalTripEditTitleInput').value.trim();
    if (!newJudul || newJudul === oldJudul) {
      closeCustomModal(false);
      return;
    }

    const { error } = await db.from('trips').update({ judul: newJudul }).eq('id', id);
    if (error) return showToast('Gagal edit trip: ' + error.message, 'error');

    await db.from('activity_logs').insert([{ user_email: currentUser.email, action: 'EDIT_TRIP', details: `Mengubah judul trip "${oldJudul}" menjadi "${newJudul}"` }]);
    showToast('Judul trip diperbarui!', 'success');
    await refreshAppData();
    closeCustomModal(true);
    renderSetupView();
  };

  document.getElementById('customModal').classList.remove('hidden');
}

async function handleToggleTripStatusSPA(id, currentStatus) {
  const targetStatus = currentStatus === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
  const { error } = await db.from('trips').update({ status: targetStatus }).eq('id', id);
  if (error) return showToast('Gagal mengubah status trip: ' + error.message, 'error');

  await db.from('activity_logs').insert([{ user_email: currentUser.email, action: 'TOGGLE_TRIP_STATUS', details: `Mengubah status trip ID: ${id} menjadi ${targetStatus}` }]);
  showToast(`Status trip diubah ke ${targetStatus}`, 'info');
  await refreshAppData();
  renderSetupView();
}

async function handleDeleteTripSPA(id, judulTrip) {
  const isUsed = appData.expenses.some(e => e.trip_id === id);

  if (isUsed) {
    showToast(`Trip "${judulTrip}" sudah dipakai transaksi! Gunakan tombol 'Nonaktif'.`, 'warning');
    return;
  }

  const confirmDelete = await showCustomConfirm('Hapus Trip', `Apakah Anda yakin ingin menghapus permanen Trip "${judulTrip}"?`);
  if (!confirmDelete) return;

  const { error } = await db.from('trips').delete().eq('id', id);
  if (error) return showToast('Gagal menghapus trip: ' + error.message, 'error');

  await db.from('activity_logs').insert([{ user_email: currentUser.email, action: 'DELETE_TRIP', details: `Menghapus trip: ${judulTrip}` }]);
  showToast('Trip berhasil dihapus!', 'success');
  await refreshAppData();
  renderSetupView();
}

async function handleAddUserSPA() {
  const nama = document.getElementById('newUserName').value.trim();
  const email = document.getElementById('newUserEmail').value.trim().toLowerCase();
  const role = document.getElementById('newUserRole').value;

  if (!nama || !email) return showToast('Lengkapi data user!', 'warning');

  const { error } = await db.from('users').insert([{ nama, email, role, status: 'ACTIVE' }]);
  if (error) return showToast('Gagal membuat user: ' + error.message, 'error');

  await db.from('activity_logs').insert([{ user_email: currentUser.email, action: 'ADD_USER', details: `Menambahkan user: ${email} (${role})` }]);
  showToast('User baru berhasil ditambahkan!', 'success');
  await refreshAppData();
  renderSetupView();
}

function openEditUserModalSPA(userId) {
  const targetUser = appData.users.find(u => u.id === userId);
  if (!targetUser) return;

  document.getElementById('modalTitle').innerText = `Edit Full User: ${targetUser.nama}`;
  document.getElementById('modalMessage').innerText = '';
  
  const container = document.getElementById('modalInputContainer');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="space-y-3 text-left">
      <div class="space-y-1">
        <label class="text-[10px] font-bold text-slate-500 uppercase">Nama Lengkap</label>
        <input type="text" id="editUserNama" value="${targetUser.nama}" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 font-bold focus:outline-none">
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-bold text-slate-500 uppercase">Alamat Email</label>
        <input type="email" id="editUserEmail" value="${targetUser.email}" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:outline-none">
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[10px] font-bold text-slate-500 uppercase">Role</label>
          <select id="editUserRole" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700">
            <option value="USER" ${targetUser.role === 'USER' ? 'selected' : ''}>USER</option>
            <option value="ADMIN" ${targetUser.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
          </select>
        </div>
        <div class="space-y-1">
          <label class="text-[10px] font-bold text-slate-500 uppercase">Status</label>
          <select id="editUserStatus" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700">
            <option value="ACTIVE" ${targetUser.status !== 'INACTIVE' ? 'selected' : ''}>ACTIVE</option>
            <option value="INACTIVE" ${targetUser.status === 'INACTIVE' ? 'selected' : ''}>INACTIVE</option>
          </select>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modalBtnCancel').classList.remove('hidden');
  const confirmBtn = document.getElementById('modalBtnConfirm');
  confirmBtn.innerText = 'Simpan Perubahan';
  confirmBtn.onclick = async () => {
    const newNama = document.getElementById('editUserNama').value.trim();
    const newEmail = document.getElementById('editUserEmail').value.trim().toLowerCase();
    const newRole = document.getElementById('editUserRole').value;
    const newStatus = document.getElementById('editUserStatus').value;

    if (!newNama || !newEmail) return showToast('Nama dan Email tidak boleh kosong!', 'warning');

    const { error } = await db.from('users').update({
      nama: newNama,
      email: newEmail,
      role: newRole,
      status: newStatus
    }).eq('id', userId);

    if (error) return showToast('Gagal update user: ' + error.message, 'error');

    await db.from('activity_logs').insert([{ user_email: currentUser.email, action: 'EDIT_USER_FULL', details: `Mengubah data user (${targetUser.email})` }]);
    showToast('Data user berhasil diperbarui!', 'success');
    await refreshAppData();
    closeCustomModal(true);
    renderSetupView();
  };

  document.getElementById('customModal').classList.remove('hidden');
}

async function handleToggleUserStatusSPA(id, currentStatus) {
  const targetStatus = currentStatus === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
  const { error } = await db.from('users').update({ status: targetStatus }).eq('id', id);
  if (error) return showToast('Gagal mengubah status user: ' + error.message, 'error');

  await db.from('activity_logs').insert([{ user_email: currentUser.email, action: 'TOGGLE_USER_STATUS', details: `Mengubah status user ID: ${id} menjadi ${targetStatus}` }]);
  showToast(`Status user diubah ke ${targetStatus}`, 'info');
  await refreshAppData();
  renderSetupView();
}

async function handleDeleteUserSPA(id, emailUser) {
  const isUsedAsPembayar = appData.expenses.some(e => e.pembayar_email.toLowerCase() === emailUser.toLowerCase());
  const isUsedAsPeserta = appData.expenses.some(e => (e.peserta_emails || []).some(p => p.toLowerCase() === emailUser.toLowerCase()));

  if (isUsedAsPembayar || isUsedAsPeserta) {
    showToast(`User (${emailUser}) terikat riwayat transaksi! Gunakan tombol 'Nonaktif'.`, 'warning');
    return;
  }

  const confirmDelete = await showCustomConfirm('Hapus User', `Hapus permanen user ${emailUser} dari database?`);
  if (!confirmDelete) return;

  const { error } = await db.from('users').delete().eq('id', id);
  if (error) return showToast('Gagal menghapus user: ' + error.message, 'error');

  await db.from('activity_logs').insert([{ user_email: currentUser.email, action: 'DELETE_USER', details: `Menghapus user: ${emailUser}` }]);
  showToast('User berhasil dihapus!', 'success');
  await refreshAppData();
  renderSetupView();
}

async function handleAddCategorySPA() {
  const nama = document.getElementById('newCategoryName').value.trim();
  if (!nama) return showToast('Masukkan nama kategori!', 'warning');

  const { error } = await db.from('categories').insert([{ nama, status: 'ACTIVE' }]);
  if (error) return showToast('Gagal menambah kategori: ' + error.message, 'error');

  await db.from('activity_logs').insert([{ user_email: currentUser.email, action: 'ADD_CATEGORY', details: `Menambahkan kategori: ${nama}` }]);
  showToast('Kategori baru ditambahkan!', 'success');
  await refreshAppData();
  renderSetupView();
}

async function handleToggleCategoryStatusSPA(id, currentStatus) {
  const targetStatus = currentStatus === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
  const { error } = await db.from('categories').update({ status: targetStatus }).eq('id', id);
  if (error) return showToast('Gagal mengubah status kategori: ' + error.message, 'error');

  showToast(`Status kategori diubah ke ${targetStatus}`, 'info');
  await refreshAppData();
  renderSetupView();
}

async function handleDeleteCategorySPA(id, namaKategori) {
  const isUsed = appData.expenses.some(e => (e.kategori || '').toLowerCase() === namaKategori.toLowerCase());

  if (isUsed) {
    showToast(`Kategori "${namaKategori}" terikat transaksi! Gunakan 'Nonaktif'.`, 'warning');
    return;
  }

  const confirmDelete = await showCustomConfirm('Hapus Kategori', `Hapus permanen kategori "${namaKategori}"?`);
  if (!confirmDelete) return;

  const { error } = await db.from('categories').delete().eq('id', id);
  if (error) return showToast('Gagal menghapus kategori: ' + error.message, 'error');

  await db.from('activity_logs').insert([{ user_email: currentUser.email, action: 'DELETE_CATEGORY', details: `Menghapus kategori: ${namaKategori}` }]);
  showToast('Kategori dihapus!', 'success');
  await refreshAppData();
  renderSetupView();
}

async function doLogout() {
  localStorage.removeItem('gh_user_session');
  await db.auth.signOut();
  window.location.replace('login.html');
}
