import { promises as fs } from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { ProjectAnalyzer } from '../analyzers/project-analyzer.js';

interface BudgetConfig {
  budgetLimit: number;
  currency: string;
  period: 'monthly' | 'weekly' | 'daily';
  alerts: BudgetAlert[];
  autoShutdown?: boolean;
  autoShutdownThreshold?: number; // percentage
  notifications?: {
    email?: string[];
    slack?: {
      webhook: string;
      channel: string;
    };
    webhook?: string;
  };
}

interface BudgetAlert {
  threshold: number; // percentage of budget
  severity: 'info' | 'warning' | 'critical';
  message: string;
  actions?: string[];
}

interface CostEstimate {
  service: string;
  cost: number;
  unit: string;
  usage?: number;
  details?: any;
}

interface CostBreakdown {
  totalCost: number;
  currency: string;
  period: string;
  estimates: CostEstimate[];
  provider: string;
  region: string;
  lastUpdated: Date;
}

interface BudgetStatus {
  budgetLimit: number;
  currentSpend: number;
  estimatedCost: number;
  currency: string;
  budgetUsage: number; // percentage
  withinBudget: boolean;
  projectedMonthlySpend: number;
  alerts: BudgetAlert[];
}

interface CostOptimizationSuggestion {
  type: 'instance_size' | 'storage' | 'network' | 'service';
  description: string;
  potentialSavings: number;
  effort: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
  implementation: string;
}

export class CostBudget {
  private configFile: string;
  private costHistoryFile: string;
  private analyzer: ProjectAnalyzer;

  // Cloud provider cost matrices (simplified for example)
  private readonly AWS_COSTS = {
    't3.micro': { cpu: 2, memory: 1024, cost: 0.0104 }, // per hour
    't3.small': { cpu: 2, memory: 2048, cost: 0.0208 },
    't3.medium': { cpu: 2, memory: 4096, cost: 0.0416 },
    't3.large': { cpu: 2, memory: 8192, cost: 0.0832 },
    't3.xlarge': { cpu: 4, memory: 16384, cost: 0.1664 },
    'rds.t3.micro': { cost: 0.017 }, // per hour
    'rds.t3.small': { cost: 0.034 },
    'ebs.gp2': { cost: 0.10 }, // per GB per month
    'ebs.gp3': { cost: 0.08 },
    'lb.application': { cost: 0.0225 }, // per hour
    'nat.gateway': { cost: 0.045 } // per hour
  };

  private readonly AZURE_COSTS = {
    'Standard_B1s': { cpu: 1, memory: 1024, cost: 0.0104 },
    'Standard_B1ms': { cpu: 1, memory: 2048, cost: 0.0208 },
    'Standard_B2s': { cpu: 2, memory: 4096, cost: 0.0416 },
    'Standard_B2ms': { cpu: 2, memory: 8192, cost: 0.0832 },
    'sql.basic': { cost: 0.0067 }, // per hour
    'sql.standard': { cost: 0.015 },
    'disk.standard': { cost: 0.06 }, // per GB per month
    'disk.premium': { cost: 0.135 },
    'load.balancer': { cost: 0.025 } // per hour
  };

  private readonly GCP_COSTS = {
    'e2-micro': { cpu: 2, memory: 1024, cost: 0.0084 },
    'e2-small': { cpu: 2, memory: 2048, cost: 0.0168 },
    'e2-medium': { cpu: 2, memory: 4096, cost: 0.0336 },
    'e2-standard-2': { cpu: 2, memory: 8192, cost: 0.0672 },
    'db-f1-micro': { cost: 0.0075 }, // per hour
    'db-g1-small': { cost: 0.025 },
    'disk.standard': { cost: 0.04 }, // per GB per month
    'disk.ssd': { cost: 0.17 },
    'load.balancer': { cost: 0.025 } // per hour
  };

  constructor() {
    const configDir = path.join(homedir(), '.devops-cli');
    this.configFile = path.join(configDir, 'budget-config.json');
    this.costHistoryFile = path.join(configDir, 'cost-history.json');
    this.analyzer = new ProjectAnalyzer();
    this.ensureConfigFiles();
  }

