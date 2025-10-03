// Project Analysis Types
export interface ProjectAnalysis {
  projectPath: string;
  projectName: string;
  services: ServiceInfo[];
  languages: LanguageInfo[];
  frameworks: FrameworkInfo[];
  dependencies: DependencyInfo[];
  databases: DatabaseInfo[];
  complexity: ProjectComplexity;
  estimatedSize: {
    linesOfCode: number;
    fileCount: number;
    totalSizeMB: number;
  };
}

export interface ServiceInfo {
  name: string;
  path: string;
  language: string;
  framework?: string;
  port?: number;
  hasDockerfile: boolean;
  hasTests: boolean;
  dependencies: string[];
  entryPoint?: string;
}

export interface LanguageInfo {
  name: string;
  version?: string;
  fileCount: number;
  percentage: number;
}

export interface FrameworkInfo {
  name: string;
  version?: string;
  language: string;
  type: 'web' | 'api' | 'cli' | 'library' | 'unknown';
}

export interface DependencyInfo {
  name: string;
  version?: string;
  type: 'runtime' | 'dev' | 'peer';
}

export interface DatabaseInfo {
  type: 'mysql' | 'postgresql' | 'mongodb' | 'redis' | 'dynamodb' | 'other';
  version?: string;
  detected: boolean;
}

export type ProjectComplexity = 'simple' | 'moderate' | 'complex' | 'enterprise';

// Resource Calculation Types
export interface ResourceRequirements {
  services: ServiceResources[];
  infrastructure: InfrastructureRequirements;
  estimated_cost: CostEstimate;
}

export interface ServiceResources {
  serviceName: string;
  replicas: number;
  cpu: {
    request: string;
    limit: string;
  };
  memory: {
    request: string;
    limit: string;
  };
  storage?: {
    size: string;
    type: 'ephemeral' | 'persistent';
  };
  autoscaling: {
    enabled: boolean;
    minReplicas: number;
    maxReplicas: number;
    targetCPU: number;
    targetMemory?: number;
  };
}

export interface InfrastructureRequirements {
  kubernetes: {
    nodeCount: number;
    nodeType: string;
    nodeSize: string;
  };
  networking: {
    loadBalancer: boolean;
    ingress: boolean;
    serviceMesh: boolean;
  };
  storage: {
    persistentVolumes: number;
    totalStorageGB: number;
  };
  database: {
    managed: boolean;
    type?: string;
    instanceClass?: string;
  };
}

export interface CostEstimate {
  monthly: {
    compute: number;
    storage: number;
    networking: number;
    database: number;
    total: number;
  };
  currency: string;
}

// Kubernetes Generation Types
export interface KubernetesManifests {
  deployments: any[];
  services: any[];
  configMaps: any[];
  secrets: any[];
  ingress?: any;
  hpa?: any[];
  pdb?: any[];
  serviceAccounts?: any[];
}

// Terraform Types
export interface TerraformConfig {
  provider: ProviderConfig;
  vpc: VPCConfig;
  eks: EKSConfig;
  ecr: ECRConfig[];
  rds?: RDSConfig;
  elasticache?: ElastiCacheConfig;
  s3?: S3Config[];
  iam: IAMConfig;
}

export interface ProviderConfig {
  region: string;
  profile?: string;
  account_id?: string;
}

export interface VPCConfig {
  cidr: string;
  azs: string[];
  privateSubnets: string[];
  publicSubnets: string[];
  enableNatGateway: boolean;
  singleNatGateway: boolean;
}

export interface EKSConfig {
  clusterName: string;
  clusterVersion: string;
  nodeGroups: NodeGroupConfig[];
  enableAutoMode?: boolean;
}

export interface NodeGroupConfig {
  name: string;
  instanceTypes: string[];
  desiredSize: number;
  minSize: number;
  maxSize: number;
  diskSize: number;
}

export interface ECRConfig {
  repositoryName: string;
  imageScanOnPush: boolean;
  imageTagMutability: 'MUTABLE' | 'IMMUTABLE';
}

export interface RDSConfig {
  engine: string;
  engineVersion: string;
  instanceClass: string;
  allocatedStorage: number;
  dbName: string;
  multiAZ: boolean;
}

export interface ElastiCacheConfig {
  engine: 'redis' | 'memcached';
  nodeType: string;
  numCacheNodes: number;
}

