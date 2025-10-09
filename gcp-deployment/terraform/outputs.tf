output "project_id" {
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
  value = "gcloud container clusters get-credentials ${google_container_cluster.primary.name} --region ${var.region} --project ${var.project_id}"
}
