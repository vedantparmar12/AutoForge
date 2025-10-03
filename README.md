# MCP DevOps Automation 🚀

**Automated DevOps lifecycle creation for any project - from analysis to AWS deployment**

An intelligent MCP (Model Context Protocol) server that analyzes your project, automatically determines optimal infrastructure requirements, and generates a complete DevOps setup including Kubernetes manifests, Terraform configurations, CI/CD pipelines, and deployment guides.

## 🌟 Features

- **🔍 Smart Project Analysis** - Automatically detects:
  - Languages, frameworks, and dependencies
  - Microservices architecture
  - Database requirements
  - Project complexity and size

- **📊 Intelligent Resource Calculation** - Determines optimal:
  - CPU and memory requirements per service
  - Replica counts and autoscaling policies
  - Infrastructure sizing (EKS nodes, RDS, etc.)
  - Monthly cost estimates

- **🎯 Complete DevOps Generation** - Creates:
  - Kubernetes manifests (Deployments, Services, Ingress, HPA, PDB)
  - Terraform AWS infrastructure (EKS, VPC, ECR, RDS, IAM)
  - CI/CD pipelines (GitHub Actions, GitLab CI)
  - ArgoCD GitOps configurations
  - Monitoring setup (Prometheus, Grafana)
  - Comprehensive deployment guides

- **☁️ AWS Deployment** - Supports:
  - Amazon EKS with Auto Mode
  - Private ECR repositories
  - Managed RDS/ElastiCache
  - Application Load Balancers
  - Full IAM/RBAC setup

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│           MCP DevOps Automation Server          │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────┐  ┌──────────────┐            │
│  │   Project   │  │   Resource   │            │
│  │   Analyzer  │→ │  Calculator  │            │
│  └─────────────┘  └──────────────┘            │
│         ↓                 ↓                     │
│  ┌─────────────────────────────────────────┐  │
│  │         Generators                      │  │
│  ├─────────────────────────────────────────┤  │
│  │  • Kubernetes Manifests                 │  │
│  │  • Terraform (EKS, VPC, ECR, RDS)       │  │
│  │  • CI/CD Pipelines (GitHub Actions)     │  │
│  │  • GitOps (ArgoCD, Helm)                │  │
│  │  • Monitoring (Prometheus, Grafana)     │  │
│  └─────────────────────────────────────────┘  │
│         ↓                                      │
│  ┌─────────────────────────────────────────┐  │
│  │      Deployment Orchestrator            │  │
│  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                    ↓
         ┌──────────────────────┐
         │    AWS EKS Cluster   │
         └──────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- AWS CLI configured (`aws configure`)
- Terraform 1.0+ (for infrastructure deployment)
- kubectl 1.33+ (for Kubernetes management)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/mcp-devops-automation.git
cd mcp-devops-automation

# Install dependencies
npm install

# Build the project
npm run build

# Start the MCP server
npm start
```

### Using in Your IDE

#### Cursor / VS Code with MCP Extension

Add to your MCP configuration (`.cursor/mcp/config.json` or VS Code settings):

```json
{
  "mcpServers": {
    "devops-automation": {
      "command": "node",
      "args": ["/path/to/mcp-devops-automation/dist/index.js"],
      "description": "Automated DevOps setup and AWS deployment"
    }
  }
}
```

## 📖 Usage

### 1. Analyze Your Project

```typescript
// The AI agent can call:
await mcp.call('analyze-project', {
  projectPath: '/path/to/your/project'
});

// Returns:
{
  "success": true,
  "analysis": {
    "projectName": "retail-store-sample-app",
    "services": [
      {
        "name": "ui",
        "language": "Java",
        "framework": "Spring Boot",
        "port": 8080,
        "hasDocker": true,
        "hasTests": true
      },
      // ... more services
    ],
    "complexity": "complex",
    "languages": [...],
    "frameworks": [...],
    "databases": [...]
  }
}
```

### 2. Calculate Resources

```typescript
await mcp.call('calculate-resources', {
  projectPath: '/path/to/your/project'
});

