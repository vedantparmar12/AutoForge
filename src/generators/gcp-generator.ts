import type { ProjectAnalysis, ResourceRequirements } from '../types/index.js';

export class GCPGenerator {
  generateGCPTerraform(
    analysis: ProjectAnalysis,
    resources: ResourceRequirements,
    region: string = 'us-central1'
  ): Record<string, string> {
    const files: Record<string, string> = {};

    files['main.tf'] = this.generateMainTerraform(analysis, region);
    files['variables.tf'] = this.generateVariables(analysis);
    files['gke.tf'] = this.generateGKE(analysis, resources, region);
    files['gcr.tf'] = this.generateGCR(analysis);
    files['database.tf'] = this.generateDatabase(analysis, region);
    files['networking.tf'] = this.generateNetworking(region);
    files['outputs.tf'] = this.generateOutputs();

    return files;
  }

  private generateMainTerraform(analysis: ProjectAnalysis, region: string): string {
    return `terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = "${region}"
}

# Enable required APIs
resource "google_project_service" "container" {
  service            = "container.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "compute" {
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "sqladmin" {
  service            = "sqladmin.googleapis.com"
  disable_on_destroy = false
}
`;
  }

  private generateVariables(analysis: ProjectAnalysis): string {
    return `variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "${analysis.projectName}"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "node_count" {
  description = "Number of GKE nodes"
  type        = number
  default     = 3
}

variable "machine_type" {
  description = "Machine type for GKE nodes"
  type        = string
  default     = "e2-standard-2"  # 2 vCPU, 8GB RAM
}
`;
  }

  private generateGKE(analysis: ProjectAnalysis, resources: ResourceRequirements, region: string): string {
    return `# Google Kubernetes Engine (GKE)
resource "google_container_cluster" "primary" {
  name     = "${analysis.projectName}-gke"
  location = var.region

  # We can't create a cluster with no node pool, so create smallest possible pool
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.subnet.name

  # Workload Identity
  workload_identity_config {
    workload_pool = "\${var.project_id}.svc.id.goog"
  }

  # Enable GKE Autopilot features
  release_channel {
    channel = "REGULAR"
  }

  # Network policy
  network_policy {
    enabled = true
  }

  # Binary authorization
  binary_authorization {
    evaluation_mode = "PROJECT_SINGLETON_POLICY_ENFORCE"
  }

  # Monitoring and logging
  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
    managed_prometheus {
      enabled = true
    }
  }

  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }

  depends_on = [
    google_project_service.container,
    google_project_service.compute
  ]
}

# Node pool
resource "google_container_node_pool" "primary_nodes" {
  name       = "${analysis.projectName}-node-pool"
  location   = var.region
  cluster    = google_container_cluster.primary.name
  node_count = var.node_count

  autoscaling {
    min_node_count = 2
    max_node_count = 10
  }

  node_config {
    preemptible  = false
    machine_type = var.machine_type

    # Google recommends custom service accounts with minimal permissions
    service_account = google_service_account.gke_nodes.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      environment = var.environment
      project     = var.project_name
    }

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    disk_size_gb = 50
    disk_type    = "pd-standard"
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# Service account for GKE nodes
resource "google_service_account" "gke_nodes" {
  account_id   = "${analysis.projectName}-gke-sa"
  display_name = "GKE Node Service Account"
}

# IAM binding for Artifact Registry
resource "google_project_iam_member" "gke_artifactregistry" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:\${google_service_account.gke_nodes.email}"
}
`;
  }