  private async ensureConfigFiles(): Promise<void> {
    try {
      await fs.access(this.configFile);
    } catch (error) {
      await fs.mkdir(path.dirname(this.configFile), { recursive: true });
      
      const defaultConfig: BudgetConfig = {
        budgetLimit: 100,
        currency: 'USD',
        period: 'monthly',
        alerts: [
          {
            threshold: 50,
            severity: 'info',
            message: 'Budget usage has reached 50%',
            actions: ['email']
          },
          {
            threshold: 80,
            severity: 'warning',
            message: 'Budget usage has reached 80%',
            actions: ['email', 'slack']
          },
          {
            threshold: 95,
            severity: 'critical',
            message: 'Budget usage has reached 95% - immediate action required',
            actions: ['email', 'slack', 'webhook']
          }
        ],
        autoShutdown: false,
        autoShutdownThreshold: 100
      };
      
      await fs.writeFile(this.configFile, JSON.stringify(defaultConfig, null, 2));
    }

    try {
      await fs.access(this.costHistoryFile);
    } catch (error) {
      await fs.writeFile(this.costHistoryFile, JSON.stringify([]));
    }
  }

  async setBudget(amount: number, currency: string = 'USD', period: 'monthly' | 'weekly' | 'daily' = 'monthly'): Promise<void> {
    const config = await this.loadConfig();
    config.budgetLimit = amount;
    config.currency = currency;
    config.period = period;
    await this.saveConfig(config);
  }

  async setBudgetAlerts(alerts: BudgetAlert[]): Promise<void> {
    const config = await this.loadConfig();
    config.alerts = alerts;
    await this.saveConfig(config);
  }

  async setNotifications(notifications: BudgetConfig['notifications']): Promise<void> {
    const config = await this.loadConfig();
    config.notifications = notifications;
    await this.saveConfig(config);
  }

  async checkBudget(projectPath?: string, cloudProvider?: string): Promise<BudgetStatus> {
    const config = await this.loadConfig();
    let estimatedCost = 0;

    if (projectPath) {
      const costBreakdown = await this.estimateCosts(projectPath, cloudProvider || 'aws');
      estimatedCost = costBreakdown.totalCost;
    }

    const currentSpend = await this.getCurrentSpend();
    const budgetUsage = (currentSpend / config.budgetLimit) * 100;
    const withinBudget = currentSpend <= config.budgetLimit;
    const projectedMonthlySpend = this.calculateProjectedSpend(currentSpend, config.period);

    // Check for triggered alerts
    const triggeredAlerts = config.alerts.filter(alert => budgetUsage >= alert.threshold);

    const status: BudgetStatus = {
      budgetLimit: config.budgetLimit,
      currentSpend,
      estimatedCost,
      currency: config.currency,
      budgetUsage: Math.round(budgetUsage * 100) / 100,
      withinBudget,
      projectedMonthlySpend,
      alerts: triggeredAlerts
    };

    // Send alerts if needed
    if (triggeredAlerts.length > 0) {
      await this.sendAlerts(triggeredAlerts, status);
    }

    // Auto shutdown if configured
    if (config.autoShutdown && budgetUsage >= (config.autoShutdownThreshold || 100)) {
      await this.triggerAutoShutdown(projectPath, status);
    }

    return status;
  }

  async estimateCosts(projectPath: string, cloudProvider: string = 'aws', region?: string): Promise<CostBreakdown> {
    const analysis = await this.analyzer.analyzeProject(projectPath);
    const estimates: CostEstimate[] = [];

    switch (cloudProvider.toLowerCase()) {
      case 'aws':
        estimates.push(...await this.estimateAWSCosts(analysis, region || 'us-east-1'));
        break;
      case 'azure':
        estimates.push(...await this.estimateAzureCosts(analysis, region || 'eastus'));
        break;
      case 'gcp':
        estimates.push(...await this.estimateGCPCosts(analysis, region || 'us-central1'));
        break;
    }

    const totalCost = estimates.reduce((sum, estimate) => sum + estimate.cost, 0);

    const breakdown: CostBreakdown = {
      totalCost,
      currency: 'USD',
      period: 'monthly',
      estimates,
      provider: cloudProvider,
      region: region || 'default',
      lastUpdated: new Date()
    };

    // Save to history
    await this.saveCostHistory(breakdown);

    return breakdown;
  }

