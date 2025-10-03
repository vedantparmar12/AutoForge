import type { ProjectAnalysis } from '../types/index.js';

export class SecurityGenerator {
  generateSecuritySetup(analysis: ProjectAnalysis): Record<string, string> {
    const projectName = analysis.projectName.toLowerCase();

    return {
      // Container Security Scanning
      'security/trivy/install.sh': this.generateTrivyInstall(),
      'security/trivy/scan-images.sh': this.generateTrivyScanScript(analysis),
      'security/trivy/trivy-config.yaml': this.generateTrivyConfig(),

      // Secret Detection
      'security/secrets/gitleaks.toml': this.generateGitLeaksConfig(),
      'security/secrets/scan-secrets.sh': this.generateSecretScanScript(),

      // Secret Management
      'security/secrets/vault-setup.yaml': this.generateVaultSetup(projectName),
      'security/secrets/external-secrets.yaml': this.generateExternalSecrets(analysis, projectName),
      'security/secrets/sealed-secrets.yaml': this.generateSealedSecrets(projectName),

      // Runtime Security (Falco)
      'security/runtime/falco-values.yaml': this.generateFalcoValues(projectName),
      'security/runtime/falco-rules.yaml': this.generateFalcoRules(analysis, projectName),
      'security/runtime/install-falco.sh': this.generateFalcoInstall(),

      // Policy Enforcement (OPA/Kyverno)
      'security/policies/kyverno-policies.yaml': this.generateKyvernoPolicies(projectName),
      'security/policies/opa-policies.rego': this.generateOPAPolicies(),
      'security/policies/pod-security-standards.yaml': this.generatePodSecurityStandards(projectName),

      // Network Security
      'security/network/network-policies.yaml': this.generateNetworkPolicies(analysis, projectName),
      'security/network/service-mesh.yaml': this.generateServiceMeshConfig(analysis, projectName),

      // RBAC Hardening
      'security/rbac/roles.yaml': this.generateRBACRoles(analysis, projectName),
      'security/rbac/service-accounts.yaml': this.generateSecureServiceAccounts(analysis, projectName),

      // Backup & DR
      'security/backup/velero-install.sh': this.generateVeleroInstall(),
      'security/backup/backup-schedule.yaml': this.generateBackupSchedule(projectName),
      'security/backup/restore.sh': this.generateRestoreScript(projectName),

      // Security Scanning in CI/CD
      '.github/workflows/security-scan.yml': this.generateSecurityScanWorkflow(analysis),

      // Compliance
      'security/compliance/cis-benchmark.yaml': this.generateCISBenchmark(),
      'security/compliance/audit-policy.yaml': this.generateAuditPolicy(),

      // Documentation
      'security/README.md': this.generateSecurityReadme(analysis, projectName),
      'security/SECURITY-CHECKLIST.md': this.generateSecurityChecklist()
    };
  }

  private generateTrivyInstall(): string {
    return `#!/bin/bash
set -e

echo "Installing Trivy..."

# Install Trivy
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
echo "deb https://aquasecurity.github.io/trivy-repo/deb \$(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
sudo apt-get update
sudo apt-get install -y trivy

# Verify installation
trivy --version

echo "✅ Trivy installed successfully!"
`;
  }

  private generateTrivyScanScript(analysis: ProjectAnalysis): string {
    return `#!/bin/bash
set -e

echo "🔍 Scanning container images for vulnerabilities..."

ECR_REGISTRY="\${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_REGION}.amazonaws.com"

# Scan all service images
${analysis.services.map(service => `
echo "Scanning ${service.name}..."
trivy image \\
  --severity CRITICAL,HIGH \\
  --exit-code 1 \\
  --no-progress \\
  --format json \\
  --output security/reports/${service.name}-scan.json \\
  \${ECR_REGISTRY}/${service.name}:latest

echo "✅ ${service.name} scan complete"
`).join('\n')}

echo "🎉 All images scanned successfully!"
`;
  }

