// Tracker settings.
// The publishable key is safe to show in a web page. Never put the secret key here,
// and never put the team password in any file: it's set for each person in Supabase.
window.CPS_CONFIG = {
  supabaseUrl: 'https://rnscdydgbspkhtfwmbmg.supabase.co',
  supabaseKey: 'sb_publishable_gnqDDXbe9tm06PyWwm28QA_SEeuBcER',
  // 'password' asks for a password after you pick your name; 'code' emails a 6-digit code instead
  signIn: 'password',
  passwordLabel: 'Team password',
  // who teammates should ask when they can't get in
  adminContact: 'Kathryn Farris',
};