  private async estimateAWSCosts(analysis: any, region: string): Promise<CostEstimate[]> {
    const estimates: CostEstimate[] = [];

    // Compute costs
    const instanceType = this.selectInstanceType('aws', analysis);
    const instanceCost = this.AWS_COSTS[instanceType];
    if (instanceCost) {
      estimates.push({
        service: `EC2 ${instanceType}`,
        cost: instanceCost.cost * 24 * 30, // monthly cost
        unit: 'USD/month',
        usage: 1,
        details: { instanceType, region, hours: 24 * 30 }
      });
    }

    // Database costs
    if (analysis.database?.length > 0) {
      const dbInstanceType = analysis.complexity === 'high' ? 'rds.t3.small' : 'rds.t3.micro';
      const dbCost = this.AWS_COSTS[dbInstanceType];
      if (dbCost) {
        estimates.push({
          service: `RDS ${dbInstanceType}`,
          cost: dbCost.cost * 24 * 30,
          unit: 'USD/month',
          usage: 1,
          details: { instanceType: dbInstanceType, database: analysis.database }
        });
      }
    }

    // Storage costs
    const storageSize = this.estimateStorageSize(analysis);
    estimates.push({
      service: 'EBS GP3 Storage',
      cost: this.AWS_COSTS['ebs.gp3'] * storageSize,
      unit: 'USD/month',
      usage: storageSize,
      details: { type: 'gp3', sizeGB: storageSize }
    });

    // Load balancer
    if (analysis.services?.length > 1 || analysis.complexity === 'high') {
      estimates.push({
        service: 'Application Load Balancer',
        cost: this.AWS_COSTS['lb.application'] * 24 * 30,
        unit: 'USD/month',
        usage: 1,
        details: { type: 'application' }
      });
    }

    // NAT Gateway (for private subnets)
    estimates.push({
      service: 'NAT Gateway',
      cost: this.AWS_COSTS['nat.gateway'] * 24 * 30,
      unit: 'USD/month',
      usage: 1,
      details: { type: 'managed' }
    });

    // Data transfer (simplified)
    const dataTransferCost = this.estimateDataTransfer(analysis);
    if (dataTransferCost > 0) {
      estimates.push({
        service: 'Data Transfer',
        cost: dataTransferCost,
        unit: 'USD/month',
        usage: 100, // GB
        details: { type: 'internet_out' }
      });
    }

    return estimates;
  }

  private async estimateAzureCosts(analysis: any, region: string): Promise<CostEstimate[]> {
    const estimates: CostEstimate[] = [];

    // Compute costs
    const instanceType = this.selectInstanceType('azure', analysis);
    const instanceCost = this.AZURE_COSTS[instanceType];
    if (instanceCost) {
      estimates.push({
        service: `VM ${instanceType}`,
        cost: instanceCost.cost * 24 * 30,
        unit: 'USD/month',
        usage: 1,
        details: { instanceType, region, hours: 24 * 30 }
      });
    }

    // Database costs
    if (analysis.database?.length > 0) {
      const dbType = analysis.complexity === 'high' ? 'sql.standard' : 'sql.basic';
      const dbCost = this.AZURE_COSTS[dbType];
      if (dbCost) {
        estimates.push({
          service: `SQL Database ${dbType}`,
          cost: dbCost.cost * 24 * 30,
          unit: 'USD/month',
          usage: 1,
          details: { type: dbType, database: analysis.database }
        });
      }
    }

    // Storage costs
    const storageSize = this.estimateStorageSize(analysis);
    const diskType = analysis.complexity === 'high' ? 'disk.premium' : 'disk.standard';
    estimates.push({
      service: `Managed Disk ${diskType}`,
      cost: this.AZURE_COSTS[diskType] * storageSize,
      unit: 'USD/month',
      usage: storageSize,
      details: { type: diskType, sizeGB: storageSize }
    });

    // Load balancer
    if (analysis.services?.length > 1 || analysis.complexity === 'high') {
      estimates.push({
        service: 'Load Balancer',
        cost: this.AZURE_COSTS['load.balancer'] * 24 * 30,
        unit: 'USD/month',
        usage: 1,
        details: { type: 'standard' }
      });
    }

    return estimates;
  }

