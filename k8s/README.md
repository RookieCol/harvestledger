# Kubernetes manifests

Raw manifests to run HarvestLedger on a local cluster (kind or minikube).
`docker-compose` stays the tool for day-to-day dev; this is the deployment
exercise. A Helm chart of the same topology lives in [`../helm`](../helm).

> **Status:** verified. The full stack was brought up on a local **kind**
> cluster (k8s 1.36): all pods reach Ready, and a smoke test through the
> gateway (`/health` → 200, register → 201, login → 201 with a Redis-backed
> rotated refresh token) passes end to end.

## What's here

| File | Contents |
|---|---|
| `00-namespace.yaml` | `harvestledger` namespace |
| `01-config.yaml` | ConfigMap (non-secret env) + Secret (**placeholder** values) |
| `02-tls.yaml` | cert-manager self-signed `Issuer` for the gateway Ingress |
| `10..13-*.yaml` | Postgres, MongoDB, Redis, RabbitMQ — StatefulSets + Services |
| `20-gateway.yaml` | gateway Deployment + Service + Ingress (TLS, edge rate limit) + HPA |
| `21..23-*.yaml` | auth, farms, tracing Deployments (health probes on port 3000) |
| `kind-config.yaml` | kind cluster config exposing host ports 80/443 for the ingress controller |

Only the gateway is exposed (Service + Ingress); the other three talk over
RabbitMQ and expose only their `/health` port for probes.

## Bring-up (kind)

```bash
# 1. Cluster, with host 80/443 mapped for the ingress controller
kind create cluster --name harvestledger --config k8s/kind-config.yaml

# 2. Ingress controller (kind's own manifest, NodePort-backed) + cert-manager
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl -n ingress-nginx wait --for=condition=ready pod -l app.kubernetes.io/component=controller --timeout=90s

kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl -n cert-manager wait --for=condition=available deploy --all --timeout=90s

# 3. Build the four images and load them into the cluster
docker build -t harvestledger-gateway:latest -f apps/gateway/Dockerfile .
docker build -t harvestledger-auth:latest    -f apps/auth/Dockerfile .
docker build -t harvestledger-farms:latest   -f apps/farms/Dockerfile .
docker build -t harvestledger-tracing:latest -f apps/tracing/Dockerfile .
kind load docker-image harvestledger-{gateway,auth,farms,tracing}:latest --name harvestledger

# 4. (Recommended) replace the placeholder Secret values in 01-config.yaml first,
#    then apply everything
kubectl apply -f k8s/

# 5. Wait for readiness
kubectl -n harvestledger rollout status deploy/gateway
kubectl -n harvestledger get certificate gateway-tls

# 6. Reach the gateway through the Ingress
echo "127.0.0.1 harvestledger.local" | sudo tee -a /etc/hosts
curl -k https://harvestledger.local/health
# → https://harvestledger.local/api/v1 , docs at https://harvestledger.local/api/docs
```

The `-k` above is expected: the cert comes from the self-signed Issuer in
`02-tls.yaml`, not a trusted CA — there's no CA that would issue a trusted
cert for a non-public host. Plain `port-forward` still works as a fallback
that bypasses the Ingress entirely:

```bash
kubectl -n harvestledger port-forward svc/gateway 8086:80
# → http://localhost:8086/api/v1 , health at http://localhost:8086/health
```

The HPA needs `metrics-server` in the cluster to scale on CPU.

## Notes / follow-ups

- The Secret ships **placeholder** values — replace them (or create the Secret
  out-of-band) before any non-throwaway use.
- DB migrations: `synchronize` is off; the schema is owned by TypeORM
  migrations (`libs/common/src/migrations`). Only the `auth` worker runs them
  on startup (`DB_RUN_MIGRATIONS=true`), so the services don't race. Verified
  on the cluster: from an empty schema, auth applies `InitialSchema` and the
  full CRUD flow works. Generate new ones with
  `POSTGRES_URI=… pnpm migration:generate libs/common/src/migrations/<Name>`.
- MinIO isn't in these manifests yet; set S3 to a real bucket or add a MinIO
  StatefulSet mirroring the compose service.
- The edge rate limit (`limit-rps: 20` on the Ingress) is on top of the
  gateway's own per-pod `ThrottlerModule` (100 req/min/pod) — with 2-6
  replicas the app-level ceiling alone floats between 200-600 req/min, so the
  edge limit is what actually bounds it. Raise or drop this annotation before
  any Phase 4 load test, or it will cap the numbers you're trying to measure.
- Moving the throttler itself to a shared Redis store (instead of per-pod
  in-memory) is a natural follow-up now that `RedisService` is already a
  first-class dependency (idempotency, refresh tokens) — not done here since
  the edge limit and the app limit solve different problems.
