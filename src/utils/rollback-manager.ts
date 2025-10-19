import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DeploymentHistory } from './deployment-history.js';

const execAsync = promisify(exec);

interface RollbackOptions {
  force?: boolean;
  skipChecks?: boolean;
  timeout?: number;
  backupCurrent?: boolean;
  dryRun?: boolean;
}

interface RollbackResult {
  success: boolean;
  rollbackId: string;
  previousDeploymentId: string;
  targetDeploymentId: string;
  duration: number;
  steps: RollbackStep[];
  error?: string;
  warnings?: string[];
}

interface RollbackStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  duration?: number;
  error?: string;
  details?: any;
}

interface RollbackPlan {
  targetDeployment: any;
  currentDeployment: any;
  steps: RollbackStep[];
  estimatedDuration: number;
  risks: string[];
  prerequisites: string[];
}

export class RollbackManager {
  private deploymentHistory: DeploymentHistory;
  private defaultTimeout: number = 300000; // 5 minutes

  constructor() {
    this.deploymentHistory = new DeploymentHistory();
  }

  async rollback(
    targetDeploymentId: string, 
    environment: string, 
    options: RollbackOptions = {}
  ): Promise<RollbackResult> {
    const startTime = Date.now();
    const rollbackId = this.generateRollbackId();
    
    try {
      // Get deployment information
      const targetDeployment = await this.deploymentHistory.getDeployment(targetDeploymentId);
      if (!targetDeployment) {
        throw new Error(`Target deployment ${targetDeploymentId} not found`);
      }

      if (!targetDeployment.success) {
        throw new Error(`Cannot rollback to failed deployment ${targetDeploymentId}`);
      }

      const currentDeployment = await this.deploymentHistory.getLatestDeployment(
        targetDeployment.projectPath, 
        environment
      );

      if (!currentDeployment) {
        throw new Error(`No current deployment found for environment ${environment}`);
      }

      // Create rollback plan
      const plan = await this.createRollbackPlan(targetDeployment, currentDeployment, environment);
      
      // Run safety checks unless skipped
      if (!options.skipChecks) {
        await this.runSafetyChecks(plan, options);
      }

      // Execute rollback
      const result = await this.executeRollback(plan, rollbackId, options);
      
      // Record rollback in history
      await this.recordRollback(rollbackId, targetDeploymentId, currentDeployment.deploymentId, result);

      return {
        ...result,
        duration: Date.now() - startTime,
        targetDeploymentId,
        previousDeploymentId: currentDeployment.deploymentId
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record failed rollback
      await this.recordRollback(rollbackId, targetDeploymentId, 'unknown', {
        success: false,
        rollbackId,
        previousDeploymentId: 'unknown',
        targetDeploymentId,
        duration,
        steps: [],
        error: (error as Error).message
      });

      throw error;
    }
  }

  async createRollbackPlan(
    targetDeployment: any, 
    currentDeployment: any, 
    environment: string
  ): Promise<RollbackPlan> {
    const steps: RollbackStep[] = [];
    const risks: string[] = [];
    const prerequisites: string[] = [];
    
    // Backup current deployment step
    steps.push({
      name: 'backup-current',
      status: 'pending',
      details: { description: 'Backup current deployment state' }
    });

    // Database rollback (if needed)
    if (this.needsDatabaseRollback(targetDeployment, currentDeployment)) {
      steps.push({
        name: 'database-rollback',
        status: 'pending',
        details: { description: 'Rollback database schema and data' }
      });
      risks.push('Database rollback may result in data loss');
      prerequisites.push('Database backup must be available');
    }

    // Configuration rollback
    steps.push({
      name: 'config-rollback',
      status: 'pending',
      details: { description: 'Restore previous configuration' }
    });

    // Infrastructure rollback
    if (this.needsInfrastructureRollback(targetDeployment, currentDeployment)) {
      steps.push({
        name: 'infrastructure-rollback',
        status: 'pending',
        details: { description: 'Rollback infrastructure changes' }
      });
      risks.push('Infrastructure changes may affect other services');
      prerequisites.push('Terraform state must be available');
    }

    // Kubernetes rollback
    steps.push({
      name: 'kubernetes-rollback',
      status: 'pending',
      details: { description: 'Rollback Kubernetes deployments' }
    });

    // Traffic management
    if (currentDeployment.cloud === 'aws' || currentDeployment.cloud === 'gcp' || currentDeployment.cloud === 'azure') {
      steps.push({
        name: 'traffic-management',
        status: 'pending',
        details: { description: 'Manage traffic routing during rollback' }
      });
    }

    // Health checks
    steps.push({
      name: 'health-checks',
      status: 'pending',
      details: { description: 'Verify application health after rollback' }
    });

    // Cleanup
    steps.push({
      name: 'cleanup',
      status: 'pending',
      details: { description: 'Cleanup rollback artifacts' }
    });

    // Estimate duration
    const estimatedDuration = this.estimateRollbackDuration(steps, targetDeployment, currentDeployment);

    // Add version-specific risks
    if (this.isVersionDowngrade(targetDeployment, currentDeployment)) {
      risks.push('Rolling back to older version may cause compatibility issues');
    }

    if (this.hasBreakingChanges(targetDeployment, currentDeployment)) {
      risks.push('Breaking changes detected between versions');
    }

    return {
      targetDeployment,
      currentDeployment,
      steps,
      estimatedDuration,
      risks,
      prerequisites
    };
  }

  async executeRollback(
    plan: RollbackPlan, 
    rollbackId: string, 
    options: RollbackOptions
  ): Promise<RollbackResult> {
    const result: RollbackResult = {
      success: false,
      rollbackId,
      previousDeploymentId: plan.currentDeployment.deploymentId,
      targetDeploymentId: plan.targetDeployment.deploymentId,
      duration: 0,
      steps: [...plan.steps],
      warnings: []
    };

    if (options.dryRun) {
      result.success = true;
      result.steps = result.steps.map(step => ({ ...step, status: 'skipped' as const }));
      return result;
    }

    try {
      for (const step of result.steps) {
        const stepIndex = result.steps.findIndex(s => s.name === step.name);
        const stepResult = await this.executeRollbackStep(step, plan, options);
        
        result.steps[stepIndex] = stepResult;
        
        if (stepResult.status === 'failed' && !options.force) {
          throw new Error(`Rollback step '${step.name}' failed: ${stepResult.error}`);
        }
        
        if (stepResult.status === 'failed' && options.force) {
          result.warnings?.push(`Step '${step.name}' failed but continuing due to force option`);
        }
      }

      result.success = true;
      return result;

    } catch (error) {
      result.error = (error as Error).message;
      result.success = false;
      
      // Attempt recovery if possible
      if (!options.force) {
        await this.attemptRecovery(result, plan, options);
      }
      
      return result;
    }
  }

  private async executeRollbackStep(
    step: RollbackStep, 
    plan: RollbackPlan, 
    options: RollbackOptions
  ): Promise<RollbackStep> {
    const startTime = Date.now();
    const updatedStep: RollbackStep = { ...step, status: 'running' };
    
    try {
      switch (step.name) {
        case 'backup-current':
          await this.backupCurrentState(plan.currentDeployment);
          break;
          
        case 'database-rollback':
          await this.rollbackDatabase(plan.targetDeployment, plan.currentDeployment);
          break;
          
        case 'config-rollback':
          await this.rollbackConfiguration(plan.targetDeployment, plan.currentDeployment);
          break;
          
        case 'infrastructure-rollback':
          await this.rollbackInfrastructure(plan.targetDeployment, plan.currentDeployment);
          break;
          
        case 'kubernetes-rollback':
          await this.rollbackKubernetes(plan.targetDeployment, plan.currentDeployment);
          break;
          
        case 'traffic-management':
          await this.manageTraffic(plan.targetDeployment, plan.currentDeployment);
          break;
          
        case 'health-checks':
          await this.performHealthChecks(plan.targetDeployment, plan.currentDeployment);
          break;
          
        case 'cleanup':
          await this.cleanupRollback(plan.targetDeployment, plan.currentDeployment);
          break;
          
        default:
          throw new Error(`Unknown rollback step: ${step.name}`);
      }
      
      updatedStep.status = 'completed';
      updatedStep.duration = Date.now() - startTime;
      
    } catch (error) {
      updatedStep.status = 'failed';
      updatedStep.error = (error as Error).message;
      updatedStep.duration = Date.now() - startTime;
    }
    
    return updatedStep;
  }

  private async backupCurrentState(currentDeployment: any): Promise<void> {
    const backupPath = path.join(currentDeployment.projectPath, '.rollback-backup');
    await fs.mkdir(backupPath, { recursive: true });
    
    // Backup Kubernetes state
    try {
      const { stdout } = await execAsync(
        `kubectl get all -n ${currentDeployment.environment} -o yaml`,
        { timeout: this.defaultTimeout }
      );
      await fs.writeFile(path.join(backupPath, 'kubernetes-state.yaml'), stdout);
    } catch (error) {
      // Non-critical backup failure
    }
    
    // Backup configuration
    const configFiles = ['config.yaml', 'values.yaml', '.env'];
    for (const configFile of configFiles) {
      const configPath = path.join(currentDeployment.projectPath, configFile);
      try {
        const exists = await fs.access(configPath).then(() => true, () => false);
        if (exists) {
          const content = await fs.readFile(configPath);
          await fs.writeFile(path.join(backupPath, configFile), content);
        }
      } catch (error) {
        // Non-critical backup failure
      }
    }
  }

  private async rollbackDatabase(targetDeployment: any, currentDeployment: any): Promise<void> {
    const dbType = targetDeployment.configuration?.database || 'postgres';
    
    switch (dbType) {
      case 'postgres':
        await this.rollbackPostgres(targetDeployment, currentDeployment);
        break;
      case 'mongodb':
        await this.rollbackMongoDB(targetDeployment, currentDeployment);
        break;
      case 'mysql':
        await this.rollbackMySQL(targetDeployment, currentDeployment);
        break;
      default:
        // Skip database rollback if type not supported
        break;
    }
  }

  private async rollbackPostgres(targetDeployment: any, currentDeployment: any): Promise<void> {
    // This is a simplified example - in production, you'd want more sophisticated logic
    const backupFile = `backup-${targetDeployment.deploymentId}.sql`;
    const backupPath = path.join(targetDeployment.projectPath, '.db-backups', backupFile);
    
    try {
      await fs.access(backupPath);
      // Restore from backup
      await execAsync(
        `kubectl exec -n ${currentDeployment.environment} deployment/postgres -- psql -U postgres -d app < ${backupPath}`,
        { timeout: this.defaultTimeout }
      );
    } catch (error) {
      throw new Error(`Database rollback failed: ${(error as Error).message}`);
    }
  }

  private async rollbackMongoDB(targetDeployment: any, currentDeployment: any): Promise<void> {
    const backupPath = path.join(targetDeployment.projectPath, '.db-backups', `backup-${targetDeployment.deploymentId}`);
    
    try {
      await fs.access(backupPath);
      await execAsync(
        `kubectl exec -n ${currentDeployment.environment} deployment/mongodb -- mongorestore --drop ${backupPath}`,
        { timeout: this.defaultTimeout }
      );
    } catch (error) {
      throw new Error(`MongoDB rollback failed: ${(error as Error).message}`);
    }
  }

  private async rollbackMySQL(targetDeployment: any, currentDeployment: any): Promise<void> {
    const backupFile = `backup-${targetDeployment.deploymentId}.sql`;
    const backupPath = path.join(targetDeployment.projectPath, '.db-backups', backupFile);
    
    try {
      await fs.access(backupPath);
      await execAsync(
        `kubectl exec -n ${currentDeployment.environment} deployment/mysql -- mysql -u root -p app < ${backupPath}`,
        { timeout: this.defaultTimeout }
      );
    } catch (error) {
      throw new Error(`MySQL rollback failed: ${(error as Error).message}`);
    }
  }

  private async rollbackConfiguration(targetDeployment: any, currentDeployment: any): Promise<void> {
    const targetConfigPath = path.join(targetDeployment.projectPath, '.deployment-configs', targetDeployment.deploymentId);
    
    try {
      // Check if target configuration exists
      await fs.access(targetConfigPath);
      
      // Apply configuration using kubectl
      await execAsync(
        `kubectl apply -f ${targetConfigPath} -n ${currentDeployment.environment}`,
        { timeout: this.defaultTimeout }
      );
      
    } catch (error) {
      throw new Error(`Configuration rollback failed: ${(error as Error).message}`);
    }
  }

  private async rollbackInfrastructure(targetDeployment: any, currentDeployment: any): Promise<void> {
    const terraformDir = path.join(targetDeployment.projectPath, '.terraform-states', targetDeployment.deploymentId);
    
    try {
      // Check if Terraform state exists
      await fs.access(path.join(terraformDir, 'terraform.tfstate'));
      
      // Apply previous Terraform state
      await execAsync(
        'terraform apply -auto-approve',
        { cwd: terraformDir, timeout: this.defaultTimeout }
      );
      
    } catch (error) {
      throw new Error(`Infrastructure rollback failed: ${(error as Error).message}`);
    }
  }

  private async rollbackKubernetes(targetDeployment: any, currentDeployment: any): Promise<void> {
    try {
      // Rollback using kubectl rollout undo
      const deployments = await this.getDeployments(currentDeployment.environment);
      
      for (const deployment of deployments) {
        await execAsync(
          `kubectl rollout undo deployment/${deployment} -n ${currentDeployment.environment}`,
          { timeout: this.defaultTimeout }
        );
        
        // Wait for rollout to complete
        await execAsync(
          `kubectl rollout status deployment/${deployment} -n ${currentDeployment.environment} --timeout=300s`,
          { timeout: this.defaultTimeout }
        );
      }
      
    } catch (error) {
      throw new Error(`Kubernetes rollback failed: ${(error as Error).message}`);
    }
  }

  private async manageTraffic(targetDeployment: any, currentDeployment: any): Promise<void> {
    // Implement traffic management based on cloud provider
    switch (currentDeployment.cloud) {
      case 'aws':
        await this.manageAWSTraffic(targetDeployment, currentDeployment);
        break;
      case 'azure':
        await this.manageAzureTraffic(targetDeployment, currentDeployment);
        break;
      case 'gcp':
        await this.manageGCPTraffic(targetDeployment, currentDeployment);
        break;
    }
  }

  private async manageAWSTraffic(targetDeployment: any, currentDeployment: any): Promise<void> {
    // AWS ALB/ELB traffic management
    // This is simplified - in production, you'd integrate with AWS APIs
    await new Promise(resolve => setTimeout(resolve, 5000)); // Simulate traffic switching
  }

  private async manageAzureTraffic(targetDeployment: any, currentDeployment: any): Promise<void> {
    // Azure traffic management
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  private async manageGCPTraffic(targetDeployment: any, currentDeployment: any): Promise<void> {
    // GCP load balancer traffic management
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  private async performHealthChecks(targetDeployment: any, currentDeployment: any): Promise<void> {
    const healthEndpoints = this.getHealthEndpoints(targetDeployment);
    
    for (const endpoint of healthEndpoints) {
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes with 10 second intervals
      
      while (attempts < maxAttempts) {
        try {
          const { stdout } = await execAsync(
            `curl -f -s ${endpoint}/health || curl -f -s ${endpoint} || echo "unhealthy"`,
            { timeout: 10000 }
          );
          
          if (!stdout.includes('unhealthy')) {
            break; // Health check passed
          }
        } catch (error) {
          // Health check failed, continue trying
        }
        
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      
      if (attempts >= maxAttempts) {
        throw new Error(`Health check failed for endpoint ${endpoint}`);
      }
    }
  }

  private async cleanupRollback(targetDeployment: any, currentDeployment: any): Promise<void> {
    // Cleanup temporary files and resources created during rollback
    const cleanupPaths = [
      path.join(currentDeployment.projectPath, '.rollback-backup'),
      path.join(currentDeployment.projectPath, '.rollback-temp')
    ];
    
    for (const cleanupPath of cleanupPaths) {
      try {
        await fs.rm(cleanupPath, { recursive: true, force: true });
      } catch (error) {
        // Non-critical cleanup failure
      }
    }
  }

  private async runSafetyChecks(plan: RollbackPlan, options: RollbackOptions): Promise<void> {
    // Check if target deployment is too old
    const daysSinceTarget = (Date.now() - new Date(plan.targetDeployment.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceTarget > 30) {
      throw new Error('Cannot rollback to deployment older than 30 days without force option');
    }
    
    // Check for breaking changes
    if (this.hasBreakingChanges(plan.targetDeployment, plan.currentDeployment)) {
      throw new Error('Breaking changes detected. Use force option to proceed with rollback.');
    }
    
    // Check cluster health
    try {
      await execAsync('kubectl cluster-info --request-timeout=10s');
    } catch (error) {
      throw new Error('Kubernetes cluster is not healthy. Cannot proceed with rollback.');
    }
  }

  private async attemptRecovery(result: RollbackResult, plan: RollbackPlan, options: RollbackOptions): Promise<void> {
    // Attempt to restore from backup if rollback failed
    const backupPath = path.join(plan.currentDeployment.projectPath, '.rollback-backup');
    
    try {
      await fs.access(backupPath);
      
      // Restore Kubernetes state
      const kubernetesStatePath = path.join(backupPath, 'kubernetes-state.yaml');
      await fs.access(kubernetesStatePath);
      
      await execAsync(
        `kubectl apply -f ${kubernetesStatePath}`,
        { timeout: this.defaultTimeout }
      );
      
      result.warnings?.push('Attempted recovery by restoring from backup');
      
    } catch (error) {
      result.warnings?.push('Recovery attempt failed - manual intervention may be required');
    }
  }

  private async recordRollback(
    rollbackId: string,
    targetDeploymentId: string,
    previousDeploymentId: string,
    result: RollbackResult
  ): Promise<void> {
    // Record rollback in deployment history
    await this.deploymentHistory.markAsRollback(rollbackId, targetDeploymentId);
    
    // Save detailed rollback information
    const rollbackRecord = {
      rollbackId,
      targetDeploymentId,
      previousDeploymentId,
      timestamp: new Date(),
      ...result
    };
    
    // This could be extended to save to a separate rollback history file
    // For now, we'll just mark it in the deployment history
  }

  // Helper methods
  private needsDatabaseRollback(targetDeployment: any, currentDeployment: any): boolean {
    return targetDeployment.configuration?.database && 
           currentDeployment.configuration?.database &&
           targetDeployment.version !== currentDeployment.version;
  }

  private needsInfrastructureRollback(targetDeployment: any, currentDeployment: any): boolean {
    return JSON.stringify(targetDeployment.configuration?.infrastructure) !== 
           JSON.stringify(currentDeployment.configuration?.infrastructure);
  }

  private isVersionDowngrade(targetDeployment: any, currentDeployment: any): boolean {
    if (!targetDeployment.version || !currentDeployment.version) return false;
    
    // Simple version comparison - in production, use a proper semver library
    return targetDeployment.version < currentDeployment.version;
  }

  private hasBreakingChanges(targetDeployment: any, currentDeployment: any): boolean {
    // This is a simplified check - in production, you'd analyze actual changes
    if (!targetDeployment.version || !currentDeployment.version) return false;
    
    const targetMajor = parseInt(targetDeployment.version.split('.')[0]);
    const currentMajor = parseInt(currentDeployment.version.split('.')[0]);
    
    return targetMajor < currentMajor;
  }

  private estimateRollbackDuration(steps: RollbackStep[], targetDeployment: any, currentDeployment: any): number {
    // Estimate based on step count and deployment complexity
    const baseTime = 60000; // 1 minute base
    const stepTime = 30000; // 30 seconds per step
    const complexityMultiplier = this.getComplexityMultiplier(targetDeployment, currentDeployment);
    
    return baseTime + (steps.length * stepTime * complexityMultiplier);
  }

  private getComplexityMultiplier(targetDeployment: any, currentDeployment: any): number {
    let multiplier = 1;
    
    if (this.needsDatabaseRollback(targetDeployment, currentDeployment)) {
      multiplier *= 2;
    }
    
    if (this.needsInfrastructureRollback(targetDeployment, currentDeployment)) {
      multiplier *= 1.5;
    }
    
    if (this.hasBreakingChanges(targetDeployment, currentDeployment)) {
      multiplier *= 3;
    }
    
    return multiplier;
  }

  private async getDeployments(namespace: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        `kubectl get deployments -n ${namespace} -o jsonpath='{.items[*].metadata.name}'`
      );
      return stdout.trim().split(' ').filter(name => name.length > 0);
    } catch (error) {
      return [];
    }
  }

  private getHealthEndpoints(deployment: any): string[] {
    // Extract health check endpoints from deployment configuration
    // This is simplified - in production, you'd parse the actual service configuration
    const baseUrl = `http://app.${deployment.environment}.svc.cluster.local:3000`;
    return [baseUrl];
  }

  private generateRollbackId(): string {
    return `rollback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public utility methods
  async getRollbackHistory(projectPath?: string, environment?: string): Promise<any[]> {
    const filter: any = {};
    if (projectPath) filter.projectPath = projectPath;
    if (environment) filter.environment = environment;
    
    const deployments = await this.deploymentHistory.getHistory(filter);
    return deployments.filter(d => d.status === 'rollback');
  }

  async canRollback(deploymentId: string, environment: string): Promise<{ canRollback: boolean; reason?: string }> {
    const deployment = await this.deploymentHistory.getDeployment(deploymentId);
    
    if (!deployment) {
      return { canRollback: false, reason: 'Deployment not found' };
    }
    
    if (!deployment.success) {
      return { canRollback: false, reason: 'Cannot rollback to failed deployment' };
    }
    
    const daysSince = (Date.now() - new Date(deployment.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) {
      return { canRollback: false, reason: 'Deployment is older than 30 days' };
    }
    
    return { canRollback: true };
  }

  async previewRollback(targetDeploymentId: string, environment: string): Promise<RollbackPlan> {
    const targetDeployment = await this.deploymentHistory.getDeployment(targetDeploymentId);
    if (!targetDeployment) {
      throw new Error(`Target deployment ${targetDeploymentId} not found`);
    }

    const currentDeployment = await this.deploymentHistory.getLatestDeployment(
      targetDeployment.projectPath, 
      environment
    );

    if (!currentDeployment) {
      throw new Error(`No current deployment found for environment ${environment}`);
    }

    return this.createRollbackPlan(targetDeployment, currentDeployment, environment);
  }
}