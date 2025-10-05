# Terraform Backend Setup

This directory contains the infrastructure code to set up the Terraform backend (S3 + DynamoDB).

## Purpose

Creates the required AWS resources for Terraform state management:
- **S3 Bucket**: Stores Terraform state files with versioning and encryption
- **DynamoDB Table**: Provides state locking to prevent concurrent modifications

## Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform 1.0+ installed
- AWS permissions to create S3 buckets and DynamoDB tables

## Setup Instructions

### 1. Initialize Terraform
```bash
cd backend-setup
terraform init
```

### 2. Review the Plan
```bash
terraform plan
```

### 3. Apply the Configuration
```bash
terraform apply
```

### 4. Note the Outputs
After apply completes, note the bucket name and DynamoDB table name. These should match:
- S3 Bucket: `mcp-devops-automation-terraform-state`
- DynamoDB Table: `mcp-devops-automation-terraform-lock`

## Using the Backend

After creating these resources, you can use them in your main Terraform configuration:

```hcl
terraform {
  backend "s3" {
    bucket         = "mcp-devops-automation-terraform-state"
    key            = "env/terraform.tfstate"  # Change per environment
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "mcp-devops-automation-terraform-lock"
  }
}
```

## Environment-Specific State Files

Use different state file keys for each environment:
- **Dev**: `dev/terraform.tfstate`
- **Staging**: `staging/terraform.tfstate`
- **Production**: `prod/terraform.tfstate`

## Security Features

- ✅ S3 bucket versioning enabled (state history)
- ✅ Server-side encryption (AES256)
- ✅ Public access blocked
- ✅ DynamoDB encryption at rest (AWS managed)

## Cost Considerations

- **S3**: Pay for storage and requests (minimal cost)
- **DynamoDB**: Pay-per-request billing (cost-effective for state locking)
- Estimated cost: <$5/month for typical usage

## Troubleshooting

### State Lock Issues
If you see "Error acquiring the state lock":
```bash
# Force unlock (use with caution!)
terraform force-unlock <LOCK_ID>
```

### Backend Already Exists
If resources already exist:
```bash
# Import existing resources
terraform import aws_s3_bucket.terraform_state mcp-devops-automation-terraform-state
terraform import aws_dynamodb_table.terraform_lock mcp-devops-automation-terraform-lock
```

## Cleanup

⚠️ **WARNING**: Only destroy if you're completely removing the infrastructure!

```bash
# This will delete state storage - ensure you have backups!
terraform destroy
```
