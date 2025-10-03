import type { ProjectAnalysis, GitOpsConfig, ArgoApplication } from '../types/index.js';

export class ArgoCDGenerator {
  generateArgoCDSetup(
    analysis: ProjectAnalysis,
    repoURL: string = 'https://github.com/your-org/your-repo.git'
  ): Record<string, string> {
    const projectName = analysis.projectName.toLowerCase();

    return {
      'argocd/projects/project.yaml': this.generateProject(analysis, projectName),
      'argocd/applications/umbrella-app.yaml': this.generateUmbrellaApplication(
        analysis,
        projectName,
        repoURL
      ),
      ...this.generateServiceApplications(analysis, projectName, repoURL),
      'argocd/README.md': this.generateReadme(analysis, projectName),
      'argocd/sync-waves.md': this.generateSyncWavesDoc()
    };
  }

  private generateProject(analysis: ProjectAnalysis, projectName: string): string {
    return `apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: ${projectName}
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  description: ${analysis.projectName} project

  # Source repositories
  sourceRepos:
    - '*'  # Allow all repos (restrict in production)

  # Destination clusters and namespaces
  destinations:
    - namespace: ${projectName}
      server: https://kubernetes.default.svc
    - namespace: '*'
      server: https://kubernetes.default.svc

  # Cluster resource whitelist
  clusterResourceWhitelist:
    - group: '*'
      kind: '*'

  # Namespace resource whitelist
  namespaceResourceWhitelist:
    - group: '*'
      kind: '*'

  # Roles for access control
  roles:
    - name: admin
      description: Admin access to ${projectName}
      policies:
        - p, proj:${projectName}:admin, applications, *, ${projectName}/*, allow
      groups:
        - ${projectName}-admins

    - name: developer
      description: Developer access to ${projectName}
      policies:
        - p, proj:${projectName}:developer, applications, get, ${projectName}/*, allow
        - p, proj:${projectName}:developer, applications, sync, ${projectName}/*, allow
      groups:
        - ${projectName}-developers
`;
  }

  private generateUmbrellaApplication(
    analysis: ProjectAnalysis,
    projectName: string,
    repoURL: string
  ): string {
    return `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${projectName}-umbrella
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
  annotations:
    argocd.argoproj.io/sync-wave: "0"
spec:
  project: ${projectName}

  source:
    repoURL: ${repoURL}
    targetRevision: HEAD
    path: helm/${projectName}
    helm:
      releaseName: ${projectName}
      valueFiles:
        - values.yaml
      parameters:
        - name: global.imageRegistry
          value: \${ECR_REGISTRY}

  destination:
    server: https://kubernetes.default.svc
    namespace: ${projectName}

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m

  revisionHistoryLimit: 10

  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
`;
  }

  private generateServiceApplications(
    analysis: ProjectAnalysis,
    projectName: string,
    repoURL: string
  ): Record<string, string> {
    const apps: Record<string, string> = {};

    analysis.services.forEach((service, index) => {
      apps[`argocd/applications/${service.name}-app.yaml`] = `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${projectName}-${service.name}
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
  annotations:
    argocd.argoproj.io/sync-wave: "${index + 1}"
    notifications.argoproj.io/subscribe.on-deployed.slack: ${projectName}-notifications
    notifications.argoproj.io/subscribe.on-sync-failed.slack: ${projectName}-alerts
spec:
  project: ${projectName}

  source:
    repoURL: ${repoURL}
    targetRevision: HEAD
    path: helm/charts/${service.name}
    helm:
      releaseName: ${service.name}
      valueFiles:
        - values.yaml
        - values-prod.yaml
      parameters:
        - name: image.tag
          value: latest
        - name: image.repository
          value: \${ECR_REGISTRY}/${service.name}

  destination:
    server: https://kubernetes.default.svc
    namespace: ${projectName}

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
    retry:
      limit: 3
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 1m

  # Health assessment
  health:
    - kind: Deployment
      check: |
        hs = {}
        if obj.status ~= nil then
          if obj.status.updatedReplicas == obj.spec.replicas and
             obj.status.replicas == obj.spec.replicas and
             obj.status.availableReplicas == obj.spec.replicas then
            hs.status = "Healthy"
            hs.message = "All replicas are ready"
            return hs
          end
        end
        hs.status = "Progressing"
        hs.message = "Waiting for all replicas"
        return hs
`;
    });

    return apps;
  }

