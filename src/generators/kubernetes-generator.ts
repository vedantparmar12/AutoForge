import type { ProjectAnalysis, ResourceRequirements, ServiceResources, KubernetesManifests } from '../types/index.js';
import * as yaml from 'js-yaml';

export class KubernetesGenerator {
  generateManifests(
    analysis: ProjectAnalysis,
    resources: ResourceRequirements
  ): KubernetesManifests {
    const namespace = analysis.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    return {
      deployments: this.generateDeployments(analysis, resources.services, namespace),
      services: this.generateServices(analysis.services, namespace),
      configMaps: this.generateConfigMaps(analysis, namespace),
      secrets: this.generateSecrets(analysis, namespace),
      ingress: this.generateIngress(analysis, namespace),
      hpa: this.generateHPA(resources.services, namespace),
      pdb: this.generatePDB(resources.services, namespace),
      serviceAccounts: this.generateServiceAccounts(analysis.services, namespace)
    };
  }

  private generateDeployments(
    analysis: ProjectAnalysis,
    servicesResources: ServiceResources[],
    namespace: string
  ): any[] {
    return analysis.services.map((service, index) => {
      const resources = servicesResources[index];

      return {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: service.name,
          namespace,
          labels: {
            app: service.name,
            'app.kubernetes.io/name': service.name,
            'app.kubernetes.io/component': this.getComponentType(service.name),
            'app.kubernetes.io/part-of': analysis.projectName
          }
        },
        spec: {
          replicas: resources.replicas,
          selector: {
            matchLabels: {
              app: service.name
            }
          },
          template: {
            metadata: {
              labels: {
                app: service.name,
                version: 'v1'
              },
              annotations: {
                'prometheus.io/scrape': 'true',
                'prometheus.io/port': service.port?.toString() || '8080',
                'prometheus.io/path': '/metrics'
              }
            },
            spec: {
              serviceAccountName: service.name,
              containers: [
                {
                  name: service.name,
                  image: `\${ECR_REGISTRY}/${service.name}:latest`,
                  imagePullPolicy: 'Always',
                  ports: [
                    {
                      name: 'http',
                      containerPort: service.port || 8080,
                      protocol: 'TCP'
                    }
                  ],
                  resources: {
                    requests: {
                      cpu: resources.cpu.request,
                      memory: resources.memory.request
                    },
                    limits: {
                      cpu: resources.cpu.limit,
                      memory: resources.memory.limit
                    }
                  },
                  env: [
                    {
                      name: 'SERVICE_NAME',
                      value: service.name
                    },
                    {
                      name: 'NAMESPACE',
                      valueFrom: {
                        fieldRef: {
                          fieldPath: 'metadata.namespace'
                        }
                      }
                    },
                    {
                      name: 'POD_IP',
                      valueFrom: {
                        fieldRef: {
                          fieldPath: 'status.podIP'
                        }
                      }
                    }
                  ],
                  envFrom: [
                    {
                      configMapRef: {
                        name: `${service.name}-config`
                      }
                    }
                  ],
                  livenessProbe: {
                    httpGet: {
                      path: '/health',
                      port: service.port || 8080
                    },
                    initialDelaySeconds: 30,
                    periodSeconds: 10,
                    timeoutSeconds: 5,
                    failureThreshold: 3
                  },
                  readinessProbe: {
                    httpGet: {
                      path: '/ready',
                      port: service.port || 8080
                    },
                    initialDelaySeconds: 10,
                    periodSeconds: 5,
                    timeoutSeconds: 3,
                    failureThreshold: 3
                  },
                  ...(resources.storage && {
                    volumeMounts: [
                      {
                        name: 'data',
                        mountPath: '/data'
                      }
                    ]
                  })
                }
              ],
              ...(resources.storage && {
                volumes: [
                  {
                    name: 'data',
                    persistentVolumeClaim: {
                      claimName: `${service.name}-pvc`
                    }
                  }
                ]
              })
            }
          }
        }
      };
    });
  }

  private generateServices(services: any[], namespace: string): any[] {
    return services.map(service => ({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: service.name,
        namespace,
        labels: {
          app: service.name
        }
      },
      spec: {
        type: 'ClusterIP',
        ports: [
          {
            port: 80,
            targetPort: service.port || 8080,
            protocol: 'TCP',
            name: 'http'
          }
        ],
        selector: {
          app: service.name
        }
      }
    }));
  }

  private generateConfigMaps(analysis: ProjectAnalysis, namespace: string): any[] {
    return analysis.services.map(service => ({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${service.name}-config`,
        namespace
      },
      data: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        PORT: (service.port || 8080).toString(),
        ...(service.framework && {
          FRAMEWORK: service.framework
        })
      }
    }));
  }

  private generateSecrets(analysis: ProjectAnalysis, namespace: string): any[] {
    return [
      {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: `${analysis.projectName}-secrets`,
          namespace
        },
        type: 'Opaque',
        stringData: {
          DATABASE_URL: 'REPLACE_WITH_DATABASE_URL',
          API_KEY: 'REPLACE_WITH_API_KEY',
          JWT_SECRET: 'REPLACE_WITH_JWT_SECRET'
        }
      }
    ];
  }

  private generateIngress(analysis: ProjectAnalysis, namespace: string): any {
    const uiService = analysis.services.find(s =>
      s.name.includes('ui') || s.name.includes('frontend') || s.name.includes('web')
    );

    if (!uiService) return null;

    return {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: `${analysis.projectName}-ingress`,
        namespace,
        annotations: {
          'kubernetes.io/ingress.class': 'nginx',
          'cert-manager.io/cluster-issuer': 'letsencrypt-prod',
          'nginx.ingress.kubernetes.io/ssl-redirect': 'true',
          'nginx.ingress.kubernetes.io/force-ssl-redirect': 'true'
        }
      },
      spec: {
        tls: [
          {
            hosts: [`${analysis.projectName}.example.com`],
            secretName: `${analysis.projectName}-tls`
          }
        ],
        rules: [
          {
            host: `${analysis.projectName}.example.com`,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: uiService.name,
                      port: {
                        number: 80
                      }
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    };
  }

  private generateHPA(servicesResources: ServiceResources[], namespace: string): any[] {
    return servicesResources
      .filter(s => s.autoscaling.enabled)
      .map(service => ({
        apiVersion: 'autoscaling/v2',
        kind: 'HorizontalPodAutoscaler',
        metadata: {
          name: service.serviceName,
          namespace
        },
        spec: {
          scaleTargetRef: {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            name: service.serviceName
          },
          minReplicas: service.autoscaling.minReplicas,
          maxReplicas: service.autoscaling.maxReplicas,
          metrics: [
            {
              type: 'Resource',
              resource: {
                name: 'cpu',
                target: {
                  type: 'Utilization',
                  averageUtilization: service.autoscaling.targetCPU
                }
              }
            },
            ...(service.autoscaling.targetMemory ? [{
              type: 'Resource',
              resource: {
                name: 'memory',
                target: {
                  type: 'Utilization',
                  averageUtilization: service.autoscaling.targetMemory
                }
              }
            }] : [])
          ],
          behavior: {
            scaleDown: {
              stabilizationWindowSeconds: 300,
              policies: [
                {
                  type: 'Percent',
                  value: 50,
                  periodSeconds: 15
                }
              ]
            },
            scaleUp: {
              stabilizationWindowSeconds: 0,
              policies: [
                {
                  type: 'Percent',
                  value: 100,
                  periodSeconds: 15
                },
                {
                  type: 'Pods',
                  value: 4,
                  periodSeconds: 15
                }
              ],
              selectPolicy: 'Max'
            }
          }
        }
      }));
  }

  private generatePDB(servicesResources: ServiceResources[], namespace: string): any[] {
    return servicesResources
      .filter(s => s.replicas > 1)
      .map(service => ({
        apiVersion: 'policy/v1',
        kind: 'PodDisruptionBudget',
        metadata: {
          name: service.serviceName,
          namespace
        },
        spec: {
          minAvailable: Math.ceil(service.replicas * 0.5),
          selector: {
            matchLabels: {
              app: service.serviceName
            }
          }
        }
      }));
  }

  private generateServiceAccounts(services: any[], namespace: string): any[] {
    return services.map(service => ({
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: {
        name: service.name,
        namespace,
        annotations: {
          'eks.amazonaws.com/role-arn': `arn:aws:iam::\${AWS_ACCOUNT_ID}:role/${service.name}-role`
        }
      }
    }));
  }

  private getComponentType(serviceName: string): string {
    const name = serviceName.toLowerCase();
    if (name.includes('ui') || name.includes('frontend')) return 'frontend';
    if (name.includes('api') || name.includes('service')) return 'backend';
    if (name.includes('db') || name.includes('database')) return 'database';
    if (name.includes('cache')) return 'cache';
    return 'service';
  }

  exportToYAML(manifests: KubernetesManifests): string {
    const allManifests = [
      ...manifests.deployments,
      ...manifests.services,
      ...manifests.configMaps,
      ...manifests.secrets,
      ...(manifests.ingress ? [manifests.ingress] : []),
      ...(manifests.hpa || []),
      ...(manifests.pdb || []),
      ...(manifests.serviceAccounts || [])
    ];

    return allManifests.map(m => yaml.dump(m)).join('---\n');
  }
}
