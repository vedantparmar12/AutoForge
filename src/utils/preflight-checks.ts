import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

const execAsync = promisify(exec);

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

interface PreflightResults {
  passed: boolean;
  checks: CheckResult[];
  warnings: CheckResult[];
  errors: CheckResult[];
}

export class PreflightChecker {
  async runChecks(cloudProvider?: string): Promise<PreflightResults> {
    const checks: CheckResult[] = [];
    
    // System checks
    checks.push(...await this.runSystemChecks());
    
    // Docker checks
    checks.push(...await this.runDockerChecks());
    
    // Cloud provider specific checks
    if (cloudProvider) {
      switch (cloudProvider.toLowerCase()) {
        case 'aws':
          checks.push(...await this.runAWSChecks());
          break;
        case 'azure':
          checks.push(...await this.runAzureChecks());
          break;
        case 'gcp':
          checks.push(...await this.runGCPChecks());
          break;
      }
    }
    
    // Kubernetes checks
    checks.push(...await this.runKubernetesChecks());
    
    // Terraform checks
    checks.push(...await this.runTerraformChecks());
    
    return this.categorizeResults(checks);
  }

  private async runSystemChecks(): Promise<CheckResult[]> {
    const checks: CheckResult[] = [];
    
    // Check Node.js version
    try {
      const { stdout } = await execAsync('node --version');
      const version = stdout.trim();
      const majorVersion = parseInt(version.split('.')[0].substring(1));
      
      checks.push({
        name: 'Node.js Version',
        status: majorVersion >= 16 ? 'pass' : 'fail',
        message: majorVersion >= 16 
          ? `Node.js ${version} (✓ Compatible)`
          : `Node.js ${version} (✗ Requires v16+)`,
        details: { version, required: 'v16+' }
      });
    } catch (error) {
      checks.push({
        name: 'Node.js Installation',
        status: 'fail',
        message: 'Node.js is not installed or not in PATH',
        details: { error: (error as Error).message }
      });
    }

    // Check npm version
    try {
      const { stdout } = await execAsync('npm --version');
      checks.push({
        name: 'npm Installation',
        status: 'pass',
        message: `npm ${stdout.trim()} is available`,
        details: { version: stdout.trim() }
      });
    } catch (error) {
      checks.push({
        name: 'npm Installation',
        status: 'fail',
        message: 'npm is not installed or not in PATH',
        details: { error: (error as Error).message }
      });
    }

    // Check Git installation
    try {
      const { stdout } = await execAsync('git --version');
      checks.push({
        name: 'Git Installation',
        status: 'pass',
        message: `${stdout.trim()} is available`,
        details: { version: stdout.trim() }
      });
    } catch (error) {
      checks.push({
        name: 'Git Installation',
        status: 'warning',
        message: 'Git is not installed (recommended for version control)',
        details: { error: (error as Error).message }
      });
    }

    // Check system resources
    const memoryCheck = await this.checkSystemMemory();
    checks.push(memoryCheck);

    const diskCheck = await this.checkDiskSpace();
    checks.push(diskCheck);

    return checks;
  }

  private async runDockerChecks(): Promise<CheckResult[]> {
    const checks: CheckResult[] = [];
    
    // Check Docker installation
    try {
      const { stdout } = await execAsync('docker --version');
      checks.push({
        name: 'Docker Installation',
        status: 'pass',
        message: `${stdout.trim()} is available`,
        details: { version: stdout.trim() }
      });

      // Check Docker daemon
      try {
        await execAsync('docker info');
        checks.push({
          name: 'Docker Daemon',
          status: 'pass',
          message: 'Docker daemon is running',
          details: {}
        });
      } catch (error) {
        checks.push({
          name: 'Docker Daemon',
          status: 'fail',
          message: 'Docker daemon is not running',
          details: { error: (error as Error).message }
        });
      }

      // Check Docker Compose
      try {
        const { stdout } = await execAsync('docker-compose --version');
        checks.push({
          name: 'Docker Compose',
          status: 'pass',
          message: `${stdout.trim()} is available`,
          details: { version: stdout.trim() }
        });
      } catch (error) {
        // Try newer docker compose syntax
        try {
          const { stdout } = await execAsync('docker compose version');
          checks.push({
            name: 'Docker Compose',
            status: 'pass',
            message: `${stdout.trim()} is available`,
            details: { version: stdout.trim() }
          });
        } catch (error2) {
          checks.push({
            name: 'Docker Compose',
            status: 'fail',
            message: 'Docker Compose is not installed',
            details: { error: (error2 as Error).message }
          });
        }
      }

    } catch (error) {
      checks.push({
        name: 'Docker Installation',
        status: 'fail',
        message: 'Docker is not installed or not in PATH',
        details: { error: (error as Error).message }
      });
    }

    return checks;
  }

