import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ProjectAnalyzer } from '../analyzers/project-analyzer.js';

interface DockerComposeOptions {
  outputDir?: string;
  includeDevTools?: boolean;
  exposeAllPorts?: boolean;
  addHealthChecks?: boolean;
}

interface ServiceConfig {
  image?: string;
  build?: {
    context: string;
    dockerfile?: string;
  };
  ports?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  depends_on?: string[];
  networks?: string[];
  healthcheck?: {
    test: string[];
    interval: string;
    timeout: string;
    retries: number;
    start_period?: string;
  };
  restart?: string;
}

interface DockerComposeConfig {
  version: string;
  services: Record<string, ServiceConfig>;
  networks?: Record<string, any>;
  volumes?: Record<string, any>;
}

export class DockerComposeGenerator {
  private analyzer: ProjectAnalyzer;

  constructor() {
    this.analyzer = new ProjectAnalyzer();
  }

  async generate(
    projectPath: string, 
    options: DockerComposeOptions = {}
  ): Promise<{ files: string[]; config: DockerComposeConfig }> {
    const analysis = await this.analyzer.analyzeProject(projectPath);
    const outputDir = options.outputDir || projectPath;
    
    const dockerComposeConfig = await this.generateConfig(analysis, projectPath, options);
    const files: string[] = [];

    // Generate docker-compose.yml
    const dockerComposePath = path.join(outputDir, 'docker-compose.yml');
    await fs.writeFile(dockerComposePath, yaml.dump(dockerComposeConfig, { 
      indent: 2,
      lineWidth: -1 
    }));
    files.push(dockerComposePath);

    // Generate docker-compose.dev.yml for development overrides
    const devConfig = this.generateDevOverride(dockerComposeConfig);
    const dockerComposeDevPath = path.join(outputDir, 'docker-compose.dev.yml');
    await fs.writeFile(dockerComposeDevPath, yaml.dump(devConfig, { 
      indent: 2,
      lineWidth: -1 
    }));
    files.push(dockerComposeDevPath);

    // Generate Dockerfiles if needed
    const dockerfiles = await this.generateDockerfiles(analysis, outputDir);
    files.push(...dockerfiles);

    // Generate .env file
    const envFile = await this.generateEnvFile(analysis, outputDir);
    if (envFile) {
      files.push(envFile);
    }

    // Generate development scripts
    const scripts = await this.generateDevelopmentScripts(outputDir);
    files.push(...scripts);

    return { files, config: dockerComposeConfig };
  }

  private async generateConfig(
    analysis: any, 
    projectPath: string, 
    options: DockerComposeOptions
  ): Promise<DockerComposeConfig> {
    const config: DockerComposeConfig = {
      version: '3.8',
      services: {},
      networks: {
        'dev-network': {
          driver: 'bridge'
        }
      },
      volumes: {
        'node_modules': {},
        'postgres_data': {},
        'redis_data': {},
        'mongodb_data': {}
      }
    };

    // Add application services
    await this.addApplicationServices(config, analysis, projectPath, options);

    // Add database services
    this.addDatabaseServices(config, analysis, options);

    // Add caching services
    this.addCachingServices(config, analysis, options);

    // Add message queue services
    this.addMessageQueueServices(config, analysis, options);

    // Add development tools
    if (options.includeDevTools) {
      this.addDevelopmentTools(config, options);
    }

    return config;
  }

