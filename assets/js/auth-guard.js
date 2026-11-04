let currentUser = null;

async function checkAuthAndProtect(adminOnly = false) {
  const { data: { session } } = await db.auth.getSession();

  if (!session || !session.user) {
    redirectToLogin();
    return null;
  }

  const email = session.user.email.toLowerCase().trim();

  try {
    const { data: userRecord, error } = await db
      .from('users')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    if (error || !userRecord) {
      await db.auth.signOut();
      localStorage.removeItem('gh_user_session');
      alert(`Akses Ditolak: Email ${email} belum terdaftar di sistem!`);
      redirectToLogin();
      return null;
    }

    if (adminOnly && userRecord.role !== 'ADMIN') {
      alert("Akses Ditolak: Halaman ini hanya untuk Admin!");
      window.location.href = 'index.html';
      return null;
    }

    currentUser = userRecord;
    localStorage.setItem('gh_user_session', JSON.stringify(currentUser));
    return currentUser;

  } catch (err) {
    redirectToLogin();
    return null;
  }
}

function redirectToLogin() {
  localStorage.removeItem('gh_user_session');
  if (!window.location.pathname.endsWith('login.html')) {
    window.location.href = 'login.html';
  }
}

async function doLogout() {
  localStorage.removeItem('gh_user_session');
  await db.auth.signOut();
  window.location.href = 'login.html';
}
