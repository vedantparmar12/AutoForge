# Deployment Guide - MCP DevOps Automation

This guide explains the enhanced CI/CD pipeline with staging deployment and multiple deployment strategies.

## Table of Contents
- [Deployment Workflow](#deployment-workflow)
- [Environment Configuration](#environment-configuration)
- [Deployment Strategies](#deployment-strategies)
- [Manual Deployment](#manual-deployment)
- [Rollback Procedures](#rollback-procedures)
- [Monitoring](#monitoring)

## Deployment Workflow

### Automatic Deployments

#### Staging Deployment (develop branch)
```bash
# Merge to develop branch triggers automatic staging deployment
git checkout develop
git merge feature/my-feature
git push origin develop
```

**Workflow:**
1. Code pushed to `develop` branch
2. CI tests run automatically
3. Docker images built and pushed to ECR
4. Staging deployment triggered automatically
5. Smoke tests run on staging
6. Slack notification sent

#### Production Deployment (main branch)
```bash
# Merge to main branch triggers production deployment (requires approval)
git checkout main
git merge develop
git push origin main
```

**Workflow:**
1. Code pushed to `main` branch
2. Deployment waits for manual approval in GitHub
3. Once approved, production deployment starts
4. Deployment strategy executed (rolling/blue-green/canary)
5. Smoke tests run on production
6. Rollback point created
7. Slack notification sent

### Manual Deployment

Use GitHub Actions UI to manually trigger deployment:

1. Go to **Actions** → **Deploy to EKS** → **Run workflow**
2. Select:
   - **Branch**: main/develop
   - **Environment**: production/staging/development
   - **Deployment Strategy**: rolling/blue-green/canary

## Environment Configuration

### Development
- **Cluster**: `mcp-devops-automation-dev-cluster`
- **Namespace**: `mcp-devops-automation`
- **VPC CIDR**: `10.1.0.0/16`
- **Cost Optimization**: Single NAT Gateway
- **Auto-Deploy**: No (manual only)

### Staging
- **Cluster**: `mcp-devops-automation-staging-cluster`
- **Namespace**: `mcp-devops-automation`
- **VPC CIDR**: `10.2.0.0/16`
- **Auto-Deploy**: Yes (on push to develop)
- **Approval**: Not required

### Production
- **Cluster**: `mcp-devops-automation-prod-cluster`
- **Namespace**: `mcp-devops-automation`
- **VPC CIDR**: `10.0.0.0/16`
- **Auto-Deploy**: Yes (on push to main)
- **Approval**: **Required** (GitHub Environment Protection)

## Deployment Strategies

### 1. Rolling Update (Default)
Progressive update of pods with zero downtime.

```yaml
# Automatically used for staging
# Can be selected for production via workflow_dispatch
```

**Process:**
1. New pods are created
2. Health checks pass
3. Old pods are terminated
4. Gradual rollout across all replicas

**Pros:**
- Simple and predictable
- No additional infrastructure needed
- Automatic rollback on failure

**Cons:**
- Mixed versions during deployment
- No instant rollback

### 2. Blue-Green Deployment
Complete environment switch with instant rollback capability.

```bash
# Select "blue-green" in manual deployment
```

**Process:**
1. Deploy complete new environment (green)
2. Run smoke tests on green
3. Switch traffic to green via ingress update
4. Wait for verification (60s)
5. Delete old environment (blue)

**Pros:**
- Instant rollback (just switch back)
- Full environment testing before traffic switch
- Zero downtime

**Cons:**
- Requires 2x infrastructure temporarily
- Higher cost during deployment

### 3. Canary Deployment
Gradual traffic shift with monitoring.

```bash
# Select "canary" in manual deployment
```

**Process:**
1. Deploy canary with 1 replica (10% traffic)
2. Monitor metrics for 5 minutes
3. If healthy, promote to 100%
4. If unhealthy, rollback automatically

**Pros:**
- Risk mitigation with gradual rollout
- Real user validation
- Automatic rollback on errors

**Cons:**
- Longer deployment time
- Requires traffic splitting

## Rollback Procedures

### Automatic Rollback
The pipeline automatically rolls back if:
- Health checks fail
- Smoke tests fail
- Deployment timeout (15 minutes)

### Manual Rollback

#### Using Helm
```bash
# List releases
helm list -n mcp-devops-automation

# Rollback to previous version
helm rollback mcp-devops-automation -n mcp-devops-automation

# Rollback to specific revision
helm rollback mcp-devops-automation 3 -n mcp-devops-automation
```

#### Using kubectl
```bash
# Rollback deployment
kubectl rollout undo deployment -n mcp-devops-automation

# Rollback to specific revision
kubectl rollout undo deployment/analyzers -n mcp-devops-automation --to-revision=2

# Check rollout status
kubectl rollout status deployment -n mcp-devops-automation
```

#### Emergency Rollback (Blue-Green)
```bash
# Switch back to blue environment
kubectl patch ingress mcp-devops-automation \
  -n mcp-devops-automation \
  -p '{"spec":{"rules":[{"host":"*","http":{"paths":[{"path":"/","pathType":"Prefix","backend":{"service":{"name":"mcp-devops-automation-blue","port":{"number":80}}}}]}}}}'
```

## Smoke Tests

### Staging Smoke Tests
Automatically run after staging deployment:
```bash
# Test health endpoints for all services
for service in analyzers calculators generators tools types; do
  curl -f http://$service.mcp-devops-automation.svc.cluster.local/health
done
```

### Production Smoke Tests
Automatically run after production deployment:
```bash
# Comprehensive health checks
for service in analyzers calculators generators tools types; do
  kubectl run test-prod-$service --rm -i --restart=Never \
    --image=curlimages/curl:latest \
    -- curl -f http://$service.mcp-devops-automation.svc.cluster.local/health
done
```

### Custom Smoke Tests
Add your own smoke tests in `.github/workflows/deploy.yml`:
```yaml
- name: Run custom smoke tests
  run: |
    # Your custom tests here
    npm run smoke-test
```

## Monitoring

### Deployment Monitoring
```bash
# Watch deployment progress
kubectl get pods -n mcp-devops-automation -w

# Check deployment history
kubectl rollout history deployment -n mcp-devops-automation

# View deployment events
kubectl get events -n mcp-devops-automation --sort-by='.lastTimestamp'
```

### Service Health
```bash
# Check all pods
kubectl get pods -n mcp-devops-automation -o wide

# Check services
kubectl get svc -n mcp-devops-automation

# Check resource usage
kubectl top pods -n mcp-devops-automation
```

### Metrics & Logs
```bash
# View pod logs
kubectl logs -f deployment/analyzers -n mcp-devops-automation

# Prometheus metrics
kubectl port-forward -n monitoring svc/prometheus 9090:9090

# Grafana dashboards
kubectl port-forward -n monitoring svc/grafana 3000:3000
```

## Pre-Deployment Checklist

### Before Deploying to Staging
- [ ] All unit tests passing
- [ ] Code review approved
- [ ] Feature branch merged to develop
- [ ] Database migrations ready (if any)
- [ ] Environment variables updated

### Before Deploying to Production
- [ ] Staging deployment successful
- [ ] Smoke tests passing in staging
- [ ] Performance testing completed
- [ ] Security scan passed
- [ ] Backup of current production state
- [ ] Rollback plan documented
- [ ] Stakeholders notified
- [ ] Maintenance window scheduled (if needed)

## Troubleshooting

### Deployment Stuck
```bash
# Check pod status
kubectl describe pod <pod-name> -n mcp-devops-automation

# Check deployment
kubectl describe deployment <deployment-name> -n mcp-devops-automation

# Force delete stuck pod
kubectl delete pod <pod-name> -n mcp-devops-automation --force --grace-period=0
```

### Health Check Failures
```bash
# Check liveness/readiness probes
kubectl get events -n mcp-devops-automation | grep -i probe

# Test health endpoint manually
kubectl exec -it <pod-name> -n mcp-devops-automation -- curl localhost:8080/health
```

### Image Pull Errors
```bash
# Check image pull secrets
kubectl get secrets -n mcp-devops-automation

# Verify ECR authentication
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
```

## Notifications

### Slack Notifications
Deployment notifications are sent to Slack for:
- ✅ Successful deployments
- ❌ Failed deployments
- ⏸️ Deployments awaiting approval

Configure Slack webhook:
```bash
# Add to GitHub Secrets
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

## Security Considerations

### Secrets Management
- All secrets stored in AWS Secrets Manager
- GitHub Secrets used for CI/CD credentials
- Kubernetes secrets encrypted at rest
- Pod security policies enforced

### Access Control
- Production deployments require approval
- RBAC configured for service accounts
- Network policies restrict pod communication
- Audit logging enabled

## Cost Optimization

### Development
- Single NAT Gateway
- Smaller instance types
- Spot instances for non-critical workloads

### Staging
- Moderate redundancy
- Auto-scaling with lower limits

### Production
- Full redundancy
- Multi-AZ deployment
- Production-grade instance types
- Reserved instances for cost savings

## Support

For deployment issues:
1. Check this guide
2. Review deployment logs in GitHub Actions
3. Check Kubernetes events and pod logs
4. Contact DevOps team: devops@example.com
5. Emergency: Use rollback procedures above

## References
- [Helm Documentation](https://helm.sh/docs/)
- [Kubernetes Deployment Strategies](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [AWS EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [ArgoCD GitOps Guide](https://argo-cd.readthedocs.io/)
