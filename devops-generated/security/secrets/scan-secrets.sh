#!/bin/bash
set -e

echo "🔍 Scanning for secrets in repository..."

# Install GitLeaks if not present
if ! command -v gitleaks &> /dev/null; then
    echo "Installing GitLeaks..."
    wget https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_linux_x64.tar.gz || {
        echo "❌ Failed to download GitLeaks"
        exit 1
    }
    tar -xzf gitleaks_linux_x64.tar.gz || {
        echo "❌ Failed to extract GitLeaks"
        exit 1
    }
    sudo mv gitleaks /usr/local/bin/ || {
        echo "❌ Failed to install GitLeaks"
        exit 1
    }
    rm gitleaks_linux_x64.tar.gz
fi

# Scan for secrets
gitleaks detect --source . --config security/secrets/gitleaks.toml --report-format json --report-path security/reports/secrets-scan.json

echo "✅ Secret scanning complete!"
