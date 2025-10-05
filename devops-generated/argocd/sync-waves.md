# ArgoCD Sync Waves

Sync waves control the order of resource deployment in ArgoCD.

## How It Works

Resources are deployed in order based on their `argocd.argoproj.io/sync-wave` annotation:

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "1"
```

## Wave Order

- **Wave -5**: Namespaces, CustomResourceDefinitions
- **Wave 0**: Infrastructure (databases, caches, secrets)
- **Wave 1**: Backend services
- **Wave 2**: API Gateway, middleware
- **Wave 3**: Frontend applications
- **Wave 5**: Monitoring, logging

## Example

```yaml
# Deploy database first
apiVersion: v1
kind: Service
metadata:
  name: postgres
  annotations:
    argocd.argoproj.io/sync-wave: "0"

---
# Then deploy API that uses database
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  annotations:
    argocd.argoproj.io/sync-wave: "1"
```

## Benefits

1. **Ordered Deployment**: Dependencies deployed first
2. **Reduced Errors**: No missing dependencies
3. **Predictable Rollouts**: Same order every time
4. **Easy Rollbacks**: Reverse order rollback

## Tips

- Leave gaps between waves (0, 5, 10) for future insertions
- Use negative waves for infrastructure
- Use positive waves for applications
- Document your wave strategy
