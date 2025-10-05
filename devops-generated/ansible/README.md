# Ansible Deployment for mcp-devops-automation

Alternative deployment method using Ansible instead of Terraform.

## Prerequisites

```bash
# Install Ansible
pip install ansible

# Install required collections
ansible-galaxy collection install amazon.aws
ansible-galaxy collection install community.aws
ansible-galaxy collection install kubernetes.core

# Install boto3 for AWS
pip install boto3 botocore

# Configure AWS CLI
aws configure
```

## Directory Structure

```
ansible/
├── ansible.cfg              # Ansible configuration
├── inventory/
│   └── hosts.yml           # Inventory file
├── group_vars/
│   └── all.yml             # Global variables
├── playbooks/
│   ├── deploy-all.yml      # Main deployment playbook
│   ├── setup-infrastructure.yml
│   ├── deploy-services.yml
│   └── rollback.yml
└── roles/
    ├── eks-cluster/        # EKS cluster setup
    ├── ecr-repos/          # ECR repository creation
    └── k8s-deploy/         # Kubernetes deployment
```

## Usage

### Complete Deployment

```bash
ansible-playbook playbooks/deploy-all.yml
```

### Infrastructure Only

```bash
ansible-playbook playbooks/setup-infrastructure.yml
```

### Services Only

```bash
ansible-playbook playbooks/deploy-services.yml
```

### Rollback

```bash
ansible-playbook playbooks/rollback.yml
```

## Configuration

Edit `group_vars/all.yml` to customize:

- AWS region and credentials
- Cluster size and instance types
- Service replicas and resources
- Enable/disable monitoring

## Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region | us-east-1 |
| `cluster_name` | EKS cluster name | mcp-devops-automation-cluster |
| `cluster_version` | Kubernetes version | 1.33 |
| `enable_monitoring` | Install Prometheus/Grafana | true |
| `enable_argocd` | Install ArgoCD | true |

## Playbook Tags

Run specific tasks with tags:

```bash
# Only create VPC
ansible-playbook playbooks/setup-infrastructure.yml --tags vpc

# Only deploy specific service
ansible-playbook playbooks/deploy-services.yml --tags ui

# Skip monitoring
ansible-playbook playbooks/deploy-all.yml --skip-tags monitoring
```

## Troubleshooting

```bash
# Check syntax
ansible-playbook playbooks/deploy-all.yml --syntax-check

# Dry run
ansible-playbook playbooks/deploy-all.yml --check

# Verbose output
ansible-playbook playbooks/deploy-all.yml -vvv

# Run specific hosts
ansible-playbook playbooks/deploy-all.yml --limit eks_cluster
```

## Comparison: Ansible vs Terraform

| Feature | Ansible | Terraform |
|---------|---------|-----------|
| **State Management** | Stateless | Stateful |
| **Idempotency** | ✅ Yes | ✅ Yes |
| **AWS Support** | Good | Excellent |
| **Learning Curve** | Moderate | Moderate |
| **Best For** | Configuration + Deployment | Infrastructure |

## When to Use Ansible

- You prefer procedural approach
- Need configuration management
- Already using Ansible
- Want agent-based deployment
- Complex deployment workflows

## When to Use Terraform

- You prefer declarative approach
- Pure infrastructure as code
- State management needed
- Multi-cloud deployment
- Plan/apply workflow preferred
