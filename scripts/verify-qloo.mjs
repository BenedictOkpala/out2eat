import { loadLocalEnv, projectRoot } from './with-app-env.mjs';
const env = loadLocalEnv(projectRoot());
const key = env.QLOO_API_KEY?.trim() || env.QLOO_HACKATHON_API_KEY?.trim() || env.HACKATHON_QLOO_API_KEY?.trim();
if (!key) {
  console.log(JSON.stringify({ configured: false, authenticated: false, reason: 'No nonempty Qloo key in project .env/.env.local or process environment.' }));
  process.exitCode = 1;
} else {
  try {
    const response = await fetch('https://hackathon.api.qloo.com/v2/tags?filter.query=restaurant&take=1', {
      headers: { 'X-Api-Key': key, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(12000),
    });
    const payload = response.ok ? await response.json() : null;
    const results = payload?.results;
    const tags = Array.isArray(results) ? results : results?.tags;
    console.log(JSON.stringify({ configured: true, httpStatus: response.status, authenticated: response.ok && payload?.success !== false && Array.isArray(tags), tagCount: Array.isArray(tags) ? tags.length : 0 }));
    if (!response.ok || !Array.isArray(tags) || payload?.success === false) process.exitCode=1;
  } catch (error) {
    console.log(JSON.stringify({configured:true,authenticated:false,errorType:error.name}));process.exitCode=1;
  }
}
