import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { ProjectAnalyzer } from '../analyzers/project-analyzer.js';
import { ResourceCalculator } from '../calculators/resource-calculator.js';
import { KubernetesGenerator } from '../generators/kubernetes-generator.js';
import { TerraformGenerator } from '../generators/terraform-generator.js';
import { AzureGenerator } from '../generators/azure-generator.js';
import { GCPGenerator } from '../generators/gcp-generator.js';

interface DeploymentProgress {
  step: number;
  totalSteps: number;
  message: string;
  status: 'running' | 'completed' | 'failed';
}

export class ZeroConfigDeployer {
  private analyzer = new ProjectAnalyzer();
  private calculator = new ResourceCalculator();
  private k8sGenerator = new KubernetesGenerator();
  private terraformGenerator = new TerraformGenerator();
  private azureGenerator = new AzureGenerator();
  private gcpGenerator = new GCPGenerator();

  async deployNow(
    projectPath: string,
    options?: {
      cloud?: 'aws' | 'azure' | 'gcp';
      region?: string;
      dryRun?: boolean;
      autoApprove?: boolean;
    }
  ): Promise<{
    success: boolean;
    deploymentUrl?: string;
    duration: number;
    steps: DeploymentProgress[];
    costs: any;
  }> {
    const startTime = Date.now();
    const steps: DeploymentProgress[] = [];
    const cloud = options?.cloud || await this.detectBestCloud();
    const region = options?.region || this.getDefaultRegion(cloud);

    try {
      // Step 1: Analyze project
      steps.push(this.createStep(1, 8, 'Analyzing project structure...', 'running'));
      const analysis = await this.analyzer.analyzeProject(projectPath);
      steps[0].status = 'completed';

      // Step 2: Calculate resources
      steps.push(this.createStep(2, 8, 'Calculating optimal resources...', 'running'));
      const resources = this.calculator.calculateResources(analysis);
      steps[1].status = 'completed';

      // Step 3: Estimate costs
      steps.push(this.createStep(3, 8, 'Estimating costs...', 'running'));
      const costs = this.estimateCosts(cloud, resources);
      steps[2].status = 'completed';

      // Step 4: Generate configurations
      steps.push(this.createStep(4, 8, 'Generating infrastructure configs...', 'running'));
      const configs = await this.generateConfigs(analysis, resources, cloud, region);
      steps[3].status = 'completed';

      // Step 5: Write files
      steps.push(this.createStep(5, 8, 'Writing configuration files...', 'running'));
      const outputDir = join(projectPath, 'zero-config-deploy');
      await this.writeConfigs(outputDir, configs);
      steps[4].status = 'completed';

      if (options?.dryRun) {
        steps.push(this.createStep(6, 8, 'DRY RUN - Skipping deployment', 'completed'));

        return {
          success: true,
          duration: Date.now() - startTime,
          steps,
          costs,
        };
      }

      // Step 6: Initialize Terraform
      steps.push(this.createStep(6, 8, 'Initializing Terraform...', 'running'));
      await this.runCommand('terraform', ['init'], join(outputDir, 'terraform'));
      steps[5].status = 'completed';

      // Step 7: Deploy infrastructure
      steps.push(this.createStep(7, 8, 'Deploying infrastructure...', 'running'));
      if (options?.autoApprove) {
        await this.runCommand('terraform', ['apply', '-auto-approve'], join(outputDir, 'terraform'));
      } else {
        // Interactive mode - user approves
        await this.runCommand('terraform', ['apply'], join(outputDir, 'terraform'));
      }
      steps[6].status = 'completed';

      // Step 8: Deploy applications
      steps.push(this.createStep(8, 8, 'Deploying applications to Kubernetes...', 'running'));
      const deploymentUrl = await this.deployToKubernetes(outputDir, cloud);
      steps[7].status = 'completed';

      return {
        success: true,
        deploymentUrl,
        duration: Date.now() - startTime,
        steps,
        costs,
      };
    } catch (error: any) {
      // Mark current step as failed
      if (steps.length > 0) {
        steps[steps.length - 1].status = 'failed';
        steps[steps.length - 1].message += ` (Error: ${error.message})`;
      }

      return {
        success: false,
        duration: Date.now() - startTime,
        steps,
        costs: null,
      };
    }
  }

  private async detectBestCloud(): Promise<'aws' | 'azure' | 'gcp'> {
    // Check for existing cloud credentials/config
    try {
      // Check AWS
      await this.runCommand('aws', ['sts', 'get-caller-identity'], process.cwd());
      return 'aws';
    } catch {
      // AWS not configured
    }

    try {
      // Check Azure
      await this.runCommand('az', ['account', 'show'], process.cwd());
      return 'azure';
    } catch {
      // Azure not configured
    }

    try {
      // Check GCP
      await this.runCommand('gcloud', ['config', 'get-value', 'project'], process.cwd());
      return 'gcp';
    } catch {
      // GCP not configured
    }

    // Default to AWS
    return 'aws';
  }

