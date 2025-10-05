#!/bin/bash
set -e

echo "Installing Velero for backup and disaster recovery..."

# Install Velero CLI
wget https://github.com/vmware-tanzu/velero/releases/latest/download/velero-linux-amd64.tar.gz || {
    echo "❌ Failed to download Velero"
    exit 1
}
tar -xvf velero-linux-amd64.tar.gz || {
    echo "❌ Failed to extract Velero"
    exit 1
}
sudo mv velero-*/velero /usr/local/bin/ || {
    echo "❌ Failed to install Velero"
    exit 1
}
rm -rf velero-*

# Create S3 bucket for backups
aws s3 mb s3://mcp-devops-automation-cluster-velero-backups --region ${AWS_REGION} || {
    echo "❌ Failed to create S3 bucket for backups"
    exit 1
}

# Install Velero with AWS plugin
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.8.0 \
  --bucket mcp-devops-automation-cluster-velero-backups \
  --backup-location-config region=${AWS_REGION} \
  --snapshot-location-config region=${AWS_REGION} \
  --use-node-agent \
  --use-volume-snapshots=true || {
    echo "❌ Failed to install Velero with AWS plugin"
    exit 1
}

echo "✅ Velero installed successfully!"