export interface S3Config {
  bucketName: string;
  versioning: boolean;
  encryption: boolean;
}

export interface IAMConfig {
  roles: IAMRole[];
  policies: IAMPolicy[];
}

export interface IAMRole {
  name: string;
  assumeRolePolicy: any;
  policyArns: string[];
}

export interface IAMPolicy {
  name: string;
  policy: any;
}

// CI/CD Types
export interface CICDPipeline {
  provider: 'github-actions' | 'gitlab-ci' | 'jenkins' | 'circleci';
  stages: PipelineStage[];
  environment: EnvironmentConfig[];
  secrets: SecretConfig[];
}

export interface PipelineStage {
  name: string;
  jobs: Job[];
}

export interface Job {
  name: string;
  steps: Step[];
  dependencies?: string[];
  environment?: string;
}

export interface Step {
  name: string;
  run?: string;
  uses?: string;
  with?: Record<string, any>;
}

export interface EnvironmentConfig {
  name: string;
  variables: Record<string, string>;
}

export interface SecretConfig {
  name: string;
  description: string;
  required: boolean;
}

// GitOps Types
export interface GitOpsConfig {
  tool: 'argocd' | 'flux' | 'jenkins-x';
  applications: ArgoApplication[];
  helmCharts: HelmChartConfig[];
}

export interface ArgoApplication {
  name: string;
  namespace: string;
  project: string;
  source: {
    repoURL: string;
    path: string;
    targetRevision: string;
  };
  destination: {
    server: string;
    namespace: string;
  };
  syncPolicy?: {
    automated?: {
      prune: boolean;
      selfHeal: boolean;
    };
  };
}

export interface HelmChartConfig {
  name: string;
  description: string;
  version: string;
  values: Record<string, any>;
  templates: string[];
}

// Deployment Types
export interface DeploymentConfig {
  strategy: 'terraform' | 'cloudformation' | 'pulumi';
  phases: DeploymentPhase[];
  rollback: RollbackConfig;
}

export interface DeploymentPhase {
  name: string;
  order: number;
  commands: string[];
  validation?: string[];
}

export interface RollbackConfig {
  enabled: boolean;
  automatic: boolean;
  healthCheckEndpoint?: string;
}

// Monitoring Types
export interface MonitoringConfig {
  prometheus: PrometheusConfig;
  grafana: GrafanaConfig;
  alerting: AlertingConfig;
  logging: LoggingConfig;
}

export interface PrometheusConfig {
  enabled: boolean;
  retention: string;
  scrapeInterval: string;
  serviceMonitors: ServiceMonitor[];
}

export interface ServiceMonitor {
  name: string;
  selector: Record<string, string>;
  endpoints: {
    port: string;
    path: string;
  }[];
}

export interface GrafanaConfig {
  enabled: boolean;
  dashboards: Dashboard[];
}

export interface Dashboard {
  name: string;
  uid: string;
  panels: Panel[];
}

export interface Panel {
  title: string;
  type: string;
  query: string;
}

export interface AlertingConfig {
  enabled: boolean;
  rules: AlertRule[];
  receivers: AlertReceiver[];
}

export interface AlertRule {
  name: string;
  expr: string;
  for: string;
  severity: 'critical' | 'warning' | 'info';
  annotations: Record<string, string>;
}

export interface AlertReceiver {
  name: string;
  type: 'slack' | 'email' | 'pagerduty' | 'webhook';
  config: Record<string, any>;
}

export interface LoggingConfig {
  enabled: boolean;
  provider: 'cloudwatch' | 'elasticsearch' | 'loki';
  retention: number;
}

// MCP Tool Response Types
export interface ToolResponse {
  content: ContentBlock[];
  isError?: boolean;
}

export interface ContentBlock {
  type: 'text' | 'resource';
  text?: string;
  resource?: {
    uri: string;
    mimeType?: string;
    text?: string;
  };
}

// Configuration Types
export interface DevOpsConfig {
  projectPath: string;
  outputDir?: string;
  awsRegion?: string;
  clusterName?: string;
  deploymentStrategy?: 'basic' | 'gitops' | 'blue-green' | 'canary';
  cicdProvider?: 'github-actions' | 'gitlab-ci' | 'jenkins';
  enableMonitoring?: boolean;
  enableLogging?: boolean;
  dryRun?: boolean;
}
