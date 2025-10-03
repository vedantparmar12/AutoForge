import type {
  ProjectAnalysis,
  ResourceRequirements,
  ServiceResources,
  InfrastructureRequirements,
  CostEstimate
} from '../types/index.js';

export class ResourceCalculator {
  // AWS pricing (approximate monthly costs in USD)
  private readonly pricing = {
    eks: {
      clusterHourly: 0.10, // EKS control plane
      't3.medium': 0.0416,
      't3.large': 0.0832,
      't3.xlarge': 0.1664,
      'm5.large': 0.096,
      'm5.xlarge': 0.192,
      'm5.2xlarge': 0.384
    },
    storage: {
      ebsGp3PerGB: 0.08,
      ebsIopsProvisioned: 0.065
    },
    networking: {
      loadBalancer: 16.2, // ALB monthly
      dataTransferPerGB: 0.09
    },
    rds: {
      't3.micro': 0.017,
      't3.small': 0.034,
      't3.medium': 0.068,
      't3.large': 0.136,
      storagePerGB: 0.115
    }
  };

  calculateResources(analysis: ProjectAnalysis): ResourceRequirements {
    const serviceResources = this.calculateServiceResources(analysis);
    const infrastructure = this.calculateInfrastructure(analysis, serviceResources);
    const estimated_cost = this.estimateCost(serviceResources, infrastructure, analysis);

    return {
      services: serviceResources,
      infrastructure,
      estimated_cost
    };
  }

  private calculateServiceResources(analysis: ProjectAnalysis): ServiceResources[] {
    return analysis.services.map(service => {
      const baseResources = this.getBaseResources(service.language, service.framework);
      const complexityMultiplier = this.getComplexityMultiplier(analysis.complexity);

      // Adjust based on dependencies count (more dependencies = more memory)
      const dependencyFactor = Math.min(service.dependencies.length / 50, 2);

      return {
        serviceName: service.name,
        replicas: this.calculateReplicas(analysis.complexity, service.name),
        cpu: {
          request: this.adjustResource(baseResources.cpu.request, complexityMultiplier),
          limit: this.adjustResource(baseResources.cpu.limit, complexityMultiplier)
        },
        memory: {
          request: this.adjustResource(
            baseResources.memory.request,
            complexityMultiplier * (1 + dependencyFactor * 0.3)
          ),
          limit: this.adjustResource(
            baseResources.memory.limit,
            complexityMultiplier * (1 + dependencyFactor * 0.3)
          )
        },
        storage: this.requiresStorage(service) ? {
          size: '10Gi',
          type: 'persistent' as const
        } : undefined,
        autoscaling: {
          enabled: analysis.complexity !== 'simple',
          minReplicas: this.calculateReplicas(analysis.complexity, service.name),
          maxReplicas: this.calculateMaxReplicas(analysis.complexity),
          targetCPU: 70,
          targetMemory: 80
        }
      };
    });
  }

  private getBaseResources(language: string, framework?: string): {
    cpu: { request: string; limit: string };
    memory: { request: string; limit: string };
  } {
    // Base resources by language/framework
    const resourceMap: Record<string, any> = {
      'Java': {
        cpu: { request: '500m', limit: '1000m' },
        memory: { request: '512Mi', limit: '1Gi' }
      },
      'JavaScript/TypeScript': {
        cpu: { request: '250m', limit: '500m' },
        memory: { request: '256Mi', limit: '512Mi' }
      },
      'Go': {
        cpu: { request: '200m', limit: '400m' },
        memory: { request: '128Mi', limit: '256Mi' }
      },
      'Python': {
        cpu: { request: '300m', limit: '600m' },
        memory: { request: '256Mi', limit: '512Mi' }
      },
      'Rust': {
        cpu: { request: '200m', limit: '500m' },
        memory: { request: '128Mi', limit: '256Mi' }
      }
    };

    // Framework-specific adjustments
    if (framework === 'Spring Boot') {
      return {
        cpu: { request: '500m', limit: '1500m' },
        memory: { request: '768Mi', limit: '1.5Gi' }
      };
    }

    if (framework === 'Next.js' || framework === 'React') {
      return {
        cpu: { request: '300m', limit: '800m' },
        memory: { request: '384Mi', limit: '768Mi' }
      };
    }

    return resourceMap[language] || {
      cpu: { request: '250m', limit: '500m' },
      memory: { request: '256Mi', limit: '512Mi' }
    };
  }

