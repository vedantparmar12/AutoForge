import type { ProjectAnalysis, ResourceRequirements, MonitoringConfig } from '../types/index.js';

export class MonitoringGenerator {
  generateMonitoringSetup(
    analysis: ProjectAnalysis,
    resources: ResourceRequirements
  ): Record<string, string> {
    const projectName = analysis.projectName.toLowerCase();

    return {
      // Prometheus setup
      'monitoring/prometheus/values.yaml': this.generatePrometheusValues(projectName),
      'monitoring/prometheus/servicemonitors.yaml': this.generateServiceMonitors(analysis, projectName),
      'monitoring/prometheus/alerts.yaml': this.generateAlertRules(analysis, projectName),
      'monitoring/prometheus/recording-rules.yaml': this.generateRecordingRules(projectName),

      // Grafana setup
      'monitoring/grafana/values.yaml': this.generateGrafanaValues(projectName),
      'monitoring/grafana/dashboards/overview.json': this.generateOverviewDashboard(analysis, projectName),
      'monitoring/grafana/dashboards/services.json': this.generateServiceDashboard(analysis, projectName),
      'monitoring/grafana/dashboards/infrastructure.json': this.generateInfrastructureDashboard(projectName),

      // Installation guide
      'monitoring/README.md': this.generateMonitoringReadme(analysis, projectName),
      'monitoring/install.sh': this.generateInstallScript(projectName)
    };
  }

  private generatePrometheusValues(projectName: string): string {
    return `# Prometheus configuration
prometheus:
  prometheusSpec:
    retention: 15d
    retentionSize: "50GB"

    replicas: 2

    resources:
      requests:
        cpu: 500m
        memory: 2Gi
      limits:
        cpu: 2000m
        memory: 4Gi

    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: gp3
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 50Gi

    # Service monitors
    serviceMonitorSelector:
      matchLabels:
        app.kubernetes.io/part-of: ${projectName}

    # Pod monitors
    podMonitorSelector:
      matchLabels:
        app.kubernetes.io/part-of: ${projectName}

    # Alert manager config
    alerting:
      alertmanagers:
        - namespace: monitoring
          name: alertmanager-operated
          port: web

    # External labels
    externalLabels:
      cluster: ${projectName}-cluster
      environment: production

  # Ingress for Prometheus UI
  ingress:
    enabled: true
    ingressClassName: nginx
    hosts:
      - prometheus.${projectName}.example.com
    tls:
      - secretName: prometheus-tls
        hosts:
          - prometheus.${projectName}.example.com

# Alert Manager
alertmanager:
  alertmanagerSpec:
    replicas: 2

    storage:
      volumeClaimTemplate:
        spec:
          storageClassName: gp3
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 10Gi

  config:
    global:
      resolve_timeout: 5m
      slack_api_url: 'YOUR_SLACK_WEBHOOK_URL'

    route:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 12h
      receiver: 'slack-notifications'
      routes:
        - match:
            severity: critical
          receiver: 'slack-critical'
          continue: true

        - match:
            severity: warning
          receiver: 'slack-warnings'

    receivers:
      - name: 'slack-notifications'
        slack_configs:
          - channel: '#${projectName}-alerts'
            title: 'Alert: {{ .CommonLabels.alertname }}'
            text: '{{ range .Alerts }}{{ .Annotations.message }}{{ end }}'

      - name: 'slack-critical'
        slack_configs:
          - channel: '#${projectName}-critical'
            title: 'CRITICAL: {{ .CommonLabels.alertname }}'
            text: '{{ range .Alerts }}{{ .Annotations.message }}{{ end }}'

      - name: 'slack-warnings'
        slack_configs:
          - channel: '#${projectName}-warnings'
            title: 'Warning: {{ .CommonLabels.alertname }}'
            text: '{{ range .Alerts }}{{ .Annotations.message }}{{ end }}'

# Grafana integration
grafana:
  enabled: true
  adminPassword: changeme

  datasources:
    datasources.yaml:
      apiVersion: 1
      datasources:
        - name: Prometheus
          type: prometheus
          url: http://prometheus-operated:9090
          isDefault: true
          editable: false
`;
  }

