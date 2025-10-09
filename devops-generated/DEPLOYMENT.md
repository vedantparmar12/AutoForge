# mcp-devops-automation - Deployment Guide

## Overview
Complete deployment guide with Helm, ArgoCD, Prometheus, and Ansible support.

**Project Complexity:** moderate
**Services:** 5
**Estimated Monthly Cost:** $310.98

## 🎯 What Was Generated

✅ **Kubernetes Manifests** - Raw K8s YAML
✅ **Helm Charts** - Production-ready Helm charts for each service
✅ **ArgoCD Applications** - GitOps deployment configurations
✅ **Terraform** - Complete AWS infrastructure
✅ **Ansible Playbooks** - Alternative deployment method
✅ **CI/CD Pipelines** - GitHub Actions workflows
✅ **Monitoring Stack** - Prometheus, Grafana, AlertManager
✅ **Documentation** - This guide and component READMEs

## 🚀 Deployment Options

You have **3 deployment methods**:

### Option 1: GitOps with ArgoCD (Recommended)
Best for: Production environments, team collaboration

### Option 2: Terraform + Helm
Best for: Full control, infrastructure management

### Option 3: Ansible
Best for: Existing Ansible workflows, procedural deployment

---

## Prerequisites

```bash
# Required tools
aws --version          # AWS CLI v2+
terraform --version    # Terraform 1.0+
kubectl --version      # kubectl 1.33+
helm --version         # Helm 3.0+
```

## Option 1: GitOps with ArgoCD

### Step 1: Deploy Infrastructure

```bash
cd terraform/
terraform init
terraform apply -auto-approve
```

### Step 2: Update Kubeconfig

```bash
aws eks update-kubeconfig --name mcp-devops-automation-cluster --region us-east-1
```

### Step 3: Install ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

### Step 4: Deploy Applications

```bash
# Deploy the project
kubectl apply -f argocd/projects/project.yaml

# Deploy all services via umbrella chart
kubectl apply -f argocd/applications/umbrella-app.yaml

# Or deploy services individually
kubectl apply -f argocd/applications/
```

### Step 5: Access ArgoCD UI

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Get password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Open: https://localhost:8080
# Login: admin / <password>
```

---

## Option 2: Terraform + Helm

### Step 1: Deploy Infrastructure

```bash
cd terraform/
terraform init
terraform apply -target=module.vpc -target=module.eks -auto-approve

# Update kubeconfig
aws eks update-kubeconfig --name mcp-devops-automation-cluster --region us-east-1

# Complete infrastructure
terraform apply -auto-approve
```

### Step 2: Deploy with Helm

```bash
cd helm/

# Update Helm dependencies
helm dependency update

# Install all services
helm install mcp-devops-automation . -n mcp-devops-automation --create-namespace

# Or install individually
helm install analyzers charts/analyzers -n mcp-devops-automation
helm install calculators charts/calculators -n mcp-devops-automation
helm install generators charts/generators -n mcp-devops-automation
helm install tools charts/tools -n mcp-devops-automation
helm install types charts/types -n mcp-devops-automation
```

---

## Option 3: Ansible

### Step 1: Install Requirements

```bash
pip install ansible boto3 botocore
ansible-galaxy collection install amazon.aws community.aws kubernetes.core
```

### Step 2: Deploy Everything

```bash
cd ansible/
ansible-playbook playbooks/deploy-all.yml
```

See `ansible/README.md` for more options.

---

## 📊 Monitoring Setup

### Install Prometheus & Grafana

```bash
cd monitoring/
chmod +x install.sh
./install.sh
```

### Access Dashboards

```bash
# Prometheus
kubectl port-forward -n monitoring svc/prometheus-operated 9090:9090

# Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
# Login: admin / changeme
```

### Pre-configured Dashboards

- **Overview** - System-wide metrics
- **Services** - Per-service performance
- **Infrastructure** - Cluster health

---

## 🔍 Verification

```bash
# Check pods
kubectl get pods -n mcp-devops-automation

# Check services
kubectl get svc -n mcp-devops-automation

# Check ingress
kubectl get ingress -n mcp-devops-automation

# Get application URL
kubectl get svc ingress-nginx-controller -n ingress-nginx
```

---

## 🎨 Service Resources


### analyzers
- **Replicas:** 2 (auto-scaling: 2-5)
- **CPU:** 375m / 750m
- **Memory:** 384Mi / 768Mi

### calculators
- **Replicas:** 2 (auto-scaling: 2-5)
- **CPU:** 375m / 750m
- **Memory:** 384Mi / 768Mi

### generators
- **Replicas:** 2 (auto-scaling: 2-5)
- **CPU:** 375m / 750m
- **Memory:** 384Mi / 768Mi

### tools
- **Replicas:** 2 (auto-scaling: 2-5)
- **CPU:** 375m / 750m
- **Memory:** 384Mi / 768Mi

### types
- **Replicas:** 2 (auto-scaling: 2-5)
- **CPU:** 375m / 750m
- **Memory:** 384Mi / 768Mi


---

## 💰 Cost Breakdown

| Component | Monthly Cost |
|-----------|--------------|
| Compute (EKS + Nodes) | $255.21 |
| Storage | $0 |
| Networking | $25.2 |
| Database | $30.57 |
| **Total** | **$310.98** |

---

## 🔧 Troubleshooting

### Pods not starting
```bash
kubectl describe pod <pod-name> -n mcp-devops-automation
kubectl logs <pod-name> -n mcp-devops-automation
```

### Image pull errors
```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com
```

### ArgoCD sync issues
```bash
argocd app get mcp-devops-automation-umbrella
argocd app sync mcp-devops-automation-umbrella --force
```

---

## 🧹 Cleanup

```bash
# Delete Kubernetes resources
kubectl delete namespace mcp-devops-automation

# Destroy infrastructure
cd terraform/
terraform destroy -auto-approve

# Delete ArgoCD
kubectl delete namespace argocd

# Delete monitoring
kubectl delete namespace monitoring
```

---

## 📚 Additional Resources

- **Helm Charts:** `helm/README.md`
- **ArgoCD:** `argocd/README.md`
- **Monitoring:** `monitoring/README.md`
- **Ansible:** `ansible/README.md`

---

**Generated by MCP DevOps Automation**
**Date:** 2025-10-09T21:43:34.461Z
**Features:** Helm ✅ | ArgoCD ✅ | Prometheus ✅ | Ansible ✅