// Returns:
{
  "success": true,
  "resources": {
    "services": [
      {
        "name": "ui",
        "replicas": 3,
        "cpu": { "request": "500m", "limit": "1500m" },
        "memory": { "request": "768Mi", "limit": "1.5Gi" },
        "autoscaling": {
          "enabled": true,
          "minReplicas": 3,
          "maxReplicas": 10,
          "targetCPU": 70
        }
      }
      // ... more services
    ],
    "infrastructure": {
      "kubernetes": {
        "nodeCount": 4,
        "nodeType": "m5.large",
        "nodeSize": "2 vCPU, 8GB RAM"
      }
    },
    "estimatedCost": {
      "monthly": {
        "compute": 245.52,
        "storage": 8.00,
        "networking": 25.20,
        "database": 99.28,
        "total": 378.00
      },
      "currency": "USD"
    }
  }
}
```

### 3. Generate Complete DevOps Setup

```typescript
await mcp.call('generate-devops-setup', {
  projectPath: '/path/to/your/project',
  awsRegion: 'us-east-1',
  enableMonitoring: true,
  deploymentStrategy: 'gitops'
});

// Generates:
// ✅ Kubernetes manifests (k8s/)
// ✅ Terraform files (terraform/)
// ✅ GitHub Actions workflows (.github/workflows/)
// ✅ Deployment guide (DEPLOYMENT.md)

// Returns:
{
  "success": true,
  "message": "DevOps setup generated successfully",
  "outputDir": "/path/to/your/project/devops-generated",
  "files": {
    "kubernetes": ["k8s/manifests.yaml"],
    "terraform": ["main.tf", "vpc.tf", "eks.tf", "ecr.tf", ...],
    "cicd": [".github/workflows/ci.yml", ...],
    "documentation": ["DEPLOYMENT.md"]
  },
  "nextSteps": [
    "1. Review generated Terraform files in terraform/",
    "2. Update terraform.tfvars with your AWS credentials",
    "3. Run: cd terraform && terraform init && terraform apply",
    "4. Configure GitHub secrets for CI/CD pipelines",
    "5. Push changes to trigger automated deployment"
  ]
}
```

### 4. Deploy to AWS

```typescript
// Dry run (default - shows what would be deployed)
await mcp.call('deploy-to-aws', {
  projectPath: '/path/to/your/project',
  awsRegion: 'us-east-1',
  dryRun: true
});

// Actual deployment (use with caution)
await mcp.call('deploy-to-aws', {
  projectPath: '/path/to/your/project',
  awsRegion: 'us-east-1',
  dryRun: false
});
```

## 🎯 Example: Full Workflow

Here's how an AI agent would use this MCP server to deploy a project:

```
User: "Analyze my project at /workspace/my-app and deploy it to AWS"