  private generateTrivyConfig(): string {
    return `# Trivy configuration
severity: CRITICAL,HIGH,MEDIUM
vuln-type: os,library
format: table
exit-code: 1
skip-dirs:
  - /usr/local/bundle
  - /node_modules
ignore-unfixed: true
timeout: 10m
`;
  }

  private generateGitLeaksConfig(): string {
    return `# GitLeaks configuration for secret detection
[allowlist]
  description = "Allowlisted files and patterns"
  files = [
    '''go.sum''',
    '''package-lock.json''',
    '''yarn.lock'''
  ]

[[rules]]
  description = "AWS Access Key"
  regex = '''(?i)aws(.{0,20})?['\"][0-9a-zA-Z]{16,20}['\"]'''
  tags = ["aws", "key"]

[[rules]]
  description = "AWS Secret Key"
  regex = '''(?i)aws(.{0,20})?['\"][0-9a-zA-Z/+=]{40}['\"]'''
  tags = ["aws", "secret"]

[[rules]]
  description = "Generic API Key"
  regex = '''(?i)api[_-]?key['\"]?\\s*[:=]\\s*['\"][0-9a-zA-Z]{32,45}['\"]'''
  tags = ["api", "key"]

[[rules]]
  description = "Private Key"
  regex = '''-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----'''
  tags = ["private", "key"]
`;
  }

  private generateSecretScanScript(): string {
    return `#!/bin/bash
set -e

echo "🔍 Scanning for secrets in repository..."

# Install GitLeaks if not present
if ! command -v gitleaks &> /dev/null; then
    echo "Installing GitLeaks..."
    wget https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_linux_x64.tar.gz
    tar -xzf gitleaks_linux_x64.tar.gz
    sudo mv gitleaks /usr/local/bin/
    rm gitleaks_linux_x64.tar.gz
fi

# Scan for secrets
gitleaks detect --source . --config security/secrets/gitleaks.toml --report-format json --report-path security/reports/secrets-scan.json

echo "✅ Secret scanning complete!"
`;
  }

  private generateVaultSetup(projectName: string): string {
    return `# HashiCorp Vault setup for secret management
apiVersion: v1
kind: Namespace
metadata:
  name: vault
---
apiVersion: helm.cattle.io/v1
kind: HelmChart
metadata:
  name: vault
  namespace: vault
spec:
  chart: vault
  repo: https://helm.releases.hashicorp.com
  targetNamespace: vault
  valuesContent: |-
    server:
      ha:
        enabled: true
        replicas: 3

      dataStorage:
        enabled: true
        size: 10Gi
        storageClass: gp3

      ingress:
        enabled: true
        hosts:
          - host: vault.${projectName}.example.com

      # Auto-unseal with AWS KMS
      extraEnvironmentVars:
        VAULT_SEAL_TYPE: awskms
        VAULT_AWSKMS_SEAL_KEY_ID: \${AWS_KMS_KEY_ID}

    ui:
      enabled: true

    # Inject secrets into pods
    injector:
      enabled: true
      agentImage:
        repository: "hashicorp/vault"
        tag: "latest"
`;
  }

  private generateExternalSecrets(analysis: ProjectAnalysis, projectName: string): string {
    return `# External Secrets Operator - Sync secrets from AWS Secrets Manager
apiVersion: v1
kind: Namespace
metadata:
  name: external-secrets
---
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: ${projectName}
spec:
  provider:
    aws:
      service: SecretsManager
      region: \${AWS_REGION}
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets
---
${analysis.services.map(service => `apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: ${service.name}-secrets
  namespace: ${projectName}
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: ${service.name}-secrets
    creationPolicy: Owner
  data:
    - secretKey: database-url
      remoteRef:
        key: ${projectName}/${service.name}/database-url
    - secretKey: api-key
      remoteRef:
        key: ${projectName}/${service.name}/api-key
---`).join('\n')}
`;
  }

