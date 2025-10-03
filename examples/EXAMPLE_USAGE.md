# Example Usage Guide

This guide demonstrates how to use the MCP DevOps Automation server with various project types.

## Example 1: Simple Node.js API

```typescript
// 1. Analyze the project
const analysis = await mcp.call('analyze-project', {
  projectPath: '/workspace/my-nodejs-api'
});

// Result:
{
  "success": true,
  "analysis": {
    "projectName": "my-nodejs-api",
    "services": [
      {
        "name": "api",
        "language": "JavaScript/TypeScript",
        "framework": "Express",
        "port": 3000
      }
    ],
    "complexity": "simple",
    "estimatedSize": {
      "linesOfCode": 5420,
      "fileCount": 45
    }
  }
}

// 2. Calculate resources
const resources = await mcp.call('calculate-resources', {
  projectPath: '/workspace/my-nodejs-api'
});

// Result shows:
// - 1 replica initially
// - 250m CPU request / 500m limit
// - 256Mi memory request / 512Mi limit
// - Estimated cost: ~$150/month

// 3. Generate DevOps setup
await mcp.call('generate-devops-setup', {
  projectPath: '/workspace/my-nodejs-api',
  awsRegion: 'us-west-2',
  enableMonitoring: true
});

// Generated files:
// ✅ k8s/manifests.yaml
// ✅ terraform/main.tf, vpc.tf, eks.tf, etc.
// ✅ .github/workflows/ci.yml, build-and-push.yml
// ✅ DEPLOYMENT.md
```

## Example 2: Microservices Application (Like Retail Store)

```typescript
// 1. Analyze multi-service project
const analysis = await mcp.call('analyze-project', {
  projectPath: '/workspace/retail-store-app'
});

// Result:
{
  "success": true,
  "analysis": {
    "projectName": "retail-store-app",
    "services": [
      { "name": "ui", "language": "Java", "framework": "Spring Boot", "port": 8080 },
      { "name": "catalog", "language": "Go", "framework": "Gin", "port": 8080 },
      { "name": "cart", "language": "Java", "framework": "Spring Boot", "port": 8080 },
      { "name": "orders", "language": "Java", "framework": "Spring Boot", "port": 8080 },
      { "name": "checkout", "language": "JavaScript/TypeScript", "framework": "Express", "port": 8080 }
    ],
    "complexity": "complex",
    "databases": [
      { "type": "mongodb", "detected": true },
      { "type": "mysql", "detected": true }
    ]
  }
}

// 2. Calculate resources for complex app
const resources = await mcp.call('calculate-resources', {
  projectPath: '/workspace/retail-store-app'
});

// Result shows:
// - 3-5 replicas per service
// - Higher CPU/memory for Java services
// - 4 EKS nodes (m5.large)
// - Estimated cost: ~$570/month

// 3. Generate complete setup
await mcp.call('generate-devops-setup', {
  projectPath: '/workspace/retail-store-app',
  awsRegion: 'us-east-1',
  deploymentStrategy: 'gitops',
  enableMonitoring: true,
  enableLogging: true
});
```

## Example 3: Python ML Application

```typescript
const analysis = await mcp.call('analyze-project', {
  projectPath: '/workspace/ml-api'
});

// Detects:
// - Python/FastAPI
// - Dependencies: tensorflow, pytorch, numpy, pandas
// - Higher memory requirements automatically calculated
// - GPU instance types recommended (if heavy ML detected)

await mcp.call('generate-devops-setup', {
  projectPath: '/workspace/ml-api',
  awsRegion: 'us-west-2',
  enableMonitoring: true
});

// Generates:
// - Kubernetes with GPU node pools (if needed)
// - Higher memory limits (2-4Gi)
// - S3 integration for model storage
// - Optimized for ML workloads
```

## Example 4: Full Deployment Flow

