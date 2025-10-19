import { promises as fs } from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import * as crypto from 'crypto';

interface DeploymentRecord {
  deploymentId: string;
  projectPath: string;
  environment: string;
  cloud: string;
  region: string;
  timestamp: Date;
  success: boolean;
  duration?: number;
  version?: string;
  commitHash?: string;
  branch?: string;
  deployedBy?: string;
  error?: string;
  rollbackTo?: string;
  artifacts?: {
    dockerImage?: string;
    helmChart?: string;
    terraformState?: string;
    kubernetesManifests?: string[];
  };
  metrics?: {
    buildTime?: number;
    deployTime?: number;
    resourcesCreated?: number;
    servicesDeployed?: number;
  };
  configuration?: {
    replicas?: number;
    cpuLimit?: string;
    memoryLimit?: string;
    storageSize?: string;
  };
  status?: 'pending' | 'running' | 'success' | 'failed' | 'rollback';
}

interface DeploymentFilter {
  projectPath?: string;
  environment?: string;
  cloud?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

interface DeploymentStats {
  totalDeployments: number;
  successRate: number;
  failureRate: number;
  averageDuration: number;
  deploymentsByEnvironment: Record<string, number>;
  deploymentsByCloud: Record<string, number>;
  recentActivity: DeploymentRecord[];
}

export class DeploymentHistory {
  private historyFile: string;
  private maxRecords: number;

  constructor(options?: { historyFile?: string; maxRecords?: number }) {
    const configDir = path.join(homedir(), '.devops-cli');
    this.historyFile = options?.historyFile || path.join(configDir, 'deployment-history.json');
    this.maxRecords = options?.maxRecords || 1000;
    this.ensureHistoryFile();
  }

  private async ensureHistoryFile(): Promise<void> {
    try {
      await fs.access(this.historyFile);
    } catch (error) {
      // Create directory if it doesn't exist
      await fs.mkdir(path.dirname(this.historyFile), { recursive: true });
      // Create empty history file
      await fs.writeFile(this.historyFile, JSON.stringify([]));
    }
  }

  async recordDeployment(deployment: Omit<DeploymentRecord, 'deploymentId'> & { deploymentId?: string }): Promise<string> {
    const deploymentId = deployment.deploymentId || this.generateDeploymentId();
    
    const record: DeploymentRecord = {
      ...deployment,
      deploymentId,
      timestamp: new Date(deployment.timestamp),
      deployedBy: deployment.deployedBy || process.env.USER || process.env.USERNAME || 'unknown'
    };

    // Add Git information if available
    try {
      const gitInfo = await this.getGitInfo(deployment.projectPath);
      record.commitHash = gitInfo.commitHash;
      record.branch = gitInfo.branch;
      record.version = gitInfo.version;
    } catch (error) {
      // Git info is optional
    }

    const history = await this.loadHistory();
    history.unshift(record);

    // Trim history to max records
    if (history.length > this.maxRecords) {
      history.splice(this.maxRecords);
    }

    await this.saveHistory(history);
    return deploymentId;
  }

  async updateDeployment(deploymentId: string, updates: Partial<DeploymentRecord>): Promise<void> {
    const history = await this.loadHistory();
    const index = history.findIndex(d => d.deploymentId === deploymentId);
    
    if (index === -1) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    history[index] = { ...history[index], ...updates };
    await this.saveHistory(history);
  }

  async getDeployment(deploymentId: string): Promise<DeploymentRecord | null> {
    const history = await this.loadHistory();
    return history.find(d => d.deploymentId === deploymentId) || null;
  }

