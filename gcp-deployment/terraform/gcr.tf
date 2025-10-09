# Artifact Registry (replaces deprecated GCR)
resource "google_artifact_registry_repository" "main" {
  location      = var.region
  repository_id = "mcp-devops-automation-repo"
  description   = "Docker repository for mcp-devops-automation"
  format        = "DOCKER"

  docker_config {
    immutable_tags = false
  }
}


# Container images for analyzers will be pushed to:
# ${var.region}-docker.pkg.dev/${var.project_id}/mcp-devops-automation-repo/analyzers:latest


# Container images for calculators will be pushed to:
# ${var.region}-docker.pkg.dev/${var.project_id}/mcp-devops-automation-repo/calculators:latest


# Container images for generators will be pushed to:
# ${var.region}-docker.pkg.dev/${var.project_id}/mcp-devops-automation-repo/generators:latest


# Container images for tools will be pushed to:
# ${var.region}-docker.pkg.dev/${var.project_id}/mcp-devops-automation-repo/tools:latest


# Container images for types will be pushed to:
# ${var.region}-docker.pkg.dev/${var.project_id}/mcp-devops-automation-repo/types:latest