  private generateServiceMonitors(analysis: ProjectAnalysis, projectName: string): string {
    return `---
${analysis.services.map(service => `apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ${service.name}
  namespace: ${projectName}
  labels:
    app.kubernetes.io/name: ${service.name}
    app.kubernetes.io/part-of: ${projectName}
spec:
  selector:
    matchLabels:
      app: ${service.name}
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
      scrapeTimeout: 10s
      scheme: http
      relabelings:
        - sourceLabels: [__meta_kubernetes_pod_name]
          targetLabel: pod
        - sourceLabels: [__meta_kubernetes_namespace]
          targetLabel: namespace
        - sourceLabels: [__meta_kubernetes_service_name]
          targetLabel: service
---`).join('\n')}

# Pod Monitor for services without Service
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: ${projectName}-pods
  namespace: ${projectName}
  labels:
    app.kubernetes.io/part-of: ${projectName}
spec:
  selector:
    matchLabels:
      app.kubernetes.io/part-of: ${projectName}
  podMetricsEndpoints:
    - port: http
      path: /metrics
      interval: 30s
`;
  }

  private generateAlertRules(analysis: ProjectAnalysis, projectName: string): string {
    return `apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: ${projectName}-alerts
  namespace: monitoring
  labels:
    app.kubernetes.io/part-of: ${projectName}
spec:
  groups:
    - name: ${projectName}.availability
      interval: 30s
      rules:
        - alert: ServiceDown
          expr: up{job=~"${projectName}.*"} == 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Service {{ $labels.job }} is down"
            message: "{{ $labels.job }} in namespace {{ $labels.namespace }} has been down for more than 5 minutes"

        - alert: HighErrorRate
          expr: rate(http_requests_total{job=~"${projectName}.*",status=~"5.."}[5m]) > 0.05
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High error rate on {{ $labels.job }}"
            message: "{{ $labels.job }} is experiencing {{ $value }}% error rate"

        - alert: PodCrashLooping
          expr: rate(kube_pod_container_status_restarts_total{namespace="${projectName}"}[15m]) > 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Pod {{ $labels.pod }} is crash looping"
            message: "Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} is restarting frequently"

    - name: ${projectName}.performance
      interval: 30s
      rules:
        - alert: HighResponseTime
          expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job=~"${projectName}.*"}[5m])) > 1
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "High response time on {{ $labels.job }}"
            message: "95th percentile response time is {{ $value }}s"

        - alert: HighCPUUsage
          expr: (sum(rate(container_cpu_usage_seconds_total{namespace="${projectName}"}[5m])) by (pod) / sum(container_spec_cpu_quota{namespace="${projectName}"}/container_spec_cpu_period{namespace="${projectName}"}) by (pod)) > 0.8
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "High CPU usage on {{ $labels.pod }}"
            message: "Pod {{ $labels.pod }} is using {{ $value }}% of CPU"

        - alert: HighMemoryUsage
          expr: (sum(container_memory_working_set_bytes{namespace="${projectName}"}) by (pod) / sum(container_spec_memory_limit_bytes{namespace="${projectName}"}) by (pod)) > 0.8
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "High memory usage on {{ $labels.pod }}"
            message: "Pod {{ $labels.pod }} is using {{ $value }}% of memory"

    - name: ${projectName}.capacity
      interval: 30s
      rules:
        - alert: PodNearMemoryLimit
          expr: (container_memory_working_set_bytes{namespace="${projectName}"} / container_spec_memory_limit_bytes{namespace="${projectName}"}) > 0.9
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Pod {{ $labels.pod }} is near memory limit"
            message: "Pod {{ $labels.pod }} is using {{ $value }}% of memory limit"

        - alert: HPAMaxedOut
          expr: kube_horizontalpodautoscaler_status_current_replicas{namespace="${projectName}"} == kube_horizontalpodautoscaler_spec_max_replicas{namespace="${projectName}"}
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "HPA {{ $labels.horizontalpodautoscaler }} is at max replicas"
            message: "Consider increasing max replicas for {{ $labels.horizontalpodautoscaler }}"

    - name: ${projectName}.infrastructure
      interval: 30s
      rules:
        - alert: NodeNotReady
          expr: kube_node_status_condition{condition="Ready",status="true"} == 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Node {{ $labels.node }} is not ready"
            message: "Node {{ $labels.node }} has been not ready for more than 5 minutes"

        - alert: DiskSpaceRunningLow
          expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Disk space running low on {{ $labels.instance }}"
            message: "Disk {{ $labels.device }} has less than 10% space available"
`;
  }

  private generateRecordingRules(projectName: string): string {
    return `apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: ${projectName}-recording-rules
  namespace: monitoring
  labels:
    app.kubernetes.io/part-of: ${projectName}
spec:
  groups:
    - name: ${projectName}.aggregations
      interval: 30s
      rules:
        # Request rate
        - record: job:http_requests:rate5m
          expr: sum(rate(http_requests_total{job=~"${projectName}.*"}[5m])) by (job, method, status)

        # Error rate
        - record: job:http_errors:rate5m
          expr: sum(rate(http_requests_total{job=~"${projectName}.*",status=~"5.."}[5m])) by (job)

        # Response time percentiles
        - record: job:http_request_duration:p95
          expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job=~"${projectName}.*"}[5m])) by (job, le))

        - record: job:http_request_duration:p99
          expr: histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job=~"${projectName}.*"}[5m])) by (job, le))

        # Resource usage
        - record: namespace:container_cpu_usage:sum
          expr: sum(rate(container_cpu_usage_seconds_total{namespace="${projectName}"}[5m])) by (namespace, pod)

        - record: namespace:container_memory_usage:sum
          expr: sum(container_memory_working_set_bytes{namespace="${projectName}"}) by (namespace, pod)
`;
  }