  private async estimateGCPCosts(analysis: any, region: string): Promise<CostEstimate[]> {
    const estimates: CostEstimate[] = [];

    // Compute costs
    const instanceType = this.selectInstanceType('gcp', analysis);
    const instanceCost = this.GCP_COSTS[instanceType];
    if (instanceCost) {
      estimates.push({
        service: `Compute Engine ${instanceType}`,
        cost: instanceCost.cost * 24 * 30,
        unit: 'USD/month',
        usage: 1,
        details: { instanceType, region, hours: 24 * 30 }
      });
    }

    // Database costs
    if (analysis.database?.length > 0) {
      const dbInstanceType = analysis.complexity === 'high' ? 'db-g1-small' : 'db-f1-micro';
      const dbCost = this.GCP_COSTS[dbInstanceType];
      if (dbCost) {
        estimates.push({
          service: `Cloud SQL ${dbInstanceType}`,
          cost: dbCost.cost * 24 * 30,
          unit: 'USD/month',
          usage: 1,
          details: { instanceType: dbInstanceType, database: analysis.database }
        });
      }
    }

    // Storage costs
    const storageSize = this.estimateStorageSize(analysis);
    const diskType = analysis.complexity === 'high' ? 'disk.ssd' : 'disk.standard';
    estimates.push({
      service: `Persistent Disk ${diskType}`,
      cost: this.GCP_COSTS[diskType] * storageSize,
      unit: 'USD/month',
      usage: storageSize,
      details: { type: diskType, sizeGB: storageSize }
    });

    // Load balancer
    if (analysis.services?.length > 1 || analysis.complexity === 'high') {
      estimates.push({
        service: 'Load Balancer',
        cost: this.GCP_COSTS['load.balancer'] * 24 * 30,
        unit: 'USD/month',
        usage: 1,
        details: { type: 'http' }
      });
    }

    return estimates;
  }

  private selectInstanceType(provider: string, analysis: any): string {
    const complexity = analysis.complexity || 'medium';
    const services = analysis.services?.length || 1;

    switch (provider) {
      case 'aws':
        if (complexity === 'high' || services > 3) return 't3.large';
        if (complexity === 'medium' || services > 1) return 't3.medium';
        return 't3.small';
      
      case 'azure':
        if (complexity === 'high' || services > 3) return 'Standard_B2ms';
        if (complexity === 'medium' || services > 1) return 'Standard_B2s';
        return 'Standard_B1ms';
      
      case 'gcp':
        if (complexity === 'high' || services > 3) return 'e2-standard-2';
        if (complexity === 'medium' || services > 1) return 'e2-medium';
        return 'e2-small';
      
      default:
        return 't3.small';
    }
  }

  private estimateStorageSize(analysis: any): number {
    // Base storage
    let storageSize = 20; // GB
    
    // Add storage based on complexity
    if (analysis.complexity === 'high') {
      storageSize += 80;
    } else if (analysis.complexity === 'medium') {
      storageSize += 40;
    } else {
      storageSize += 20;
    }
    
    // Add storage for each service
    storageSize += (analysis.services?.length || 1) * 10;
    
    // Add database storage
    if (analysis.database?.length > 0) {
      storageSize += 20;
    }
    
    return storageSize;
  }

  private estimateDataTransfer(analysis: any): number {
    // Simplified data transfer estimation
    const complexity = analysis.complexity || 'medium';
    const services = analysis.services?.length || 1;
    
    let transferGB = 10; // base transfer
    
    if (complexity === 'high') {
      transferGB += 50;
    } else if (complexity === 'medium') {
      transferGB += 25;
    }
    
    transferGB += services * 5;
    
    // Data transfer cost (simplified - first 1GB free, then $0.09/GB)
    return Math.max(0, transferGB - 1) * 0.09;
  }

