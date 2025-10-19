import { promises as fs } from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import * as yaml from 'js-yaml';

interface Environment {
  name: string;
  description: string;
  cloud: 'aws' | 'azure' | 'gcp';
  region: string;
  status: 'active' | 'inactive' | 'maintenance';
  created: Date;
  lastUpdated: Date;
  config: EnvironmentConfig;
  variables: Record<string, string>;
  secrets: Record<string, string>;
  resources?: {
    cluster?: string;
    namespace?: string;
    resourceGroup?: string;
    project?: string;
  };
  deployment?: {
    strategy: 'blue-green' | 'rolling' | 'canary';
    replicas: number;
    autoScaling: boolean;
    minReplicas?: number;
    maxReplicas?: number;
  };
  monitoring?: {
    enabled: boolean;
    tools: string[];
    alerting: boolean;
  };
  networking?: {
    vpc?: string;
    subnets?: string[];
    loadBalancer?: string;
    ingress?: string;
  };
}

interface EnvironmentConfig {
  cpu: string;
  memory: string;
  storage: string;
  database?: {
    type: string;
    size: string;
    backup: boolean;
  };
  caching?: {
    enabled: boolean;
    type: string;
    size: string;
  };
  security?: {
    tls: boolean;
    authentication: boolean;
    authorization: boolean;
    networkPolicies: boolean;
  };
}

interface EnvironmentTemplate {
  name: string;
  description: string;
  cloud: 'aws' | 'azure' | 'gcp';
  config: Partial<EnvironmentConfig>;
  variables: Record<string, string>;
  recommendedFor: string[];
}

interface EnvironmentPromotion {
  from: string;
  to: string;
  timestamp: Date;
  artifacts: string[];
  rollbackPlan?: string;
  approver?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
}

export class EnvironmentManager {
  private configFile: string;
  private environmentsDir: string;
  private templatesDir: string;
  private promotionHistoryFile: string;

