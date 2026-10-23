import http from 'k6/http';
import { check, sleep } from 'k6';

// Intentionally read-only: this exercises the public MAKE portal, the NAS
// storage health route, and the portal's unauthenticated access guard. It does
// not log in, upload files, or create/change/delete database rows.
const portalUrl = __ENV.PORTAL_URL || 'https://leadingedge.com.bd/make-portal/';
const nasHealthUrl = __ENV.NAS_HEALTH_URL || 'http://100.88.85.6:8081/health';
const wpProtectedUrl = __ENV.WP_PROTECTED_STATUS_URL || 'https://leadingedge.com.bd/wp-json/le-make/v1/system-status';
const nasDbReadUrl = __ENV.NAS_DB_READ_URL || '';
const nasApiKey = __ENV.NAS_API_KEY || '';
const nasJwtToken = __ENV.NAS_JWT_TOKEN || '';
const supabaseAuthHealthUrl = __ENV.SUPABASE_AUTH_HEALTH_URL || '';
const supabaseAnonKey = __ENV.SUPABASE_ANON_KEY || '';
const maxVus = __ENV.MAX_VUS === '10' ? 10 : 5;
const midpointVus = Math.max(1, Math.ceil(maxVus / 2));

http.setResponseCallback(http.expectedStatuses(200, 401));

export const options = {
  stages: [
    { duration: '10s', target: 1 },
    { duration: '20s', target: midpointVus },
    { duration: '30s', target: maxVus },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:portal}': ['p(95)<5000'],
    'http_req_duration{endpoint:nas_health}': ['p(95)<2000'],
    'http_req_duration{endpoint:wp_auth_guard}': ['p(95)<3000'],
    'http_req_duration{endpoint:nas_database_read}': ['p(95)<3000'],
    'http_req_duration{endpoint:supabase_auth_health}': ['p(95)<3000'],
  },
  discardResponseBodies: false,
  noConnectionReuse: false,
  userAgent: 'LE-SOFT-release-readonly-k6/1.0',
};

export default function () {
  const portal = http.get(portalUrl, {
    tags: { endpoint: 'portal' },
    timeout: '10s',
  });
  check(portal, {
    'MAKE portal returns 200 HTML': (r) => r.status === 200 && String(r.headers['Content-Type'] || '').includes('text/html'),
    'MAKE portal response is non-empty': (r) => !!r.body && r.body.length > 0,
  });

  const nas = http.get(nasHealthUrl, {
    tags: { endpoint: 'nas_health' },
    timeout: '10s',
  });
  check(nas, {
    'NAS health returns healthy JSON': (r) => r.status === 200 && String(r.body).includes('healthy'),
  });

  const protectedStatus = http.get(wpProtectedUrl, {
    tags: { endpoint: 'wp_auth_guard' },
    timeout: '10s',
  });
  check(protectedStatus, {
    'protected portal status rejects anonymous access': (r) => r.status === 401,
  });

  if (supabaseAuthHealthUrl && supabaseAnonKey) {
    const supabaseHealth = http.get(supabaseAuthHealthUrl, {
      headers: { apikey: supabaseAnonKey },
      tags: { endpoint: 'supabase_auth_health' },
      timeout: '10s',
    });
    check(supabaseHealth, {
      'Supabase Auth health responds 200': (r) => r.status === 200,
    });
  }

  if (nasDbReadUrl && nasApiKey && nasJwtToken) {
    const nasDb = http.get(nasDbReadUrl, {
      headers: {
        apikey: nasApiKey,
        Authorization: `Bearer ${nasJwtToken}`,
        Accept: 'application/json',
      },
      tags: { endpoint: 'nas_database_read' },
      timeout: '10s',
    });
    let validRows = false;
    try { validRows = nasDb.status === 200 && Array.isArray(JSON.parse(nasDb.body)); } catch {}
    check(nasDb, {
      'authenticated NAS database read succeeds': () => validRows,
    });
  }

  sleep(0.3);
}
