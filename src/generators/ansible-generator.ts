import type { ProjectAnalysis, ResourceRequirements } from '../types/index.js';

export class AnsibleGenerator {
  generateAnsiblePlaybooks(
    analysis: ProjectAnalysis,
    resources: ResourceRequirements,
    region: string = 'us-east-1'
  ): Record<string, string> {
    const projectName = analysis.projectName.toLowerCase();

    return {
      'ansible/ansible.cfg': this.generateAnsibleConfig(),
      'ansible/inventory/hosts.yml': this.generateInventory(projectName, region),
      'ansible/group_vars/all.yml': this.generateGroupVars(analysis, resources, region),
      'ansible/playbooks/deploy-all.yml': this.generateDeployAllPlaybook(analysis, projectName),
      'ansible/playbooks/setup-infrastructure.yml': this.generateInfrastructurePlaybook(projectName),
      'ansible/playbooks/deploy-services.yml': this.generateServicesPlaybook(analysis, projectName),
      'ansible/playbooks/rollback.yml': this.generateRollbackPlaybook(analysis, projectName),
      'ansible/roles/eks-cluster/tasks/main.yml': this.generateEKSRole(),
      'ansible/roles/ecr-repos/tasks/main.yml': this.generateECRRole(analysis),
      'ansible/roles/k8s-deploy/tasks/main.yml': this.generateK8sDeployRole(),
      'ansible/README.md': this.generateAnsibleReadme(analysis, projectName)
    };
  }

  private generateAnsibleConfig(): string {
    return `[defaults]
inventory = inventory/hosts.yml
remote_user = ec2-user
host_key_checking = False
retry_files_enabled = False
gathering = smart
fact_caching = jsonfile
fact_caching_connection = /tmp/ansible_facts
fact_caching_timeout = 3600
stdout_callback = yaml
callbacks_enabled = profile_tasks, timer

[privilege_escalation]
become = True
become_method = sudo
become_user = root

[ssh_connection]
ssh_args = -o ControlMaster=auto -o ControlPersist=60s
pipelining = True
`;
  }

  private generateInventory(projectName: string, region: string): string {
    return `all:
  vars:
    ansible_python_interpreter: /usr/bin/python3
    aws_region: ${region}
    cluster_name: ${projectName}-cluster
    project_name: ${projectName}

  children:
    eks_cluster:
      hosts:
        localhost:
          ansible_connection: local

    bastion:
      hosts:
        # Add bastion host if needed
        # bastion.example.com:

    monitoring:
      hosts:
        localhost:
          ansible_connection: local
`;
  }

  private generateGroupVars(
    analysis: ProjectAnalysis,
    resources: ResourceRequirements,
    region: string
  ): string {
    return `---
# AWS Configuration
aws_region: ${region}
aws_profile: default

# Project Configuration
project_name: ${analysis.projectName.toLowerCase()}
cluster_name: "{{ project_name }}-cluster"
cluster_version: "1.33"

# VPC Configuration
vpc_cidr: "10.0.0.0/16"
availability_zones:
  - ${region}a
  - ${region}b
  - ${region}c

# EKS Configuration
eks_node_groups:
  - name: main
    instance_types:
      - ${resources.infrastructure.kubernetes.nodeType}
    desired_size: ${resources.infrastructure.kubernetes.nodeCount}
    min_size: ${Math.max(2, Math.floor(resources.infrastructure.kubernetes.nodeCount / 2))}
    max_size: ${resources.infrastructure.kubernetes.nodeCount * 2}
    disk_size: 50

# Services Configuration
services:
${analysis.services.map((s, i) => `  - name: ${s.name}
    language: ${s.language}
    framework: ${s.framework || 'none'}
    port: ${s.port || 8080}
    replicas: ${resources.services[i].replicas}
    cpu_request: ${resources.services[i].cpu.request}
    cpu_limit: ${resources.services[i].cpu.limit}
    memory_request: ${resources.services[i].memory.request}
    memory_limit: ${resources.services[i].memory.limit}
`).join('')}

# Docker Configuration
ecr_registry: "{{ aws_account_id }}.dkr.ecr.{{ aws_region }}.amazonaws.com"
docker_images:
${analysis.services.map(s => `  - ${s.name}`).join('\n')}

# Monitoring
enable_monitoring: true
enable_prometheus: true
enable_grafana: true
enable_logging: true

# ArgoCD
enable_argocd: true
argocd_version: "2.9.0"
`;
  }

  private generateDeployAllPlaybook(analysis: ProjectAnalysis, projectName: string): string {
    return `---
- name: Deploy ${analysis.projectName} - Complete Setup
  hosts: localhost
  connection: local
  gather_facts: yes

  tasks:
    - name: Display deployment information
      debug:
        msg:
          - "Project: {{ project_name }}"
          - "Region: {{ aws_region }}"
          - "Cluster: {{ cluster_name }}"
          - "Services: ${analysis.services.length}"

    - name: Setup AWS Infrastructure
      import_playbook: setup-infrastructure.yml

    - name: Deploy Services
      import_playbook: deploy-services.yml

    - name: Deploy Monitoring Stack
      import_playbook: setup-monitoring.yml
      when: enable_monitoring | bool

    - name: Display access information
      debug:
        msg:
          - "Deployment complete!"
          - "Run: kubectl get pods -n {{ project_name }}"
          - "Get ingress: kubectl get ingress -n {{ project_name }}"
`;
  }

