import type { ProjectAnalysis, ResourceRequirements, ServiceResources, HelmChartConfig } from '../types/index.js';

export class HelmGenerator {
  generateHelmCharts(
    analysis: ProjectAnalysis,
    resources: ResourceRequirements
  ): Record<string, Record<string, string>> {
    const charts: Record<string, Record<string, string>> = {};

    // Generate individual Helm charts for each service
    analysis.services.forEach((service, index) => {
      const serviceResources = resources.services[index];
      charts[service.name] = this.generateServiceHelmChart(
        service,
        serviceResources,
        analysis.projectName
      );
    });

    // Generate umbrella chart for the entire application
    charts['umbrella'] = this.generateUmbrellaChart(analysis, resources);

    return charts;
  }

  private generateServiceHelmChart(
    service: any,
    resources: ServiceResources,
    projectName: string
  ): Record<string, string> {
    return {
      'Chart.yaml': this.generateChartYaml(service.name, projectName),
      'values.yaml': this.generateValuesYaml(service, resources),
      'templates/deployment.yaml': this.generateDeploymentTemplate(),
      'templates/service.yaml': this.generateServiceTemplate(),
      'templates/hpa.yaml': this.generateHPATemplate(),
      'templates/serviceaccount.yaml': this.generateServiceAccountTemplate(),
      'templates/configmap.yaml': this.generateConfigMapTemplate(),
      'templates/ingress.yaml': this.generateIngressTemplate(),
      'templates/_helpers.tpl': this.generateHelpersTemplate(),
      '.helmignore': this.generateHelmIgnore()
    };
  }

  private generateChartYaml(serviceName: string, projectName: string): string {
    return `apiVersion: v2
name: ${serviceName}
description: Helm chart for ${serviceName} service
type: application
version: 1.0.0
appVersion: "1.0"
keywords:
  - ${serviceName}
  - ${projectName}
  - microservice
home: https://github.com/your-org/${projectName}
sources:
  - https://github.com/your-org/${projectName}
maintainers:
  - name: DevOps Team
    email: devops@example.com
`;
  }

  private generateValuesYaml(service: any, resources: ServiceResources): string {
    return `# Default values for ${service.name}
replicaCount: ${resources.replicas}

image:
  repository: \${ECR_REGISTRY}/${service.name}
  pullPolicy: Always
  tag: "latest"

imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

serviceAccount:
  create: true
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::\${AWS_ACCOUNT_ID}:role/${service.name}-role
  name: ${service.name}

podAnnotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "${service.port || 8080}"
  prometheus.io/path: "/metrics"

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000

securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
    - ALL
  readOnlyRootFilesystem: true

service:
  type: ClusterIP
  port: 80
  targetPort: ${service.port || 8080}
  protocol: TCP

ingress:
  enabled: false
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: ${service.name}.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ${service.name}-tls
      hosts:
        - ${service.name}.example.com

resources:
  limits:
    cpu: ${resources.cpu.limit}
    memory: ${resources.memory.limit}
  requests:
    cpu: ${resources.cpu.request}
    memory: ${resources.memory.request}

autoscaling:
  enabled: ${resources.autoscaling.enabled}
  minReplicas: ${resources.autoscaling.minReplicas}
  maxReplicas: ${resources.autoscaling.maxReplicas}
  targetCPUUtilizationPercentage: ${resources.autoscaling.targetCPU}
  ${resources.autoscaling.targetMemory ? `targetMemoryUtilizationPercentage: ${resources.autoscaling.targetMemory}` : ''}

nodeSelector: {}

tolerations: []

affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
              - key: app.kubernetes.io/name
                operator: In
                values:
                  - ${service.name}
          topologyKey: kubernetes.io/hostname

livenessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /ready
    port: http
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3

env:
  - name: SERVICE_NAME
    value: ${service.name}
  - name: LOG_LEVEL
    value: info
  - name: NODE_ENV
    value: production

envFrom:
  - configMapRef:
      name: ${service.name}-config
  - secretRef:
      name: ${service.name}-secrets
      optional: true

${resources.storage ? `
persistence:
  enabled: true
  storageClass: gp3
  accessMode: ReadWriteOnce
  size: ${resources.storage.size}
  mountPath: /data
` : ''}

podDisruptionBudget:
  enabled: ${resources.replicas > 1}
  minAvailable: ${Math.ceil(resources.replicas * 0.5)}

serviceMonitor:
  enabled: true
  interval: 30s
  scrapeTimeout: 10s
  path: /metrics
`;
  }

