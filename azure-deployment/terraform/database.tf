
# Azure Database for PostgreSQL
resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "mcp-devops-automation-postgres"
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
  name      = "mcp-devops-automation_db"
  server_id = azurerm_postgresql_flexible_server.main.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

# Random password for databases
resource "random_password" "db_password" {
  length  = 16
  special = true
}