  private generateInfrastructurePlaybook(projectName: string): string {
    return `---
- name: Setup AWS Infrastructure
  hosts: localhost
  connection: local
  gather_facts: yes

  tasks:
    - name: Get AWS account ID
      command: aws sts get-caller-identity --query Account --output text
      register: aws_account_output
      changed_when: false

    - name: Set AWS account ID fact
      set_fact:
        aws_account_id: "{{ aws_account_output.stdout }}"

    - name: Create VPC
      amazon.aws.ec2_vpc_net:
        name: "{{ cluster_name }}-vpc"
        cidr_block: "{{ vpc_cidr }}"
        region: "{{ aws_region }}"
        tags:
          Name: "{{ cluster_name }}-vpc"
          Project: "{{ project_name }}"
      register: vpc

    - name: Create Internet Gateway
      amazon.aws.ec2_vpc_igw:
        vpc_id: "{{ vpc.vpc.id }}"
        region: "{{ aws_region }}"
        tags:
          Name: "{{ cluster_name }}-igw"
      register: igw

    - name: Create EKS Cluster
      include_role:
        name: eks-cluster

    - name: Create ECR Repositories
      include_role:
        name: ecr-repos

    - name: Update kubeconfig
      command: >
        aws eks update-kubeconfig
        --name {{ cluster_name }}
        --region {{ aws_region }}
      changed_when: false

    - name: Wait for cluster to be ready
      command: kubectl get nodes
      register: nodes
      until: nodes.rc == 0
      retries: 10
      delay: 30
      changed_when: false

    - name: Install NGINX Ingress Controller
      kubernetes.core.helm:
        name: ingress-nginx
        chart_ref: ingress-nginx/ingress-nginx
        release_namespace: ingress-nginx
        create_namespace: yes
        values:
          controller:
            service:
              type: LoadBalancer

    - name: Install ArgoCD
      kubernetes.core.helm:
        name: argocd
        chart_ref: argo/argo-cd
        release_namespace: argocd
        create_namespace: yes
      when: enable_argocd | bool
`;
  }

  private generateServicesPlaybook(analysis: ProjectAnalysis, projectName: string): string {
    return `---
- name: Deploy Services
  hosts: localhost
  connection: local
  gather_facts: yes

  tasks:
    - name: Create namespace
      kubernetes.core.k8s:
        name: "{{ project_name }}"
        kind: Namespace
        state: present

    - name: Build and push Docker images
      include_tasks: build-and-push.yml
      loop: "{{ services }}"
      loop_control:
        loop_var: service

    - name: Deploy Kubernetes manifests
      include_role:
        name: k8s-deploy

    - name: Wait for deployments to be ready
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: "{{ project_name }}"
        name: "{{ item.name }}"
        wait: yes
        wait_condition:
          type: Available
          status: "True"
        wait_timeout: 300
      loop: "{{ services }}"

    - name: Get service endpoints
      kubernetes.core.k8s_info:
        kind: Service
        namespace: "{{ project_name }}"
      register: services_info

    - name: Display service information
      debug:
        msg:
          - "Services deployed successfully!"
          - "{{ services_info }}"
`;
  }

  private generateRollbackPlaybook(analysis: ProjectAnalysis, projectName: string): string {
    return `---
- name: Rollback Deployment
  hosts: localhost
  connection: local
  gather_facts: yes

  vars_prompt:
    - name: rollback_revision
      prompt: "Enter revision to rollback to (leave empty for previous)"
      private: no

  tasks:
    - name: Get deployment history
      command: >
        kubectl rollout history deployment/{{ item.name }}
        -n {{ project_name }}
      loop: "{{ services }}"
      register: history
      changed_when: false

    - name: Display deployment history
      debug:
        msg: "{{ history.results | map(attribute='stdout') | list }}"

    - name: Rollback deployments
      command: >
        kubectl rollout undo deployment/{{ item.name }}
        -n {{ project_name }}
        {% if rollback_revision %}--to-revision={{ rollback_revision }}{% endif %}
      loop: "{{ services }}"
      register: rollback_result

    - name: Wait for rollback to complete
      command: >
        kubectl rollout status deployment/{{ item.name }}
        -n {{ project_name }}
      loop: "{{ services }}"
      changed_when: false

    - name: Verify rollback
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: "{{ project_name }}"
        name: "{{ item.name }}"
      loop: "{{ services }}"
      register: deployment_status

    - name: Display rollback results
      debug:
        msg: "Rollback completed for {{ item.item.name }}"
      loop: "{{ deployment_status.results }}"
`;
  }

