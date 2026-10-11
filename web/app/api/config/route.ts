// Runtime config read from the container's env, so the same image works
// locally and on Cloud Run without rebuilding for each API URL.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    apiUrl: process.env.API_URL || 'http://localhost:8080',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    version: process.env.APP_VERSION || 'dev',
    commit: process.env.GIT_SHA || 'local',
  });
}
