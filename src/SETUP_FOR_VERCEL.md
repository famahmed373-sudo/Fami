# Setup instructions for Vercel deployment and local testing

1. Include the initializer and shims in your index.html HEAD (before main app JS):

<script src="/src/supabase-client.js" defer></script>
<script src="/src/runtime-shims.js" defer></script>

2. Optional: configure environment variables in Vercel when you want to use a real Supabase project:

- SUPABASE_URL
- SUPABASE_ANON_KEY

If these are not set, the app runs in DEMO/MOCK mode using localStorage.

3. Local testing:
- Install a static server: npm i -g serve
- Run: npx serve . -s -l 3000
- Open http://localhost:3000 and check DevTools Console. You should see a DEMO/MOCK mode warning and no uncaught exceptions.

4. If your app expects direct imports of supabase-js in many files, centralize DB calls through window.supabase or adapt those files to import from src/supabase-client.js.

5. Troubleshooting: If console shows missing methods (e.g., "single()" or "limit()"), tell me the exact console error and I will extend the mock to implement those chainable methods.