  private generateSealedSecrets(projectName: string): string {
    return `# Sealed Secrets - Encrypt secrets in Git
apiVersion: v1
kind: Namespace
metadata:
  name: sealed-secrets
---
apiVersion: helm.cattle.io/v1
kind: HelmChart
metadata:
  name: sealed-secrets
  namespace: sealed-secrets
spec:
  chart: sealed-secrets
  repo: https://bitnami-labs.github.io/sealed-secrets
  targetNamespace: sealed-secrets
  valuesContent: |-
    fullnameOverride: sealed-secrets-controller

    # Generate a new key
    commandArgs:
      - --update-status

# Usage:
# 1. Install kubeseal CLI: brew install kubeseal
# 2. Create a secret: kubectl create secret generic mysecret --from-literal=password=mypassword --dry-run=client -o yaml > secret.yaml
# 3. Seal it: kubeseal -f secret.yaml -w sealed-secret.yaml
# 4. Commit sealed-secret.yaml to Git safely
`;
  }

  private generateFalcoValues(projectName: string): string {
    return `# Falco - Runtime security monitoring
falco:
  enabled: true

  # Use eBPF instead of kernel module
  ebpf:
    enabled: true

  # Configure outputs
  json_output: true
  json_include_output_property: true

  # Alert channels
  outputs:
    rate: 1
    max_burst: 1000

  # Slack integration
  slack:
    enabled: true
    webhook_url: \${SLACK_WEBHOOK_URL}

  # File output
  file_output:
    enabled: true
    keep_alive: false
    filename: /var/log/falco/events.txt

# Falcosidekick - Route alerts to multiple destinations
falcosidekick:
  enabled: true

  config:
    slack:
      webhookurl: \${SLACK_WEBHOOK_URL}
      channel: "#${projectName}-security-alerts"
      minimumpriority: warning

    prometheus:
      enabled: true

    alertmanager:
      hostport: http://alertmanager-operated:9093

# Custom rules
customRules:
  rules-${projectName}.yaml: |-
    - rule: Unauthorized Process in Container
      desc: Detect execution of unauthorized processes
      condition: >
        spawned_process and
        container and
        not proc.name in (node, java, python, go)
      output: >
        Unauthorized process started (user=%user.name container=%container.name
        process=%proc.cmdline)
      priority: WARNING
`;
  }

  private generateFalcoRules(analysis: ProjectAnalysis, projectName: string): string {
    return `# Custom Falco rules for ${analysis.projectName}
- list: allowed_containers
  items: [${analysis.services.map(s => s.name).join(', ')}]

- rule: Suspicious Network Activity
  desc: Detect unexpected network connections
  condition: >
    inbound_outbound and
    container.name in (allowed_containers) and
    not fd.sport in (80, 443, 8080, 3000, 5432)
  output: >
    Suspicious network activity detected
    (container=%container.name connection=%fd.name)
  priority: WARNING

- rule: Write to Non-Data Directory
  desc: Detect writes outside allowed directories
  condition: >
    open_write and
    container and
    not fd.name startswith /data and
    not fd.name startswith /tmp
  output: >
    Unexpected write to filesystem
    (file=%fd.name container=%container.name)
  priority: WARNING

- rule: Privilege Escalation Attempt
  desc: Detect attempts to escalate privileges
  condition: >
    spawned_process and
    proc.name in (sudo, su, setuid) and
    container
  output: >
    Privilege escalation attempt detected
    (user=%user.name command=%proc.cmdline)
  priority: CRITICAL

- rule: Cryptocurrency Mining
  desc: Detect crypto mining processes
  condition: >
    spawned_process and
    proc.name in (xmrig, cpuminer, ethminer)
  output: >
    Cryptocurrency mining detected (process=%proc.name)
  priority: CRITICAL
`;
  }

  private generateFalcoInstall(): string {
    return `#!/bin/bash
set -e

echo "Installing Falco runtime security..."

# Add Falco Helm repository
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update

# Install Falco
helm install falco falcosecurity/falco \\
  --namespace falco --create-namespace \\
  -f security/runtime/falco-values.yaml

echo "✅ Falco installed successfully!"
echo "Monitor alerts: kubectl logs -f -n falco -l app=falco"
`;
  }

