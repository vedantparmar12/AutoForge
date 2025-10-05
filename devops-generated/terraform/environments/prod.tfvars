# Production Environment Configuration
aws_region     = "us-east-1"
environment    = "production"
cluster_name   = "mcp-devops-automation-prod-cluster"
cluster_version = "1.33"
vpc_cidr       = "10.0.0.0/16"

# Full redundancy for production
enable_nat_gateway = true
single_nat_gateway = false

tags = {
  Terraform   = "true"
  Environment = "production"
  Project     = "mcp-devops-automation"
  CostCenter  = "production"
}
