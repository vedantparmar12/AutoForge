
# Cloud SQL for PostgreSQL
resource "google_sql_database_instance" "postgres" {
  name             = "mcp-devops-automation-postgres"
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
  name     = "mcp-devops-automation_db"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "user" {
  name     = "dbadmin"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
}

# Memorystore for Redis
resource "google_redis_instance" "cache" {
  name           = "mcp-devops-automation-redis"
  tier           = "BASIC"
  memory_size_gb = 1
  region         = var.region

  authorized_network = google_compute_network.vpc.id
  redis_version      = "REDIS_6_X"
}

# Random password for databases
resource "random_password" "db_password" {
  length  = 16
  special = true
}