  private async addApplicationServices(
    config: DockerComposeConfig, 
    analysis: any, 
    projectPath: string,
    options: DockerComposeOptions
  ): Promise<void> {
    const mainService = this.determineMainService(analysis);
    const serviceConfig: ServiceConfig = {
      build: {
        context: '.',
        dockerfile: 'Dockerfile'
      },
      volumes: [
        '.:/app',
        'node_modules:/app/node_modules'
      ],
      environment: {
        NODE_ENV: 'development',
        PORT: '3000',
        ...this.generateEnvironmentVariables(analysis)
      },
      networks: ['dev-network'],
      restart: 'unless-stopped'
    };

    // Add ports
    serviceConfig.ports = this.determinePorts(analysis, options.exposeAllPorts);

    // Add health checks
    if (options.addHealthChecks) {
      serviceConfig.healthcheck = this.generateHealthCheck(analysis);
    }

    // Add dependencies
    const dependencies = this.determineDependencies(analysis);
    if (dependencies.length > 0) {
      serviceConfig.depends_on = dependencies;
    }

    config.services[mainService] = serviceConfig;

    // Add additional services for microservices
    if (analysis.architecture === 'microservices') {
      this.addMicroservices(config, analysis, options);
    }
  }

  private addDatabaseServices(
    config: DockerComposeConfig, 
    analysis: any, 
    options: DockerComposeOptions
  ): void {
    if (analysis.database?.includes('postgres')) {
      config.services['postgres'] = {
        image: 'postgres:15-alpine',
        environment: {
          POSTGRES_DB: '${POSTGRES_DB:-devdb}',
          POSTGRES_USER: '${POSTGRES_USER:-devuser}',
          POSTGRES_PASSWORD: '${POSTGRES_PASSWORD:-devpass}'
        },
        ports: options.exposeAllPorts ? ['5432:5432'] : [],
        volumes: ['postgres_data:/var/lib/postgresql/data'],
        networks: ['dev-network'],
        restart: 'unless-stopped'
      };

      if (options.addHealthChecks) {
        config.services['postgres'].healthcheck = {
          test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-devuser} -d ${POSTGRES_DB:-devdb}'],
          interval: '10s',
          timeout: '5s',
          retries: 5
        };
      }
    }

    if (analysis.database?.includes('mysql')) {
      config.services['mysql'] = {
        image: 'mysql:8.0',
        environment: {
          MYSQL_ROOT_PASSWORD: '${MYSQL_ROOT_PASSWORD:-rootpass}',
          MYSQL_DATABASE: '${MYSQL_DATABASE:-devdb}',
          MYSQL_USER: '${MYSQL_USER:-devuser}',
          MYSQL_PASSWORD: '${MYSQL_PASSWORD:-devpass}'
        },
        ports: options.exposeAllPorts ? ['3306:3306'] : [],
        volumes: ['mysql_data:/var/lib/mysql'],
        networks: ['dev-network'],
        restart: 'unless-stopped'
      };
    }