  async getCostOptimizationSuggestions(costBreakdown: CostBreakdown): Promise<CostOptimizationSuggestion[]> {
    const suggestions: CostOptimizationSuggestion[] = [];
    
    for (const estimate of costBreakdown.estimates) {
      // Instance size optimization
      if (estimate.service.includes('EC2') || estimate.service.includes('VM') || estimate.service.includes('Compute Engine')) {
        if (estimate.cost > 50) { // If monthly cost is high
          suggestions.push({
            type: 'instance_size',
            description: `Consider using a smaller instance type for ${estimate.service}`,
            potentialSavings: estimate.cost * 0.3, // 30% savings potential
            effort: 'low',
            riskLevel: 'low',
            implementation: 'Downgrade instance size and monitor performance'
          });
        }
      }
      
      // Storage optimization
      if (estimate.service.includes('Storage') || estimate.service.includes('Disk')) {
        suggestions.push({
          type: 'storage',
          description: `Optimize storage type and size for ${estimate.service}`,
          potentialSavings: estimate.cost * 0.2,
          effort: 'medium',
          riskLevel: 'low',
          implementation: 'Implement lifecycle policies and cleanup unused storage'
        });
      }
      
      // Database optimization
      if (estimate.service.includes('RDS') || estimate.service.includes('SQL') || estimate.service.includes('Cloud SQL')) {
        suggestions.push({
          type: 'service',
          description: `Consider using reserved instances for ${estimate.service}`,
          potentialSavings: estimate.cost * 0.4,
          effort: 'low',
          riskLevel: 'low',
          implementation: 'Purchase 1-year reserved instances for predictable workloads'
        });
      }
    }
    
    // Network optimization
    if (costBreakdown.estimates.some(e => e.service.includes('Transfer'))) {
      suggestions.push({
        type: 'network',
        description: 'Optimize data transfer costs by using CloudFront/CDN',
        potentialSavings: 10,
        effort: 'medium',
        riskLevel: 'low',
        implementation: 'Implement CDN for static content delivery'
      });
    }
    
    return suggestions;
  }

  async getAlerts(): Promise<BudgetAlert[]> {
    const status = await this.getStatus();
    return status.alerts;
  }

  async getStatus(): Promise<BudgetStatus> {
    return this.checkBudget();
  }

  private async getCurrentSpend(): Promise<number> {
    // In a real implementation, this would fetch actual spending from cloud provider APIs
    // For now, return a simulated value based on cost history
    const history = await this.loadCostHistory();
    if (history.length === 0) return 0;
    
    const latestCost = history[history.length - 1];
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const currentDay = new Date().getDate();
    
    // Simulate current spend as proportion of monthly estimate
    return (latestCost.totalCost * currentDay) / daysInMonth;
  }

  private calculateProjectedSpend(currentSpend: number, period: string): number {
    const now = new Date();
    const currentDay = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    switch (period) {
      case 'daily':
        return currentSpend * daysInMonth;
      case 'weekly':
        return currentSpend * 4.33; // Average weeks in month
      case 'monthly':
      default:
        return (currentSpend / currentDay) * daysInMonth;
    }
  }

  private async sendAlerts(alerts: BudgetAlert[], status: BudgetStatus): Promise<void> {
    const config = await this.loadConfig();
    
    for (const alert of alerts) {
      const message = `${alert.message}\nCurrent spend: ${status.currency} ${status.currentSpend}\nBudget: ${status.currency} ${status.budgetLimit}\nUsage: ${status.budgetUsage}%`;
      
      for (const action of alert.actions || []) {
        switch (action) {
          case 'email':
            if (config.notifications?.email) {
              await this.sendEmailAlert(config.notifications.email, alert.severity, message);
            }
            break;
          case 'slack':
            if (config.notifications?.slack) {
              await this.sendSlackAlert(config.notifications.slack, alert.severity, message);
            }
            break;
          case 'webhook':
            if (config.notifications?.webhook) {
              await this.sendWebhookAlert(config.notifications.webhook, alert.severity, message, status);
            }
            break;
        }
      }
    }
  }

  private async sendEmailAlert(emails: string[], severity: string, message: string): Promise<void> {
    // In production, integrate with email service (SendGrid, SES, etc.)
    console.log(`EMAIL ALERT (${severity}): ${message} -> ${emails.join(', ')}`);
  }

  private async sendSlackAlert(slackConfig: { webhook: string; channel: string }, severity: string, message: string): Promise<void> {
    // In production, integrate with Slack API
    console.log(`SLACK ALERT (${severity}) to ${slackConfig.channel}: ${message}`);
  }

  private async sendWebhookAlert(webhookUrl: string, severity: string, message: string, status: BudgetStatus): Promise<void> {
    // In production, make HTTP POST to webhook URL
    console.log(`WEBHOOK ALERT (${severity}) to ${webhookUrl}:`, { message, status });
  }

  private async triggerAutoShutdown(projectPath?: string, status?: BudgetStatus): Promise<void> {
    console.log('AUTO SHUTDOWN TRIGGERED - Budget limit exceeded');
    
    // In production, this would:
    // 1. Stop non-essential services
    // 2. Scale down deployments
    // 3. Send notifications
    // 4. Log the action
    
    if (projectPath) {
      console.log(`Shutting down non-essential services for project: ${projectPath}`);
    }
  }

