# Monitoring Setup for mcp-devops-automation

Complete Prometheus and Grafana monitoring stack.

## Components

- **Prometheus** - Metrics collection and alerting
- **Grafana** - Visualization and dashboards
- **AlertManager** - Alert routing and notification
- **ServiceMonitors** - Automatic service discovery

## Installation

Run the installation script:

```bash
chmod +x install.sh
./install.sh
```

Or install manually:

```bash
# Add Prometheus Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus Operator
helm install prometheus prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f prometheus/values.yaml

# Apply ServiceMonitors
kubectl apply -f prometheus/servicemonitors.yaml

# Apply Alert Rules
kubectl apply -f prometheus/alerts.yaml
kubectl apply -f prometheus/recording-rules.yaml
```

## Access

### Prometheus

```bash
kubectl port-forward -n monitoring svc/prometheus-operated 9090:9090
# Open http://localhost:9090
```

### Grafana

```bash
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
# Open http://localhost:3000
# Login: admin / changeme
```

### AlertManager

```bash
kubectl port-forward -n monitoring svc/alertmanager-operated 9093:9093
# Open http://localhost:9093
```

## Dashboards

Pre-configured Grafana dashboards:

1. **Overview** - System-wide metrics
2. **Services** - Per-service metrics
3. **Infrastructure** - Node and cluster metrics

## Alerts

Configured alert rules:

- **ServiceDown** - Service unavailable
- **HighErrorRate** - 5xx errors > 5%
- **PodCrashLooping** - Pod restarting frequently
- **HighResponseTime** - p95 > 1s
- **HighCPUUsage** - CPU > 80%
- **HighMemoryUsage** - Memory > 80%
- **HPAMaxedOut** - HPA at max replicas

## Slack Integration

Configure Slack webhook in `prometheus/values.yaml`:

```yaml
alertmanager:
  config:
    global:
      slack_api_url: 'YOUR_WEBHOOK_URL'
```

## Metrics

Services expose metrics at `/metrics` endpoint:

- `http_requests_total` - Request counter
- `http_request_duration_seconds` - Request latency
- `http_requests_in_progress` - Current requests

## Troubleshooting

```bash
# Check Prometheus targets
kubectl port-forward -n monitoring svc/prometheus-operated 9090:9090
# Visit http://localhost:9090/targets

# Check alerts
# Visit http://localhost:9090/alerts

# Check ServiceMonitor
kubectl get servicemonitors -n mcp-devops-automation
```