  private getComplexityMultiplier(complexity: string): number {
    const multipliers = {
      simple: 1,
      moderate: 1.5,
      complex: 2,
      enterprise: 3
    };
    return multipliers[complexity as keyof typeof multipliers] || 1;
  }

  private calculateReplicas(complexity: string, serviceName: string): number {
    const baseReplicas = {
      simple: 1,
      moderate: 2,
      complex: 3,
      enterprise: 5
    };

    // UI/Frontend services might need more replicas
    if (serviceName.includes('ui') || serviceName.includes('frontend')) {
      return baseReplicas[complexity as keyof typeof baseReplicas] + 1;
    }

    return baseReplicas[complexity as keyof typeof baseReplicas] || 2;
  }

  private calculateMaxReplicas(complexity: string): number {
    const maxReplicas = {
      simple: 3,
      moderate: 5,
      complex: 10,
      enterprise: 20
    };
    return maxReplicas[complexity as keyof typeof maxReplicas] || 5;
  }

  private adjustResource(resource: string, multiplier: number): string {
    const match = resource.match(/^(\d+(?:\.\d+)?)(m|Mi|Gi|Ki)?$/);
    if (!match) return resource;

    const [, value, unit] = match;
    const numValue = parseFloat(value);
    const newValue = Math.ceil(numValue * multiplier);

    return `${newValue}${unit || ''}`;
  }

  private requiresStorage(service: any): boolean {
    // Services that typically need persistent storage
    const storagePatterns = ['database', 'db', 'cache', 'storage', 'data'];
    return storagePatterns.some(pattern =>
      service.name.toLowerCase().includes(pattern)
    );
  }

  private calculateInfrastructure(
    analysis: ProjectAnalysis,
    serviceResources: ServiceResources[]
  ): InfrastructureRequirements {
    const totalCpuRequest = serviceResources.reduce((sum, s) =>
      sum + this.cpuToNumber(s.cpu.request) * s.replicas, 0
    );

    const totalMemoryRequest = serviceResources.reduce((sum, s) =>
      sum + this.memoryToMB(s.memory.request) * s.replicas, 0
    );

    const nodeCount = this.calculateNodeCount(totalCpuRequest, totalMemoryRequest, analysis.complexity);
    const nodeType = this.selectNodeType(totalCpuRequest, totalMemoryRequest, analysis.complexity);

    return {
      kubernetes: {
        nodeCount,
        nodeType,
        nodeSize: this.getNodeSize(nodeType)
      },
      networking: {
        loadBalancer: true,
        ingress: true,
        serviceMesh: analysis.complexity === 'enterprise'
      },
      storage: {
        persistentVolumes: serviceResources.filter(s => s.storage).length,
        totalStorageGB: serviceResources
          .filter(s => s.storage)
          .reduce((sum, s) => sum + this.storageToGB(s.storage!.size), 0)
      },
      database: {
        managed: analysis.databases.length > 0,
        type: analysis.databases[0]?.type,
        instanceClass: this.selectDatabaseInstance(analysis.complexity)
      }
    };
  }

  private calculateNodeCount(cpuRequest: number, memoryMB: number, complexity: string): number {
    const complexityFactors = {
      simple: 2,
      moderate: 3,
      complex: 4,
      enterprise: 6
    };

    const basedOnCPU = Math.ceil(cpuRequest / 2); // Assuming 2 vCPU per node (t3.medium)
    const basedOnMemory = Math.ceil(memoryMB / 4096); // 4GB per node
    const basedOnComplexity = complexityFactors[complexity as keyof typeof complexityFactors] || 2;

    return Math.max(basedOnCPU, basedOnMemory, basedOnComplexity);
  }