  private generateDeploymentTemplate(): string {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "chart.fullname" . }}
  labels:
    {{- include "chart.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "chart.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        {{- with .Values.podAnnotations }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
      labels:
        {{- include "chart.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "chart.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
      - name: {{ .Chart.Name }}
        securityContext:
          {{- toYaml .Values.securityContext | nindent 12 }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: {{ .Values.service.targetPort }}
          protocol: TCP
        {{- if .Values.livenessProbe }}
        livenessProbe:
          {{- toYaml .Values.livenessProbe | nindent 12 }}
        {{- end }}
        {{- if .Values.readinessProbe }}
        readinessProbe:
          {{- toYaml .Values.readinessProbe | nindent 12 }}
        {{- end }}
        resources:
          {{- toYaml .Values.resources | nindent 12 }}
        {{- if .Values.env }}
        env:
          {{- toYaml .Values.env | nindent 12 }}
        {{- end }}
        {{- if .Values.envFrom }}
        envFrom:
          {{- toYaml .Values.envFrom | nindent 12 }}
        {{- end }}
        {{- if .Values.persistence.enabled }}
        volumeMounts:
        - name: data
          mountPath: {{ .Values.persistence.mountPath }}
        {{- end }}
      {{- if .Values.persistence.enabled }}
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: {{ include "chart.fullname" . }}-pvc
      {{- end }}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
`;
  }

  private generateServiceTemplate(): string {
    return `apiVersion: v1
kind: Service
metadata:
  name: {{ include "chart.fullname" . }}
  labels:
    {{- include "chart.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: {{ .Values.service.protocol }}
      name: http
  selector:
    {{- include "chart.selectorLabels" . | nindent 4 }}
`;
  }

  private generateHPATemplate(): string {
    return `{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "chart.fullname" . }}
  labels:
    {{- include "chart.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "chart.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    {{- if .Values.autoscaling.targetCPUUtilizationPercentage }}
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
    {{- end }}
    {{- if .Values.autoscaling.targetMemoryUtilizationPercentage }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetMemoryUtilizationPercentage }}
    {{- end }}
{{- end }}
`;
  }

  private generateServiceAccountTemplate(): string {
    return `{{- if .Values.serviceAccount.create -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "chart.serviceAccountName" . }}
  labels:
    {{- include "chart.labels" . | nindent 4 }}
  {{- with .Values.serviceAccount.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
{{- end }}
`;
  }

  private generateConfigMapTemplate(): string {
    return `apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "chart.fullname" . }}-config
  labels:
    {{- include "chart.labels" . | nindent 4 }}
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  PORT: "{{ .Values.service.targetPort }}"
`;
  }

  private generateIngressTemplate(): string {
    return `{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "chart.fullname" . }}
  labels:
    {{- include "chart.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  ingressClassName: {{ .Values.ingress.className }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
      secretName: {{ .secretName }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "chart.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
`;
  }

  private generateHelpersTemplate(): string {
    return `{{/*
Expand the name of the chart.
*/}}
{{- define "chart.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "chart.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "chart.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "chart.labels" -}}
helm.sh/chart: {{ include "chart.chart" . }}
{{ include "chart.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "chart.selectorLabels" -}}
app.kubernetes.io/name: {{ include "chart.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "chart.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "chart.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
`;
  }

  private generateHelmIgnore(): string {
    return `.DS_Store
.git/
.gitignore
.bzr/
.bzrignore
.hg/
.hgignore
.svn/
*.swp
*.bak
*.tmp
*.orig
*~
.project
.idea/
*.tmproj
.vscode/
`;
  }

  private generateUmbrellaChart(
    analysis: ProjectAnalysis,
    resources: ResourceRequirements
  ): Record<string, string> {
    const projectName = analysis.projectName.toLowerCase();

    return {
      'Chart.yaml': `apiVersion: v2
name: ${projectName}
description: Umbrella Helm chart for ${analysis.projectName}
type: application
version: 1.0.0
appVersion: "1.0"
dependencies:
${analysis.services.map(s => `  - name: ${s.name}
    version: "1.0.0"
    repository: "file://charts/${s.name}"
    condition: ${s.name}.enabled`).join('\n')}
`,
      'values.yaml': `# Global values shared across all services
global:
  imageRegistry: \${ECR_REGISTRY}
  imagePullPolicy: Always
  storageClass: gp3

  # AWS Configuration
  aws:
    region: us-east-1
    accountId: \${AWS_ACCOUNT_ID}

# Individual service configurations
${analysis.services.map((s, i) => `${s.name}:
  enabled: true
  replicaCount: ${resources.services[i].replicas}
  image:
    tag: latest
  resources:
    limits:
      cpu: ${resources.services[i].cpu.limit}
      memory: ${resources.services[i].memory.limit}
    requests:
      cpu: ${resources.services[i].cpu.request}
      memory: ${resources.services[i].memory.request}
`).join('\n')}
`,
      'README.md': `# ${analysis.projectName} Helm Chart

This is an umbrella chart that deploys all services for ${analysis.projectName}.

## Installation

\`\`\`bash
# Add dependencies
helm dependency update

# Install the chart
helm install ${projectName} . -n ${projectName} --create-namespace

# Upgrade
helm upgrade ${projectName} . -n ${projectName}
\`\`\`

## Services

${analysis.services.map(s => `- **${s.name}** - ${s.language}${s.framework ? ` (${s.framework})` : ''}`).join('\n')}

## Configuration

See \`values.yaml\` for all configuration options.
`
    };
  }
}
