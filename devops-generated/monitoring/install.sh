#!/bin/bash
set -e

echo "Installing monitoring stack for mcp-devops-automation..."

# Create namespace
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Add Helm repositories
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install Prometheus Operator
echo "Installing Prometheus Operator..."
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f prometheus/values.yaml \
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
kubectl create configmap grafana-dashboards \
  --from-file=grafana/dashboards/ \
  -n monitoring \
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