  private generateKyvernoPolicies(projectName: string): string {
    return `# Kyverno Policies - Policy as Code
apiVersion: v1
kind: Namespace
metadata:
  name: kyverno
---
# Install Kyverno
apiVersion: helm.cattle.io/v1
kind: HelmChart
metadata:
  name: kyverno
  namespace: kyverno
spec:
  chart: kyverno
  repo: https://kyverno.github.io/kyverno/
  targetNamespace: kyverno
---
# Policy: Require non-root containers
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-non-root
spec:
  validationFailureAction: enforce
  rules:
    - name: check-runAsNonRoot
      match:
        resources:
          kinds:
            - Pod
      validate:
        message: "Running as root is not allowed"
        pattern:
          spec:
            securityContext:
              runAsNonRoot: true
---
# Policy: Require read-only root filesystem
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-ro-rootfs
spec:
  validationFailureAction: enforce
  rules:
    - name: check-readOnlyRootFilesystem
      match:
        resources:
          kinds:
            - Pod
      validate:
        message: "Root filesystem must be read-only"
        pattern:
          spec:
            containers:
              - securityContext:
                  readOnlyRootFilesystem: true
---
# Policy: Disallow privileged containers
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-privileged
spec:
  validationFailureAction: enforce
  rules:
    - name: check-privileged
      match:
        resources:
          kinds:
            - Pod
      validate:
        message: "Privileged containers are not allowed"
        pattern:
          spec:
            containers:
              - securityContext:
                  privileged: false
---
# Policy: Require resource limits
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-limits
spec:
  validationFailureAction: enforce
  rules:
    - name: check-limits
      match:
        resources:
          kinds:
            - Pod
          namespaces:
            - ${projectName}
      validate:
        message: "CPU and memory limits are required"
        pattern:
          spec:
            containers:
              - resources:
                  limits:
                    memory: "?*"
                    cpu: "?*"
---
# Policy: Disallow latest tag
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-latest-tag
spec:
  validationFailureAction: enforce
  rules:
    - name: require-image-tag
      match:
        resources:
          kinds:
            - Pod
      validate:
        message: "Using 'latest' tag is not allowed"
        pattern:
          spec:
            containers:
              - image: "!*:latest"
`;
  }

  private generateOPAPolicies(): string {
    return `# OPA (Open Policy Agent) Policies
package kubernetes.admission

# Deny containers running as root
deny[msg] {
  input.request.kind.kind == "Pod"
  container := input.request.object.spec.containers[_]
  not container.securityContext.runAsNonRoot
  msg := sprintf("Container %v must run as non-root", [container.name])
}

# Require resource limits
deny[msg] {
  input.request.kind.kind == "Pod"
  container := input.request.object.spec.containers[_]
  not container.resources.limits.cpu
  msg := sprintf("Container %v must have CPU limits", [container.name])
}

# Deny privilege escalation
deny[msg] {
  input.request.kind.kind == "Pod"
  container := input.request.object.spec.containers[_]
  container.securityContext.allowPrivilegeEscalation
  msg := sprintf("Container %v cannot allow privilege escalation", [container.name])
}

# Require image from trusted registry
deny[msg] {
  input.request.kind.kind == "Pod"
  container := input.request.object.spec.containers[_]
  not startswith(container.image, "YOUR_ECR_REGISTRY")
  msg := sprintf("Container %v must use images from trusted registry", [container.name])
}
`;
  }

  private generatePodSecurityStandards(projectName: string): string {
    return `# Pod Security Standards - Enforce security best practices
apiVersion: v1
kind: Namespace
metadata:
  name: ${projectName}
  labels:
    # Enforce restricted pod security standard
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
`;
  }

