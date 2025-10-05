# Security Checklist - Pre-Deployment

## Container Security

- [ ] All containers run as non-root
- [ ] Root filesystem is read-only
- [ ] No privileged containers
- [ ] All capabilities dropped
- [ ] Images scanned with Trivy
- [ ] No HIGH/CRITICAL vulnerabilities
- [ ] Images from trusted registry only
- [ ] Image tags are immutable (not :latest)

## Secret Management

- [ ] No secrets in Git repository
- [ ] GitLeaks scan passed
- [ ] Secrets stored in Vault/AWS Secrets Manager
- [ ] Kubernetes secrets encrypted at rest
- [ ] Secret rotation policy configured
- [ ] Service accounts use IRSA

## Network Security

- [ ] Network policies applied
- [ ] Default deny all configured
- [ ] Ingress rules explicit
- [ ] Egress rules explicit
- [ ] TLS/mTLS enabled
- [ ] Service mesh configured (optional)

## Access Control

- [ ] RBAC configured
- [ ] No cluster-admin in production
- [ ] Service accounts per pod
- [ ] Token auto-mount disabled
- [ ] Audit logging enabled
- [ ] Pod Security Standards enforced

## Runtime Security

- [ ] Falco installed and configured
- [ ] Falco rules customized
- [ ] Alerts configured (Slack)
- [ ] Anomaly detection active
- [ ] Event logging enabled

## Policy Enforcement

- [ ] Kyverno/OPA installed
- [ ] Policies configured
- [ ] Validation mode: enforce
- [ ] Resource limits required
- [ ] Image provenance checked

## Backup & DR

- [ ] Velero installed
- [ ] Backup schedule configured
- [ ] S3 bucket created
- [ ] Backup tested
- [ ] Restore procedure documented
- [ ] RPO/RTO defined

## Compliance

- [ ] CIS Benchmark run
- [ ] Audit policy configured
- [ ] Logs retained per policy
- [ ] Compliance reports generated
- [ ] Security reviews completed

## Monitoring

- [ ] Prometheus alerts configured
- [ ] Grafana dashboards setup
- [ ] Log aggregation enabled
- [ ] Alert routing configured
- [ ] On-call schedule defined

## CI/CD Security

- [ ] Security scans in pipeline
- [ ] SAST tools configured
- [ ] Dependency scanning enabled
- [ ] Container scanning automated
- [ ] IaC scanning enabled
- [ ] Manual approval for production

## Documentation

- [ ] Security README updated
- [ ] Runbooks created
- [ ] Incident response plan
- [ ] Contact list maintained
- [ ] Architecture diagrams current

---

**Sign-off:**

- Security Team: _________________ Date: _______
- DevOps Team: _________________ Date: _______
- Product Owner: _________________ Date: _______

**This checklist must be completed before production deployment.**
