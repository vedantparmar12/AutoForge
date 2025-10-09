# Azure Container Registry (ACR)
resource "azurerm_container_registry" "main" {
  name                = "${var.project_name}acr"  # Must be globally unique
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Standard"
  admin_enabled       = true

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}


# ACR repository for analyzers
# Images will be pushed to: ${azurerm_container_registry.main.login_server}/analyzers:latest


# ACR repository for calculators
# Images will be pushed to: ${azurerm_container_registry.main.login_server}/calculators:latest


# ACR repository for generators
# Images will be pushed to: ${azurerm_container_registry.main.login_server}/generators:latest


# ACR repository for tools
# Images will be pushed to: ${azurerm_container_registry.main.login_server}/tools:latest


# ACR repository for types
# Images will be pushed to: ${azurerm_container_registry.main.login_server}/types:latest