  private async runAWSChecks(): Promise<CheckResult[]> {
    const checks: CheckResult[] = [];
    
    // Check AWS CLI
    try {
      const { stdout } = await execAsync('aws --version');
      checks.push({
        name: 'AWS CLI',
        status: 'pass',
        message: `${stdout.trim().split(' ')[0]} is available`,
        details: { version: stdout.trim() }
      });

      // Check AWS credentials
      try {
        await execAsync('aws sts get-caller-identity');
        checks.push({
          name: 'AWS Authentication',
          status: 'pass',
          message: 'AWS credentials are configured and valid',
          details: {}
        });
      } catch (error) {
        checks.push({
          name: 'AWS Authentication',
          status: 'fail',
          message: 'AWS credentials are not configured or invalid',
          details: { 
            error: (error as Error).message,
            suggestion: 'Run "aws configure" to set up credentials'
          }
        });
      }

      // Check AWS region
      try {
        const { stdout } = await execAsync('aws configure get region');
        const region = stdout.trim();
        checks.push({
          name: 'AWS Region',
          status: region ? 'pass' : 'warning',
          message: region 
            ? `Default region is set to ${region}`
            : 'No default region configured',
          details: { region: region || null }
        });
      } catch (error) {
        checks.push({
          name: 'AWS Region',
          status: 'warning',
          message: 'Unable to determine default AWS region',
          details: { error: (error as Error).message }
        });
      }

    } catch (error) {
      checks.push({
        name: 'AWS CLI',
        status: 'fail',
        message: 'AWS CLI is not installed',
        details: { 
          error: (error as Error).message,
          installation: 'Install from https://aws.amazon.com/cli/'
        }
      });
    }

    // Check eksctl
    try {
      const { stdout } = await execAsync('eksctl version');
      checks.push({
        name: 'eksctl',
        status: 'pass',
        message: 'eksctl is available for EKS management',
        details: { version: stdout.trim() }
      });
    } catch (error) {
      checks.push({
        name: 'eksctl',
        status: 'warning',
        message: 'eksctl is not installed (recommended for EKS)',
        details: { 
          error: (error as Error).message,
          installation: 'Install from https://eksctl.io/'
        }
      });
    }

    return checks;
  }

  private async runAzureChecks(): Promise<CheckResult[]> {
    const checks: CheckResult[] = [];
    
    // Check Azure CLI
    try {
      const { stdout } = await execAsync('az --version');
      checks.push({
        name: 'Azure CLI',
        status: 'pass',
        message: 'Azure CLI is available',
        details: { version: stdout.split('\n')[0] }
      });

      // Check Azure authentication
      try {
        await execAsync('az account show');
        checks.push({
          name: 'Azure Authentication',
          status: 'pass',
          message: 'Azure authentication is configured',
          details: {}
        });
      } catch (error) {
        checks.push({
          name: 'Azure Authentication',
          status: 'fail',
          message: 'Not logged in to Azure',
          details: { 
            error: (error as Error).message,
            suggestion: 'Run "az login" to authenticate'
          }
        });
      }

    } catch (error) {
      checks.push({
        name: 'Azure CLI',
        status: 'fail',
        message: 'Azure CLI is not installed',
        details: { 
          error: (error as Error).message,
          installation: 'Install from https://docs.microsoft.com/en-us/cli/azure/'
        }
      });
    }

    return checks;
  }

  private async runGCPChecks(): Promise<CheckResult[]> {
    const checks: CheckResult[] = [];
    
    // Check gcloud CLI
    try {
      const { stdout } = await execAsync('gcloud --version');
      checks.push({
        name: 'Google Cloud CLI',
        status: 'pass',
        message: 'gcloud CLI is available',
        details: { version: stdout.split('\n')[0] }
      });

      // Check GCP authentication
      try {
        await execAsync('gcloud auth list --filter=status:ACTIVE --format="value(account)"');
        checks.push({
          name: 'GCP Authentication',
          status: 'pass',
          message: 'GCP authentication is configured',
          details: {}
        });
      } catch (error) {
        checks.push({
          name: 'GCP Authentication',
          status: 'fail',
          message: 'Not authenticated with GCP',
          details: { 
            error: (error as Error).message,
            suggestion: 'Run "gcloud auth login" to authenticate'
          }
        });
      }

      // Check default project
      try {
        const { stdout } = await execAsync('gcloud config get-value project');
        const project = stdout.trim();
        checks.push({
          name: 'GCP Project',
          status: project && project !== '(unset)' ? 'pass' : 'warning',
          message: project && project !== '(unset)' 
            ? `Default project is set to ${project}`
            : 'No default project configured',
          details: { project: project === '(unset)' ? null : project }
        });
      } catch (error) {
        checks.push({
          name: 'GCP Project',
          status: 'warning',
          message: 'Unable to determine default GCP project',
          details: { error: (error as Error).message }
        });
      }

    } catch (error) {
      checks.push({
        name: 'Google Cloud CLI',
        status: 'fail',
        message: 'gcloud CLI is not installed',
        details: { 
          error: (error as Error).message,
          installation: 'Install from https://cloud.google.com/sdk/'
        }
      });
    }

    return checks;
  }