  private selectNodeType(cpuRequest: number, memoryMB: number, complexity: string): string {
    if (complexity === 'enterprise' || cpuRequest > 8 || memoryMB > 16384) {
      return 'm5.xlarge'; // 4 vCPU, 16GB RAM
    } else if (complexity === 'complex' || cpuRequest > 4 || memoryMB > 8192) {
      return 'm5.large'; // 2 vCPU, 8GB RAM
    } else if (cpuRequest > 2 || memoryMB > 4096) {
      return 't3.large'; // 2 vCPU, 8GB RAM
    } else {
      return 't3.medium'; // 2 vCPU, 4GB RAM
    }
  }

  private getNodeSize(nodeType: string): string {
    const sizes: Record<string, string> = {
      't3.medium': '2 vCPU, 4GB RAM',
      't3.large': '2 vCPU, 8GB RAM',
      't3.xlarge': '4 vCPU, 16GB RAM',
      'm5.large': '2 vCPU, 8GB RAM',
      'm5.xlarge': '4 vCPU, 16GB RAM',
      'm5.2xlarge': '8 vCPU, 32GB RAM'
    };
    return sizes[nodeType] || nodeType;
  }

  private selectDatabaseInstance(complexity: string): string {
    const instances = {
      simple: 't3.micro',
      moderate: 't3.small',
      complex: 't3.medium',
      enterprise: 't3.large'
    };
    return instances[complexity as keyof typeof instances] || 't3.small';
  }

  private estimateCost(
    services: ServiceResources[],
    infrastructure: InfrastructureRequirements,
    analysis: ProjectAnalysis
  ): CostEstimate {
    const hoursPerMonth = 730;

    // Compute cost (EKS cluster + nodes)
    const eksClusterCost = this.pricing.eks.clusterHourly * hoursPerMonth;
    const nodeType = infrastructure.kubernetes.nodeType as keyof typeof this.pricing.eks;
    const nodeCost = (this.pricing.eks[nodeType] || 0.0416) * hoursPerMonth * infrastructure.kubernetes.nodeCount;
    const computeCost = eksClusterCost + nodeCost;

    // Storage cost
    const storageCost = infrastructure.storage.totalStorageGB * this.pricing.storage.ebsGp3PerGB;

    // Networking cost (load balancer + data transfer estimate)
    const networkingCost = this.pricing.networking.loadBalancer +
      (this.pricing.networking.dataTransferPerGB * 100); // Estimate 100GB transfer

    // Database cost (if managed)
    let databaseCost = 0;
    if (infrastructure.database.managed && infrastructure.database.instanceClass) {
      const instanceType = infrastructure.database.instanceClass as keyof typeof this.pricing.rds;
      databaseCost = (this.pricing.rds[instanceType] || 0.034) * hoursPerMonth +
        (50 * this.pricing.rds.storagePerGB); // 50GB database storage
    }

    const totalCost = computeCost + storageCost + networkingCost + databaseCost;

    return {
      monthly: {
        compute: Math.round(computeCost * 100) / 100,
        storage: Math.round(storageCost * 100) / 100,
        networking: Math.round(networkingCost * 100) / 100,
        database: Math.round(databaseCost * 100) / 100,
        total: Math.round(totalCost * 100) / 100
      },
      currency: 'USD'
    };
  }

  private cpuToNumber(cpu: string): number {
    if (cpu.endsWith('m')) {
      return parseInt(cpu) / 1000;
    }
    return parseFloat(cpu);
  }

  private memoryToMB(memory: string): number {
    if (memory.endsWith('Gi')) {
      return parseFloat(memory) * 1024;
    } else if (memory.endsWith('Mi')) {
      return parseFloat(memory);
    } else if (memory.endsWith('Ki')) {
      return parseFloat(memory) / 1024;
    }
    return parseFloat(memory);
  }

  private storageToGB(storage: string): number {
    if (storage.endsWith('Gi')) {
      return parseFloat(storage);
    } else if (storage.endsWith('Mi')) {
      return parseFloat(storage) / 1024;
    } else if (storage.endsWith('Ti')) {
      return parseFloat(storage) * 1024;
    }
    return parseFloat(storage);
  }
}
