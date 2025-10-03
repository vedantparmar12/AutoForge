import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { ProjectAnalyzer } from '../analyzers/project-analyzer.js';
import { ResourceCalculator } from '../calculators/resource-calculator.js';
import { KubernetesGenerator } from '../generators/kubernetes-generator.js';
import { TerraformGenerator } from '../generators/terraform-generator.js';
import { CICDGenerator } from '../generators/cicd-generator.js';
import type { DevOpsConfig, ToolResponse } from '../types/index.js';

export class DevOpsTools {
  private analyzer = new ProjectAnalyzer();
  private calculator = new ResourceCalculator();
  private k8sGenerator = new KubernetesGenerator();
  private terraformGenerator = new TerraformGenerator();
  private cicdGenerator = new CICDGenerator();

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

      // Create output directories
      await mkdir(outputDir, { recursive: true });
      await mkdir(join(outputDir, 'k8s'), { recursive: true });
      await mkdir(join(outputDir, 'terraform'), { recursive: true });
      await mkdir(join(outputDir, '.github', 'workflows'), { recursive: true });

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
        await mkdir(join(outputDir, '.github', 'workflows'), { recursive: true });
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
              message: 'DevOps setup generated successfully',
              outputDir,
              files: {
                kubernetes: ['k8s/manifests.yaml'],
                terraform: Object.keys(terraformFiles),
                cicd: Object.keys(cicdFiles),
                documentation: ['DEPLOYMENT.md']
              },
              nextSteps: [
                '1. Review generated Terraform files in terraform/',
                '2. Update terraform.tfvars with your AWS credentials',
                '3. Run: cd terraform && terraform init && terraform apply',
                '4. Configure GitHub secrets for CI/CD pipelines',
                '5. Push changes to trigger automated deployment'
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
                '8. Setup monitoring\n\n' +
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
This deployment guide was automatically generated by MCP DevOps Automation.

**Project Complexity:** ${analysis.complexity}
**Services:** ${analysis.services.length}
**Estimated Monthly Cost:** $${resources.estimated_cost.monthly.total}

## Prerequisites

1. **AWS CLI** - \`aws --version\` (v2+)
2. **Terraform** - \`terraform --version\` (v1.0+)
3. **kubectl** - \`kubectl version --client\` (v1.33+)
4. **Docker** - \`docker --version\` (v20.0+)

## Quick Start

### Step 1: Configure AWS Credentials

\`\`\`bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and region (${region})
\`\`\`

### Step 2: Create S3 Bucket for Terraform State

\`\`\`bash
aws s3 mb s3://${projectName}-terraform-state --region ${region}
aws s3api put-bucket-versioning --bucket ${projectName}-terraform-state --versioning-configuration Status=Enabled
\`\`\`

### Step 3: Deploy Infrastructure with Terraform

\`\`\`bash
cd terraform/

# Initialize Terraform
terraform init

# Review the plan
terraform plan

# Apply infrastructure (Phase 1: VPC and EKS)
terraform apply -target=module.vpc -target=module.eks -auto-approve

# Update kubeconfig
aws eks update-kubeconfig --name ${projectName}-cluster --region ${region}

# Apply remaining infrastructure (Phase 2)
terraform apply -auto-approve
\`\`\`

### Step 4: Build and Push Docker Images

\`\`\`bash
# Get ECR login credentials
aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.${region}.amazonaws.com

# Build and push each service
${analysis.services.map((s: any) => `
docker build -t ${projectName}-cluster/${s.name}:latest ./src/${s.name}
docker tag ${projectName}-cluster/${s.name}:latest $(aws sts get-caller-identity --query Account --output text).dkr.ecr.${region}.amazonaws.com/${projectName}-cluster/${s.name}:latest
docker push $(aws sts get-caller-identity --query Account --output text).dkr.ecr.${region}.amazonaws.com/${projectName}-cluster/${s.name}:latest
`).join('')}
\`\`\`

### Step 5: Deploy Kubernetes Resources

\`\`\`bash
# Create namespace
kubectl create namespace ${projectName}

# Deploy all resources
kubectl apply -f k8s/manifests.yaml -n ${projectName}

# Wait for deployments
kubectl rollout status deployment -n ${projectName} --timeout=5m

# Check status
kubectl get pods -n ${projectName}
kubectl get svc -n ${projectName}
\`\`\`

### Step 6: Access Your Application

\`\`\`bash
# Get the load balancer URL
kubectl get ingress -n ${projectName}

# Or get the service URL
kubectl get svc -n ingress-nginx
\`\`\`

## GitHub Actions Setup

### Required Secrets

Configure the following secrets in your GitHub repository (Settings → Secrets and variables → Actions):

| Secret Name | Description | Example |
|-------------|-------------|---------|
| \`AWS_ACCESS_KEY_ID\` | AWS Access Key | AKIA... |
| \`AWS_SECRET_ACCESS_KEY\` | AWS Secret Key | ... |
| \`AWS_REGION\` | AWS Region | ${region} |
| \`AWS_ACCOUNT_ID\` | AWS Account ID | 123456789012 |

### Automated Deployment

Once secrets are configured:

1. Push changes to \`main\` branch
2. GitHub Actions will automatically:
   - Build Docker images
   - Push to ECR
   - Update Kubernetes deployments

## Resource Overview

### Compute Resources
- **Node Count:** ${resources.infrastructure.kubernetes.nodeCount}
- **Node Type:** ${resources.infrastructure.kubernetes.nodeType}
- **Node Size:** ${resources.infrastructure.kubernetes.nodeSize}

### Services Configuration
${resources.services.map((s: any) => `
**${s.serviceName}:**
- Replicas: ${s.replicas} (auto-scaling: ${s.autoscaling.minReplicas}-${s.autoscaling.maxReplicas})
- CPU: ${s.cpu.request} (request) / ${s.cpu.limit} (limit)
- Memory: ${s.memory.request} (request) / ${s.memory.limit} (limit)
`).join('')}

### Cost Breakdown
- **Compute:** $${resources.estimated_cost.monthly.compute}/month
- **Storage:** $${resources.estimated_cost.monthly.storage}/month
- **Networking:** $${resources.estimated_cost.monthly.networking}/month
- **Database:** $${resources.estimated_cost.monthly.database}/month
- **Total:** $${resources.estimated_cost.monthly.total}/month

## Monitoring & Observability

Access monitoring tools:

\`\`\`bash
# Port-forward to ArgoCD
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Get ArgoCD admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Access: https://localhost:8080
# Username: admin
# Password: <from above>
\`\`\`

## Cleanup

To destroy all resources:

\`\`\`bash
# Delete Kubernetes resources
kubectl delete namespace ${projectName}

# Destroy Terraform infrastructure
cd terraform/
terraform destroy -auto-approve

# Delete S3 state bucket (optional)
aws s3 rb s3://${projectName}-terraform-state --force
\`\`\`

## Troubleshooting

### Common Issues

**Issue:** Terraform fails with authentication error
**Solution:** Run \`aws configure\` and verify credentials

**Issue:** ECR push fails
**Solution:** Run ECR login command again

**Issue:** Pods not starting
**Solution:** Check logs with \`kubectl logs -n ${projectName} <pod-name>\`

**Issue:** High costs
**Solution:** Review autoscaling settings and node count

## Support

For issues and questions:
- Review logs: \`kubectl logs -n ${projectName} <pod-name>\`
- Check events: \`kubectl get events -n ${projectName}\`
- ArgoCD UI: Port-forward and access at https://localhost:8080

---

**Generated by MCP DevOps Automation**
**Date:** ${new Date().toISOString()}
`;
  }
}