  private generateGCR(analysis: ProjectAnalysis): string {
    return `# Artifact Registry (replaces deprecated GCR)
resource "google_artifact_registry_repository" "main" {
  location      = var.region
  repository_id = "${analysis.projectName}-repo"
  description   = "Docker repository for ${analysis.projectName}"
  format        = "DOCKER"

  docker_config {
    immutable_tags = false
  }
}

${analysis.services.map(service => `
# Container images for ${service.name} will be pushed to:
# \${var.region}-docker.pkg.dev/\${var.project_id}/${analysis.projectName}-repo/${service.name}:latest
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
# Cloud SQL for PostgreSQL
resource "google_sql_database_instance" "postgres" {
  name             = "${analysis.projectName}-postgres"
  database_version = "POSTGRES_14"
  region           = var.region

  settings {
    tier              = "db-f1-micro"  # 0.6GB RAM, shared CPU
    availability_type = "ZONAL"        # Use REGIONAL for HA
    disk_size         = 10
    disk_type         = "PD_SSD"

    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }
  }

  deletion_protection = false

  depends_on = [google_project_service.sqladmin]
}

resource "google_sql_database" "database" {
  name     = "${analysis.projectName}_db"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "user" {
  name     = "dbadmin"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
}
`;
    }

    if (hasRedis) {
      tf += `
# Memorystore for Redis
resource "google_redis_instance" "cache" {
  name           = "${analysis.projectName}-redis"
  tier           = "BASIC"
  memory_size_gb = 1
  region         = var.region

  authorized_network = google_compute_network.vpc.id
  redis_version      = "REDIS_6_X"
}
`;
    }

    if (hasMongo) {
      tf += `
# MongoDB Atlas or self-hosted on GKE
# GCP doesn't have managed MongoDB, recommend MongoDB Atlas or deploy via Helm
# See: https://www.mongodb.com/cloud/atlas/gcp
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
    return `# VPC Network
resource "google_compute_network" "vpc" {
  name                    = "\${var.project_name}-vpc"
  auto_create_subnetworks = false
}

# Subnet for GKE
resource "google_compute_subnetwork" "subnet" {
  name          = "\${var.project_name}-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/16"
  }

  private_ip_google_access = true
}

# Cloud Router for NAT
resource "google_compute_router" "router" {
  name    = "\${var.project_name}-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

# Cloud NAT for outbound internet access
resource "google_compute_router_nat" "nat" {
  name                               = "\${var.project_name}-nat"
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

# Firewall rules
resource "google_compute_firewall" "allow_internal" {
  name    = "\${var.project_name}-allow-internal"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = ["10.0.0.0/8"]
}
`;
  }

  private generateOutputs(): string {
    return `output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "gke_cluster_name" {
  value = google_container_cluster.primary.name
}

output "gke_cluster_endpoint" {
  value     = google_container_cluster.primary.endpoint
  sensitive = true
}

output "artifact_registry_repository" {
  value = google_artifact_registry_repository.main.name
}

output "database_connection_info" {
  value = {
    postgres_connection_name = try(google_sql_database_instance.postgres.connection_name, "N/A")
    postgres_ip              = try(google_sql_database_instance.postgres.private_ip_address, "N/A")
    redis_host               = try(google_redis_instance.cache.host, "N/A")
  }
  sensitive = true
}

# Connection command
output "kubectl_connection_command" {
  value = "gcloud container clusters get-credentials \${google_container_cluster.primary.name} --region \${var.region} --project \${var.project_id}"
}
`;
  }

  estimateCosts(resources: ResourceRequirements): {
    monthly: Record<string, number>;
    currency: string;
  } {
    // GCP pricing estimates (us-central1)
    const nodeCount = resources.infrastructure?.kubernetes?.nodeCount || 3;

    const costs = {
      gke_control_plane: 73, // Standard cluster
      compute: nodeCount * 49, // e2-standard-2 ~$49/month each
      storage: 8,
      networking: 15,
      artifact_registry: 0.5, // $0.10/GB
      database: 25, // db-f1-micro
      redis: 30, // Memorystore BASIC 1GB
      total: 0,
    };

    costs.total = Object.values(costs).reduce((sum, cost) => sum + cost, 0);

    return {
      monthly: costs,
      currency: 'USD',
    };
  }
}
