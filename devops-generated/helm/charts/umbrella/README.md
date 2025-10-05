# mcp-devops-automation Helm Chart

This is an umbrella chart that deploys all services for mcp-devops-automation.

## Installation

```bash
# Add dependencies
helm dependency update

# Install the chart
helm install mcp-devops-automation . -n mcp-devops-automation --create-namespace

# Upgrade
helm upgrade mcp-devops-automation . -n mcp-devops-automation
```

## Services

- **analyzers** - TypeScript
- **calculators** - TypeScript
- **generators** - TypeScript
- **tools** - TypeScript
- **types** - TypeScript

## Configuration

See `values.yaml` for all configuration options.
