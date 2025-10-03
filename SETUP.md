# Setup Instructions

## Quick Setup

The MCP DevOps Automation server is ready to use. Follow these steps:

### 1. Install Dependencies

```bash
cd mcp-devops-automation
npm install
```

If npm install is slow, you can use yarn or pnpm:
```bash
# Using yarn
yarn install

# Using pnpm
pnpm install
```

### 2. Build the TypeScript Code

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### 3. Test the Server

```bash
npm start
```

You should see:
```
MCP DevOps Automation Server running on stdio
Version: 1.0.0
Available tools:
  - analyze-project: Analyzes a project to detect languages, frameworks...
  - calculate-resources: Calculates optimal Kubernetes resources...
  - generate-devops-setup: Generates complete DevOps setup...
  - deploy-to-aws: Deploys the application to AWS EKS
```

### 4. Configure in Your IDE

#### For Cursor

Add to `.cursor/mcp/config.json`:
```json
{
  "mcpServers": {
    "devops-automation": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-devops-automation/dist/index.js"]
    }
  }
}
```

#### For VS Code

Install the MCP extension, then add to settings:
```json
{
  "mcp.servers": [{
    "name": "devops-automation",
    "command": "node",
    "args": ["/absolute/path/to/mcp-devops-automation/dist/index.js"]
  }]
}
```

### 5. Usage

Once configured, your AI assistant can use the tools:

```typescript
// Analyze a project
await mcp.call('analyze-project', {
  projectPath: '/path/to/your/project'
});

// Generate complete DevOps setup
await mcp.call('generate-devops-setup', {
  projectPath: '/path/to/your/project',
  awsRegion: 'us-east-1'
});
```

## Troubleshooting

### npm install fails or is slow
- **Solution 1**: Use `npm install --legacy-peer-deps`
- **Solution 2**: Use yarn: `yarn install`
- **Solution 3**: Clear npm cache: `npm cache clean --force && npm install`

### TypeScript compilation errors
- Ensure you have TypeScript installed: `npm install -g typescript`
- Check Node.js version: `node --version` (should be 18+)

### Server won't start
- Check if dist/ directory exists: `ls dist/`
- Rebuild: `npm run build`
- Check for errors: `node dist/index.js`

## Development

```bash
# Watch mode (auto-rebuild on changes)
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## What Was Created

The MCP DevOps Automation server includes:

✅ **Analyzers**
- `project-analyzer.ts` - Detects languages, frameworks, services

✅ **Calculators**
- `resource-calculator.ts` - Determines CPU, memory, replicas, costs

✅ **Generators**
- `kubernetes-generator.ts` - Creates K8s manifests
- `terraform-generator.ts` - Generates AWS infrastructure
- `cicd-generator.ts` - Builds GitHub Actions pipelines

✅ **Tools**
- `devops-tools.ts` - MCP tool implementations

✅ **MCP Server**
- `index.ts` - Server entry point with 4 tools

✅ **Documentation**
- `README.md` - Full documentation
- `EXAMPLE_USAGE.md` - Usage examples
- `CONTRIBUTING.md` - Contribution guide

## Next Steps

1. Install dependencies: `npm install`
2. Build project: `npm run build`
3. Configure in your IDE
4. Start using the tools!

See `EXAMPLE_USAGE.md` for detailed examples.