  private generateNetworkPolicies(analysis: ProjectAnalysis, projectName: string): string {
    return `# Network Policies - Micro-segmentation
${analysis.services.map(service => `---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ${service.name}-netpol
  namespace: ${projectName}
spec:
  podSelector:
    matchLabels:
      app: ${service.name}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow from ingress controller
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: ingress-nginx
      ports:
        - protocol: TCP
          port: ${service.port || 8080}
    # Allow from other services in same namespace
    - from:
        - podSelector: {}
  egress:
    # Allow DNS
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
        - podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
    # Allow to other services
    - to:
        - podSelector: {}
    # Allow to internet (remove for stricter policy)
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 443
`).join('\n')}

---
# Default deny all traffic
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: ${projectName}
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
`;
  }

  private generateServiceMeshConfig(analysis: ProjectAnalysis, projectName: string): string {
    return `# Istio Service Mesh Configuration
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: istio-control-plane
  namespace: istio-system
spec:
  profile: default

  meshConfig:
    # Enable mTLS by default
    enableAutoMtls: true

    # Access logging
    accessLogFile: /dev/stdout
    accessLogEncoding: JSON

  components:
    pilot:
      k8s:
        resources:
          requests:
            cpu: 500m
            memory: 2Gi

    ingressGateways:
      - name: istio-ingressgateway
        enabled: true
        k8s:
          service:
            type: LoadBalancer

---
# Peer Authentication - Require mTLS
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: ${projectName}
spec:
  mtls:
    mode: STRICT
`;
  }

  private generateRBACRoles(analysis: ProjectAnalysis, projectName: string): string {
    return `# RBAC Roles - Least Privilege Access
---
# Developer role - read-only access
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: developer
  namespace: ${projectName}
rules:
  - apiGroups: ["", "apps", "batch"]
    resources: ["pods", "deployments", "services", "jobs"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get"]

---
# DevOps role - full access to namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: devops
  namespace: ${projectName}
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]

---
# CI/CD role - deployment access
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: cicd
  namespace: ${projectName}
rules:
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list", "update", "patch"]
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps"]
    verbs: ["get", "list", "create", "update", "delete"]

---
# Bind roles to groups
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: developer-binding
  namespace: ${projectName}
subjects:
  - kind: Group
    name: ${projectName}-developers
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: developer
  apiGroup: rbac.authorization.k8s.io
`;
  }

  private generateSecureServiceAccounts(analysis: ProjectAnalysis, projectName: string): string {
    return `# Secure Service Accounts with IRSA (IAM Roles for Service Accounts)
${analysis.services.map(service => `---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${service.name}
  namespace: ${projectName}
  annotations:
    # AWS IAM role for this service
    eks.amazonaws.com/role-arn: arn:aws:iam::\${AWS_ACCOUNT_ID}:role/${projectName}-${service.name}
automountServiceAccountToken: false  # Don't auto-mount tokens

---
# Token request for ${service.name}
apiVersion: v1
kind: Secret
metadata:
  name: ${service.name}-token
  namespace: ${projectName}
  annotations:
    kubernetes.io/service-account.name: ${service.name}
type: kubernetes.io/service-account-token
`).join('\n')}
`;
  }

  private generateVeleroInstall(): string {
    return `#!/bin/bash
set -e

echo "Installing Velero for backup and disaster recovery..."

# Install Velero CLI
wget https://github.com/vmware-tanzu/velero/releases/latest/download/velero-linux-amd64.tar.gz
tar -xvf velero-linux-amd64.tar.gz
sudo mv velero-*/velero /usr/local/bin/
rm -rf velero-*

# Create S3 bucket for backups
aws s3 mb s3://\${CLUSTER_NAME}-velero-backups --region \${AWS_REGION}

# Install Velero with AWS plugin
velero install \\
  --provider aws \\
  --plugins velero/velero-plugin-for-aws:v1.8.0 \\
  --bucket \${CLUSTER_NAME}-velero-backups \\
  --backup-location-config region=\${AWS_REGION} \\
  --snapshot-location-config region=\${AWS_REGION} \\
  --use-node-agent \\
  --use-volume-snapshots=true

echo "✅ Velero installed successfully!"
`;
  }