  private async runKubernetesChecks(): Promise<CheckResult[]> {
    const checks: CheckResult[] = [];
    
    // Check kubectl
    try {
      const { stdout } = await execAsync('kubectl version --client');
      checks.push({
        name: 'kubectl',
        status: 'pass',
        message: 'kubectl is available',
        details: { version: stdout.trim() }
      });

      // Check kubectl context
      try {
        const { stdout } = await execAsync('kubectl config current-context');
        const context = stdout.trim();
        checks.push({
          name: 'Kubernetes Context',
          status: 'pass',
          message: `Current context: ${context}`,
          details: { context }
        });
      } catch (error) {
        checks.push({
          name: 'Kubernetes Context',
          status: 'warning',
          message: 'No active Kubernetes context',
          details: { error: (error as Error).message }
        });
      }

      // Check cluster connectivity
      try {
        await execAsync('kubectl cluster-info --request-timeout=5s');
        checks.push({
          name: 'Kubernetes Cluster',
          status: 'pass',
          message: 'Connected to Kubernetes cluster',
          details: {}
        });
      } catch (error) {
        checks.push({
          name: 'Kubernetes Cluster',
          status: 'warning',
          message: 'Cannot connect to Kubernetes cluster',
          details: { error: (error as Error).message }
        });
      }

    } catch (error) {
      checks.push({
        name: 'kubectl',
        status: 'warning',
        message: 'kubectl is not installed (required for Kubernetes deployments)',
        details: { 
          error: (error as Error).message,
          installation: 'Install from https://kubernetes.io/docs/tasks/tools/'
        }
      });
    }

    // Check Helm
    try {
      const { stdout } = await execAsync('helm version --short');
      checks.push({
        name: 'Helm',
        status: 'pass',
        message: `${stdout.trim()} is available`,
        details: { version: stdout.trim() }
      });
    } catch (error) {
      checks.push({
        name: 'Helm',
        status: 'warning',
        message: 'Helm is not installed (recommended for package management)',
        details: { 
          error: (error as Error).message,
          installation: 'Install from https://helm.sh/'
        }
      });
    }

    return checks;
  }

  private async runTerraformChecks(): Promise<CheckResult[]> {
    const checks: CheckResult[] = [];
    
    // Check Terraform
    try {
      const { stdout } = await execAsync('terraform version');
      const version = stdout.split('\n')[0];
      checks.push({
        name: 'Terraform',
        status: 'pass',
        message: `${version} is available`,
        details: { version }
      });
    } catch (error) {
      checks.push({
        name: 'Terraform',
        status: 'fail',
        message: 'Terraform is not installed',
        details: { 
          error: (error as Error).message,
          installation: 'Install from https://www.terraform.io/downloads.html'
        }
      });
    }

    return checks;
  }

  private async checkSystemMemory(): Promise<CheckResult> {
    try {
      const os = await import('os');
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const totalGB = Math.round(totalMem / (1024 * 1024 * 1024));
      const freeGB = Math.round(freeMem / (1024 * 1024 * 1024));
      
      return {
        name: 'System Memory',
        status: totalGB >= 4 ? 'pass' : 'warning',
        message: `${totalGB}GB total, ${freeGB}GB available`,
        details: { 
          totalGB, 
          freeGB,
          recommendation: totalGB < 4 ? 'At least 4GB RAM recommended' : 'Sufficient memory'
        }
      };
    } catch (error) {
      return {
        name: 'System Memory',
        status: 'warning',
        message: 'Unable to check system memory',
        details: { error: (error as Error).message }
      };
    }
  }

  private async checkDiskSpace(): Promise<CheckResult> {
    try {
      // This is a simplified check - in production, you might want to check specific directories
      const { stdout } = await execAsync(process.platform === 'win32' ? 'dir' : 'df -h .');
      
      return {
        name: 'Disk Space',
        status: 'pass',
        message: 'Disk space check completed',
        details: { 
          output: stdout.trim(),
          recommendation: 'Ensure at least 10GB free space for deployments'
        }
      };
    } catch (error) {
      return {
        name: 'Disk Space',
        status: 'warning',
        message: 'Unable to check disk space',
        details: { error: (error as Error).message }
      };
    }
  }

