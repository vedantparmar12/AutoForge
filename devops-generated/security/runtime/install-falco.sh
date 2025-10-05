#!/bin/bash
set -e

echo "Installing Falco runtime security..."

# Add Falco Helm repository
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update

# Install Falco
helm install falco falcosecurity/falco \
  --namespace falco --create-namespace \
  -f security/runtime/falco-values.yaml

echo "✅ Falco installed successfully!"
echo "Monitor alerts: kubectl logs -f -n falco -l app=falco"
