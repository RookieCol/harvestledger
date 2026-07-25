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
| `10..13-*.yaml` | Postgres, MongoDB, Redis, RabbitMQ — StatefulSets + Services |
| `20-gateway.yaml` | gateway Deployment + Service + Ingress + HPA |
| `21..23-*.yaml` | auth, farms, tracing Deployments (health probes on port 3000) |

Only the gateway is exposed (Service + Ingress); the other three talk over
RabbitMQ and expose only their `/health` port for probes.

## Bring-up (kind)

```bash
# 1. Cluster
kind create cluster --name harvestledger

# 2. Build the four images and load them into the cluster
docker build -t harvestledger-gateway:latest -f apps/gateway/Dockerfile .
docker build -t harvestledger-auth:latest    -f apps/auth/Dockerfile .
docker build -t harvestledger-farms:latest   -f apps/farms/Dockerfile .
docker build -t harvestledger-tracing:latest -f apps/tracing/Dockerfile .
kind load docker-image harvestledger-{gateway,auth,farms,tracing}:latest --name harvestledger

# 3. (Recommended) replace the placeholder Secret values in 01-config.yaml first,
#    then apply everything
kubectl apply -f k8s/

# 4. Wait for readiness
kubectl -n harvestledger rollout status deploy/gateway

# 5. Reach the gateway (add harvestledger.local to /etc/hosts pointing at the
#    ingress controller, or just port-forward)
kubectl -n harvestledger port-forward svc/gateway 8086:80
# → http://localhost:8086/api/v1 , health at http://localhost:8086/health
```

The HPA needs `metrics-server` in the cluster to scale on CPU.

## Notes / follow-ups

- The Secret ships **placeholder** values — replace them (or create the Secret
  out-of-band) before any non-throwaway use.
- Real DB migrations (dropping `synchronize: true`) and the RabbitMQ DLQ/retry
  work are still open; they are best finished here, against the live cluster,
  where they can actually be verified.
- MinIO isn't in these manifests yet; set S3 to a real bucket or add a MinIO
  StatefulSet mirroring the compose service.
