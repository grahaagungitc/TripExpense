function renderSidebar(activeMenu) {
  const user = JSON.parse(localStorage.getItem('gh_user_session') || '{}');
  const isAdmin = user.role === 'ADMIN';

  const sidebarHtml = `
    <aside class="w-64 bg-slate-900 text-slate-300 min-h-screen flex flex-col justify-between shrink-0 shadow-xl">
      <div class="p-5 space-y-6">
        <!-- BRANDING -->
        <div class="flex items-center space-x-3 text-white">
          <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-xl font-bold shadow-lg shadow-indigo-500/30">
            <i class="ri-wallet-3-line"></i>
          </div>
          <div>
            <h1 class="font-extrabold text-sm leading-tight">Expense Tracker</h1>
            <p class="text-[10px] text-indigo-400 font-semibold">Archipelago Event</p>
          </div>
        </div>

        <!-- USER INFO BADGE -->
        <div class="p-3 bg-slate-800/80 rounded-2xl border border-slate-700/50 flex items-center justify-between">
          <div class="truncate">
            <p class="text-xs font-bold text-white truncate">${user.nama || 'User'}</p>
            <span class="text-[9px] font-extrabold px-2 py-0.5 rounded-full ${isAdmin ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'}">${user.role || 'USER'}</span>
          </div>
        </div>

        <!-- NAVIGATION MENU -->
        <nav class="space-y-1.5 text-xs font-semibold">
          <a href="index.html" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${activeMenu === 'dashboard' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold' : 'hover:bg-slate-800 hover:text-white'}">
            <i class="ri-dashboard-3-line text-base"></i> Dashboard & Summary
          </a>
          <a href="input-expense.html" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${activeMenu === 'expense' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold' : 'hover:bg-slate-800 hover:text-white'}">
            <i class="ri-add-circle-line text-base"></i> Input Expense & Log
          </a>
          <a href="settlement.html" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${activeMenu === 'settlement' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold' : 'hover:bg-slate-800 hover:text-white'}">
            <i class="ri-exchange-dollar-line text-base"></i> Split & Settlement
          </a>
          <a href="logs.html" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${activeMenu === 'logs' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold' : 'hover:bg-slate-800 hover:text-white'}">
            <i class="ri-history-line text-base"></i> Log Activity
          </a>
          ${isAdmin ? `
            <a href="setup.html" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${activeMenu === 'setup' ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30 font-bold' : 'text-amber-400 hover:bg-slate-800 hover:text-amber-300'}">
              <i class="ri-settings-4-line text-base"></i> Master Setup (Admin)
            </a>
          ` : ''}
        </nav>
      </div>

      <!-- LOGOUT BUTTON -->
      <div class="p-4 border-t border-slate-800">
        <button onclick="doLogout()" class="w-full py-2.5 px-3 bg-slate-800 hover:bg-red-600/90 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2">
          <i class="ri-logout-box-r-line"></i> Keluar Aplikasi
        </button>
      </div>
    </aside>
  `;

  document.getElementById('sidebarContainer').innerHTML = sidebarHtml;
}
