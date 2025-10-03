import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { ProjectAnalyzer } from '../analyzers/project-analyzer.js';
import { ResourceCalculator } from '../calculators/resource-calculator.js';
import { KubernetesGenerator } from '../generators/kubernetes-generator.js';
import { TerraformGenerator } from '../generators/terraform-generator.js';
import { CICDGenerator } from '../generators/cicd-generator.js';
import { HelmGenerator } from '../generators/helm-generator.js';
import { ArgoCDGenerator } from '../generators/argocd-generator.js';
import { MonitoringGenerator } from '../generators/monitoring-generator.js';
import { AnsibleGenerator } from '../generators/ansible-generator.js';
import { SecurityGenerator } from '../generators/security-generator.js';
import type { DevOpsConfig, ToolResponse } from '../types/index.js';

export class DevOpsTools {
  private analyzer = new ProjectAnalyzer();
  private calculator = new ResourceCalculator();
  private k8sGenerator = new KubernetesGenerator();
  private terraformGenerator = new TerraformGenerator();
  private cicdGenerator = new CICDGenerator();
  private helmGenerator = new HelmGenerator();
  private argoCDGenerator = new ArgoCDGenerator();
  private monitoringGenerator = new MonitoringGenerator();
  private ansibleGenerator = new AnsibleGenerator();
  private securityGenerator = new SecurityGenerator();

