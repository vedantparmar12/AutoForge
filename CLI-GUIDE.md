# DevOps CLI User Guide

## Table of Contents
- [Introduction](#introduction)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Interactive Mode](#interactive-mode)
- [Commands Reference](#commands-reference)
- [Features](#features)
- [Configuration](#configuration)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Introduction

The DevOps CLI is a comprehensive command-line tool that automates the entire DevOps lifecycle, from project analysis to deployment across multiple cloud providers. It provides both interactive and command-line interfaces for managing deployments, environments, costs, and infrastructure.

### Key Features

- 🚀 **One-Click Deployments** - Deploy to AWS, Azure, or GCP with a single command
- 🐳 **Local Development** - Generate docker-compose files for local development
- 💰 **Cost Management** - Track and optimize cloud costs with budgets and alerts
- 🔄 **Environment Management** - Manage dev/staging/prod environments
- 📜 **Deployment History** - Track all deployments with rollback capabilities
- ⚡ **Preflight Checks** - Validate your environment before deployment
- 🎯 **Interactive Mode** - User-friendly guided interface

## Installation

### Prerequisites

- Node.js 16+ 
- npm or yarn
- Docker (for containerization features)
- Cloud CLI tools (AWS CLI, Azure CLI, or gcloud) for cloud deployments

### Install the CLI

```bash
npm install -g mcp-devops-automation
```

Or run directly with npx:

```bash
npx mcp-devops-automation
```

### Verify Installation

```bash
devops-cli --version
# or
devops-cli --help
```

## Quick Start

### 1. Interactive Mode (Recommended for beginners)

```bash
devops-cli interactive
# or
devops-cli i
```

This launches the interactive menu where you can:
- Analyze your project
- Set up local development
- Deploy to cloud
- Manage environments
- Check costs and budgets

### 2. Analyze Your Project

```bash
devops-cli analyze /path/to/your/project
```

### 3. Set Up Local Development

```bash
devops-cli local-setup /path/to/your/project
```

### 4. Deploy to Cloud

```bash
devops-cli deploy /path/to/your/project --cloud aws --environment dev
```

## Interactive Mode

The interactive mode provides a user-friendly interface with the following options:

```
🚀 DevOps Automation CLI - Interactive Mode

? What would you like to do? (Use arrow keys)
❯ 📊 Analyze Project
  🚀 Deploy to Cloud  
  🐳 Setup Local Development
  💰 Check Cost Budget
  📜 View Deployment History
  ⏪ Rollback Deployment
  🔧 Manage Environments
  ❌ Exit
```

### Features in Interactive Mode

- **Guided Workflows** - Step-by-step prompts for complex operations
- **Smart Defaults** - Automatically detect optimal settings
- **Validation** - Real-time validation of inputs
- **Progress Tracking** - Visual feedback for long-running operations

## Commands Reference

### Project Analysis

```bash
# Analyze current directory
devops-cli analyze .

# Analyze specific project
devops-cli analyze /path/to/project

# Save analysis to file
devops-cli analyze /path/to/project --output analysis.json
```

**Output includes:**
- Languages and frameworks detected
- Services and dependencies
- Architecture complexity
- Recommended configurations

### Deployment Commands

#### Deploy to Cloud

```bash
# Basic deployment
devops-cli deploy /path/to/project

# Deploy to specific cloud and environment
devops-cli deploy /path/to/project --cloud aws --environment prod --region us-west-2

# Dry run (preview only)
devops-cli deploy /path/to/project --dry-run

# Force deployment (skip checks)
devops-cli deploy /path/to/project --force
```

**Options:**
- `--environment, -e`: Target environment (dev/staging/prod)
- `--cloud, -c`: Cloud provider (aws/azure/gcp)
- `--region, -r`: Cloud region
- `--dry-run`: Preview deployment without executing
- `--force`: Skip safety checks

#### Rollback Deployment

```bash
# Rollback to specific deployment
devops-cli rollback dep-1234567890-abc123 --environment prod

# Interactive rollback (shows recent deployments)
devops-cli rollback --interactive
```

### Local Development

```bash
# Generate docker-compose files
devops-cli local-setup /path/to/project

# Specify output directory
devops-cli local-setup /path/to/project --output ./docker

# Include development tools (pgAdmin, Redis Commander, etc.)
devops-cli local-setup /path/to/project --dev-tools
```

**Generated files:**
- `docker-compose.yml` - Main configuration
- `docker-compose.dev.yml` - Development overrides
- `Dockerfile` - Application container
- `.dockerignore` - Docker ignore rules
- `.env.local` - Environment variables
- `dev-start.sh` - Startup script
- `dev-stop.sh` - Shutdown script

### Environment Management

```bash
# List environments
devops-cli environments list

# Create environment
devops-cli environments create --name staging --cloud aws --region us-east-1

# Update environment
devops-cli environments update staging --description "Staging environment"

# Delete environment
devops-cli environments delete staging

# Clone environment
devops-cli environments clone prod staging --region us-west-2
```

**Interactive Environment Management:**
```bash
devops-cli interactive
# Select: 🔧 Manage Environments
```

### Deployment History

```bash
# View all deployments
devops-cli history

# Filter by environment
devops-cli history --environment prod

# Filter by project
devops-cli history /path/to/project

# Limit results
devops-cli history --limit 5

# Export history
devops-cli history --export deployments.json
```

### Cost Management

```bash
# Check current budget status
devops-cli cost-budget

# Set budget
devops-cli cost-budget --set 500

# Check cost for project
devops-cli cost-budget --check /path/to/project

# View cost alerts
devops-cli cost-budget --alerts

# Compare costs across providers
devops-cli cost-compare /path/to/project
```

### Preflight Checks

```bash
# Run all preflight checks
devops-cli preflight

# Quick check (essential only)
devops-cli preflight --quick

# Check specific cloud provider
devops-cli preflight --cloud aws

# Generate report
devops-cli preflight --report preflight-report.md
```

## Features

### 🐳 Docker Compose Generation

Automatically generates complete docker-compose setups including:

- **Application Services** - Based on detected frameworks
- **Databases** - PostgreSQL, MySQL, MongoDB
- **Caching** - Redis, Memcached
- **Message Queues** - RabbitMQ, Kafka
- **Development Tools** - pgAdmin, Redis Commander, Mailhog
- **Networking** - Custom networks and load balancing

**Example output:**
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
    depends_on:
      - postgres
      - redis
  
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: devdb
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
```

### 💰 Cost Budget System

#### Cost Estimation
- **Multi-Cloud Support** - Compare costs across AWS, Azure, GCP
- **Detailed Breakdown** - Instance, storage, networking costs
- **Resource Optimization** - Suggestions to reduce costs

#### Budget Management
- **Flexible Budgets** - Daily, weekly, monthly limits
- **Smart Alerts** - Email, Slack, webhook notifications
- **Auto-Shutdown** - Prevent cost overruns
- **Cost Tracking** - Historical cost analysis

#### Example Cost Report
```
AWS Cost Estimate for my-project:
┌─────────────────────────┬─────────────┬──────────────┐
│ Service                 │ Monthly Cost│ Usage        │
├─────────────────────────┼─────────────┼──────────────┤
│ EC2 t3.medium          │ $29.95      │ 720 hours    │
│ RDS t3.micro           │ $12.24      │ 720 hours    │
│ EBS GP3 Storage        │ $4.80       │ 60 GB        │
│ Application Load Bal... │ $16.20      │ 720 hours    │
│ NAT Gateway            │ $32.40      │ 720 hours    │
├─────────────────────────┼─────────────┼──────────────┤
│ Total                  │ $95.59      │              │
└─────────────────────────┴─────────────┴──────────────┘
```

### 🔄 Environment Management

#### Environment Templates
- **Development** - Minimal resources, debugging enabled
- **Staging** - Production-like, with monitoring
- **Production** - High availability, security enabled

#### Environment Features
- **Variable Management** - Environment-specific configuration
- **Secret Management** - Encrypted secret storage
- **Resource Quotas** - Prevent resource abuse
- **Promotion Workflows** - Safe environment promotion

#### Example Environment Configuration
```json
{
  "name": "production",
  "cloud": "aws",
  "region": "us-east-1",
  "config": {
    "cpu": "2",
    "memory": "4Gi",
    "storage": "100Gi",
    "database": {
      "type": "postgres",
      "size": "large",
      "backup": true
    }
  },
  "variables": {
    "NODE_ENV": "production",
    "LOG_LEVEL": "error"
  }
}
```

### 📜 Deployment History & Rollbacks

#### Deployment Tracking
- **Complete History** - All deployments with metadata
- **Git Integration** - Commit hash, branch, author
- **Performance Metrics** - Build time, deployment duration
- **Resource Usage** - CPU, memory, storage consumed

#### Rollback Capabilities
- **Smart Rollbacks** - Automatic dependency checking
- **Safety Checks** - Prevent destructive rollbacks
- **Recovery Plans** - Automated recovery procedures
- **Traffic Management** - Blue-green, canary deployments

#### Example Deployment History
```
Recent Deployments:
┌──────────────┬─────────────┬───────┬────────────┬─────────────────────┐
│ ID           │ Environment │ Cloud │ Status     │ Date                │
├──────────────┼─────────────┼───────┼────────────┼─────────────────────┤
│ dep-16234... │ prod        │ aws   │ ✅ Success │ 2024-01-15 14:30:22 │
│ dep-16233... │ staging     │ aws   │ ✅ Success │ 2024-01-15 12:15:41 │
│ dep-16232... │ dev         │ aws   │ ❌ Failed  │ 2024-01-15 10:22:15 │
└──────────────┴─────────────┴───────┴────────────┴─────────────────────┘
```

### ⚡ Preflight Checks

Comprehensive system validation before deployment:

#### System Checks
- **Runtime Versions** - Node.js, Python, Java versions
- **Package Managers** - npm, yarn, pip availability
- **Version Control** - Git installation and configuration
- **System Resources** - Memory, disk space

#### Cloud Provider Checks
- **CLI Installation** - AWS CLI, Azure CLI, gcloud
- **Authentication** - Valid cloud credentials
- **Permissions** - Required IAM permissions
- **Quotas** - Service limits and availability

#### Kubernetes Checks
- **kubectl** - Client installation and configuration
- **Cluster Access** - Connection to Kubernetes cluster
- **Helm** - Package manager availability
- **Permissions** - RBAC and namespace access

## Configuration

### Global Configuration

The CLI stores configuration in `~/.devops-cli/`:

```
~/.devops-cli/
├── budget-config.json      # Cost budget settings
├── cost-history.json       # Historical cost data
├── deployment-history.json # Deployment records
├── environment-config.json # Environment settings
├── environments/           # Environment definitions
│   ├── dev.json
│   ├── staging.json
│   └── prod.json
└── templates/              # Environment templates
    ├── development.json
    ├── staging.json
    └── production.json
```

### Environment Variables

Configure CLI behavior with environment variables:

```bash
# Default cloud provider
export DEVOPS_CLI_CLOUD=aws

# Default region
export DEVOPS_CLI_REGION=us-east-1

# Default environment
export DEVOPS_CLI_ENVIRONMENT=dev

# Disable interactive prompts
export DEVOPS_CLI_NON_INTERACTIVE=true

# Enable debug logging
export DEVOPS_CLI_DEBUG=true
```

### Budget Configuration

```json
{
  "budgetLimit": 500,
  "currency": "USD",
  "period": "monthly",
  "alerts": [
    {
      "threshold": 80,
      "severity": "warning",
      "message": "Budget usage has reached 80%",
      "actions": ["email", "slack"]
    }
  ],
  "notifications": {
    "email": ["admin@company.com"],
    "slack": {
      "webhook": "https://hooks.slack.com/...",
      "channel": "#devops-alerts"
    }
  }
}
```

## Examples

### Complete Workflow Example

```bash
# 1. Create a new project
mkdir my-awesome-app && cd my-awesome-app
npm init -y
npm install express

# 2. Analyze the project
devops-cli analyze .

# 3. Set up local development
devops-cli local-setup . --dev-tools

# 4. Start local environment
./dev-start.sh

# 5. Create environments
devops-cli environments create --name dev --cloud aws --region us-east-1 --template development
devops-cli environments create --name prod --cloud aws --region us-east-1 --template production

# 6. Set budget
devops-cli cost-budget --set 200

# 7. Deploy to dev
devops-cli deploy . --environment dev --dry-run  # Preview first
devops-cli deploy . --environment dev            # Actually deploy

# 8. Check deployment
devops-cli history --environment dev

# 9. Deploy to production
devops-cli deploy . --environment prod

# 10. Monitor costs
devops-cli cost-budget
```

### Multi-Environment Deployment

```bash
# Create multiple environments
for env in dev staging prod; do
  devops-cli environments create \
    --name $env \
    --cloud aws \
    --region us-east-1 \
    --template $env
done

# Deploy to all environments
for env in dev staging prod; do
  echo "Deploying to $env..."
  devops-cli deploy . --environment $env
  
  # Wait for deployment to complete
  sleep 60
  
  # Check status
  devops-cli history --environment $env --limit 1
done
```

### Cost Optimization Workflow

```bash
# Compare costs across providers
devops-cli cost-compare . > cost-comparison.txt

# Set up budget alerts
devops-cli cost-budget --set 300
devops-cli cost-budget --alerts

# Monitor costs over time
devops-cli cost-budget --trends 30  # Last 30 days

# Get optimization suggestions
devops-cli cost-optimize .
```

### Disaster Recovery Setup

```bash
# Set up production environment
devops-cli environments create \
  --name prod \
  --cloud aws \
  --region us-east-1 \
  --template production

# Create disaster recovery environment
devops-cli environments clone prod prod-dr --region us-west-2

# Deploy to both regions
devops-cli deploy . --environment prod
devops-cli deploy . --environment prod-dr

# Set up automated backups and monitoring
devops-cli backup --environment prod --schedule daily
devops-cli backup --environment prod-dr --schedule daily
```

## Troubleshooting

### Common Issues

#### "Command not found"
```bash
# Make sure the CLI is installed globally
npm install -g mcp-devops-automation

# Or use npx
npx mcp-devops-automation --help
```

#### "Docker daemon not running"
```bash
# Start Docker Desktop or daemon
sudo systemctl start docker  # Linux
# or restart Docker Desktop on Mac/Windows
```

#### "Cloud authentication failed"
```bash
# Configure AWS CLI
aws configure

# Configure Azure CLI
az login

# Configure Google Cloud CLI
gcloud auth login
```

#### "Deployment failed"
```bash
# Run preflight checks
devops-cli preflight --cloud aws

# Check deployment history
devops-cli history --limit 5

# Try with dry-run first
devops-cli deploy . --dry-run
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
export DEVOPS_CLI_DEBUG=true
devops-cli deploy . --environment dev
```

### Getting Help

```bash
# General help
devops-cli --help

# Command-specific help
devops-cli deploy --help
devops-cli environments --help

# Interactive mode (easiest for beginners)
devops-cli interactive
```

### Log Files

Check log files for detailed error information:

```bash
# On Unix/Linux/Mac
tail -f ~/.devops-cli/logs/devops-cli.log

# On Windows
type %USERPROFILE%\.devops-cli\logs\devops-cli.log
```

## Advanced Features

### Custom Templates

Create custom environment templates:

```bash
# Create new template
devops-cli templates create \
  --name custom-template \
  --description "Custom template for microservices" \
  --config config.json

# Use custom template
devops-cli environments create \
  --name my-env \
  --template custom-template
```

### Webhooks and Integrations

Set up webhooks for deployment notifications:

```bash
# Configure webhook URL
devops-cli config set webhook-url https://my-webhook.example.com/deployments

# Test webhook
devops-cli webhook test
```

### API Integration

Use the CLI programmatically:

```javascript
const { DevOpsTools } = require('mcp-devops-automation');

const devops = new DevOpsTools();

async function deployProject() {
  const analysis = await devops.analyzeProject('./my-project');
  const result = await devops.deployToAWS({
    projectPath: './my-project',
    environment: 'dev'
  });
  console.log('Deployment result:', result);
}
```

## Support

- **Documentation**: [GitHub Wiki](https://github.com/your-org/mcp-devops-automation/wiki)
- **Issues**: [GitHub Issues](https://github.com/your-org/mcp-devops-automation/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/mcp-devops-automation/discussions)
- **Discord**: [DevOps Community](https://discord.gg/devops-community)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.