  private generateBackupSchedule(projectName: string): string {
    return `# Velero Backup Schedules
---
# Daily full cluster backup
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: daily-backup
  namespace: velero
spec:
  schedule: "0 2 * * *"  # 2 AM daily
  template:
    ttl: 720h  # 30 days retention
    includedNamespaces:
      - ${projectName}
      - istio-system
      - monitoring
    snapshotVolumes: true

---
# Hourly application backup
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: hourly-app-backup
  namespace: velero
spec:
  schedule: "0 * * * *"  # Every hour
  template:
    ttl: 168h  # 7 days retention
    includedNamespaces:
      - ${projectName}
    labelSelector:
      matchLabels:
        backup: "true"
`;
  }

  private generateRestoreScript(projectName: string): string {
    return `#!/bin/bash
set -e

echo "🔄 Disaster Recovery - Restore from backup"

# List available backups
echo "Available backups:"
velero backup get

# Prompt for backup name
read -p "Enter backup name to restore: " BACKUP_NAME

# Restore
velero restore create --from-backup \$BACKUP_NAME

# Wait for restore to complete
velero restore describe \$BACKUP_NAME --wait

echo "✅ Restore completed successfully!"
`;
  }

  private generateSecurityScanWorkflow(analysis: ProjectAnalysis): string {
    return `name: Security Scanning

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight

jobs:
  secret-scan:
    name: Scan for Secrets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run GitLeaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

      - name: Upload results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: gitleaks-report
          path: results.sarif

  dependency-scan:
    name: Dependency Vulnerability Scan
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [${analysis.services.map(s => s.name).join(', ')}]
    steps:
      - uses: actions/checkout@v4

      - name: Run Snyk scan
        uses: snyk/actions/node@master
        continue-on-error: true
        env:
          SNYK_TOKEN: \${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high --file=src/\${{ matrix.service }}/package.json

  container-scan:
    name: Container Image Scan
    runs-on: ubuntu-latest
    needs: [secret-scan, dependency-scan]
    strategy:
      matrix:
        service: [${analysis.services.map(s => s.name).join(', ')}]
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -t \${{ matrix.service }}:test src/\${{ matrix.service }}

      - name: Run Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: \${{ matrix.service }}:test
          format: 'sarif'
          output: 'trivy-results-\${{ matrix.service }}.sarif'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'

      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: 'trivy-results-\${{ matrix.service }}.sarif'

  iac-scan:
    name: Infrastructure as Code Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Trivy IaC scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'config'
          scan-ref: 'terraform/'
          format: 'sarif'
          output: 'trivy-iac-results.sarif'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'

      - name: Upload IaC scan results
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: 'trivy-iac-results.sarif'
`;
  }

  private generateCISBenchmark(): string {
    return `# CIS Kubernetes Benchmark
apiVersion: batch/v1
kind: Job
metadata:
  name: kube-bench
  namespace: kube-system
spec:
  template:
    spec:
      hostPID: true
      containers:
        - name: kube-bench
          image: aquasec/kube-bench:latest
          command: ["kube-bench", "run", "--targets", "node,policies,managedservices"]
          volumeMounts:
            - name: var-lib-kubelet
              mountPath: /var/lib/kubelet
              readOnly: true
            - name: etc-kubernetes
              mountPath: /etc/kubernetes
              readOnly: true
      restartPolicy: Never
      volumes:
        - name: var-lib-kubelet
          hostPath:
            path: "/var/lib/kubelet"
        - name: etc-kubernetes
          hostPath:
            path: "/etc/kubernetes"
`;
  }

  private generateAuditPolicy(): string {
    return `# Kubernetes Audit Policy
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
  # Log all requests at Metadata level
  - level: Metadata

  # Don't log read-only requests
  - level: None
    verbs: ["get", "list", "watch"]

  # Log requests to sensitive resources at RequestResponse level
  - level: RequestResponse
    resources:
      - group: ""
        resources: ["secrets", "configmaps"]

  # Log authentication/authorization events
  - level: RequestResponse
    verbs: ["create", "update", "patch", "delete"]
    users: ["system:serviceaccount:*"]

  # Don't log healthz/readyz
  - level: None
    paths:
      - /healthz*
      - /readyz*
      - /livez*
`;
  }