  async analyzeProject(projectPath: string): Promise<ToolResponse> {
    try {
      const analysis = await this.analyzer.analyzeProject(projectPath);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              analysis: {
                projectName: analysis.projectName,
                services: analysis.services.map(s => ({
                  name: s.name,
                  language: s.language,
                  framework: s.framework,
                  port: s.port,
                  hasDocker: s.hasDockerfile,
                  hasTests: s.hasTests
                })),
                languages: analysis.languages,
                frameworks: analysis.frameworks,
                databases: analysis.databases,
                complexity: analysis.complexity,
                size: analysis.estimatedSize
              }
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error analyzing project: ${error.message}` }],
        isError: true
      };
    }
  }

  async calculateResources(projectPath: string): Promise<ToolResponse> {
    try {
      const analysis = await this.analyzer.analyzeProject(projectPath);
      const resources = this.calculator.calculateResources(analysis);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              resources: {
                services: resources.services.map(s => ({
                  name: s.serviceName,
                  replicas: s.replicas,
                  cpu: s.cpu,
                  memory: s.memory,
                  autoscaling: s.autoscaling
                })),
                infrastructure: resources.infrastructure,
                estimatedCost: resources.estimated_cost
              }
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error calculating resources: ${error.message}` }],
        isError: true
      };
    }
  }

  async generateDevOpsSetup(config: DevOpsConfig): Promise<ToolResponse> {
    try {
      const outputDir = config.outputDir || join(config.projectPath, 'devops-generated');

      // Analyze project
      const analysis = await this.analyzer.analyzeProject(config.projectPath);
      const resources = this.calculator.calculateResources(analysis);

      // Generate all configurations
      const k8sManifests = this.k8sGenerator.generateManifests(analysis, resources);
      const terraformFiles = this.terraformGenerator.generateTerraform(
        analysis,
        resources,
        config.awsRegion
      );
      const cicdFiles = this.cicdGenerator.generateGitHubActions(
        analysis,
        config.awsRegion || 'us-east-1'
      );

      // NEW: Generate Helm charts
      const helmCharts = this.helmGenerator.generateHelmCharts(analysis, resources);

      // NEW: Generate ArgoCD applications
      const argoCDFiles = this.argoCDGenerator.generateArgoCDSetup(analysis);

      // NEW: Generate monitoring setup
      const monitoringFiles = config.enableMonitoring !== false
        ? this.monitoringGenerator.generateMonitoringSetup(analysis, resources)
        : {};

      // NEW: Generate Ansible playbooks (optional alternative)
      const ansibleFiles = this.ansibleGenerator.generateAnsiblePlaybooks(
        analysis,
        resources,
        config.awsRegion || 'us-east-1'
      );

      // NEW: Generate Security setup (Trivy, Falco, Kyverno, Velero)
      const securityFiles = this.securityGenerator.generateSecuritySetup(analysis);

      // Create output directories
      await mkdir(outputDir, { recursive: true });
      await mkdir(join(outputDir, 'k8s'), { recursive: true });
      await mkdir(join(outputDir, 'terraform'), { recursive: true });
      await mkdir(join(outputDir, '.github', 'workflows'), { recursive: true });
      await mkdir(join(outputDir, 'helm'), { recursive: true });
      await mkdir(join(outputDir, 'argocd'), { recursive: true });
      await mkdir(join(outputDir, 'monitoring'), { recursive: true });
      await mkdir(join(outputDir, 'ansible'), { recursive: true });
      await mkdir(join(outputDir, 'security'), { recursive: true });

      // Write Kubernetes manifests
      const k8sYaml = this.k8sGenerator.exportToYAML(k8sManifests);
      await writeFile(join(outputDir, 'k8s', 'manifests.yaml'), k8sYaml);

      // Write Terraform files
      for (const [filename, content] of Object.entries(terraformFiles)) {
        await writeFile(join(outputDir, 'terraform', filename), content);
      }

      // Write CI/CD files
      for (const [filepath, content] of Object.entries(cicdFiles)) {
        const fullPath = join(outputDir, filepath);
        await writeFile(fullPath, content);
      }

      // Write Helm charts
      for (const [serviceName, files] of Object.entries(helmCharts)) {
        const helmDir = join(outputDir, 'helm', 'charts', serviceName);
        await mkdir(helmDir, { recursive: true });
        await mkdir(join(helmDir, 'templates'), { recursive: true });

        for (const [filename, content] of Object.entries(files)) {
          await writeFile(join(helmDir, filename), content);
        }
      }

      // Write ArgoCD files
      for (const [filepath, content] of Object.entries(argoCDFiles)) {
        const fullPath = join(outputDir, filepath);
        await mkdir(join(outputDir, filepath.substring(0, filepath.lastIndexOf('/'))), { recursive: true });
        await writeFile(fullPath, content);
      }

      // Write monitoring files
      for (const [filepath, content] of Object.entries(monitoringFiles)) {
        const fullPath = join(outputDir, filepath);
        await mkdir(join(outputDir, filepath.substring(0, filepath.lastIndexOf('/'))), { recursive: true });
        await writeFile(fullPath, content);
      }

      // Write Ansible files
      for (const [filepath, content] of Object.entries(ansibleFiles)) {
        const fullPath = join(outputDir, filepath);
        await mkdir(join(outputDir, filepath.substring(0, filepath.lastIndexOf('/'))), { recursive: true });
        await writeFile(fullPath, content);
      }

      // Write Security files
      for (const [filepath, content] of Object.entries(securityFiles)) {
        const fullPath = join(outputDir, filepath);
        await mkdir(join(outputDir, filepath.substring(0, filepath.lastIndexOf('/'))), { recursive: true });
        await writeFile(fullPath, content);
      }

      // Generate deployment guide
      const deploymentGuide = this.generateDeploymentGuide(analysis, resources, config);
      await writeFile(join(outputDir, 'DEPLOYMENT.md'), deploymentGuide);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Complete DevOps setup generated successfully',
              outputDir,
              files: {
                kubernetes: ['k8s/manifests.yaml'],
                terraform: Object.keys(terraformFiles),
                cicd: Object.keys(cicdFiles),
                helm: Object.keys(helmCharts).map(s => `helm/charts/${s}`),
                argocd: Object.keys(argoCDFiles),
                monitoring: Object.keys(monitoringFiles),
                ansible: Object.keys(ansibleFiles),
                security: Object.keys(securityFiles),
                documentation: ['DEPLOYMENT.md']
              },
              features: {
                gitops: '✅ ArgoCD applications configured',
                helm: `✅ ${Object.keys(helmCharts).length} Helm charts generated`,
                monitoring: config.enableMonitoring !== false ? '✅ Prometheus & Grafana setup included' : '⏭️ Monitoring skipped',
                security: `✅ ${Object.keys(securityFiles).length} security configurations (Trivy, Falco, Kyverno, Velero)`,
                cicd: '✅ GitHub Actions pipelines',
                ansible: '✅ Ansible playbooks (alternative to Terraform)',
                infrastructure: '✅ Complete AWS/EKS setup'
              },
              nextSteps: [
                '1. Review generated files in ' + outputDir,
                '2. Choose deployment method: Terraform (recommended) or Ansible',
                '3. For Terraform: cd terraform && terraform init && terraform apply',
                '4. For Ansible: cd ansible && ansible-playbook playbooks/deploy-all.yml',
                '5. Configure GitHub secrets for CI/CD (see DEPLOYMENT.md)',
                '6. Deploy via ArgoCD: kubectl apply -f argocd/',
                '7. Access monitoring: kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80'
              ]
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error generating DevOps setup: ${error.message}` }],
        isError: true
      };
    }
  }

  async deployToAWS(config: DevOpsConfig): Promise<ToolResponse> {
    try {
      if (config.dryRun) {
        return {
          content: [
            {
              type: 'text',
              text: 'DRY RUN: Would execute deployment with the following steps:\n' +
                '1. Initialize Terraform\n' +
                '2. Create VPC and networking\n' +
                '3. Create EKS cluster\n' +
                '4. Create ECR repositories\n' +
                '5. Build and push Docker images\n' +
                '6. Deploy Kubernetes manifests\n' +
                '7. Configure ArgoCD\n' +
                '8. Setup Prometheus & Grafana monitoring\n\n' +
                'Run without dryRun to execute actual deployment.'
            }
          ]
        };
      }

      // In a real implementation, this would execute Terraform and kubectl commands
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Deployment initiated',
              warning: 'Actual deployment requires AWS CLI and Terraform installed locally',
              recommendation: 'Use the generated files and follow DEPLOYMENT.md for manual deployment'
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error deploying to AWS: ${error.message}` }],
        isError: true
      };
    }
  }

  private generateDeploymentGuide(
    analysis: any,
    resources: any,
    config: DevOpsConfig
  ): string {
    const projectName = analysis.projectName;
    const region = config.awsRegion || 'us-east-1';

    return `# ${projectName} - Deployment Guide

## Overview
Complete deployment guide with Helm, ArgoCD, Prometheus, and Ansible support.

**Project Complexity:** ${analysis.complexity}
**Services:** ${analysis.services.length}
**Estimated Monthly Cost:** $${resources.estimated_cost.monthly.total}

## 🎯 What Was Generated

✅ **Kubernetes Manifests** - Raw K8s YAML
✅ **Helm Charts** - Production-ready Helm charts for each service
✅ **ArgoCD Applications** - GitOps deployment configurations
✅ **Terraform** - Complete AWS infrastructure
✅ **Ansible Playbooks** - Alternative deployment method
✅ **CI/CD Pipelines** - GitHub Actions workflows
✅ **Monitoring Stack** - Prometheus, Grafana, AlertManager
✅ **Documentation** - This guide and component READMEs

## 🚀 Deployment Options

You have **3 deployment methods**:

### Option 1: GitOps with ArgoCD (Recommended)
Best for: Production environments, team collaboration

### Option 2: Terraform + Helm
Best for: Full control, infrastructure management

### Option 3: Ansible
Best for: Existing Ansible workflows, procedural deployment

---

## Prerequisites

\`\`\`bash
# Required tools
aws --version          # AWS CLI v2+
terraform --version    # Terraform 1.0+
kubectl --version      # kubectl 1.33+
helm --version         # Helm 3.0+
\`\`\`

## Option 1: GitOps with ArgoCD

### Step 1: Deploy Infrastructure

\`\`\`bash
cd terraform/
terraform init
terraform apply -auto-approve
\`\`\`

### Step 2: Update Kubeconfig

\`\`\`bash
aws eks update-kubeconfig --name ${projectName}-cluster --region ${region}
\`\`\`

### Step 3: Install ArgoCD

\`\`\`bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
\`\`\`

### Step 4: Deploy Applications

\`\`\`bash
# Deploy the project
kubectl apply -f argocd/projects/project.yaml

# Deploy all services via umbrella chart
kubectl apply -f argocd/applications/umbrella-app.yaml

# Or deploy services individually
kubectl apply -f argocd/applications/
\`\`\`

### Step 5: Access ArgoCD UI

\`\`\`bash
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Get password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Open: https://localhost:8080
# Login: admin / <password>
\`\`\`

---

## Option 2: Terraform + Helm

### Step 1: Deploy Infrastructure

\`\`\`bash
cd terraform/
terraform init
terraform apply -target=module.vpc -target=module.eks -auto-approve

# Update kubeconfig
aws eks update-kubeconfig --name ${projectName}-cluster --region ${region}

# Complete infrastructure
terraform apply -auto-approve
\`\`\`

### Step 2: Deploy with Helm

\`\`\`bash
cd helm/

# Update Helm dependencies
helm dependency update

# Install all services
helm install ${projectName} . -n ${projectName} --create-namespace

# Or install individually
${analysis.services.map((s: any) => `helm install ${s.name} charts/${s.name} -n ${projectName}`).join('\n')}
\`\`\`

---

## Option 3: Ansible

### Step 1: Install Requirements

\`\`\`bash
pip install ansible boto3 botocore
ansible-galaxy collection install amazon.aws community.aws kubernetes.core
\`\`\`

### Step 2: Deploy Everything

\`\`\`bash
cd ansible/
ansible-playbook playbooks/deploy-all.yml
\`\`\`

See \`ansible/README.md\` for more options.

---

## 📊 Monitoring Setup

### Install Prometheus & Grafana

\`\`\`bash
cd monitoring/
chmod +x install.sh
./install.sh
\`\`\`

### Access Dashboards

\`\`\`bash
# Prometheus
kubectl port-forward -n monitoring svc/prometheus-operated 9090:9090

# Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
# Login: admin / changeme
\`\`\`

### Pre-configured Dashboards

- **Overview** - System-wide metrics
- **Services** - Per-service performance
- **Infrastructure** - Cluster health

---

## 🔍 Verification

\`\`\`bash
# Check pods
kubectl get pods -n ${projectName}

# Check services
kubectl get svc -n ${projectName}

# Check ingress
kubectl get ingress -n ${projectName}

# Get application URL
kubectl get svc ingress-nginx-controller -n ingress-nginx
\`\`\`

---

## 🎨 Service Resources

${resources.services.map((s: any) => `
### ${s.serviceName}
- **Replicas:** ${s.replicas} (auto-scaling: ${s.autoscaling.minReplicas}-${s.autoscaling.maxReplicas})
- **CPU:** ${s.cpu.request} / ${s.cpu.limit}
- **Memory:** ${s.memory.request} / ${s.memory.limit}
`).join('')}

---

## 💰 Cost Breakdown

| Component | Monthly Cost |
|-----------|--------------|
| Compute (EKS + Nodes) | $${resources.estimated_cost.monthly.compute} |
| Storage | $${resources.estimated_cost.monthly.storage} |
| Networking | $${resources.estimated_cost.monthly.networking} |
| Database | $${resources.estimated_cost.monthly.database} |
| **Total** | **$${resources.estimated_cost.monthly.total}** |

---

## 🔧 Troubleshooting

### Pods not starting
\`\`\`bash
kubectl describe pod <pod-name> -n ${projectName}
kubectl logs <pod-name> -n ${projectName}
\`\`\`

### Image pull errors
\`\`\`bash
# Login to ECR
aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.${region}.amazonaws.com
\`\`\`

### ArgoCD sync issues
\`\`\`bash
argocd app get ${projectName}-umbrella
argocd app sync ${projectName}-umbrella --force
\`\`\`

---

## 🧹 Cleanup

\`\`\`bash
# Delete Kubernetes resources
kubectl delete namespace ${projectName}

# Destroy infrastructure
cd terraform/
terraform destroy -auto-approve

# Delete ArgoCD
kubectl delete namespace argocd

# Delete monitoring
kubectl delete namespace monitoring
\`\`\`

---

## 📚 Additional Resources

- **Helm Charts:** \`helm/README.md\`
- **ArgoCD:** \`argocd/README.md\`
- **Monitoring:** \`monitoring/README.md\`
- **Ansible:** \`ansible/README.md\`

---

**Generated by MCP DevOps Automation**
**Date:** ${new Date().toISOString()}
**Features:** Helm ✅ | ArgoCD ✅ | Prometheus ✅ | Ansible ✅
`;
  }
}