  // Cost comparison across providers
  async compareCosts(projectPath: string, providers: string[] = ['aws', 'azure', 'gcp']): Promise<{ provider: string; cost: CostBreakdown }[]> {
    const comparisons = [];
    
    for (const provider of providers) {
      const costBreakdown = await this.estimateCosts(projectPath, provider);
      comparisons.push({
        provider,
        cost: costBreakdown
      });
    }
    
    // Sort by total cost
    comparisons.sort((a, b) => a.cost.totalCost - b.cost.totalCost);
    
    return comparisons;
  }

  // Cost tracking over time
  async getCostTrends(days: number = 30): Promise<{ date: string; cost: number }[]> {
    const history = await this.loadCostHistory();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return history
      .filter(h => new Date(h.lastUpdated) >= cutoffDate)
      .map(h => ({
        date: new Date(h.lastUpdated).toISOString().split('T')[0],
        cost: h.totalCost
      }));
  }

  // Budget recommendations
  async getBudgetRecommendations(projectPath?: string): Promise<{ recommendedBudget: number; reasoning: string }> {
    let recommendedBudget = 100; // default
    let reasoning = 'Default budget recommendation';
    
    if (projectPath) {
      const costBreakdown = await this.estimateCosts(projectPath);
      recommendedBudget = Math.round(costBreakdown.totalCost * 1.2); // 20% buffer
      reasoning = `Based on estimated monthly cost of $${costBreakdown.totalCost} with 20% buffer`;
    } else {
      const history = await this.loadCostHistory();
      if (history.length > 0) {
        const avgCost = history.reduce((sum, h) => sum + h.totalCost, 0) / history.length;
        recommendedBudget = Math.round(avgCost * 1.3); // 30% buffer for historical data
        reasoning = `Based on historical average cost of $${avgCost.toFixed(2)} with 30% buffer`;
      }
    }
    
    return { recommendedBudget, reasoning };
  }

  // Resource tagging for cost allocation
  async generateCostAllocationTags(projectPath: string): Promise<Record<string, string>> {
    const analysis = await this.analyzer.analyzeProject(projectPath);
    const projectName = path.basename(projectPath);
    
    return {
      'Project': projectName,
      'Environment': 'dev', // could be dynamic
      'Team': 'devops',
      'CostCenter': 'engineering',
      'Application': analysis.frameworks?.[0] || 'unknown',
      'Language': analysis.languages?.[0] || 'unknown',
      'Complexity': analysis.complexity || 'medium',
      'CreatedBy': 'devops-cli',
      'CreatedAt': new Date().toISOString().split('T')[0]
    };
  }

  // File operations
  private async loadConfig(): Promise<BudgetConfig> {
    try {
      const data = await fs.readFile(this.configFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error('Failed to load budget configuration');
    }
  }

  private async saveConfig(config: BudgetConfig): Promise<void> {
    await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
  }

  private async loadCostHistory(): Promise<CostBreakdown[]> {
    try {
      const data = await fs.readFile(this.costHistoryFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  private async saveCostHistory(breakdown: CostBreakdown): Promise<void> {
    const history = await this.loadCostHistory();
    history.push(breakdown);
    
    // Keep only last 100 records
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    
    await fs.writeFile(this.costHistoryFile, JSON.stringify(history, null, 2));
  }

  // Export/Import functionality
  async exportBudgetConfig(outputPath: string): Promise<void> {
    const config = await this.loadConfig();
    const history = await this.loadCostHistory();
    
    const exportData = {
      config,
      history,
      exportedAt: new Date().toISOString()
    };
    
    await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
  }

  async importBudgetConfig(inputPath: string): Promise<void> {
    const data = await fs.readFile(inputPath, 'utf8');
    const importData = JSON.parse(data);
    
    if (importData.config) {
      await this.saveConfig(importData.config);
    }
    
    if (importData.history) {
      await fs.writeFile(this.costHistoryFile, JSON.stringify(importData.history, null, 2));
    }
  }

  // Cleanup old data
  async cleanup(olderThanDays: number = 90): Promise<number> {
    const history = await this.loadCostHistory();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const filteredHistory = history.filter(h => new Date(h.lastUpdated) > cutoffDate);
    const removedCount = history.length - filteredHistory.length;
    
    if (removedCount > 0) {
      await fs.writeFile(this.costHistoryFile, JSON.stringify(filteredHistory, null, 2));
    }
    
    return removedCount;
  }
}