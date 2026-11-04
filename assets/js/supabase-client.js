const SUPABASE_URL = 'https://htmmlzaxnbedweezhlyb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bW1semF4bmJlZHdlZXpobHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1OTYwNjQsImV4cCI6MjEwOTE3MjA2NH0.HduOFDBtcTx4HbJ3IpLSeBQjZaxzZ2qj-v1DvbRU9Y4';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
