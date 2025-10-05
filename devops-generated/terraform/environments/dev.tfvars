# Development Environment Configuration
aws_region     = "us-east-1"
environment    = "dev"
cluster_name   = "mcp-devops-automation-dev-cluster"
cluster_version = "1.33"
vpc_cidr       = "10.1.0.0/16"

# Cost optimization for dev
enable_nat_gateway = true
single_nat_gateway = true  # Single NAT to save costs

tags = {
  Terraform   = "true"
  Environment = "dev"
  Project     = "mcp-devops-automation"
  CostCenter  = "development"
}