  async getHistory(filter: DeploymentFilter = {}): Promise<DeploymentRecord[]> {
    const history = await this.loadHistory();
    let filtered = history;

    // Apply filters
    if (filter.projectPath) {
      filtered = filtered.filter(d => d.projectPath === filter.projectPath);
    }

    if (filter.environment) {
      filtered = filtered.filter(d => d.environment === filter.environment);
    }

    if (filter.cloud) {
      filtered = filtered.filter(d => d.cloud === filter.cloud);
    }

    if (filter.success !== undefined) {
      filtered = filtered.filter(d => d.success === filter.success);
    }

    if (filter.startDate) {
      filtered = filtered.filter(d => new Date(d.timestamp) >= filter.startDate!);
    }

    if (filter.endDate) {
      filtered = filtered.filter(d => new Date(d.timestamp) <= filter.endDate!);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || filtered.length;
    
    return filtered.slice(offset, offset + limit);
  }

  async getLatestDeployment(projectPath?: string, environment?: string): Promise<DeploymentRecord | null> {
    const filter: DeploymentFilter = { limit: 1 };
    if (projectPath) filter.projectPath = projectPath;
    if (environment) filter.environment = environment;

    const deployments = await this.getHistory(filter);
    return deployments.length > 0 ? deployments[0] : null;
  }

  async getSuccessfulDeployments(projectPath?: string, environment?: string): Promise<DeploymentRecord[]> {
    const filter: DeploymentFilter = { success: true };
    if (projectPath) filter.projectPath = projectPath;
    if (environment) filter.environment = environment;

    return this.getHistory(filter);
  }

  async getFailedDeployments(projectPath?: string, environment?: string): Promise<DeploymentRecord[]> {
    const filter: DeploymentFilter = { success: false };
    if (projectPath) filter.projectPath = projectPath;
    if (environment) filter.environment = environment;

    return this.getHistory(filter);
  }

  async getDeploymentStats(filter: DeploymentFilter = {}): Promise<DeploymentStats> {
    const history = await this.getHistory(filter);
    
    if (history.length === 0) {
      return {
        totalDeployments: 0,
        successRate: 0,
        failureRate: 0,
        averageDuration: 0,
        deploymentsByEnvironment: {},
        deploymentsByCloud: {},
        recentActivity: []
      };
    }

    const successful = history.filter(d => d.success);
    const failed = history.filter(d => !d.success);
    const withDuration = history.filter(d => d.duration);
    
    const totalDeployments = history.length;
    const successRate = (successful.length / totalDeployments) * 100;
    const failureRate = (failed.length / totalDeployments) * 100;
    const averageDuration = withDuration.length > 0 
      ? withDuration.reduce((sum, d) => sum + (d.duration || 0), 0) / withDuration.length
      : 0;

    // Group by environment
    const deploymentsByEnvironment = history.reduce((acc, d) => {
      acc[d.environment] = (acc[d.environment] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Group by cloud
    const deploymentsByCloud = history.reduce((acc, d) => {
      acc[d.cloud] = (acc[d.cloud] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Recent activity (last 10)
    const recentActivity = history.slice(0, 10);

    return {
      totalDeployments,
      successRate: Math.round(successRate * 100) / 100,
      failureRate: Math.round(failureRate * 100) / 100,
      averageDuration: Math.round(averageDuration),
      deploymentsByEnvironment,
      deploymentsByCloud,
      recentActivity
    };
  }

  async deleteDeployment(deploymentId: string): Promise<void> {
    const history = await this.loadHistory();
    const filtered = history.filter(d => d.deploymentId !== deploymentId);
    
    if (filtered.length === history.length) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    await this.saveHistory(filtered);
  }

  async clearHistory(filter?: DeploymentFilter): Promise<void> {
    if (!filter) {
      // Clear all history
      await this.saveHistory([]);
      return;
    }

    // Clear filtered history
    const history = await this.loadHistory();
    const toDelete = await this.getHistory(filter);
    const toDeleteIds = new Set(toDelete.map(d => d.deploymentId));
    const remaining = history.filter(d => !toDeleteIds.has(d.deploymentId));
    
    await this.saveHistory(remaining);
  }

  async exportHistory(outputPath: string, format: 'json' | 'csv' = 'json'): Promise<void> {
    const history = await this.loadHistory();
    
    if (format === 'json') {
      await fs.writeFile(outputPath, JSON.stringify(history, null, 2));
    } else if (format === 'csv') {
      const csv = await this.convertToCSV(history);
      await fs.writeFile(outputPath, csv);
    }
  }

  async importHistory(inputPath: string): Promise<void> {
    const data = await fs.readFile(inputPath, 'utf8');
    const imported: DeploymentRecord[] = JSON.parse(data);
    
    // Validate imported data
    for (const record of imported) {
      if (!record.deploymentId || !record.projectPath || !record.timestamp) {
        throw new Error('Invalid deployment record format');
      }
    }

    const existing = await this.loadHistory();
    const existingIds = new Set(existing.map(d => d.deploymentId));
    
    // Only add new records
    const newRecords = imported.filter(r => !existingIds.has(r.deploymentId));
    
    if (newRecords.length > 0) {
      const merged = [...newRecords, ...existing];
      // Sort by timestamp
      merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // Trim to max records
      if (merged.length > this.maxRecords) {
        merged.splice(this.maxRecords);
      }
      
      await this.saveHistory(merged);
    }
  }

  async getDeploymentDiff(deploymentId1: string, deploymentId2: string): Promise<any> {
    const deployment1 = await this.getDeployment(deploymentId1);
    const deployment2 = await this.getDeployment(deploymentId2);
    
    if (!deployment1 || !deployment2) {
      throw new Error('One or both deployments not found');
    }

    return {
      deploymentId1,
      deploymentId2,
      differences: {
        environment: deployment1.environment !== deployment2.environment,
        cloud: deployment1.cloud !== deployment2.cloud,
        region: deployment1.region !== deployment2.region,
        version: deployment1.version !== deployment2.version,
        commitHash: deployment1.commitHash !== deployment2.commitHash,
        branch: deployment1.branch !== deployment2.branch,
        configuration: JSON.stringify(deployment1.configuration) !== JSON.stringify(deployment2.configuration)
      },
      deployment1: deployment1,
      deployment2: deployment2
    };
  }

  private async loadHistory(): Promise<DeploymentRecord[]> {
    try {
      const data = await fs.readFile(this.historyFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  private async saveHistory(history: DeploymentRecord[]): Promise<void> {
    await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));
  }

  private generateDeploymentId(): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `dep-${timestamp}-${random}`;
  }

  private async getGitInfo(projectPath: string): Promise<{ commitHash?: string; branch?: string; version?: string }> {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      const [commitResult, branchResult] = await Promise.allSettled([
        execAsync('git rev-parse HEAD', { cwd: projectPath }),
        execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectPath })
      ]);

      const result: any = {};
      
      if (commitResult.status === 'fulfilled') {
        result.commitHash = commitResult.value.stdout.trim();
      }
      
      if (branchResult.status === 'fulfilled') {
        result.branch = branchResult.value.stdout.trim();
      }

      // Try to get version from package.json or other version files
      try {
        const packagePath = path.join(projectPath, 'package.json');
        const packageData = await fs.readFile(packagePath, 'utf8');
        const packageJson = JSON.parse(packageData);
        result.version = packageJson.version;
      } catch (error) {
        // Version is optional
      }

      return result;
    } catch (error) {
      return {};
    }
  }

  private async convertToCSV(history: DeploymentRecord[]): Promise<string> {
    const headers = [
      'Deployment ID',
      'Project Path',
      'Environment',
      'Cloud',
      'Region',
      'Timestamp',
      'Success',
      'Duration (ms)',
      'Version',
      'Commit Hash',
      'Branch',
      'Deployed By',
      'Error',
      'Status'
    ];

    const rows = history.map(d => [
      d.deploymentId,
      d.projectPath,
      d.environment,
      d.cloud,
      d.region,
      d.timestamp.toISOString(),
      d.success ? 'Yes' : 'No',
      d.duration || '',
      d.version || '',
      d.commitHash || '',
      d.branch || '',
      d.deployedBy || '',
      d.error || '',
      d.status || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return csvContent;
  }

  // Utility methods for integration with other components
  async startDeployment(deployment: Omit<DeploymentRecord, 'deploymentId' | 'timestamp' | 'success'>): Promise<string> {
    const deploymentId = await this.recordDeployment({
      ...deployment,
      success: false, // Initially false until completed
      status: 'running',
      timestamp: new Date()
    });

    return deploymentId;
  }

  async completeDeployment(deploymentId: string, success: boolean, duration?: number, error?: string): Promise<void> {
    await this.updateDeployment(deploymentId, {
      success,
      duration,
      error,
      status: success ? 'success' : 'failed'
    });
  }

  async addDeploymentArtifacts(deploymentId: string, artifacts: DeploymentRecord['artifacts']): Promise<void> {
    await this.updateDeployment(deploymentId, { artifacts });
  }

  async addDeploymentMetrics(deploymentId: string, metrics: DeploymentRecord['metrics']): Promise<void> {
    await this.updateDeployment(deploymentId, { metrics });
  }

  async markAsRollback(deploymentId: string, rollbackTo: string): Promise<void> {
    await this.updateDeployment(deploymentId, { 
      status: 'rollback',
      rollbackTo 
    });
  }

  // Search functionality
  async searchDeployments(query: string): Promise<DeploymentRecord[]> {
    const history = await this.loadHistory();
    const searchTerm = query.toLowerCase();
    
    return history.filter(d => 
      d.deploymentId.toLowerCase().includes(searchTerm) ||
      d.projectPath.toLowerCase().includes(searchTerm) ||
      d.environment.toLowerCase().includes(searchTerm) ||
      d.cloud.toLowerCase().includes(searchTerm) ||
      (d.version && d.version.toLowerCase().includes(searchTerm)) ||
      (d.branch && d.branch.toLowerCase().includes(searchTerm)) ||
      (d.commitHash && d.commitHash.toLowerCase().includes(searchTerm))
    );
  }

  // Cleanup old deployments
  async cleanup(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const history = await this.loadHistory();
    const toKeep = history.filter(d => new Date(d.timestamp) > cutoffDate);
    const removedCount = history.length - toKeep.length;
    
    if (removedCount > 0) {
      await this.saveHistory(toKeep);
    }
    
    return removedCount;
  }

  // Backup functionality
  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = this.historyFile.replace('.json', `-backup-${timestamp}.json`);
    
    const history = await this.loadHistory();
    await fs.writeFile(backupPath, JSON.stringify(history, null, 2));
    
    return backupPath;
  }
}