AI Agent:
1. Calls analyze-project → Gets project details
2. Calls calculate-resources → Gets resource requirements
3. Asks user: "I found 5 microservices. Estimated cost: $378/month. Proceed?"
4. Calls generate-devops-setup → Creates all configs
5. Tells user: "Review the generated files in devops-generated/"
6. User confirms → Calls deploy-to-aws
7. Monitors deployment and reports status
```

## 📊 What Gets Generated

### Kubernetes Resources

- **Deployments** - With health checks, resource limits, and best practices
- **Services** - ClusterIP services for internal communication
- **ConfigMaps** - Environment-specific configuration
- **Secrets** - Placeholder secrets (you add real values)
- **Ingress** - NGINX ingress with TLS support
- **HPA** - Horizontal Pod Autoscalers for auto-scaling
- **PDB** - Pod Disruption Budgets for availability
- **ServiceAccounts** - With IRSA for AWS access

### Terraform Infrastructure

- **VPC** - Multi-AZ with public/private subnets
- **EKS** - Managed Kubernetes with Auto Mode
- **ECR** - Private Docker registries for each service
- **RDS** - Managed database (if detected)
- **IAM** - Roles and policies with least privilege
- **Add-ons** - Load Balancer Controller, ArgoCD, NGINX Ingress

### CI/CD Pipelines

- **Build & Test** - Automated testing for each service
- **Docker Build & Push** - Multi-arch image builds to ECR
- **Deployment** - GitOps-based deployment to EKS
- **Terraform** - Infrastructure as Code automation

## 💰 Cost Estimation

The server provides detailed cost estimates:

| Component | Simple | Moderate | Complex | Enterprise |
|-----------|--------|----------|---------|------------|
| **Compute** | $150 | $250 | $400 | $800 |
| **Storage** | $5 | $10 | $20 | $50 |
| **Network** | $20 | $30 | $50 | $100 |
| **Database** | $25 | $50 | $100 | $200 |
| **Total/mo** | ~$200 | ~$340 | ~$570 | ~$1,150 |

*Actual costs vary based on usage, region, and AWS pricing changes*

## 🔧 Configuration Options

### Project Complexity Detection

Automatically determined by:
- Number of services (1, 2-5, 6-10, 10+)
- Language diversity (1, 2-3, 4+)
- Lines of code (10k, 50k, 100k+)
- Dependency count

### Deployment Strategies

- **basic** - Simple deployment, no GitOps
- **gitops** - ArgoCD-based automated deployment (default)
- **blue-green** - Zero-downtime deployments
- **canary** - Progressive rollouts with metrics

### CI/CD Providers

- **github-actions** - GitHub Actions workflows (default)
- **gitlab-ci** - GitLab CI/CD pipelines
- **jenkins** - Jenkinsfile configurations

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## 📁 Project Structure

```
mcp-devops-automation/
├── src/
│   ├── analyzers/          # Project analysis logic
│   │   └── project-analyzer.ts
│   ├── calculators/        # Resource calculation
│   │   └── resource-calculator.ts
│   ├── generators/         # Config generators
│   │   ├── kubernetes-generator.ts
│   │   ├── terraform-generator.ts
│   │   └── cicd-generator.ts
│   ├── tools/             # MCP tool implementations
│   │   └── devops-tools.ts
│   ├── types/             # TypeScript types
│   │   └── index.ts
│   └── index.ts           # MCP server entry point
├── templates/             # Config templates
├── tests/                # Test files
├── examples/             # Example projects
├── package.json
├── tsconfig.json
└── README.md
```

## 🔍 Supported Technologies

### Languages
✅ JavaScript/TypeScript (Node.js, React, Next.js, Express)
✅ Java (Spring Boot, Quarkus)
✅ Go (Gin, Echo, Fiber)
✅ Python (Django, Flask, FastAPI)
✅ Rust, Ruby, PHP, C#, Kotlin

### Frameworks
✅ Express, NestJS, Fastify
✅ Spring Boot, Micronaut, Quarkus
✅ Django, Flask, FastAPI
✅ Gin, Echo, Fiber
✅ React, Vue, Next.js, Angular

### Databases
✅ PostgreSQL, MySQL, MariaDB
✅ MongoDB, Redis
✅ Amazon DynamoDB, ElastiCache
✅ Auto-detects and provisions RDS/DocumentDB

## 🚨 Troubleshooting

### Issue: "Project analysis failed"
**Solution:** Ensure the project path is absolute and contains valid source code

### Issue: "Terraform apply fails"
**Solution:** Check AWS credentials: `aws sts get-caller-identity`

### Issue: "Images not found in ECR"
**Solution:** Run the build-and-push workflow first

### Issue: "High resource estimates"
**Solution:** Review the complexity calculation or manually adjust resources in generated manifests

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- Built with [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
- Uses [Terraform AWS Modules](https://github.com/terraform-aws-modules)
- Inspired by GitOps best practices

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/your-org/mcp-devops-automation/issues)
- **Documentation:** [Full Docs](https://docs.your-org.com/mcp-devops)
- **Discord:** [Community Discord](https://discord.gg/your-org)

---

**Made with ❤️ by the DevOps Automation Team**

*Automatically analyze, configure, and deploy any project to AWS in minutes, not days.*
