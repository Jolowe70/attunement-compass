// Quick check after a deploy: open /api/health. 404 means functions did not deploy; 502 means one crashed on load.
export const handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify({
    ok: true, app: 'attunement-compass', build: 'COMPASS-02', node: process.version,
    model: process.env.COMPASS_MODEL || 'claude-haiku-4-5 (default)',
    supabase: 'etmkqtddanvxdiicofbf (built in; VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY override it)',
    env: {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      COMPASS_MODEL: !!process.env.COMPASS_MODEL
    }
  })
});
