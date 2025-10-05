# Staging Environment Configuration
aws_region     = "us-east-1"
environment    = "staging"
cluster_name   = "mcp-devops-automation-staging-cluster"
cluster_version = "1.33"
vpc_cidr       = "10.2.0.0/16"

# Moderate redundancy for staging
enable_nat_gateway = true
single_nat_gateway = false

tags = {
  Terraform   = "true"
  Environment = "staging"
  Project     = "mcp-devops-automation"
  CostCenter  = "staging"
}
