import { readFile, readdir } from 'fs/promises';
import { join, extname } from 'path';
import type { ProjectAnalysis, ServiceInfo } from '../types/index.js';

interface ServiceDependency {
  from: string;
  to: string;
  type: 'api' | 'database' | 'cache' | 'queue' | 'internal';
  details?: string;
}

interface DependencyGraph {
  services: string[];
  dependencies: ServiceDependency[];
  databases: Array<{ name: string; type: string }>;
  externalServices: string[];
}

interface ImpactAnalysis {
  service: string;
  directDependents: string[];
  indirectDependents: string[];
  databases: string[];
  criticalityScore: number;
  recommendation: string;
}

export class DependencyMapper {
  private servicePatterns = {
    // HTTP/API calls
    httpCalls: [
      /fetch\(['"]([^'"]+)['"]/g,
      /axios\.(get|post|put|delete)\(['"]([^'"]+)['"]/g,
      /http\.(get|post|put|delete)\(['"]([^'"]+)['"]/g,
      /RestTemplate.*\(['"]([^'"]+)['"]/g,
      /requests\.(get|post|put|delete)\(['"]([^'"]+)['"]/g,
    ],

    // Database connections
    databases: [
      /mongoose\.connect\(['"]([^'"]+)['"]/g,
      /new\s+Pool\(\{.*database:\s*['"]([^'"]+)['"]/gs,
      /createConnection\(\{.*database:\s*['"]([^'"]+)['"]/gs,
      /redis\.createClient/g,
      /MongoClient\.connect/g,
    ],

    // Service imports (microservices)
    imports: [
      /from\s+['"]\.\.\/([^'"]+)['"]/g,
      /require\(['"]\.\.\/([^'"]+)['"]/g,
      /import\s+.*\s+from\s+['"]@\/([^'"]+)['"]/g,
    ],
  };

  async mapDependencies(analysis: ProjectAnalysis): Promise<{
    graph: DependencyGraph;
    mermaidDiagram: string;
    impactAnalysis: ImpactAnalysis[];
  }> {
    const graph = await this.buildDependencyGraph(analysis);
    const mermaidDiagram = this.generateMermaidDiagram(graph);
    const impactAnalysis = this.analyzeImpact(graph, analysis);

    return {
      graph,
      mermaidDiagram,
      impactAnalysis,
    };
  }

  private async buildDependencyGraph(analysis: ProjectAnalysis): Promise<DependencyGraph> {
    const dependencies: ServiceDependency[] = [];
    const databases = new Set<string>();
    const externalServices = new Set<string>();

    // Analyze each service
    for (const service of analysis.services) {
      if (!service.path) continue;

      const files = await this.getServiceFiles(service.path);

      for (const file of files) {
        try {
          const content = await readFile(file, 'utf-8');

          // Detect HTTP/API calls
          const apiCalls = this.detectApiCalls(content, service.name);
          dependencies.push(...apiCalls);

          // Detect database usage
          const dbDeps = this.detectDatabaseDependencies(content, service.name);
          dependencies.push(...dbDeps);
          dbDeps.forEach(dep => databases.add(dep.to));

          // Detect internal service dependencies
          const internalDeps = this.detectInternalDependencies(content, service.name, analysis.services);
          dependencies.push(...internalDeps);
        } catch {
          // Skip files we can't read
        }
      }
    }

    // Detect databases from project analysis
    analysis.databases.forEach(db => {
      databases.add(`${db.type}-db`);
    });

    return {
      services: analysis.services.map(s => s.name),
      dependencies: this.deduplicateDependencies(dependencies),
      databases: Array.from(databases).map(name => ({
        name,
        type: this.inferDatabaseType(name)
      })),
      externalServices: Array.from(externalServices),
    };
  }

  private detectApiCalls(content: string, serviceName: string): ServiceDependency[] {
    const dependencies: ServiceDependency[] = [];

    for (const pattern of this.servicePatterns.httpCalls) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const url = match[1] || match[2];
        if (url && !url.startsWith('http')) {
          // Internal API call
          const targetService = this.extractServiceFromUrl(url);
          if (targetService && targetService !== serviceName) {
            dependencies.push({
              from: serviceName,
              to: targetService,
              type: 'api',
              details: `API call to ${url}`
            });
          }
        }
      }
    }

    return dependencies;
  }

  private detectDatabaseDependencies(content: string, serviceName: string): ServiceDependency[] {
    const dependencies: ServiceDependency[] = [];

    // PostgreSQL
    if (content.includes('pg') || content.includes('postgres')) {
      dependencies.push({
        from: serviceName,
        to: 'postgresql-db',
        type: 'database',
      });
    }

    // MongoDB
    if (content.includes('mongoose') || content.includes('mongodb')) {
      dependencies.push({
        from: serviceName,
        to: 'mongodb-db',
        type: 'database',
      });
    }

    // Redis
    if (content.includes('redis') || content.includes('ioredis')) {
      dependencies.push({
        from: serviceName,
        to: 'redis-cache',
        type: 'cache',
      });
    }

    // MySQL
    if (content.includes('mysql') || content.includes('mariadb')) {
      dependencies.push({
        from: serviceName,
        to: 'mysql-db',
        type: 'database',
      });
    }

    return dependencies;
  }

  private detectInternalDependencies(
    content: string,
    serviceName: string,
    services: ServiceInfo[]
  ): ServiceDependency[] {
    const dependencies: ServiceDependency[] = [];

    for (const pattern of this.servicePatterns.imports) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const importPath = match[1];
        const targetService = services.find(s =>
          importPath.includes(s.name) && s.name !== serviceName
        );

        if (targetService) {
          dependencies.push({
            from: serviceName,
            to: targetService.name,
            type: 'internal',
            details: `Imports from ${importPath}`
          });
        }
      }
    }

    return dependencies;
  }

  private extractServiceFromUrl(url: string): string | null {
    // Extract service name from URLs like "/api/users", "/services/product"
    const match = url.match(/\/(api\/)?([a-z-]+)/i);
    return match ? match[2] : null;
  }

  private inferDatabaseType(name: string): string {
    if (name.includes('postgres')) return 'postgresql';
    if (name.includes('mongo')) return 'mongodb';
    if (name.includes('redis')) return 'redis';
    if (name.includes('mysql')) return 'mysql';
    return 'unknown';
  }

  private deduplicateDependencies(dependencies: ServiceDependency[]): ServiceDependency[] {
    const seen = new Set<string>();
    return dependencies.filter(dep => {
      const key = `${dep.from}->${dep.to}-${dep.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private generateMermaidDiagram(graph: DependencyGraph): string {
    const lines: string[] = ['graph TD'];

    // Add service nodes
    graph.services.forEach(service => {
      lines.push(`    ${this.sanitizeId(service)}[${service}]:::service`);
    });

    // Add database nodes
    graph.databases.forEach(db => {
      const icon = this.getDatabaseIcon(db.type);
      lines.push(`    ${this.sanitizeId(db.name)}[(${icon} ${db.name})]:::database`);
    });

    // Add dependencies
    graph.dependencies.forEach(dep => {
      const fromId = this.sanitizeId(dep.from);
      const toId = this.sanitizeId(dep.to);
      const label = dep.type === 'api' ? 'API' : dep.type === 'database' ? 'DB' : '';
      lines.push(`    ${fromId} -->|${label}| ${toId}`);
    });

    // Add styling
    lines.push('');
    lines.push('    classDef service fill:#4A90E2,stroke:#2E5C8A,stroke-width:2px,color:#fff');
    lines.push('    classDef database fill:#E27D60,stroke:#C45A3C,stroke-width:2px,color:#fff');

    return lines.join('\n');
  }

  private getDatabaseIcon(type: string): string {
    const icons: Record<string, string> = {
      postgresql: '🐘',
      mongodb: '🍃',
      redis: '⚡',
      mysql: '🐬',
      unknown: '💾',
    };
    return icons[type] || icons.unknown;
  }

  private sanitizeId(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
  }

  private analyzeImpact(graph: DependencyGraph, analysis: ProjectAnalysis): ImpactAnalysis[] {
    const results: ImpactAnalysis[] = [];

    for (const service of graph.services) {
      // Find direct dependents (services that depend on this one)
      const directDependents = graph.dependencies
        .filter(dep => dep.to === service && graph.services.includes(dep.from))
        .map(dep => dep.from);

      // Find indirect dependents (cascade effect)
      const indirectDependents = this.findIndirectDependents(service, graph, new Set(directDependents));

      // Find databases this service depends on
      const databases = graph.dependencies
        .filter(dep => dep.from === service && dep.type === 'database')
        .map(dep => dep.to);

      // Calculate criticality score
      const criticalityScore = this.calculateCriticalityScore(
        directDependents.length,
        indirectDependents.length,
        databases.length
      );

      // Generate recommendation
      const recommendation = this.generateRecommendation(
        directDependents.length,
        indirectDependents.length,
        databases.length,
        criticalityScore
      );

      results.push({
        service,
        directDependents,
        indirectDependents,
        databases,
        criticalityScore,
        recommendation,
      });
    }

    // Sort by criticality (most critical first)
    return results.sort((a, b) => b.criticalityScore - a.criticalityScore);
  }

  private findIndirectDependents(
    service: string,
    graph: DependencyGraph,
    visited: Set<string>
  ): string[] {
    const indirect: string[] = [];

    // Find services that depend on the direct dependents
    for (const dependent of visited) {
      const nextLevel = graph.dependencies
        .filter(dep => dep.to === dependent && !visited.has(dep.from))
        .map(dep => dep.from);

      nextLevel.forEach(svc => {
        if (!indirect.includes(svc) && svc !== service) {
          indirect.push(svc);
          visited.add(svc);
        }
      });
    }

    return indirect;
  }

  private calculateCriticalityScore(
    directDependents: number,
    indirectDependents: number,
    databases: number
  ): number {
    // Score 0-100
    const directWeight = directDependents * 20;
    const indirectWeight = indirectDependents * 10;
    const dbWeight = databases * 15;

    return Math.min(100, directWeight + indirectWeight + dbWeight);
  }

  private generateRecommendation(
    directDependents: number,
    indirectDependents: number,
    databases: number,
    score: number
  ): string {
    if (score >= 80) {
      return `🚨 CRITICAL: This service has high impact. Consider: (1) Add redundancy/replicas (2) Implement circuit breakers (3) Set up failover (4) Monitor closely`;
    }

    if (score >= 50) {
      return `⚠️  HIGH IMPACT: Consider adding health checks, implementing graceful degradation, and monitoring dependencies`;
    }

    if (databases > 0 && directDependents > 0) {
      return `💡 MODERATE: Shared database detected. Consider read replicas and connection pooling`;
    }

    if (directDependents === 0) {
      return `✅ LOW IMPACT: Leaf service with no dependents. Safe to modify independently`;
    }

    return `✅ NORMAL: Standard monitoring and best practices recommended`;
  }

  private async getServiceFiles(servicePath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(servicePath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(servicePath, entry.name);

        if (entry.isDirectory() && !this.shouldIgnoreDir(entry.name)) {
          const subFiles = await this.getServiceFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && this.isCodeFile(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return files;
  }

  private shouldIgnoreDir(name: string): boolean {
    return ['node_modules', 'dist', 'build', '.git', 'coverage'].includes(name);
  }

  private isCodeFile(filename: string): boolean {
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.rb', '.php'];
    return codeExtensions.includes(extname(filename));
  }
}