  private generateEKSRole(): string {
    return `---
- name: Create EKS cluster
  community.aws.eks_cluster:
    name: "{{ cluster_name }}"
    version: "{{ cluster_version }}"
    role_arn: "arn:aws:iam::{{ aws_account_id }}:role/eks-cluster-role"
    subnets_ids:
      - "{{ private_subnet_1_id }}"
      - "{{ private_subnet_2_id }}"
    security_groups:
      - "{{ eks_security_group_id }}"
    region: "{{ aws_region }}"
    wait: yes
    wait_timeout: 1800

- name: Create EKS node group
  community.aws.eks_nodegroup:
    name: "{{ item.name }}"
    cluster_name: "{{ cluster_name }}"
    node_role: "arn:aws:iam::{{ aws_account_id }}:role/eks-node-role"
    subnets:
      - "{{ private_subnet_1_id }}"
      - "{{ private_subnet_2_id }}"
    instance_types: "{{ item.instance_types }}"
    scaling_config:
      min_size: "{{ item.min_size }}"
      max_size: "{{ item.max_size }}"
      desired_size: "{{ item.desired_size }}"
    disk_size: "{{ item.disk_size }}"
    region: "{{ aws_region }}"
    wait: yes
  loop: "{{ eks_node_groups }}"
`;
  }

  private generateECRRole(analysis: ProjectAnalysis): string {
    return `---
- name: Create ECR repositories
  community.aws.ecs_ecr:
    name: "{{ cluster_name }}/{{ item }}"
    region: "{{ aws_region }}"
    scan_on_push: yes
    image_tag_mutability: MUTABLE
  loop:
${analysis.services.map(s => `    - ${s.name}`).join('\n')}
  register: ecr_repos

- name: Set lifecycle policy
  command: >
    aws ecr put-lifecycle-policy
    --repository-name {{ cluster_name }}/{{ item }}
    --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"Keep last 30 images","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":30},"action":{"type":"expire"}}]}'
    --region {{ aws_region }}
  loop:
${analysis.services.map(s => `    - ${s.name}`).join('\n')}
  changed_when: true
`;
  }

  private generateK8sDeployRole(): string {
    return `---
- name: Deploy Kubernetes manifests
  kubernetes.core.k8s:
    src: "{{ item }}"
    state: present
    namespace: "{{ project_name }}"
  with_fileglob:
    - ../../../k8s/*.yaml

- name: Deploy Helm charts
  kubernetes.core.helm:
    name: "{{ item.name }}"
    chart_ref: "../../../helm/charts/{{ item.name }}"
    release_namespace: "{{ project_name }}"
    create_namespace: yes
    values:
      image:
        repository: "{{ ecr_registry }}/{{ item.name }}"
        tag: latest
  loop: "{{ services }}"
`;
  }

  private generateAnsibleReadme(analysis: ProjectAnalysis, projectName: string): string {
    return `# Ansible Deployment for ${analysis.projectName}

Alternative deployment method using Ansible instead of Terraform.

## Prerequisites

\`\`\`bash
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
\`\`\`

## Directory Structure

\`\`\`
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
\`\`\`

## Usage

### Complete Deployment

\`\`\`bash
ansible-playbook playbooks/deploy-all.yml
\`\`\`

### Infrastructure Only

\`\`\`bash
ansible-playbook playbooks/setup-infrastructure.yml
\`\`\`

### Services Only

\`\`\`bash
ansible-playbook playbooks/deploy-services.yml
\`\`\`

### Rollback

\`\`\`bash
ansible-playbook playbooks/rollback.yml
\`\`\`

## Configuration

Edit \`group_vars/all.yml\` to customize:

- AWS region and credentials
- Cluster size and instance types
- Service replicas and resources
- Enable/disable monitoring

## Variables

| Variable | Description | Default |
|----------|-------------|---------|
| \`aws_region\` | AWS region | us-east-1 |
| \`cluster_name\` | EKS cluster name | ${projectName}-cluster |
| \`cluster_version\` | Kubernetes version | 1.33 |
| \`enable_monitoring\` | Install Prometheus/Grafana | true |
| \`enable_argocd\` | Install ArgoCD | true |

## Playbook Tags

Run specific tasks with tags:

\`\`\`bash
# Only create VPC
ansible-playbook playbooks/setup-infrastructure.yml --tags vpc

# Only deploy specific service
ansible-playbook playbooks/deploy-services.yml --tags ui

# Skip monitoring
ansible-playbook playbooks/deploy-all.yml --skip-tags monitoring
\`\`\`

## Troubleshooting

\`\`\`bash
# Check syntax
ansible-playbook playbooks/deploy-all.yml --syntax-check

# Dry run
ansible-playbook playbooks/deploy-all.yml --check

# Verbose output
ansible-playbook playbooks/deploy-all.yml -vvv

# Run specific hosts
ansible-playbook playbooks/deploy-all.yml --limit eks_cluster
\`\`\`

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
`;
  }
}
