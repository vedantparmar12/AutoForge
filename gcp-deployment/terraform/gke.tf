# Google Kubernetes Engine (GKE)
resource "google_container_cluster" "primary" {
  name     = "mcp-devops-automation-gke"
  location = var.region

  # We can't create a cluster with no node pool, so create smallest possible pool
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.subnet.name

  # Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
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
  name       = "mcp-devops-automation-node-pool"
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
  account_id   = "mcp-devops-automation-gke-sa"
  display_name = "GKE Node Service Account"
}

# IAM binding for Artifact Registry
resource "google_project_iam_member" "gke_artifactregistry" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}
