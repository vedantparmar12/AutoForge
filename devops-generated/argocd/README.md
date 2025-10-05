# ArgoCD Configuration for mcp-devops-automation

This directory contains ArgoCD Application manifests for GitOps deployment.

## Structure

```
argocd/
├── projects/
│   └── project.yaml           # ArgoCD Project definition
├── applications/
│   ├── umbrella-app.yaml      # Umbrella application (all services)
│   ├── analyzers-app.yaml      # analyzers service application
│   ├── calculators-app.yaml      # calculators service application
│   ├── generators-app.yaml      # generators service application
│   ├── tools-app.yaml      # tools service application
│   ├── types-app.yaml      # types service application
└── README.md
```

## Installation

### 1. Install ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

### 2. Access ArgoCD UI

```bash
# Port forward
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

### 3. Deploy Project

```bash
# Create the project
kubectl apply -f argocd/projects/project.yaml

# Deploy umbrella application (deploys all services)
kubectl apply -f argocd/applications/umbrella-app.yaml

# Or deploy services individually
kubectl apply -f argocd/applications/
```

## Sync Waves

Services are deployed in order using sync waves:

- Wave 1: analyzers
- Wave 2: calculators
- Wave 3: generators
- Wave 4: tools
- Wave 5: types

## Automated Sync

All applications have automated sync enabled:
- **prune**: Remove resources not in Git
- **selfHeal**: Revert manual changes
- **retry**: Automatic retry on failure

## Notifications

Configure Slack notifications in ArgoCD:

```yaml
# argocd-notifications-cm ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.slack: |
    token: $slack-token
  template.app-deployed: |
    message: Application {{.app.metadata.name}} deployed successfully
  trigger.on-deployed: |
    - send: [app-deployed]
```

## Monitoring

Monitor ArgoCD applications:

```bash
# List applications
kubectl get applications -n argocd

# Get application status
argocd app get mcp-devops-automation-umbrella

# Sync application
argocd app sync mcp-devops-automation-umbrella

# View logs
argocd app logs mcp-devops-automation-umbrella
```

## Rollback

```bash
# List history
argocd app history mcp-devops-automation-umbrella

# Rollback to specific revision
argocd app rollback mcp-devops-automation-umbrella <revision-id>
```

## Best Practices

1. **Use Git as single source of truth**
2. **Enable automated sync in production**
3. **Set up notifications for failures**
4. **Use sync waves for ordered deployment**
5. **Configure RBAC for team access**
6. **Monitor application health regularly**