  private categorizeResults(checks: CheckResult[]): PreflightResults {
    const errors = checks.filter(c => c.status === 'fail');
    const warnings = checks.filter(c => c.status === 'warning');
    const passed = errors.length === 0;

    return {
      passed,
      checks,
      warnings,
      errors
    };
  }

  async generateReport(results: PreflightResults): Promise<string> {
    const lines: string[] = [];
    
    lines.push('# DevOps Preflight Check Report');
    lines.push('');
    lines.push(`**Overall Status: ${results.passed ? '✅ PASSED' : '❌ FAILED'}**`);
    lines.push('');
    
    if (results.errors.length > 0) {
      lines.push('## ❌ Critical Issues');
      results.errors.forEach(check => {
        lines.push(`- **${check.name}**: ${check.message}`);
        if (check.details?.suggestion) {
          lines.push(`  - *Suggestion: ${check.details.suggestion}*`);
        }
        if (check.details?.installation) {
          lines.push(`  - *Installation: ${check.details.installation}*`);
        }
      });
      lines.push('');
    }
    
    if (results.warnings.length > 0) {
      lines.push('## ⚠️ Warnings');
      results.warnings.forEach(check => {
        lines.push(`- **${check.name}**: ${check.message}`);
        if (check.details?.suggestion) {
          lines.push(`  - *Suggestion: ${check.details.suggestion}*`);
        }
        if (check.details?.installation) {
          lines.push(`  - *Installation: ${check.details.installation}*`);
        }
      });
      lines.push('');
    }
    
    const passedChecks = results.checks.filter(c => c.status === 'pass');
    if (passedChecks.length > 0) {
      lines.push('## ✅ Passed Checks');
      passedChecks.forEach(check => {
        lines.push(`- **${check.name}**: ${check.message}`);
      });
      lines.push('');
    }
    
    lines.push('---');
    lines.push(`Report generated at: ${new Date().toISOString()}`);
    
    return lines.join('\n');
  }

  async runQuickCheck(cloudProvider?: string): Promise<{ canProceed: boolean; message: string }> {
    // Run essential checks only
    const essentialChecks: CheckResult[] = [];
    
    // Check Docker (essential for containerization)
    try {
      await execAsync('docker --version');
      await execAsync('docker info');
      essentialChecks.push({
        name: 'Docker',
        status: 'pass',
        message: 'Docker is available and running'
      });
    } catch (error) {
      essentialChecks.push({
        name: 'Docker',
        status: 'fail',
        message: 'Docker is not available or not running'
      });
    }

    // Check cloud provider CLI if specified
    if (cloudProvider) {
      let cliCheck: CheckResult;
      
      switch (cloudProvider.toLowerCase()) {
        case 'aws':
          try {
            await execAsync('aws sts get-caller-identity');
            cliCheck = {
              name: 'AWS CLI',
              status: 'pass',
              message: 'AWS CLI is authenticated'
            };
          } catch (error) {
            cliCheck = {
              name: 'AWS CLI',
              status: 'fail',
              message: 'AWS CLI is not authenticated'
            };
          }
          break;
        
        case 'azure':
          try {
            await execAsync('az account show');
            cliCheck = {
              name: 'Azure CLI',
              status: 'pass',
              message: 'Azure CLI is authenticated'
            };
          } catch (error) {
            cliCheck = {
              name: 'Azure CLI',
              status: 'fail',
              message: 'Azure CLI is not authenticated'
            };
          }
          break;
        
        case 'gcp':
          try {
            await execAsync('gcloud auth list --filter=status:ACTIVE --format="value(account)"');
            cliCheck = {
              name: 'GCP CLI',
              status: 'pass',
              message: 'GCP CLI is authenticated'
            };
          } catch (error) {
            cliCheck = {
              name: 'GCP CLI',
              status: 'fail',
              message: 'GCP CLI is not authenticated'
            };
          }
          break;
        
        default:
          cliCheck = {
            name: 'Cloud CLI',
            status: 'warning',
            message: 'Unknown cloud provider'
          };
      }
      
      essentialChecks.push(cliCheck);
    }

    const failures = essentialChecks.filter(c => c.status === 'fail');
    const canProceed = failures.length === 0;
    
    if (canProceed) {
      return {
        canProceed: true,
        message: 'Essential checks passed. Ready to proceed with deployment.'
      };
    } else {
      const failureMessages = failures.map(f => f.message).join(', ');
      return {
        canProceed: false,
        message: `Cannot proceed due to: ${failureMessages}`
      };
    }
  }
}