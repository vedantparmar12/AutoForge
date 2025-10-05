#!/bin/bash
set -e

echo "Installing Trivy..."

# Install Trivy
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add - || {
    echo "❌ Failed to download Trivy GPG key"
    exit 1
}
echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list || {
    echo "❌ Failed to add Trivy repository"
    exit 1
}
sudo apt-get update || {
    echo "❌ Failed to update package lists"
    exit 1
}
sudo apt-get install -y trivy || {
    echo "❌ Failed to install Trivy"
    exit 1
}

# Verify installation
trivy --version || {
    echo "❌ Trivy installation verification failed"
    exit 1
}

echo "✅ Trivy installed successfully!"
