import type { ProjectAnalysis, ResourceRequirements, TerraformConfig } from '../types/index.js';

export class TerraformGenerator {
  generateTerraform(
    analysis: ProjectAnalysis,
    resources: ResourceRequirements,
    region: string = 'us-east-1'
  ): Record<string, string> {
    const projectName = analysis.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    return {
      'main.tf': this.generateMainTF(analysis, resources, region, projectName),
      'variables.tf': this.generateVariablesTF(projectName),
      'outputs.tf': this.generateOutputsTF(),
      'vpc.tf': this.generateVPCTF(projectName, region),
      'eks.tf': this.generateEKSTF(analysis, resources, projectName),
      'ecr.tf': this.generateECRTF(analysis, projectName),
      ...(resources.infrastructure.database.managed && {
        'rds.tf': this.generateRDSTF(analysis, projectName)
      }),
      'iam.tf': this.generateIAMTF(analysis, projectName),
      'terraform.tfvars': this.generateTFVars(region, projectName)
    };
  }

  private generateMainTF(
    analysis: ProjectAnalysis,
    resources: ResourceRequirements,
    region: string,
    projectName: string
  ): string {
    return `terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    bucket = "${projectName}-terraform-state"
    key    = "devops/terraform.tfstate"
    region = "${region}"
    encrypt = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "${projectName}"
      ManagedBy   = "Terraform"
      CreatedBy   = "MCP-DevOps-Automation"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {}
`;
  }

  private generateVariablesTF(projectName: string): string {
    return `variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "${projectName}-cluster"
}

variable "cluster_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.33"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnets"
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Use a single NAT Gateway for all AZs"
  type        = bool
  default     = false
}

variable "enable_dns_hostnames" {
  description = "Enable DNS hostnames in VPC"
  type        = bool
  default     = true
}

variable "enable_dns_support" {
  description = "Enable DNS support in VPC"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}
`;
  }

  private generateOutputsTF(): string {
    return `output "cluster_id" {
  description = "EKS cluster ID"
  value       = module.eks.cluster_id
}

output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.eks.cluster_security_group_id
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnets" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnets
}

output "ecr_repository_urls" {
  description = "ECR repository URLs"
  value       = { for k, v in aws_ecr_repository.repos : k => v.repository_url }
}

output "region" {
  description = "AWS region"
  value       = var.aws_region
}

output "account_id" {
  description = "AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}
`;
  }

  private generateVPCTF(projectName: string, region: string): string {
    return `module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${projectName}-vpc"
  cidr = var.vpc_cidr

  azs             = data.aws_availability_zones.available.names
  private_subnets = [for k, v in data.aws_availability_zones.available.names : cidrsubnet(var.vpc_cidr, 4, k)]
  public_subnets  = [for k, v in data.aws_availability_zones.available.names : cidrsubnet(var.vpc_cidr, 8, k + 48)]

  enable_nat_gateway   = var.enable_nat_gateway
  single_nat_gateway   = var.single_nat_gateway
  enable_dns_hostnames = var.enable_dns_hostnames
  enable_dns_support   = var.enable_dns_support

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
    "kubernetes.io/cluster/\${var.cluster_name}" = "shared"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
    "kubernetes.io/cluster/\${var.cluster_name}" = "shared"
  }

  tags = merge(
    var.tags,
    {
      "kubernetes.io/cluster/\${var.cluster_name}" = "shared"
    }
  )
}
`;
  }

  private generateEKSTF(
    analysis: ProjectAnalysis,
    resources: ResourceRequirements,
    projectName: string
  ): string {
    const nodeType = resources.infrastructure.kubernetes.nodeType;
    const nodeCount = resources.infrastructure.kubernetes.nodeCount;

    return `module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  cluster_endpoint_public_access = true

  # EKS Auto Mode Configuration
  cluster_compute_config = {
    enabled    = true
    node_pools = ["general-purpose", "system"]
  }

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # Managed node groups
  eks_managed_node_groups = {
    main = {
      name            = "${projectName}-node-group"
      use_name_prefix = true

      instance_types = ["${nodeType}"]
      capacity_type  = "ON_DEMAND"

      min_size     = ${Math.max(2, Math.floor(nodeCount / 2))}
      max_size     = ${nodeCount * 2}
      desired_size = ${nodeCount}

      disk_size = 50

      labels = {
        Environment = var.environment
        WorkloadType = "general"
      }

      tags = {
        Name = "${projectName}-node-group"
      }
    }
  }

  # Cluster access entry
  enable_cluster_creator_admin_permissions = true

  tags = var.tags
}

# Install essential add-ons
resource "aws_eks_addon" "vpc_cni" {
  cluster_name = module.eks.cluster_name
  addon_name   = "vpc-cni"
  addon_version = "v1.18.3-eksbuild.3"
}

resource "aws_eks_addon" "coredns" {
  cluster_name = module.eks.cluster_name
  addon_name   = "coredns"
  addon_version = "v1.11.3-eksbuild.1"

  depends_on = [module.eks.eks_managed_node_groups]
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name = module.eks.cluster_name
  addon_name   = "kube-proxy"
  addon_version = "v1.33.0-eksbuild.2"
}

# Install AWS Load Balancer Controller
resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.8.0"

  set {
    name  = "clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "serviceAccount.create"
    value = "true"
  }

  set {
    name  = "serviceAccount.annotations.eks\\\\.amazonaws\\\\.com/role-arn"
    value = aws_iam_role.aws_load_balancer_controller.arn
  }

  depends_on = [module.eks]
}

# Install NGINX Ingress Controller
resource "helm_release" "nginx_ingress" {
  name       = "ingress-nginx"
  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
  namespace  = "ingress-nginx"
  create_namespace = true
  version    = "4.11.0"

  set {
    name  = "controller.service.type"
    value = "LoadBalancer"
  }

  set {
    name  = "controller.metrics.enabled"
    value = "true"
  }

  depends_on = [module.eks]
}

# Install ArgoCD
resource "helm_release" "argocd" {
  name       = "argocd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  namespace  = "argocd"
  create_namespace = true
  version    = "7.0.0"

  set {
    name  = "server.service.type"
    value = "LoadBalancer"
  }

  depends_on = [module.eks]
}
`;
  }

