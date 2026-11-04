function renderSidebar(activeMenu) {
  const user = JSON.parse(localStorage.getItem('gh_user_session') || '{}');
  const isAdmin = user.role === 'ADMIN';

  const sidebarHtml = `
    <aside class="w-64 bg-blue-600 text-white min-h-screen flex flex-col justify-between shrink-0 p-6 shadow-2xl relative z-20">
      <div class="space-y-8">
        <!-- BRANDING LOGO -->
        <div class="flex items-center space-x-3 px-2">
          <div class="w-10 h-10 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white text-xl font-extrabold shadow-inner">
            <i class="ri-wallet-3-line"></i>
          </div>
          <div>
            <h1 class="font-extrabold text-base tracking-tight leading-none text-white">ExpenseTracker</h1>
            <p class="text-[10px] text-blue-100 font-semibold mt-1">Archipelago Event</p>
          </div>
        </div>

        <!-- NAVIGATION MENU -->
        <nav class="space-y-2 text-xs font-semibold">
          <a href="index.html" class="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${activeMenu === 'dashboard' ? 'bg-white text-blue-600 font-bold shadow-lg shadow-black/5' : 'text-blue-100 hover:bg-white/10 hover:text-white'}">
            <i class="ri-dashboard-3-line text-lg"></i> Dashboard
          </a>
          <a href="input-expense.html" class="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${activeMenu === 'expense' ? 'bg-white text-blue-600 font-bold shadow-lg shadow-black/5' : 'text-blue-100 hover:bg-white/10 hover:text-white'}">
            <i class="ri-add-circle-line text-lg"></i> Input Expense
          </a>
          <a href="settlement.html" class="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${activeMenu === 'settlement' ? 'bg-white text-blue-600 font-bold shadow-lg shadow-black/5' : 'text-blue-100 hover:bg-white/10 hover:text-white'}">
            <i class="ri-exchange-dollar-line text-lg"></i> Split Settlement
          </a>
          <a href="logs.html" class="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${activeMenu === 'logs' ? 'bg-white text-blue-600 font-bold shadow-lg shadow-black/5' : 'text-blue-100 hover:bg-white/10 hover:text-white'}">
            <i class="ri-history-line text-lg"></i> Activity Logs
          </a>
          ${isAdmin ? `
            <a href="setup.html" class="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${activeMenu === 'setup' ? 'bg-amber-400 text-slate-900 font-bold shadow-lg shadow-amber-500/20' : 'text-amber-200 hover:bg-white/10 hover:text-white'}">
              <i class="ri-settings-4-line text-lg"></i> Master Setup
            </a>
          ` : ''}
        </nav>
      </div>

      <!-- USER PROFILE & LOGOUT CARD -->
      <div class="space-y-4 pt-6 border-t border-white/15">
        <div class="flex items-center gap-3 px-2">
          <div class="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm text-white shrink-0 border border-white/30">
            ${(user.nama || 'U').charAt(0).toUpperCase()}
          </div>
          <div class="truncate">
            <p class="text-xs font-bold text-white truncate leading-tight">${user.nama || 'User'}</p>
            <span class="inline-block mt-0.5 text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-white/20 text-white uppercase">${user.role || 'USER'}</span>
          </div>
        </div>

        <button onclick="doLogout()" class="w-full py-2.5 px-3 bg-white/10 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border border-white/10">
          <i class="ri-logout-box-r-line"></i> Keluar
        </button>
      </div>
    </aside>
  `;

  document.getElementById('sidebarContainer').innerHTML = sidebarHtml;
}
