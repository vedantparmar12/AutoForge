#!/bin/bash
set -e

echo "🔍 Scanning container images for vulnerabilities..."

ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Scan all service images

echo "Scanning analyzers..."
trivy image \
  --severity CRITICAL,HIGH \
  --exit-code 1 \
  --no-progress \
  --format json \
  --output security/reports/analyzers-scan.json \
  ${ECR_REGISTRY}/analyzers:latest

echo "✅ analyzers scan complete"


echo "Scanning calculators..."
trivy image \
  --severity CRITICAL,HIGH \
  --exit-code 1 \
  --no-progress \
  --format json \
  --output security/reports/calculators-scan.json \
  ${ECR_REGISTRY}/calculators:latest

echo "✅ calculators scan complete"


echo "Scanning generators..."
trivy image \
  --severity CRITICAL,HIGH \
  --exit-code 1 \
  --no-progress \
  --format json \
  --output security/reports/generators-scan.json \
  ${ECR_REGISTRY}/generators:latest

echo "✅ generators scan complete"


echo "Scanning tools..."
trivy image \
  --severity CRITICAL,HIGH \
  --exit-code 1 \
  --no-progress \
  --format json \
  --output security/reports/tools-scan.json \
  ${ECR_REGISTRY}/tools:latest

echo "✅ tools scan complete"


echo "Scanning types..."
trivy image \
  --severity CRITICAL,HIGH \
  --exit-code 1 \
  --no-progress \
  --format json \
  --output security/reports/types-scan.json \
  ${ECR_REGISTRY}/types:latest

echo "✅ types scan complete"


echo "🎉 All images scanned successfully!"
