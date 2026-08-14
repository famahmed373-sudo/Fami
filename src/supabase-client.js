(function(){
  // Minimal supabase-client stub. In production you may initialize supabase-js elsewhere.
  if(window.SUPABASE_URL && window.SUPABASE_ANON_KEY){
    console.info('SUPABASE env vars present in window; ensure a real supabase client is initialized if needed.');
  } else {
    console.info('Supabase keys not found. Running in DEMO/MOCK mode (no DB).');
  }
})();