  private readonly DEFAULT_TEMPLATES: EnvironmentTemplate[] = [
    {
      name: 'development',
      description: 'Development environment with minimal resources',
      cloud: 'aws',
      config: {
        cpu: '0.5',
        memory: '1Gi',
        storage: '10Gi',
        database: {
          type: 'sqlite',
          size: 'small',
          backup: false
        },
        security: {
          tls: false,
          authentication: false,
          authorization: false,
          networkPolicies: false
        }
      },
      variables: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        DEBUG: 'true'
      },
      recommendedFor: ['development', 'testing', 'feature-branches']
    },
    {
      name: 'staging',
      description: 'Staging environment mirroring production',
      cloud: 'aws',
      config: {
        cpu: '1',
        memory: '2Gi',
        storage: '50Gi',
        database: {
          type: 'postgres',
          size: 'medium',
          backup: true
        },
        security: {
          tls: true,
          authentication: true,
          authorization: true,
          networkPolicies: true
        }
      },
      variables: {
        NODE_ENV: 'staging',
        LOG_LEVEL: 'info',
        DEBUG: 'false'
      },
      recommendedFor: ['pre-production', 'qa', 'integration-testing']
    },
    {
      name: 'production',
      description: 'Production environment with high availability',
      cloud: 'aws',
      config: {
        cpu: '2',
        memory: '4Gi',
        storage: '100Gi',
        database: {
          type: 'postgres',
          size: 'large',
          backup: true
        },
        caching: {
          enabled: true,
          type: 'redis',
          size: 'medium'
        },
        security: {
          tls: true,
          authentication: true,
          authorization: true,
          networkPolicies: true
        }
      },
      variables: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'error',
        DEBUG: 'false'
      },
      recommendedFor: ['production', 'live-traffic']
    }
  ];

  constructor() {
    const configDir = path.join(homedir(), '.devops-cli');
    this.configFile = path.join(configDir, 'environment-config.json');
    this.environmentsDir = path.join(configDir, 'environments');
    this.templatesDir = path.join(configDir, 'templates');
    this.promotionHistoryFile = path.join(configDir, 'promotion-history.json');
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    const dirs = [
      path.dirname(this.configFile),
      this.environmentsDir,
      this.templatesDir
    ];

    for (const dir of dirs) {
      try {
        await fs.access(dir);
      } catch (error) {
        await fs.mkdir(dir, { recursive: true });
      }
    }

    // Initialize default templates
    await this.initializeDefaultTemplates();
    
    // Initialize promotion history
    try {
      await fs.access(this.promotionHistoryFile);
    } catch (error) {
      await fs.writeFile(this.promotionHistoryFile, JSON.stringify([]));
    }
  }

  private async initializeDefaultTemplates(): Promise<void> {
    for (const template of this.DEFAULT_TEMPLATES) {
      const templateFile = path.join(this.templatesDir, `${template.name}.json`);
      try {
        await fs.access(templateFile);
      } catch (error) {
        await fs.writeFile(templateFile, JSON.stringify(template, null, 2));
      }
    }
  }

  async createEnvironment(envData: {
    name: string;
    description?: string;
    cloud: 'aws' | 'azure' | 'gcp';
    region: string;
    template?: string;
    config?: Partial<EnvironmentConfig>;
    variables?: Record<string, string>;
  }): Promise<Environment> {
    // Check if environment already exists
    const exists = await this.environmentExists(envData.name);
    if (exists) {
      throw new Error(`Environment '${envData.name}' already exists`);
    }

    // Load template if specified
    let templateConfig: Partial<EnvironmentConfig> = {};
    let templateVariables: Record<string, string> = {};
    
    if (envData.template) {
      const template = await this.getTemplate(envData.template);
      templateConfig = template.config;
      templateVariables = template.variables;
    }

    // Create environment
    const environment: Environment = {
      name: envData.name,
      description: envData.description || `${envData.name} environment`,
      cloud: envData.cloud,
      region: envData.region,
      status: 'active',
      created: new Date(),
      lastUpdated: new Date(),
      config: {
        cpu: '1',
        memory: '2Gi',
        storage: '20Gi',
        ...templateConfig,
        ...envData.config
      },
      variables: {
        ...templateVariables,
        ...envData.variables
      },
      secrets: {}
    };

    // Save environment
    await this.saveEnvironment(environment);
    
    // Generate default resources based on cloud provider
    await this.generateCloudResources(environment);

    return environment;
  }

  async updateEnvironment(name: string, updates: Partial<Environment>): Promise<Environment> {
    const environment = await this.getEnvironment(name);
    if (!environment) {
      throw new Error(`Environment '${name}' not found`);
    }

    // Update environment
    const updatedEnvironment = {
      ...environment,
      ...updates,
      lastUpdated: new Date()
    };

    await this.saveEnvironment(updatedEnvironment);
    return updatedEnvironment;
  }

  async deleteEnvironment(name: string): Promise<void> {
    const environment = await this.getEnvironment(name);
    if (!environment) {
      throw new Error(`Environment '${name}' not found`);
    }

    // Check if environment has active deployments
    const hasActiveDeployments = await this.hasActiveDeployments(name);
    if (hasActiveDeployments) {
      throw new Error(`Cannot delete environment '${name}' - it has active deployments`);
    }

    // Delete environment file
    const envFile = path.join(this.environmentsDir, `${name}.json`);
    await fs.unlink(envFile);
  }

  async listEnvironments(): Promise<Environment[]> {
    try {
      const files = await fs.readdir(this.environmentsDir);
      const environments: Environment[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const envName = path.basename(file, '.json');
          const environment = await this.getEnvironment(envName);
          if (environment) {
            environments.push(environment);
          }
        }
      }

      return environments.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      return [];
    }
  }

  async getEnvironment(name: string): Promise<Environment | null> {
    try {
      const envFile = path.join(this.environmentsDir, `${name}.json`);
      const data = await fs.readFile(envFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async setupEnvironment(name: string, projectPath: string): Promise<void> {
    const environment = await this.getEnvironment(name);
    if (!environment) {
      throw new Error(`Environment '${name}' not found`);
    }

    // Generate environment-specific configuration files
    await this.generateEnvironmentConfig(environment, projectPath);
    
    // Setup namespace/resource group
    await this.setupCloudNamespace(environment);
    
    // Apply environment variables
    await this.applyEnvironmentVariables(environment, projectPath);
    
    // Setup monitoring if enabled
    if (environment.monitoring?.enabled) {
      await this.setupMonitoring(environment, projectPath);
    }
  }

  async promoteToEnvironment(
    fromEnv: string,
    toEnv: string,
    options: {
      artifacts?: string[];
      rollbackPlan?: string;
      approver?: string;
      autoApprove?: boolean;
    } = {}
  ): Promise<EnvironmentPromotion> {
    const sourceEnv = await this.getEnvironment(fromEnv);
    const targetEnv = await this.getEnvironment(toEnv);

    if (!sourceEnv || !targetEnv) {
      throw new Error('Source or target environment not found');
    }

    // Create promotion record
    const promotion: EnvironmentPromotion = {
      from: fromEnv,
      to: toEnv,
      timestamp: new Date(),
      artifacts: options.artifacts || [],
      rollbackPlan: options.rollbackPlan,
      approver: options.approver,
      status: options.autoApprove ? 'approved' : 'pending'
    };

    // Save promotion to history
    await this.savePromotionHistory(promotion);

    // If auto-approved, execute promotion
    if (options.autoApprove) {
      await this.executePromotion(promotion);
    }

    return promotion;
  }

  async getEnvironmentDiff(env1: string, env2: string): Promise<any> {
    const environment1 = await this.getEnvironment(env1);
    const environment2 = await this.getEnvironment(env2);

    if (!environment1 || !environment2) {
      throw new Error('One or both environments not found');
    }

    return {
      environments: { env1, env2 },
      differences: {
        cloud: environment1.cloud !== environment2.cloud,
        region: environment1.region !== environment2.region,
        config: JSON.stringify(environment1.config) !== JSON.stringify(environment2.config),
        variables: JSON.stringify(environment1.variables) !== JSON.stringify(environment2.variables),
        deployment: JSON.stringify(environment1.deployment) !== JSON.stringify(environment2.deployment)
      },
      details: {
        environment1,
        environment2
      }
    };
  }

  async cloneEnvironment(sourceEnv: string, newEnvName: string, options: {
    cloud?: 'aws' | 'azure' | 'gcp';
    region?: string;
    description?: string;
  } = {}): Promise<Environment> {
    const source = await this.getEnvironment(sourceEnv);
    if (!source) {
      throw new Error(`Source environment '${sourceEnv}' not found`);
    }

    const exists = await this.environmentExists(newEnvName);
    if (exists) {
      throw new Error(`Environment '${newEnvName}' already exists`);
    }

    // Clone environment
    const cloned: Environment = {
      ...source,
      name: newEnvName,
      description: options.description || `Clone of ${sourceEnv}`,
      cloud: options.cloud || source.cloud,
      region: options.region || source.region,
      status: 'active',
      created: new Date(),
      lastUpdated: new Date(),
      resources: undefined // Reset resources for new environment
    };

    await this.saveEnvironment(cloned);
    await this.generateCloudResources(cloned);

    return cloned;
  }

  async getEnvironmentVariables(name: string, includeSecrets: boolean = false): Promise<Record<string, string>> {
    const environment = await this.getEnvironment(name);
    if (!environment) {
      throw new Error(`Environment '${name}' not found`);
    }

    const variables = { ...environment.variables };
    
    if (includeSecrets) {
      Object.assign(variables, environment.secrets);
    }

    return variables;
  }

  async setEnvironmentVariable(envName: string, key: string, value: string, isSecret: boolean = false): Promise<void> {
    const environment = await this.getEnvironment(envName);
    if (!environment) {
      throw new Error(`Environment '${envName}' not found`);
    }

    if (isSecret) {
      environment.secrets[key] = value;
    } else {
      environment.variables[key] = value;
    }

    environment.lastUpdated = new Date();
    await this.saveEnvironment(environment);
  }

  async removeEnvironmentVariable(envName: string, key: string): Promise<void> {
    const environment = await this.getEnvironment(envName);
    if (!environment) {
      throw new Error(`Environment '${envName}' not found`);
    }

    delete environment.variables[key];
    delete environment.secrets[key];

    environment.lastUpdated = new Date();
    await this.saveEnvironment(environment);
  }

  async getEnvironmentStatus(name: string): Promise<{
    environment: Environment;
    health: 'healthy' | 'degraded' | 'unhealthy';
    resources: any[];
    deployments: any[];
    issues: string[];
  }> {
    const environment = await this.getEnvironment(name);
    if (!environment) {
      throw new Error(`Environment '${name}' not found`);
    }

    // In a real implementation, this would check actual cloud resources
    const status = {
      environment,
      health: 'healthy' as const,
      resources: await this.getEnvironmentResources(name),
      deployments: await this.getEnvironmentDeployments(name),
      issues: []
    };

    // Simple health check logic
    if (environment.status === 'inactive') {
      status.health = 'unhealthy';
      status.issues.push('Environment is inactive');
    } else if (environment.status === 'maintenance') {
      status.health = 'degraded';
      status.issues.push('Environment is in maintenance mode');
    }

    return status;
  }

  // Template management
  async createTemplate(template: EnvironmentTemplate): Promise<void> {
    const templateFile = path.join(this.templatesDir, `${template.name}.json`);
    
    // Check if template already exists
    try {
      await fs.access(templateFile);
      throw new Error(`Template '${template.name}' already exists`);
    } catch (error) {
      // Template doesn't exist, proceed
    }

    await fs.writeFile(templateFile, JSON.stringify(template, null, 2));
  }

  async getTemplate(name: string): Promise<EnvironmentTemplate> {
    const templateFile = path.join(this.templatesDir, `${name}.json`);
    try {
      const data = await fs.readFile(templateFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Template '${name}' not found`);
    }
  }

  async listTemplates(): Promise<EnvironmentTemplate[]> {
    try {
      const files = await fs.readdir(this.templatesDir);
      const templates: EnvironmentTemplate[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const templateName = path.basename(file, '.json');
          try {
            const template = await this.getTemplate(templateName);
            templates.push(template);
          } catch (error) {
            // Skip invalid templates
          }
        }
      }

      return templates;
    } catch (error) {
      return [];
    }
  }

  // Configuration file generation
  async generateKubernetesManifests(envName: string, outputDir: string): Promise<string[]> {
    const environment = await this.getEnvironment(envName);
    if (!environment) {
      throw new Error(`Environment '${envName}' not found`);
    }

    const files: string[] = [];
    
    // Generate namespace
    const namespaceManifest = this.generateNamespaceManifest(environment);
    const namespacePath = path.join(outputDir, `${envName}-namespace.yaml`);
    await fs.writeFile(namespacePath, namespaceManifest);
    files.push(namespacePath);

    // Generate configmap
    const configMapManifest = this.generateConfigMapManifest(environment);
    const configMapPath = path.join(outputDir, `${envName}-configmap.yaml`);
    await fs.writeFile(configMapPath, configMapManifest);
    files.push(configMapPath);

    // Generate secret
    const secretManifest = this.generateSecretManifest(environment);
    const secretPath = path.join(outputDir, `${envName}-secret.yaml`);
    await fs.writeFile(secretPath, secretManifest);
    files.push(secretPath);

    // Generate resource quota
    const resourceQuotaManifest = this.generateResourceQuotaManifest(environment);
    const resourceQuotaPath = path.join(outputDir, `${envName}-resourcequota.yaml`);
    await fs.writeFile(resourceQuotaPath, resourceQuotaManifest);
    files.push(resourceQuotaPath);

    return files;
  }

  async generateHelmValues(envName: string, outputPath: string): Promise<void> {
    const environment = await this.getEnvironment(envName);
    if (!environment) {
      throw new Error(`Environment '${envName}' not found`);
    }

    const helmValues = {
      environment: environment.name,
      replicaCount: environment.deployment?.replicas || 1,
      image: {
        tag: 'latest'
      },
      resources: {
        limits: {
          cpu: environment.config.cpu,
          memory: environment.config.memory
        },
        requests: {
          cpu: this.calculateRequestsFromLimits(environment.config.cpu),
          memory: this.calculateRequestsFromLimits(environment.config.memory)
        }
      },
      persistence: {
        enabled: true,
        size: environment.config.storage
      },
      env: environment.variables,
      autoscaling: {
        enabled: environment.deployment?.autoScaling || false,
        minReplicas: environment.deployment?.minReplicas || 1,
        maxReplicas: environment.deployment?.maxReplicas || 10
      }
    };

    const yamlContent = yaml.dump(helmValues);
    await fs.writeFile(outputPath, yamlContent);
  }

  // Private helper methods
  private async saveEnvironment(environment: Environment): Promise<void> {
    const envFile = path.join(this.environmentsDir, `${environment.name}.json`);
    await fs.writeFile(envFile, JSON.stringify(environment, null, 2));
  }

  private async environmentExists(name: string): Promise<boolean> {
    const envFile = path.join(this.environmentsDir, `${name}.json`);
    try {
      await fs.access(envFile);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async generateCloudResources(environment: Environment): Promise<void> {
    // Generate cloud-specific resource identifiers
    const resources: Environment['resources'] = {};

    switch (environment.cloud) {
      case 'aws':
        resources.cluster = `${environment.name}-cluster`;
        resources.namespace = environment.name;
        break;
      case 'azure':
        resources.resourceGroup = `${environment.name}-rg`;
        resources.cluster = `${environment.name}-aks`;
        resources.namespace = environment.name;
        break;
      case 'gcp':
        resources.project = `${environment.name}-project`;
        resources.cluster = `${environment.name}-gke`;
        resources.namespace = environment.name;
        break;
    }

    environment.resources = resources;
    await this.saveEnvironment(environment);
  }

  private async generateEnvironmentConfig(environment: Environment, projectPath: string): Promise<void> {
    // Generate .env file for the environment
    const envVars: string[] = [
      `# Environment: ${environment.name}`,
      `# Generated: ${new Date().toISOString()}`,
      ''
    ];

    for (const [key, value] of Object.entries(environment.variables)) {
      envVars.push(`${key}=${value}`);
    }

    const envFile = path.join(projectPath, `.env.${environment.name}`);
    await fs.writeFile(envFile, envVars.join('\n'));
  }

  private async setupCloudNamespace(environment: Environment): Promise<void> {
    // In a real implementation, this would create actual cloud resources
    console.log(`Setting up namespace for environment: ${environment.name}`);
  }

  private async applyEnvironmentVariables(environment: Environment, projectPath: string): Promise<void> {
    // Apply environment variables to the project
    console.log(`Applying environment variables for: ${environment.name}`);
  }

  private async setupMonitoring(environment: Environment, projectPath: string): Promise<void> {
    // Setup monitoring for the environment
    console.log(`Setting up monitoring for environment: ${environment.name}`);
  }

  private async hasActiveDeployments(envName: string): Promise<boolean> {
    // In a real implementation, check for active deployments
    return false;
  }

  private async savePromotionHistory(promotion: EnvironmentPromotion): Promise<void> {
    const history = await this.loadPromotionHistory();
    history.push(promotion);
    
    // Keep only last 100 promotions
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    
    await fs.writeFile(this.promotionHistoryFile, JSON.stringify(history, null, 2));
  }

  private async loadPromotionHistory(): Promise<EnvironmentPromotion[]> {
    try {
      const data = await fs.readFile(this.promotionHistoryFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  private async executePromotion(promotion: EnvironmentPromotion): Promise<void> {
    // Execute the promotion
    console.log(`Executing promotion from ${promotion.from} to ${promotion.to}`);
    promotion.status = 'completed';
    await this.savePromotionHistory([promotion]);
  }

  private async getEnvironmentResources(envName: string): Promise<any[]> {
    // Get actual cloud resources for the environment
    return [];
  }

  private async getEnvironmentDeployments(envName: string): Promise<any[]> {
    // Get deployments for the environment
    return [];
  }

  // Kubernetes manifest generators
  private generateNamespaceManifest(environment: Environment): string {
    return yaml.dump({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: environment.name,
        labels: {
          environment: environment.name,
          cloud: environment.cloud,
          'managed-by': 'devops-cli'
        }
      }
    });
  }

  private generateConfigMapManifest(environment: Environment): string {
    return yaml.dump({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${environment.name}-config`,
        namespace: environment.name
      },
      data: environment.variables
    });
  }

  private generateSecretManifest(environment: Environment): string {
    // Encode secrets in base64
    const encodedSecrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(environment.secrets)) {
      encodedSecrets[key] = Buffer.from(value).toString('base64');
    }

    return yaml.dump({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: `${environment.name}-secrets`,
        namespace: environment.name
      },
      type: 'Opaque',
      data: encodedSecrets
    });
  }

  private generateResourceQuotaManifest(environment: Environment): string {
    return yaml.dump({
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: {
        name: `${environment.name}-quota`,
        namespace: environment.name
      },
      spec: {
        hard: {
          'requests.cpu': this.calculateRequestsFromLimits(environment.config.cpu),
          'requests.memory': this.calculateRequestsFromLimits(environment.config.memory),
          'limits.cpu': environment.config.cpu,
          'limits.memory': environment.config.memory,
          'requests.storage': environment.config.storage,
          persistentvolumeclaims: '10',
          pods: '20',
          services: '10'
        }
      }
    });
  }

  private calculateRequestsFromLimits(limit: string): string {
    // Calculate resource requests as 50% of limits
    if (limit.endsWith('Gi')) {
      const value = parseFloat(limit.slice(0, -2));
      return `${(value * 0.5).toFixed(1)}Gi`;
    } else if (limit.endsWith('Mi')) {
      const value = parseFloat(limit.slice(0, -2));
      return `${Math.round(value * 0.5)}Mi`;
    } else {
      // CPU cores
      const value = parseFloat(limit);
      return `${(value * 0.5).toFixed(1)}`;
    }
  }

  // Export/Import functionality
  async exportEnvironment(envName: string, outputPath: string): Promise<void> {
    const environment = await this.getEnvironment(envName);
    if (!environment) {
      throw new Error(`Environment '${envName}' not found`);
    }

    const exportData = {
      environment,
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    };

    await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
  }

  async importEnvironment(inputPath: string, newName?: string): Promise<Environment> {
    const data = await fs.readFile(inputPath, 'utf8');
    const importData = JSON.parse(data);
    
    if (!importData.environment) {
      throw new Error('Invalid environment export file');
    }

    const environment = importData.environment as Environment;
    
    // Use new name if provided
    if (newName) {
      environment.name = newName;
    }

    // Check if environment exists
    const exists = await this.environmentExists(environment.name);
    if (exists) {
      throw new Error(`Environment '${environment.name}' already exists`);
    }

    // Update timestamps
    environment.created = new Date();
    environment.lastUpdated = new Date();

    await this.saveEnvironment(environment);
    return environment;
  }

  // Cleanup functionality
  async cleanup(olderThanDays: number = 90): Promise<{ environments: number; promotions: number }> {
    let environmentsRemoved = 0;
    
    // Cleanup old inactive environments
    const environments = await this.listEnvironments();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    for (const env of environments) {
      if (env.status === 'inactive' && new Date(env.lastUpdated) < cutoffDate) {
        try {
          await this.deleteEnvironment(env.name);
          environmentsRemoved++;
        } catch (error) {
          // Skip if can't delete
        }
      }
    }

    // Cleanup old promotion history
    const promotions = await this.loadPromotionHistory();
    const recentPromotions = promotions.filter(p => new Date(p.timestamp) > cutoffDate);
    const promotionsRemoved = promotions.length - recentPromotions.length;

    if (promotionsRemoved > 0) {
      await fs.writeFile(this.promotionHistoryFile, JSON.stringify(recentPromotions, null, 2));
    }

    return { environments: environmentsRemoved, promotions: promotionsRemoved };
  }
}