```typescript
// Step 1: Analyze
console.log("Analyzing project...");
const analysis = await mcp.call('analyze-project', {
  projectPath: '/workspace/my-app'
});

console.log(`Found ${analysis.analysis.services.length} services`);
console.log(`Complexity: ${analysis.analysis.complexity}`);

// Step 2: Calculate resources and costs
console.log("\nCalculating resources...");
const resources = await mcp.call('calculate-resources', {
  projectPath: '/workspace/my-app'
});

console.log(`Estimated monthly cost: $${resources.resources.estimatedCost.monthly.total}`);

// Ask user for confirmation
const confirm = prompt(`Proceed with deployment? (yes/no)`);
if (confirm !== 'yes') {
  console.log("Deployment cancelled");
  return;
}

// Step 3: Generate all configurations
console.log("\nGenerating DevOps setup...");
await mcp.call('generate-devops-setup', {
  projectPath: '/workspace/my-app',
  outputDir: '/workspace/my-app/infrastructure',
  awsRegion: 'us-east-1',
  enableMonitoring: true,
  dryRun: false
});

console.log("\n✅ DevOps setup complete!");
console.log("Next steps:");
console.log("1. cd infrastructure/terraform");
console.log("2. terraform init && terraform apply");
console.log("3. Configure GitHub secrets");
console.log("4. Push to main branch to trigger deployment");
```

## Example 5: Dry Run Before Deployment

```typescript
// Always do a dry run first to see what will be deployed
await mcp.call('deploy-to-aws', {
  projectPath: '/workspace/my-app',
  awsRegion: 'us-east-1',
  dryRun: true  // Safety first!
});

// Review the output, then deploy for real
await mcp.call('deploy-to-aws', {
  projectPath: '/workspace/my-app',
  awsRegion: 'us-east-1',
  dryRun: false
});
```

## Example 6: Custom Configuration

```typescript
// Override default settings
await mcp.call('generate-devops-setup', {
  projectPath: '/workspace/my-app',
  outputDir: '/custom/output/path',
  awsRegion: 'eu-west-1',
  clusterName: 'production-cluster',
  deploymentStrategy: 'blue-green',
  cicdProvider: 'gitlab-ci',
  enableMonitoring: true,
  enableLogging: true,
  dryRun: false
});
```

## Expected Output Structure

After running `generate-devops-setup`, you'll get:

```
devops-generated/
├── k8s/
│   └── manifests.yaml              # All Kubernetes resources
├── terraform/
│   ├── main.tf                     # Main Terraform config
│   ├── variables.tf                # Input variables
│   ├── outputs.tf                  # Output values
│   ├── vpc.tf                      # VPC configuration
│   ├── eks.tf                      # EKS cluster setup
│   ├── ecr.tf                      # Container registries
│   ├── rds.tf                      # Database (if needed)
│   ├── iam.tf                      # IAM roles and policies
│   └── terraform.tfvars            # Variable values
├── .github/
│   └── workflows/
│       ├── ci.yml                  # Testing pipeline
│       ├── build-and-push.yml      # Docker build/push
│       ├── deploy.yml              # Deployment pipeline
│       └── terraform.yml           # Infrastructure pipeline
└── DEPLOYMENT.md                   # Step-by-step guide
```

## Tips

1. **Start with Analysis**: Always analyze first to understand your project
2. **Check Costs**: Review resource calculations before generating configs
3. **Use Dry Run**: Test deployment logic without actually deploying
4. **Review Generated Files**: Always review before applying to production
5. **Customize as Needed**: Generated files are a starting point - customize for your needs

## Common Patterns

### Pattern 1: Analyze → Calculate → Generate

```typescript
const analysis = await mcp.call('analyze-project', { projectPath: '/path' });
const resources = await mcp.call('calculate-resources', { projectPath: '/path' });
await mcp.call('generate-devops-setup', { projectPath: '/path' });
```

### Pattern 2: Generate → Review → Deploy

```typescript
await mcp.call('generate-devops-setup', { projectPath: '/path' });
// Review files manually
await mcp.call('deploy-to-aws', { projectPath: '/path', dryRun: true });
// If all looks good:
await mcp.call('deploy-to-aws', { projectPath: '/path', dryRun: false });
```

### Pattern 3: Iterative Refinement

```typescript
// First pass
await mcp.call('generate-devops-setup', { projectPath: '/path', dryRun: true });

// Review and adjust in code
// Second pass with custom settings
await mcp.call('generate-devops-setup', {
  projectPath: '/path',
  awsRegion: 'us-west-2',  // Changed region
  enableMonitoring: true    // Added monitoring
});
```