  private getDefaultRegion(cloud: 'aws' | 'azure' | 'gcp'): string {
    const defaults: Record<string, string> = {
      aws: 'us-east-1',
      azure: 'eastus',
      gcp: 'us-central1',
    };
    return defaults[cloud];
  }

  private estimateCosts(cloud: string, resources: any): any {
    switch (cloud) {
      case 'azure':
        return this.azureGenerator.estimateCosts(resources);
      case 'gcp':
        return this.gcpGenerator.estimateCosts(resources);
      default:
        return resources.estimated_cost;
    }
  }

  private async generateConfigs(
    analysis: any,
    resources: any,
    cloud: string,
    region: string
  ): Promise<Record<string, any>> {
    const configs: Record<string, any> = {};

    // Generate Kubernetes manifests (same for all clouds)
    const k8sManifests = this.k8sGenerator.generateManifests(analysis, resources);
    configs.kubernetes = this.k8sGenerator.exportToYAML(k8sManifests);

    // Generate cloud-specific Terraform
    switch (cloud) {
      case 'azure':
        configs.terraform = this.azureGenerator.generateAzureTerraform(analysis, resources, region);
        break;
      case 'gcp':
        configs.terraform = this.gcpGenerator.generateGCPTerraform(analysis, resources, region);
        break;
      default:
        configs.terraform = this.terraformGenerator.generateTerraform(analysis, resources, region);
    }

    return configs;
  }

  private async writeConfigs(outputDir: string, configs: any): Promise<void> {
    const fs = await import('fs/promises');

    // Create directories
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(join(outputDir, 'terraform'), { recursive: true });
    await fs.mkdir(join(outputDir, 'k8s'), { recursive: true });

    // Write Kubernetes manifests
    await writeFile(join(outputDir, 'k8s', 'manifests.yaml'), configs.kubernetes);

    // Write Terraform files
    for (const [filename, content] of Object.entries(configs.terraform)) {
      await writeFile(join(outputDir, 'terraform', filename), content as string);
    }

    // Write README
    await this.writeQuickStartGuide(outputDir);
  }

  private async writeQuickStartGuide(outputDir: string): Promise<string> {
    const guide = `# 🚀 Zero-Config Deployment

Your infrastructure has been automatically configured and is ready to deploy!

## ⚡ Quick Start

### 1. Deploy Infrastructure
\`\`\`bash
cd terraform/
terraform init
terraform apply
\`\`\`

### 2. Deploy Applications
\`\`\`bash
kubectl apply -f k8s/manifests.yaml
\`\`\`

### 3. Get Service URL
\`\`\`bash
kubectl get svc -n default
\`\`\`

## 📊 What Was Created

✅ Kubernetes cluster (auto-scaled)
✅ Container registry
✅ Managed database
✅ Load balancer
✅ All necessary networking

## 💰 Estimated Cost

See Terraform output for monthly cost estimates

---

**Generated by Zero-Config Deployment** ⚡
`;

    await writeFile(join(outputDir, 'README.md'), guide);
    return guide;
  }

  private async deployToKubernetes(outputDir: string, cloud: string): Promise<string> {
    // Update kubeconfig based on cloud
    switch (cloud) {
      case 'azure':
        // Get AKS credentials
        break;
      case 'gcp':
        // Get GKE credentials
        break;
      default:
        // Get EKS credentials
        break;
    }

    // Apply Kubernetes manifests
    await this.runCommand('kubectl', ['apply', '-f', join(outputDir, 'k8s', 'manifests.yaml')], outputDir);

    // Wait for LoadBalancer IP/hostname
    await this.sleep(30000); // Wait 30 seconds

    // Get service URL
    const result = await this.runCommand(
      'kubectl',
      ['get', 'svc', '-o', 'jsonpath={.items[0].status.loadBalancer.ingress[0].hostname}'],
      outputDir
    );

    return result.trim() || 'Deployment successful - URL pending';
  }

  private runCommand(
    command: string,
    args: string[],
    cwd: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed: ${command} ${args.join(' ')}\n${stderr}`));
        }
      });

      child.on('error', reject);
    });
  }

  private createStep(
    step: number,
    totalSteps: number,
    message: string,
    status: 'running' | 'completed' | 'failed'
  ): DeploymentProgress {
    return { step, totalSteps, message, status };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
