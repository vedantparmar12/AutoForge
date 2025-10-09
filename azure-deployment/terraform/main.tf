terraform {
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
  name     = "mcp-devops-automation-rg"
  location = "eastus"

  tags = {
    Environment = "production"
    Project     = "mcp-devops-automation"
    ManagedBy   = "Terraform"
  }
}