  private generateECRTF(analysis: ProjectAnalysis, projectName: string): string {
    const repos = analysis.services.map(s => s.name);

    return `# ECR Repositories for all services
resource "aws_ecr_repository" "repos" {
  for_each = toset([
${repos.map(r => `    "${r}"`).join(',\n')}
  ])

  name                 = "\${var.cluster_name}/\${each.value}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(
    var.tags,
    {
      Service = each.value
    }
  )
}

# ECR Lifecycle Policy
resource "aws_ecr_lifecycle_policy" "repos_policy" {
  for_each = aws_ecr_repository.repos

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 30 images"
        selection = {
          tagStatus     = "any"
          countType     = "imageCountMoreThan"
          countNumber   = 30
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
`;
  }

  private generateRDSTF(analysis: ProjectAnalysis, projectName: string): string {
    const dbType = analysis.databases.find(d => d.type !== 'redis')?.type || 'postgresql';

    return `# RDS Database
resource "aws_db_subnet_group" "main" {
  name       = "${projectName}-db-subnet"
  subnet_ids = module.vpc.private_subnets

  tags = {
    Name = "${projectName}-db-subnet"
  }
}

resource "aws_security_group" "rds" {
  name        = "${projectName}-rds-sg"
  description = "Security group for RDS database"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.cluster_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${projectName}-rds-sg"
  }
}

resource "aws_db_instance" "main" {
  identifier     = "${projectName}-db"
  engine         = "${dbType}"
  engine_version = "${dbType === 'postgresql' ? '16.3' : '8.0'}"
  instance_class = "db.t3.small"

  allocated_storage     = 50
  max_allocated_storage = 100
  storage_encrypted     = true

  db_name  = "${projectName.replace(/-/g, '_')}"
  username = "admin"
  password = random_password.db_password.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az               = true
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  skip_final_snapshot = false
  final_snapshot_identifier = "${projectName}-final-snapshot-\${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = {
    Name = "${projectName}-database"
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name = "${projectName}/database/credentials"
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = aws_db_instance.main.username
    password = random_password.db_password.result
    engine   = aws_db_instance.main.engine
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name
  })
}
`;
  }

  private generateIAMTF(analysis: ProjectAnalysis, projectName: string): string {
    return `# IAM Role for AWS Load Balancer Controller
resource "aws_iam_role" "aws_load_balancer_controller" {
  name = "${projectName}-aws-lb-controller"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = module.eks.oidc_provider_arn
      }
      Condition = {
        StringEquals = {
          "\${module.eks.oidc_provider}:sub" = "system:serviceaccount:kube-system:aws-load-balancer-controller"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "aws_load_balancer_controller" {
  policy_arn = "arn:aws:iam::aws:policy/AWSLoadBalancerControllerIAMPolicy"
  role       = aws_iam_role.aws_load_balancer_controller.name
}

# IAM Roles for each service (IRSA)
${analysis.services.map(service => `
resource "aws_iam_role" "${service.name}" {
  name = "${projectName}-${service.name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = module.eks.oidc_provider_arn
      }
      Condition = {
        StringEquals = {
          "\${module.eks.oidc_provider}:sub" = "system:serviceaccount:${projectName}:${service.name}"
        }
      }
    }]
  })

  tags = {
    Service = "${service.name}"
  }
}

# Basic policy for ${service.name}
resource "aws_iam_role_policy" "${service.name}" {
  name = "${service.name}-policy"
  role = aws_iam_role.${service.name}.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "*"
      }
    ]
  })
}
`).join('\n')}
`;
  }

  private generateTFVars(region: string, projectName: string): string {
    return `aws_region     = "${region}"
environment    = "production"
cluster_name   = "${projectName}-cluster"
cluster_version = "1.33"
vpc_cidr       = "10.0.0.0/16"

enable_nat_gateway = true
single_nat_gateway = false

tags = {
  Terraform   = "true"
  Environment = "production"
  Project     = "${projectName}"
}
`;
  }
}