  private generateSecurityReadme(analysis: ProjectAnalysis, projectName: string): string {
    return `# Security Setup for ${analysis.projectName}

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

\`\`\`bash
# Container scanning
./security/trivy/install.sh

# Runtime security
./security/runtime/install-falco.sh

# Backup & DR
./security/backup/velero-install.sh
\`\`\`

### 2. Scan for Vulnerabilities

\`\`\`bash
# Scan container images
./security/trivy/scan-images.sh

# Scan for secrets
./security/secrets/scan-secrets.sh
\`\`\`

### 3. Deploy Security Policies

\`\`\`bash
# Deploy Kyverno policies
kubectl apply -f security/policies/kyverno-policies.yaml

# Deploy network policies
kubectl apply -f security/network/network-policies.yaml

# Deploy Pod Security Standards
kubectl apply -f security/policies/pod-security-standards.yaml
\`\`\`

### 4. Setup Secret Management

\`\`\`bash
# Option 1: HashiCorp Vault
kubectl apply -f security/secrets/vault-setup.yaml

# Option 2: External Secrets (AWS Secrets Manager)
kubectl apply -f security/secrets/external-secrets.yaml

# Option 3: Sealed Secrets
kubectl apply -f security/secrets/sealed-secrets.yaml
\`\`\`

### 5. Configure Backups

\`\`\`bash
# Setup automatic backups
kubectl apply -f security/backup/backup-schedule.yaml

# Test restore
./security/backup/restore.sh
\`\`\`

## 📊 Security Monitoring

### Falco Alerts

\`\`\`bash
# Watch Falco alerts in real-time
kubectl logs -f -n falco -l app=falco

# View Falco events
kubectl exec -n falco -c falco -- cat /var/log/falco/events.txt
\`\`\`

### Trivy Scans

Trivy runs automatically in CI/CD on every commit. View reports:

\`\`\`bash
cat security/reports/*-scan.json
\`\`\`

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

\`\`\`bash
# View recent alerts
kubectl logs --since=1h -n falco -l app=falco | grep CRITICAL
\`\`\`

### Investigate: Check Pod

\`\`\`bash
# Get pod details
kubectl describe pod <pod-name> -n ${projectName}

# Check logs
kubectl logs <pod-name> -n ${projectName}

# Exec into pod (if safe)
kubectl exec -it <pod-name> -n ${projectName} -- /bin/sh
\`\`\`

### Contain: Isolate Pod

\`\`\`bash
# Label pod as compromised
kubectl label pod <pod-name> security=compromised -n ${projectName}

# Apply network policy to isolate
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-compromised
  namespace: ${projectName}
spec:
  podSelector:
    matchLabels:
      security: compromised
  policyTypes:
    - Ingress
    - Egress
EOF
\`\`\`

### Eradicate: Delete Pod

\`\`\`bash
# Delete compromised pod
kubectl delete pod <pod-name> -n ${projectName}

# Verify new pod is clean
kubectl get pods -n ${projectName}
\`\`\`

### Recover: Restore from Backup

\`\`\`bash
# List backups
velero backup get

# Restore
velero restore create --from-backup <backup-name>
\`\`\`

## 📋 Security Checklist

Use \`SECURITY-CHECKLIST.md\` for pre-deployment verification.

## 🔗 Resources

- **Trivy**: https://trivy.dev/
- **Falco**: https://falco.org/
- **Kyverno**: https://kyverno.io/
- **Velero**: https://velero.io/
- **CIS Benchmarks**: https://www.cisecurity.org/benchmark/kubernetes

---

**Security is everyone's responsibility! 🔒**
`;
  }

  private generateSecurityChecklist(): string {
    return `# Security Checklist - Pre-Deployment

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
`;
  }
}
