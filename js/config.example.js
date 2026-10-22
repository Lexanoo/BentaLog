/* Supabase connection. Copy this file to js/config.js, then fill in both values from your Supabase project:
   Project Settings -> API -> "Project URL" and the "anon public" (publishable) key.
   The anon key is meant to be public; row-level security in supabase/schema.sql protects the data.
   Never put the service_role / sb_secret_ key here. js/config.js is git-ignored. */
window.BENTALOG_CONFIG = {
  supabaseUrl: '',      // e.g. 'https://abcdefghijklm.supabase.co'
  supabaseAnonKey: '',  // e.g. 'sb_publishable_...' or 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....'

  // How many days of sales to load when the app opens. Older days load when you pick them in History.
  salesDays: 180,
};
