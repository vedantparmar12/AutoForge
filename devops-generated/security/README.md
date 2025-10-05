# Security Setup for mcp-devops-automation

## 🛡️ Overview

Complete security implementation including:

✅ **Container Scanning** - Trivy for vulnerability detection
✅ **Secret Detection** - GitLeaks for leaked credentials
✅ **Secret Management** - Vault, AWS Secrets Manager, Sealed Secrets
✅ **Runtime Security** - Falco for threat detection
✅ **Policy Enforcement** - Kyverno & OPA policies
✅ **Network Security** - Network policies & service mesh
✅ **RBAC** - Least privilege access control
✅ **Backup & DR** - Velero for disaster recovery
✅ **Compliance** - CIS benchmarks & audit logging

## 🚀 Quick Start

### 1. Install Security Tools

```bash
# Container scanning
./security/trivy/install.sh

# Runtime security
./security/runtime/install-falco.sh

# Backup & DR
./security/backup/velero-install.sh
```

### 2. Scan for Vulnerabilities

```bash
# Scan container images
./security/trivy/scan-images.sh

# Scan for secrets
./security/secrets/scan-secrets.sh
```

### 3. Deploy Security Policies

```bash
# Deploy Kyverno policies
kubectl apply -f security/policies/kyverno-policies.yaml

# Deploy network policies
kubectl apply -f security/network/network-policies.yaml

# Deploy Pod Security Standards
kubectl apply -f security/policies/pod-security-standards.yaml
```

### 4. Setup Secret Management

```bash
# Option 1: HashiCorp Vault
kubectl apply -f security/secrets/vault-setup.yaml

# Option 2: External Secrets (AWS Secrets Manager)
kubectl apply -f security/secrets/external-secrets.yaml

# Option 3: Sealed Secrets
kubectl apply -f security/secrets/sealed-secrets.yaml
```

### 5. Configure Backups

```bash
# Setup automatic backups
kubectl apply -f security/backup/backup-schedule.yaml

# Test restore
./security/backup/restore.sh
```

## 📊 Security Monitoring

### Falco Alerts

```bash
# Watch Falco alerts in real-time
kubectl logs -f -n falco -l app=falco

# View Falco events
kubectl exec -n falco -c falco -- cat /var/log/falco/events.txt
```

### Trivy Scans

Trivy runs automatically in CI/CD on every commit. View reports:

```bash
cat security/reports/*-scan.json
```

## 🔒 Security Best Practices

### Container Security

- ✅ Use non-root users
- ✅ Read-only root filesystem
- ✅ No privileged containers
- ✅ Drop all capabilities
- ✅ Scan images before deployment
- ✅ Use minimal base images

### Secret Management

- ✅ Never commit secrets to Git
- ✅ Use secret management tools
- ✅ Rotate secrets regularly
- ✅ Use short-lived credentials
- ✅ Enable encryption at rest
- ✅ Audit secret access

### Network Security

- ✅ Default deny all traffic
- ✅ Explicit allow rules only
- ✅ Use mTLS between services
- ✅ Encrypt traffic with TLS
- ✅ Network segmentation
- ✅ Ingress/egress filtering

### Access Control

- ✅ Principle of least privilege
- ✅ Use RBAC
- ✅ Service account per pod
- ✅ No cluster-admin in production
- ✅ MFA for human access
- ✅ Audit all access

## 🚨 Incident Response

### Detect: Falco Alert Triggered

```bash
# View recent alerts
kubectl logs --since=1h -n falco -l app=falco | grep CRITICAL
```

### Investigate: Check Pod

```bash
# Get pod details
kubectl describe pod <pod-name> -n mcp-devops-automation

# Check logs
kubectl logs <pod-name> -n mcp-devops-automation

# Exec into pod (if safe)
kubectl exec -it <pod-name> -n mcp-devops-automation -- /bin/sh
```

### Contain: Isolate Pod

```bash
# Label pod as compromised
kubectl label pod <pod-name> security=compromised -n mcp-devops-automation

# Apply network policy to isolate
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-compromised
  namespace: mcp-devops-automation
spec:
  podSelector:
    matchLabels:
      security: compromised
  policyTypes:
    - Ingress
    - Egress
EOF
```

### Eradicate: Delete Pod

```bash
# Delete compromised pod
kubectl delete pod <pod-name> -n mcp-devops-automation

# Verify new pod is clean
kubectl get pods -n mcp-devops-automation
```

### Recover: Restore from Backup

```bash
# List backups
velero backup get

# Restore
velero restore create --from-backup <backup-name>
```

## 📋 Security Checklist

Use `SECURITY-CHECKLIST.md` for pre-deployment verification.

## 🔗 Resources

- **Trivy**: https://trivy.dev/
- **Falco**: https://falco.org/
- **Kyverno**: https://kyverno.io/
- **Velero**: https://velero.io/
- **CIS Benchmarks**: https://www.cisecurity.org/benchmark/kubernetes

---

**Security is everyone's responsibility! 🔒**