  private generateGrafanaValues(projectName: string): string {
    return `# Grafana configuration
replicas: 2

adminUser: admin
adminPassword: changeme

persistence:
  enabled: true
  type: pvc
  storageClassName: gp3
  size: 10Gi

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

ingress:
  enabled: true
  ingressClassName: nginx
  hosts:
    - grafana.${projectName}.example.com
  tls:
    - secretName: grafana-tls
      hosts:
        - grafana.${projectName}.example.com

datasources:
  datasources.yaml:
    apiVersion: 1
    datasources:
      - name: Prometheus
        type: prometheus
        url: http://prometheus-operated:9090
        access: proxy
        isDefault: true
        jsonData:
          timeInterval: 30s

dashboardProviders:
  dashboardproviders.yaml:
    apiVersion: 1
    providers:
      - name: '${projectName}'
        orgId: 1
        folder: '${projectName}'
        type: file
        disableDeletion: false
        editable: true
        options:
          path: /var/lib/grafana/dashboards/${projectName}

dashboards:
  ${projectName}:
    overview:
      file: dashboards/overview.json
    services:
      file: dashboards/services.json
    infrastructure:
      file: dashboards/infrastructure.json

# Plugins
plugins:
  - grafana-piechart-panel
  - grafana-clock-panel

# Notification channels
notifiers:
  notifiers.yaml:
    notifiers:
      - name: Slack
        type: slack
        uid: slack
        org_id: 1
        is_default: true
        settings:
          url: YOUR_SLACK_WEBHOOK_URL
          recipient: '#${projectName}-alerts'
`;
  }

