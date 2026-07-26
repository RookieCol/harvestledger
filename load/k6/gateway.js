import http from 'k6/http';
import { check, sleep } from 'k6';

// Load test for the gateway. Logs in once, then exercises the read path
// (GET /farms → gateway → farms over RabbitMQ → Postgres) under a ramping load.
//
// Run in-cluster:
//   kubectl -n harvestledger run k6 --rm -i --restart=Never \
//     --image=grafana/k6:latest --command -- k6 run - < load/k6/gateway.js
// Point BASE_URL / EMAIL / PASSWORD via `-e` if needed.

const BASE = __ENV.BASE_URL || 'http://gateway.harvestledger.svc/api/v1';
const EMAIL = __ENV.EMAIL || 'mig@example.com';
const PASSWORD = __ENV.PASSWORD || 'secret12';

export const options = {
  stages: [
    { duration: '20s', target: 30 }, // ramp up
    { duration: '40s', target: 30 }, // hold
    { duration: '20s', target: 60 }, // push harder (nudge the HPA)
    { duration: '40s', target: 60 }, // hold
    { duration: '15s', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800'],
  },
};

export function setup() {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'login 201': (r) => r.status === 201 });
  return { token: res.json('accesToken') };
}

export default function (data) {
  const params = {
    headers: {
      Authorization: `Bearer ${data.token}`,
      'Content-Type': 'application/json',
    },
  };
  const res = http.get(`${BASE}/farms`, params);
  check(res, { 'farms 200': (r) => r.status === 200 });
  sleep(0.2);
}
