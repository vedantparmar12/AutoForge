import type { ProjectAnalysis, ResourceRequirements } from '../types/index.js';

export class AzureGenerator {
  generateAzureTerraform(
    analysis: ProjectAnalysis,
    resources: ResourceRequirements,
    region: string = 'eastus'
  ): Record<string, string> {
    const files: Record<string, string> = {};

    files['main.tf'] = this.generateMainTerraform(analysis, region);
    files['variables.tf'] = this.generateVariables(analysis);
    files['aks.tf'] = this.generateAKS(analysis, resources, region);
    files['acr.tf'] = this.generateACR(analysis);
    files['database.tf'] = this.generateDatabase(analysis, region);
    files['networking.tf'] = this.generateNetworking(region);
    files['outputs.tf'] = this.generateOutputs();

    return files;
  }

  private generateMainTerraform(analysis: ProjectAnalysis, region: string): string {
    return `terraform {
  required_version = ">= 1.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = "${analysis.projectName}-rg"
  location = "${region}"

  tags = {
    Environment = "production"
    Project     = "${analysis.projectName}"
    ManagedBy   = "Terraform"
  }
}
`;
  }

  private generateVariables(analysis: ProjectAnalysis): string {
    return `variable "project_name" {
  description = "Project name"
  type        = string
  default     = "${analysis.projectName}"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.28"
}

variable "node_count" {
  description = "Number of AKS nodes"
  type        = number
  default     = 3
}

variable "vm_size" {
  description = "VM size for AKS nodes"
  type        = string
  default     = "Standard_D2s_v3"  # 2 vCPU, 8GB RAM
}
`;
  }

  private generateAKS(analysis: ProjectAnalysis, resources: ResourceRequirements, region: string): string {
    return `# Azure Kubernetes Service (AKS)
resource "azurerm_kubernetes_cluster" "main" {
  name                = "${analysis.projectName}-aks"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = "${analysis.projectName}"
  kubernetes_version  = var.kubernetes_version

  default_node_pool {
    name                = "default"
    node_count          = var.node_count
    vm_size             = var.vm_size
    os_disk_size_gb     = 50
    vnet_subnet_id      = azurerm_subnet.aks.id
    enable_auto_scaling = true
    min_count           = 2
    max_count           = 10
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin    = "azure"
    load_balancer_sku = "standard"
    network_policy    = "calico"
  }

  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  }

  azure_policy_enabled = true

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# Log Analytics Workspace for monitoring
resource "azurerm_log_analytics_workspace" "main" {
  name                = "${analysis.projectName}-logs"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

# Role assignment for ACR pull
resource "azurerm_role_assignment" "aks_acr" {
  principal_id         = azurerm_kubernetes_cluster.main.kubelet_identity[0].object_id
  role_definition_name = "AcrPull"
  scope                = azurerm_container_registry.main.id
}
`;
  }

  private generateACR(analysis: ProjectAnalysis): string {
    return `# Azure Container Registry (ACR)
resource "azurerm_container_registry" "main" {
  name                = "\${var.project_name}acr"  # Must be globally unique
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Standard"
  admin_enabled       = true

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

${analysis.services.map(service => `
# ACR repository for ${service.name}
# Images will be pushed to: \${azurerm_container_registry.main.login_server}/${service.name}:latest
`).join('\n')}
`;
  }

  private generateDatabase(analysis: ProjectAnalysis, region: string): string {
    const hasPostgres = analysis.databases.some(db => db.type === 'postgresql');
    const hasMongo = analysis.databases.some(db => db.type === 'mongodb');
    const hasRedis = analysis.databases.some(db => db.type === 'redis');

    let tf = '';

    if (hasPostgres) {
      tf += `
# Azure Database for PostgreSQL
resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "${analysis.projectName}-postgres"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "14"
  administrator_login    = "psqladmin"
  administrator_password = random_password.db_password.result

  storage_mb = 32768
  sku_name   = "B_Standard_B1ms"  # Burstable, 1 vCore, 2GB RAM

  backup_retention_days = 7
  geo_redundant_backup_enabled = false

  high_availability {
    mode = "Disabled"
  }
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = "${analysis.projectName}_db"
  server_id = azurerm_postgresql_flexible_server.main.id
  collation = "en_US.utf8"
  charset   = "utf8"
}
`;
    }

    if (hasRedis) {
      tf += `
# Azure Cache for Redis
resource "azurerm_redis_cache" "main" {
  name                = "${analysis.projectName}-redis"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  capacity            = 0
  family              = "C"
  sku_name            = "Basic"
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"
}
`;
    }

    if (hasMongo) {
      tf += `
# Azure Cosmos DB (MongoDB API)
resource "azurerm_cosmosdb_account" "main" {
  name                = "${analysis.projectName}-cosmos"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  offer_type          = "Standard"
  kind                = "MongoDB"

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = azurerm_resource_group.main.location
    failover_priority = 0
  }

  capabilities {
    name = "EnableMongo"
  }
}
`;
    }

    tf += `
# Random password for databases
resource "random_password" "db_password" {
  length  = 16
  special = true
}
`;

    return tf;
  }

  private generateNetworking(region: string): string {
    return `# Virtual Network
resource "azurerm_virtual_network" "main" {
  name                = "\${var.project_name}-vnet"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = ["10.0.0.0/16"]
}

# AKS Subnet
resource "azurerm_subnet" "aks" {
  name                 = "aks-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]
}

# Database Subnet
resource "azurerm_subnet" "database" {
  name                 = "database-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/24"]

  delegation {
    name = "postgres-delegation"
    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
    }
  }
}

# Network Security Group
resource "azurerm_network_security_group" "aks" {
  name                = "\${var.project_name}-nsg"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  security_rule {
    name                       = "allow-https"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}
`;
  }

  private generateOutputs(): string {
    return `output "resource_group_name" {
  value = azurerm_resource_group.main.name
}

output "aks_cluster_name" {
  value = azurerm_kubernetes_cluster.main.name
}

output "aks_kubeconfig" {
  value     = azurerm_kubernetes_cluster.main.kube_config_raw
  sensitive = true
}

output "acr_login_server" {
  value = azurerm_container_registry.main.login_server
}

output "acr_admin_username" {
  value     = azurerm_container_registry.main.admin_username
  sensitive = true
}

output "acr_admin_password" {
  value     = azurerm_container_registry.main.admin_password
  sensitive = true
}

output "database_connection_info" {
  value = {
    postgres_host = try(azurerm_postgresql_flexible_server.main.fqdn, "N/A")
    redis_host    = try(azurerm_redis_cache.main.hostname, "N/A")
  }
  sensitive = true
}
`;
  }

  estimateCosts(resources: ResourceRequirements): {
    monthly: Record<string, number>;
    currency: string;
  } {
    // Azure pricing estimates (US East, pay-as-you-go)
    const nodeCount = resources.infrastructure?.kubernetes?.nodeCount || 3;

    const costs = {
      aks_control_plane: 0, // Free tier
      compute: nodeCount * 70, // Standard_D2s_v3 ~$70/month each
      storage: 10,
      networking: 20,
      acr: 5, // Standard tier
      database: 45, // B_Standard_B1ms
      redis: 15, // Basic C0
      total: 0,
    };

    costs.total = Object.values(costs).reduce((sum, cost) => sum + cost, 0);

    return {
      monthly: costs,
      currency: 'USD',
    };
  }
}