  private generateOverviewDashboard(analysis: ProjectAnalysis, projectName: string): string {
    // Generate a Grafana dashboard JSON
    // This is a simplified version - in production you'd want a more complete dashboard
    const dashboard = {
      title: `${analysis.projectName} - Overview`,
      uid: `${projectName}-overview`,
      tags: [projectName, 'overview'],
      timezone: 'browser',
      schemaVersion: 16,
      version: 1,
      refresh: '30s',
      panels: [
        {
          id: 1,
          title: 'Total Requests/sec',
          type: 'graph',
          targets: [{
            expr: `sum(rate(http_requests_total{namespace="${projectName}"}[5m]))`,
            legendFormat: 'Requests/sec'
          }],
          gridPos: { h: 8, w: 12, x: 0, y: 0 }
        },
        {
          id: 2,
          title: 'Error Rate',
          type: 'graph',
          targets: [{
            expr: `sum(rate(http_requests_total{namespace="${projectName}",status=~"5.."}[5m])) / sum(rate(http_requests_total{namespace="${projectName}"}[5m]))`,
            legendFormat: 'Error Rate'
          }],
          gridPos: { h: 8, w: 12, x: 12, y: 0 }
        },
        {
          id: 3,
          title: 'Response Time (p95)',
          type: 'graph',
          targets: [{
            expr: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{namespace="${projectName}"}[5m])) by (le))`,
            legendFormat: 'p95'
          }],
          gridPos: { h: 8, w: 12, x: 0, y: 8 }
        },
        {
          id: 4,
          title: 'Pod Status',
          type: 'stat',
          targets: [{
            expr: `count(kube_pod_status_phase{namespace="${projectName}",phase="Running"})`,
            legendFormat: 'Running Pods'
          }],
          gridPos: { h: 8, w: 12, x: 12, y: 8 }
        }
      ]
    };

    return JSON.stringify(dashboard, null, 2);
  }

  private generateServiceDashboard(analysis: ProjectAnalysis, projectName: string): string {
    const dashboard = {
      title: `${analysis.projectName} - Services`,
      uid: `${projectName}-services`,
      tags: [projectName, 'services'],
      panels: analysis.services.map((service, index) => ({
        id: index + 1,
        title: `${service.name} - Requests/sec`,
        type: 'graph',
        targets: [{
          expr: `sum(rate(http_requests_total{namespace="${projectName}",service="${service.name}"}[5m]))`,
          legendFormat: service.name
        }],
        gridPos: { h: 6, w: 12, x: (index % 2) * 12, y: Math.floor(index / 2) * 6 }
      }))
    };

    return JSON.stringify(dashboard, null, 2);
  }

  private generateInfrastructureDashboard(projectName: string): string {
    const dashboard = {
      title: `${projectName} - Infrastructure`,
      uid: `${projectName}-infrastructure`,
      tags: [projectName, 'infrastructure'],
      panels: [
        {
          id: 1,
          title: 'CPU Usage by Pod',
          type: 'graph',
          targets: [{
            expr: `sum(rate(container_cpu_usage_seconds_total{namespace="${projectName}"}[5m])) by (pod)`,
            legendFormat: '{{ pod }}'
          }]
        },
        {
          id: 2,
          title: 'Memory Usage by Pod',
          type: 'graph',
          targets: [{
            expr: `sum(container_memory_working_set_bytes{namespace="${projectName}"}) by (pod)`,
            legendFormat: '{{ pod }}'
          }]
        }
      ]
    };

    return JSON.stringify(dashboard, null, 2);
  }

  private generateMonitoringReadme(analysis: ProjectAnalysis, projectName: string): string {
    return `# Monitoring Setup for ${analysis.projectName}

Complete Prometheus and Grafana monitoring stack.

## Components

- **Prometheus** - Metrics collection and alerting
- **Grafana** - Visualization and dashboards
- **AlertManager** - Alert routing and notification
- **ServiceMonitors** - Automatic service discovery

## Installation

Run the installation script:

\`\`\`bash
chmod +x install.sh
./install.sh
\`\`\`

Or install manually:

\`\`\`bash
# Add Prometheus Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus Operator
helm install prometheus prometheus-community/kube-prometheus-stack \\
  -n monitoring --create-namespace \\
  -f prometheus/values.yaml

# Apply ServiceMonitors
kubectl apply -f prometheus/servicemonitors.yaml

# Apply Alert Rules
kubectl apply -f prometheus/alerts.yaml
kubectl apply -f prometheus/recording-rules.yaml
\`\`\`

## Access

### Prometheus

\`\`\`bash
kubectl port-forward -n monitoring svc/prometheus-operated 9090:9090
# Open http://localhost:9090
\`\`\`

### Grafana

\`\`\`bash
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
# Open http://localhost:3000
# Login: admin / changeme
\`\`\`

### AlertManager

\`\`\`bash
kubectl port-forward -n monitoring svc/alertmanager-operated 9093:9093
# Open http://localhost:9093
\`\`\`

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

Configure Slack webhook in \`prometheus/values.yaml\`:

\`\`\`yaml
alertmanager:
  config:
    global:
      slack_api_url: 'YOUR_WEBHOOK_URL'
\`\`\`

## Metrics

Services expose metrics at \`/metrics\` endpoint:

- \`http_requests_total\` - Request counter
- \`http_request_duration_seconds\` - Request latency
- \`http_requests_in_progress\` - Current requests

## Troubleshooting

\`\`\`bash
# Check Prometheus targets
kubectl port-forward -n monitoring svc/prometheus-operated 9090:9090
# Visit http://localhost:9090/targets

# Check alerts
# Visit http://localhost:9090/alerts

# Check ServiceMonitor
kubectl get servicemonitors -n ${projectName}
\`\`\`
`;
  }

  private generateInstallScript(projectName: string): string {
    return `#!/bin/bash
set -e

echo "Installing monitoring stack for ${projectName}..."

# Create namespace
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Add Helm repositories
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install Prometheus Operator
echo "Installing Prometheus Operator..."
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \\
  -n monitoring \\
  -f prometheus/values.yaml \\
  --wait

# Wait for Prometheus to be ready
echo "Waiting for Prometheus to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=prometheus -n monitoring --timeout=300s

# Apply ServiceMonitors
echo "Applying ServiceMonitors..."
kubectl apply -f prometheus/servicemonitors.yaml

# Apply Alert Rules
echo "Applying Alert Rules..."
kubectl apply -f prometheus/alerts.yaml
kubectl apply -f prometheus/recording-rules.yaml

# Apply Grafana dashboards
echo "Setting up Grafana dashboards..."
kubectl create configmap grafana-dashboards \\
  --from-file=grafana/dashboards/ \\
  -n monitoring \\
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Monitoring stack installed successfully!"
echo ""
echo "Access Prometheus:"
echo "  kubectl port-forward -n monitoring svc/prometheus-operated 9090:9090"
echo ""
echo "Access Grafana:"
echo "  kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80"
echo "  Default login: admin / changeme"
echo ""
echo "Access AlertManager:"
echo "  kubectl port-forward -n monitoring svc/alertmanager-operated 9093:9093"
`;
  }
}