    if (analysis.database?.includes('mongodb')) {
      config.services['mongodb'] = {
        image: 'mongo:6.0',
        environment: {
          MONGO_INITDB_ROOT_USERNAME: '${MONGO_ROOT_USERNAME:-admin}',
          MONGO_INITDB_ROOT_PASSWORD: '${MONGO_ROOT_PASSWORD:-adminpass}',
          MONGO_INITDB_DATABASE: '${MONGO_DATABASE:-devdb}'
        },
        ports: options.exposeAllPorts ? ['27017:27017'] : [],
        volumes: ['mongodb_data:/data/db'],
        networks: ['dev-network'],
        restart: 'unless-stopped'
      };
    }
  }

  private addCachingServices(
    config: DockerComposeConfig, 
    analysis: any, 
    options: DockerComposeOptions
  ): void {
    if (analysis.services?.includes('redis') || analysis.frameworks?.includes('redis')) {
      config.services['redis'] = {
        image: 'redis:7-alpine',
        ports: options.exposeAllPorts ? ['6379:6379'] : [],
        volumes: ['redis_data:/data'],
        networks: ['dev-network'],
        restart: 'unless-stopped'
      };

      if (options.addHealthChecks) {
        config.services['redis'].healthcheck = {
          test: ['CMD', 'redis-cli', 'ping'],
          interval: '10s',
          timeout: '3s',
          retries: 5
        };
      }
    }

    if (analysis.services?.includes('memcached')) {
      config.services['memcached'] = {
        image: 'memcached:1.6-alpine',
        ports: options.exposeAllPorts ? ['11211:11211'] : [],
        networks: ['dev-network'],
        restart: 'unless-stopped'
      };
    }
  }

  private addMessageQueueServices(
    config: DockerComposeConfig, 
    analysis: any, 
    options: DockerComposeOptions
  ): void {
    if (analysis.services?.includes('rabbitmq')) {
      config.services['rabbitmq'] = {
        image: 'rabbitmq:3-management-alpine',
        environment: {
          RABBITMQ_DEFAULT_USER: '${RABBITMQ_USER:-admin}',
          RABBITMQ_DEFAULT_PASS: '${RABBITMQ_PASS:-adminpass}'
        },
        ports: options.exposeAllPorts ? ['5672:5672', '15672:15672'] : [],
        volumes: ['rabbitmq_data:/var/lib/rabbitmq'],
        networks: ['dev-network'],
        restart: 'unless-stopped'
      };
    }

    if (analysis.services?.includes('kafka')) {
      config.services['zookeeper'] = {
        image: 'confluentinc/cp-zookeeper:latest',
        environment: {
          ZOOKEEPER_CLIENT_PORT: '2181',
          ZOOKEEPER_TICK_TIME: '2000'
        },
        networks: ['dev-network']
      };

      config.services['kafka'] = {
        image: 'confluentinc/cp-kafka:latest',
        depends_on: ['zookeeper'],
        ports: options.exposeAllPorts ? ['9092:9092'] : [],
        environment: {
          KAFKA_BROKER_ID: '1',
          KAFKA_ZOOKEEPER_CONNECT: 'zookeeper:2181',
          KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://localhost:9092',
          KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1'
        },
        networks: ['dev-network']
      };
    }
  }

  private addDevelopmentTools(
    config: DockerComposeConfig, 
    options: DockerComposeOptions
  ): void {
    // Add pgAdmin for PostgreSQL
    if (config.services['postgres']) {
      config.services['pgadmin'] = {
        image: 'dpage/pgadmin4:latest',
        environment: {
          PGADMIN_DEFAULT_EMAIL: '${PGADMIN_EMAIL:-admin@admin.com}',
          PGADMIN_DEFAULT_PASSWORD: '${PGADMIN_PASSWORD:-adminpass}'
        },
        ports: ['8080:80'],
        networks: ['dev-network'],
        restart: 'unless-stopped'
      };
    }

    // Add Redis Commander
    if (config.services['redis']) {
      config.services['redis-commander'] = {
        image: 'rediscommander/redis-commander:latest',
        environment: {
          REDIS_HOSTS: 'local:redis:6379'
        },
        ports: ['8081:8081'],
        depends_on: ['redis'],
        networks: ['dev-network'],
        restart: 'unless-stopped'
      };
    }

    // Add Mailhog for email testing
    config.services['mailhog'] = {
      image: 'mailhog/mailhog:latest',
      ports: ['1025:1025', '8025:8025'],
      networks: ['dev-network'],
      restart: 'unless-stopped'
    };

    // Add Nginx for reverse proxy (if multiple services)
    if (Object.keys(config.services).length > 3) {
      config.services['nginx'] = {
        image: 'nginx:alpine',
        ports: ['80:80'],
        volumes: ['./nginx.conf:/etc/nginx/nginx.conf:ro'],
        depends_on: [this.determineMainService({ services: Object.keys(config.services) })],
        networks: ['dev-network'],
        restart: 'unless-stopped'
      };
    }
  }

  private addMicroservices(
    config: DockerComposeConfig, 
    analysis: any, 
    options: DockerComposeOptions
  ): void {
    if (analysis.microservices) {
      analysis.microservices.forEach((service: any, index: number) => {
        const serviceName = service.name || `service-${index + 1}`;
        config.services[serviceName] = {
          build: {
            context: service.path || '.',
            dockerfile: service.dockerfile || 'Dockerfile'
          },
          environment: {
            NODE_ENV: 'development',
            PORT: `${3001 + index}`,
            SERVICE_NAME: serviceName,
            ...this.generateEnvironmentVariables(service)
          },
          ports: [`${3001 + index}:${3001 + index}`],
          volumes: [
            `${service.path || '.'}:/app`,
            'node_modules:/app/node_modules'
          ],
          networks: ['dev-network'],
          restart: 'unless-stopped'
        };

        if (options.addHealthChecks) {
          config.services[serviceName].healthcheck = {
            test: [`CMD`, `curl`, `-f`, `http://localhost:${3001 + index}/health`],
            interval: '30s',
            timeout: '10s',
            retries: 3,
            start_period: '40s'
          };
        }
      });
    }
  }

  private generateDevOverride(config: DockerComposeConfig): any {
    const devOverride = {
      version: '3.8',
      services: {}
    };

    // Add development-specific overrides
    Object.keys(config.services).forEach(serviceName => {
      const service = config.services[serviceName];
      if (service.build) {
        devOverride.services[serviceName] = {
          volumes: [
            ...(service.volumes || []),
            './logs:/app/logs'
          ],
          environment: {
            ...service.environment,
            DEBUG: '*',
            LOG_LEVEL: 'debug'
          },
          command: service.build.context === '.' ? 'npm run dev' : undefined
        };
      }
    });

    return devOverride;
  }

  private async generateDockerfiles(analysis: any, outputDir: string): Promise<string[]> {
    const files: string[] = [];
    
    // Generate main Dockerfile
    const dockerfile = this.generateDockerfileContent(analysis);
    const dockerfilePath = path.join(outputDir, 'Dockerfile');
    await fs.writeFile(dockerfilePath, dockerfile);
    files.push(dockerfilePath);

    // Generate .dockerignore
    const dockerignore = this.generateDockerignoreContent();
    const dockerignorePath = path.join(outputDir, '.dockerignore');
    await fs.writeFile(dockerignorePath, dockerignore);
    files.push(dockerignorePath);

    return files;
  }

  private generateDockerfileContent(analysis: any): string {
    const language = analysis.languages?.[0] || 'javascript';
    
    if (language === 'javascript' || language === 'typescript') {
      return this.generateNodeDockerfile(analysis);
    } else if (language === 'python') {
      return this.generatePythonDockerfile(analysis);
    } else if (language === 'java') {
      return this.generateJavaDockerfile(analysis);
    } else if (language === 'go') {
      return this.generateGoDockerfile(analysis);
    }

    return this.generateGenericDockerfile(analysis);
  }

  private generateNodeDockerfile(analysis: any): string {
    const nodeVersion = analysis.runtime?.node || '18';
    const framework = analysis.frameworks?.[0];
    
    return `# Multi-stage build for Node.js application
FROM node:${nodeVersion}-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:${nodeVersion}-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
${framework === 'next.js' ? 'RUN npm run build' : ''}
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS prod
COPY . .
${framework === 'next.js' ? 'RUN npm run build' : ''}
USER node
EXPOSE 3000
CMD ["npm", "start"]`;
  }

  private generatePythonDockerfile(analysis: any): string {
    const pythonVersion = analysis.runtime?.python || '3.11';
    
    return `FROM python:${pythonVersion}-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    gcc \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements*.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create non-root user
RUN useradd --create-home --shell /bin/bash app
RUN chown -R app:app /app
USER app

EXPOSE 8000
CMD ["python", "app.py"]`;
  }

  private generateJavaDockerfile(analysis: any): string {
    return `FROM openjdk:11-jre-slim

WORKDIR /app

COPY target/*.jar app.jar

EXPOSE 8080
CMD ["java", "-jar", "app.jar"]`;
  }

  private generateGoDockerfile(analysis: any): string {
    return `# Build stage
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Final stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/main .
EXPOSE 8080
CMD ["./main"]`;
  }

  private generateGenericDockerfile(analysis: any): string {
    return `FROM alpine:latest
WORKDIR /app
COPY . .
EXPOSE 8080
CMD ["./start.sh"]`;
  }

  private generateDockerignoreContent(): string {
    return `node_modules
npm-debug.log
.git
.gitignore
README.md
.env
.nyc_output
coverage
.coverage
*.log
.DS_Store
.vscode
.idea
*.swp
*.swo
dist
build
target
.terraform
.terraform.lock.hcl
terraform.tfstate*`;
  }

  private async generateEnvFile(analysis: any, outputDir: string): Promise<string | null> {
    const envContent = this.generateEnvContent(analysis);
    if (!envContent) return null;

    const envPath = path.join(outputDir, '.env.local');
    await fs.writeFile(envPath, envContent);
    return envPath;
  }

  private generateEnvContent(analysis: any): string {
    const envVars: string[] = [
      '# Environment Configuration',
      'NODE_ENV=development',
      'PORT=3000',
      '',
      '# Database Configuration'
    ];

    if (analysis.database?.includes('postgres')) {
      envVars.push(
        'POSTGRES_DB=devdb',
        'POSTGRES_USER=devuser',
        'POSTGRES_PASSWORD=devpass',
        'DATABASE_URL=postgresql://devuser:devpass@postgres:5432/devdb'
      );
    }

    if (analysis.database?.includes('mongodb')) {
      envVars.push(
        'MONGO_ROOT_USERNAME=admin',
        'MONGO_ROOT_PASSWORD=adminpass',
        'MONGO_DATABASE=devdb',
        'MONGODB_URL=mongodb://admin:adminpass@mongodb:27017/devdb?authSource=admin'
      );
    }

    if (analysis.services?.includes('redis')) {
      envVars.push(
        '',
        '# Redis Configuration',
        'REDIS_URL=redis://redis:6379'
      );
    }

    if (analysis.services?.includes('rabbitmq')) {
      envVars.push(
        '',
        '# RabbitMQ Configuration',
        'RABBITMQ_USER=admin',
        'RABBITMQ_PASS=adminpass',
        'RABBITMQ_URL=amqp://admin:adminpass@rabbitmq:5672'
      );
    }

    envVars.push(
      '',
      '# Development Tools',
      'PGADMIN_EMAIL=admin@admin.com',
      'PGADMIN_PASSWORD=adminpass',
      '',
      '# Email Testing',
      'SMTP_HOST=mailhog',
      'SMTP_PORT=1025'
    );

    return envVars.join('\n');
  }

  private async generateDevelopmentScripts(outputDir: string): Promise<string[]> {
    const files: string[] = [];

    // Generate start script
    const startScript = `#!/bin/bash
# Development startup script

echo "🚀 Starting development environment..."

# Start services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

echo "✅ Development environment started!"
echo ""
echo "📋 Available services:"
echo "  - Application: http://localhost:3000"
echo "  - PgAdmin: http://localhost:8080"
echo "  - Redis Commander: http://localhost:8081"
echo "  - Mailhog: http://localhost:8025"
echo ""
echo "🔧 Useful commands:"
echo "  - View logs: docker-compose logs -f"
echo "  - Stop services: docker-compose down"
echo "  - Rebuild: docker-compose build --no-cache"
`;

    const startScriptPath = path.join(outputDir, 'dev-start.sh');
    await fs.writeFile(startScriptPath, startScript);
    files.push(startScriptPath);

    // Generate stop script
    const stopScript = `#!/bin/bash
# Development stop script

echo "🛑 Stopping development environment..."
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down

echo "✅ Development environment stopped!"
`;

    const stopScriptPath = path.join(outputDir, 'dev-stop.sh');
    await fs.writeFile(stopScriptPath, stopScript);
    files.push(stopScriptPath);

    // Generate cleanup script
    const cleanupScript = `#!/bin/bash
# Development cleanup script

echo "🧹 Cleaning up development environment..."

# Stop and remove containers
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down -v

# Remove unused images
docker image prune -f

# Remove unused volumes
docker volume prune -f

echo "✅ Cleanup completed!"
`;

    const cleanupScriptPath = path.join(outputDir, 'dev-cleanup.sh');
    await fs.writeFile(cleanupScriptPath, cleanupScript);
    files.push(cleanupScriptPath);

    // Make scripts executable (Linux/Mac)
    if (process.platform !== 'win32') {
      await Promise.all([
        fs.chmod(startScriptPath, '755'),
        fs.chmod(stopScriptPath, '755'),
        fs.chmod(cleanupScriptPath, '755')
      ]);
    }

    return files;
  }

  private determineMainService(analysis: any): string {
    if (analysis.services?.length > 0) {
      return analysis.services[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
    }
    if (analysis.frameworks?.includes('next.js')) return 'nextjs-app';
    if (analysis.frameworks?.includes('react')) return 'react-app';
    if (analysis.frameworks?.includes('express')) return 'express-api';
    if (analysis.frameworks?.includes('nestjs')) return 'nestjs-api';
    if (analysis.frameworks?.includes('fastapi')) return 'fastapi-app';
    if (analysis.frameworks?.includes('django')) return 'django-app';
    if (analysis.frameworks?.includes('spring')) return 'spring-api';
    
    return 'app';
  }

  private determinePorts(analysis: any, exposeAll: boolean = false): string[] {
    const ports: string[] = ['3000:3000']; // Default port
    
    if (exposeAll) {
      // Add additional ports based on analysis
      if (analysis.frameworks?.includes('next.js')) {
        ports.push('3001:3001'); // Next.js dev server
      }
      if (analysis.services?.includes('api')) {
        ports.push('8000:8000'); // API port
      }
    }
    
    return ports;
  }

  private generateEnvironmentVariables(analysis: any): Record<string, string> {
    const env: Record<string, string> = {};
    
    if (analysis.database?.includes('postgres')) {
      env.DATABASE_URL = 'postgresql://devuser:devpass@postgres:5432/devdb';
    }
    
    if (analysis.database?.includes('mongodb')) {
      env.MONGODB_URL = 'mongodb://admin:adminpass@mongodb:27017/devdb?authSource=admin';
    }
    
    if (analysis.services?.includes('redis')) {
      env.REDIS_URL = 'redis://redis:6379';
    }
    
    if (analysis.services?.includes('rabbitmq')) {
      env.RABBITMQ_URL = 'amqp://admin:adminpass@rabbitmq:5672';
    }
    
    return env;
  }

  private generateHealthCheck(analysis: any): any {
    const framework = analysis.frameworks?.[0];
    
    if (framework === 'express' || framework === 'fastapi') {
      return {
        test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
        interval: '30s',
        timeout: '10s',
        retries: 3,
        start_period: '40s'
      };
    }
    
    return {
      test: ['CMD', 'wget', '--no-verbose', '--tries=1', '--spider', 'http://localhost:3000/'],
      interval: '30s',
      timeout: '10s',
      retries: 3
    };
  }

  private determineDependencies(analysis: any): string[] {
    const dependencies: string[] = [];
    
    if (analysis.database?.includes('postgres')) {
      dependencies.push('postgres');
    }
    if (analysis.database?.includes('mongodb')) {
      dependencies.push('mongodb');
    }
    if (analysis.services?.includes('redis')) {
      dependencies.push('redis');
    }
    if (analysis.services?.includes('rabbitmq')) {
      dependencies.push('rabbitmq');
    }
    
    return dependencies;
  }
}