  private generateReadme(analysis: ProjectAnalysis, projectName: string): string {
    return `# ArgoCD Configuration for ${analysis.projectName}

This directory contains ArgoCD Application manifests for GitOps deployment.

## Structure

\`\`\`
argocd/
├── projects/
│   └── project.yaml           # ArgoCD Project definition
├── applications/
│   ├── umbrella-app.yaml      # Umbrella application (all services)
${analysis.services.map(s => `│   ├── ${s.name}-app.yaml      # ${s.name} service application`).join('\n')}
└── README.md
\`\`\`

## Installation

### 1. Install ArgoCD

\`\`\`bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
\`\`\`

### 2. Access ArgoCD UI

\`\`\`bash
# Port forward
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
\`\`\`

### 3. Deploy Project

\`\`\`bash
# Create the project
kubectl apply -f argocd/projects/project.yaml

# Deploy umbrella application (deploys all services)
kubectl apply -f argocd/applications/umbrella-app.yaml

# Or deploy services individually
kubectl apply -f argocd/applications/
\`\`\`

## Sync Waves

Services are deployed in order using sync waves:

${analysis.services.map((s, i) => `- Wave ${i + 1}: ${s.name}`).join('\n')}

## Automated Sync

All applications have automated sync enabled:
- **prune**: Remove resources not in Git
- **selfHeal**: Revert manual changes
- **retry**: Automatic retry on failure

## Notifications

Configure Slack notifications in ArgoCD:

\`\`\`yaml
# argocd-notifications-cm ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.slack: |
    token: $slack-token
  template.app-deployed: |
    message: Application {{.app.metadata.name}} deployed successfully
  trigger.on-deployed: |
    - send: [app-deployed]
\`\`\`

## Monitoring

Monitor ArgoCD applications:

\`\`\`bash
# List applications
kubectl get applications -n argocd

# Get application status
argocd app get ${projectName}-umbrella

# Sync application
argocd app sync ${projectName}-umbrella

# View logs
argocd app logs ${projectName}-umbrella
\`\`\`

## Rollback

\`\`\`bash
# List history
argocd app history ${projectName}-umbrella

# Rollback to specific revision
argocd app rollback ${projectName}-umbrella <revision-id>
\`\`\`

## Best Practices

1. **Use Git as single source of truth**
2. **Enable automated sync in production**
3. **Set up notifications for failures**
4. **Use sync waves for ordered deployment**
5. **Configure RBAC for team access**
6. **Monitor application health regularly**
`;
  }

  private generateSyncWavesDoc(): string {
    return `# ArgoCD Sync Waves

Sync waves control the order of resource deployment in ArgoCD.

## How It Works

Resources are deployed in order based on their \`argocd.argoproj.io/sync-wave\` annotation:

\`\`\`yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "1"
\`\`\`

## Wave Order

- **Wave -5**: Namespaces, CustomResourceDefinitions
- **Wave 0**: Infrastructure (databases, caches, secrets)
- **Wave 1**: Backend services
- **Wave 2**: API Gateway, middleware
- **Wave 3**: Frontend applications
- **Wave 5**: Monitoring, logging

## Example

\`\`\`yaml
# Deploy database first
apiVersion: v1
kind: Service
metadata:
  name: postgres
  annotations:
    argocd.argoproj.io/sync-wave: "0"

---
# Then deploy API that uses database
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  annotations:
    argocd.argoproj.io/sync-wave: "1"
\`\`\`

## Benefits

1. **Ordered Deployment**: Dependencies deployed first
2. **Reduced Errors**: No missing dependencies
3. **Predictable Rollouts**: Same order every time
4. **Easy Rollbacks**: Reverse order rollback

## Tips

- Leave gaps between waves (0, 5, 10) for future insertions
- Use negative waves for infrastructure
- Use positive waves for applications
- Document your wave strategy
`;
  }

  generateArgoCDNotifications(projectName: string): string {
    return `apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.slack: |
    token: $slack-token

  template.app-deployed: |
    email:
      subject: Application {{.app.metadata.name}} deployed
    message: |
      Application {{.app.metadata.name}} has been deployed.
      Sync Status: {{.app.status.sync.status}}
      Health Status: {{.app.status.health.status}}
    slack:
      attachments: |
        [{
          "title": "{{ .app.metadata.name}}",
          "title_link":"{{.context.argocdUrl}}/applications/{{.app.metadata.name}}",
          "color": "#18be52",
          "fields": [
            {
              "title": "Sync Status",
              "value": "{{.app.status.sync.status}}",
              "short": true
            },
            {
              "title": "Repository",
              "value": "{{.app.spec.source.repoURL}}",
              "short": true
            }
          ]
        }]

  template.app-health-degraded: |
    message: |
      Application {{.app.metadata.name}} health is degraded.
      Health Status: {{.app.status.health.status}}
    slack:
      attachments: |
        [{
          "title": "{{ .app.metadata.name}}",
          "title_link": "{{.context.argocdUrl}}/applications/{{.app.metadata.name}}",
          "color": "#f4c030",
          "fields": [
            {
              "title": "Health Status",
              "value": "{{.app.status.health.status}}",
              "short": true
            }
          ]
        }]

  template.app-sync-failed: |
    message: |
      Application {{.app.metadata.name}} sync failed.
      Sync Status: {{.app.status.sync.status}}
    slack:
      attachments: |
        [{
          "title": "{{ .app.metadata.name}}",
          "title_link": "{{.context.argocdUrl}}/applications/{{.app.metadata.name}}",
          "color": "#E96D76",
          "fields": [
            {
              "title": "Sync Status",
              "value": "{{.app.status.sync.status}}",
              "short": true
            },
            {
              "title": "Repository",
              "value": "{{.app.spec.source.repoURL}}",
              "short": true
            }
          ]
        }]

  trigger.on-deployed: |
    - description: Application is synced and healthy
      send:
      - app-deployed
      when: app.status.operationState.phase in ['Succeeded'] and app.status.health.status == 'Healthy'

  trigger.on-health-degraded: |
    - description: Application has degraded
      send:
      - app-health-degraded
      when: app.status.health.status == 'Degraded'

  trigger.on-sync-failed: |
    - description: Application syncing has failed
      send:
      - app-sync-failed
      when: app.status.operationState.phase in ['Error', 'Failed']

  subscriptions: |
    - recipients:
      - slack:${projectName}-notifications
      triggers:
      - on-deployed
      - on-health-degraded
      - on-sync-failed
`;
  }
}
