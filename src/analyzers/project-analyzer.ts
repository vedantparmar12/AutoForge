import { readdir, readFile, stat } from 'fs/promises';
import { join, basename, extname } from 'path';
import type {
  ProjectAnalysis,
  ServiceInfo,
  LanguageInfo,
  FrameworkInfo,
  DatabaseInfo,
  ProjectComplexity,
  DependencyInfo
} from '../types/index.js';

export class ProjectAnalyzer {
  private languageExtensions: Record<string, string> = {
    '.js': 'JavaScript',
    '.ts': 'TypeScript',
    '.jsx': 'JavaScript',
    '.tsx': 'TypeScript',
    '.py': 'Python',
    '.java': 'Java',
    '.go': 'Go',
    '.rs': 'Rust',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.cs': 'C#',
    '.cpp': 'C++',
    '.c': 'C',
    '.kt': 'Kotlin',
    '.swift': 'Swift',
    '.scala': 'Scala'
  };

  async analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
    console.log(`Analyzing project at: ${projectPath}`);

    const services = await this.detectServices(projectPath);
    const languages = await this.detectLanguages(projectPath);
    const frameworks = await this.detectFrameworks(projectPath, services);
    const databases = await this.detectDatabases(projectPath);
    const dependencies = await this.extractDependencies(services);
    const estimatedSize = await this.calculateProjectSize(projectPath);
    const complexity = this.calculateComplexity(services, languages, estimatedSize);

    return {
      projectPath,
      projectName: basename(projectPath),
      services,
      languages,
      frameworks,
      databases,
      dependencies,
      complexity,
      estimatedSize
    };
  }

  private async detectServices(projectPath: string): Promise<ServiceInfo[]> {
    const services: ServiceInfo[] = [];
    const srcPath = join(projectPath, 'src');

    try {
      const entries = await readdir(srcPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const servicePath = join(srcPath, entry.name);
          const serviceInfo = await this.analyzeService(servicePath, entry.name);
          if (serviceInfo) {
            services.push(serviceInfo);
          }
        }
      }
    } catch (error) {
      // No src directory, analyze root as single service
      const serviceInfo = await this.analyzeService(projectPath, basename(projectPath));
      if (serviceInfo) {
        services.push(serviceInfo);
      }
    }

    return services;
  }

  private async analyzeService(servicePath: string, serviceName: string): Promise<ServiceInfo | null> {
    const language = await this.detectServiceLanguage(servicePath);
    if (!language) return null;

    const framework = await this.detectServiceFramework(servicePath, language);
    const port = await this.detectServicePort(servicePath);
    const hasDockerfile = await this.fileExists(join(servicePath, 'Dockerfile'));
    const hasTests = await this.detectTests(servicePath);
    const dependencies = await this.getServiceDependencies(servicePath, language);
    const entryPoint = await this.findEntryPoint(servicePath, language);

    return {
      name: serviceName,
      path: servicePath,
      language,
      framework,
      port,
      hasDockerfile,
      hasTests,
      dependencies,
      entryPoint
    };
  }

  private async detectServiceLanguage(servicePath: string): Promise<string | null> {
    // Check for language-specific files
    const indicators = [
      { file: 'package.json', language: 'JavaScript/TypeScript' },
      { file: 'pom.xml', language: 'Java' },
      { file: 'build.gradle', language: 'Java' },
      { file: 'go.mod', language: 'Go' },
      { file: 'requirements.txt', language: 'Python' },
      { file: 'Pipfile', language: 'Python' },
      { file: 'Cargo.toml', language: 'Rust' },
      { file: 'Gemfile', language: 'Ruby' },
      { file: 'composer.json', language: 'PHP' },
      { file: '*.csproj', language: 'C#' }
    ];

    for (const indicator of indicators) {
      if (await this.fileExists(join(servicePath, indicator.file))) {
        return indicator.language;
      }
    }

    // Fallback: detect by file extensions
    const files = await this.getAllFiles(servicePath);
    const extensions = files.map(f => extname(f));
    const languageCounts: Record<string, number> = {};

    for (const ext of extensions) {
      const lang = this.languageExtensions[ext];
      if (lang) {
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;
      }
    }

    const dominantLanguage = Object.entries(languageCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0];

    return dominantLanguage || null;
  }

  private async detectServiceFramework(servicePath: string, language: string): Promise<string | undefined> {
    if (language.includes('JavaScript') || language.includes('TypeScript')) {
      const packageJsonPath = join(servicePath, 'package.json');
      if (await this.fileExists(packageJsonPath)) {
        const content = await readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps.express) return 'Express';
        if (deps.next) return 'Next.js';
        if (deps.react) return 'React';
        if (deps.vue) return 'Vue';
        if (deps.nestjs) return 'NestJS';
        if (deps['@fastify/core']) return 'Fastify';
      }
    } else if (language === 'Java') {
      const pomPath = join(servicePath, 'pom.xml');
      if (await this.fileExists(pomPath)) {
        const content = await readFile(pomPath, 'utf-8');
        if (content.includes('spring-boot')) return 'Spring Boot';
        if (content.includes('quarkus')) return 'Quarkus';
        if (content.includes('micronaut')) return 'Micronaut';
      }
    } else if (language === 'Go') {
      const goModPath = join(servicePath, 'go.mod');
      if (await this.fileExists(goModPath)) {
        const content = await readFile(goModPath, 'utf-8');
        if (content.includes('gin-gonic')) return 'Gin';
        if (content.includes('echo')) return 'Echo';
        if (content.includes('fiber')) return 'Fiber';
      }
    } else if (language === 'Python') {
      const reqPath = join(servicePath, 'requirements.txt');
      if (await this.fileExists(reqPath)) {
        const content = await readFile(reqPath, 'utf-8');
        if (content.includes('django')) return 'Django';
        if (content.includes('flask')) return 'Flask';
        if (content.includes('fastapi')) return 'FastAPI';
      }
    }

    return undefined;
  }

  private async detectServicePort(servicePath: string): Promise<number | undefined> {
    const patterns = [
      { file: 'package.json', regex: /"port"\s*:\s*(\d+)/ },
      { file: 'application.properties', regex: /server\.port\s*=\s*(\d+)/ },
      { file: 'application.yml', regex: /port:\s*(\d+)/ },
      { file: '.env', regex: /PORT\s*=\s*(\d+)/ }
    ];

    for (const pattern of patterns) {
      const filePath = join(servicePath, pattern.file);
      if (await this.fileExists(filePath)) {
        const content = await readFile(filePath, 'utf-8');
        const match = content.match(pattern.regex);
        if (match) return parseInt(match[1]);
      }
    }

    return undefined;
  }

  private async detectTests(servicePath: string): Promise<boolean> {
    const testIndicators = [
      'test',
      'tests',
      '__tests__',
      'spec',
      '*.test.js',
      '*.test.ts',
      '*.spec.js',
      '*.spec.ts'
    ];

    for (const indicator of testIndicators) {
      if (await this.fileExists(join(servicePath, indicator))) {
        return true;
      }
    }

    return false;
  }

  private async getServiceDependencies(servicePath: string, language: string): Promise<string[]> {
    const deps: string[] = [];

    if (language.includes('JavaScript') || language.includes('TypeScript')) {
      const pkgPath = join(servicePath, 'package.json');
      if (await this.fileExists(pkgPath)) {
        const content = await readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        deps.push(...Object.keys(pkg.dependencies || {}));
      }
    } else if (language === 'Java') {
      const pomPath = join(servicePath, 'pom.xml');
      if (await this.fileExists(pomPath)) {
        const content = await readFile(pomPath, 'utf-8');
        const artifactMatches = content.matchAll(/<artifactId>(.*?)<\/artifactId>/g);
        for (const match of artifactMatches) {
          deps.push(match[1]);
        }
      }
    } else if (language === 'Python') {
      const reqPath = join(servicePath, 'requirements.txt');
      if (await this.fileExists(reqPath)) {
        const content = await readFile(reqPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        deps.push(...lines.map(l => l.split(/[=<>]/)[0].trim()));
      }
    }

    return deps;
  }

  private async findEntryPoint(servicePath: string, language: string): Promise<string | undefined> {
    const entryPoints: Record<string, string[]> = {
      'JavaScript/TypeScript': ['index.js', 'index.ts', 'server.js', 'server.ts', 'app.js', 'app.ts', 'main.js', 'main.ts'],
      'Java': ['Application.java', 'Main.java'],
      'Go': ['main.go'],
      'Python': ['main.py', 'app.py', '__main__.py', 'manage.py']
    };

    const possibleEntryPoints = entryPoints[language] || [];

    for (const entry of possibleEntryPoints) {
      if (await this.fileExists(join(servicePath, entry))) {
        return entry;
      }
    }

    return undefined;
  }

  private async detectLanguages(projectPath: string): Promise<LanguageInfo[]> {
    const files = await this.getAllFiles(projectPath);
    const languageCounts: Record<string, number> = {};
    let totalFiles = 0;

    for (const file of files) {
      const ext = extname(file);
      const lang = this.languageExtensions[ext];
      if (lang) {
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;
        totalFiles++;
      }
    }

    return Object.entries(languageCounts).map(([name, count]) => ({
      name,
      fileCount: count,
      percentage: Math.round((count / totalFiles) * 100)
    }));
  }

  private async detectFrameworks(projectPath: string, services: ServiceInfo[]): Promise<FrameworkInfo[]> {
    const frameworks: FrameworkInfo[] = [];

    for (const service of services) {
      if (service.framework) {
        frameworks.push({
          name: service.framework,
          language: service.language,
          type: this.determineFrameworkType(service.framework)
        });
      }
    }

    return frameworks;
  }

  private determineFrameworkType(framework: string): 'web' | 'api' | 'cli' | 'library' | 'unknown' {
    const webFrameworks = ['React', 'Vue', 'Next.js', 'Angular'];
    const apiFrameworks = ['Express', 'Spring Boot', 'Django', 'Flask', 'FastAPI', 'Gin', 'Echo'];

    if (webFrameworks.includes(framework)) return 'web';
    if (apiFrameworks.includes(framework)) return 'api';
    return 'unknown';
  }

  private async detectDatabases(projectPath: string): Promise<DatabaseInfo[]> {
    const databases: DatabaseInfo[] = [];
    const files = await this.getAllFiles(projectPath);
    const content = await Promise.all(
      files.slice(0, 100).map(async f => {
        try {
          return await readFile(f, 'utf-8');
        } catch {
          return '';
        }
      })
    );

    const allContent = content.join('\n').toLowerCase();

    const dbIndicators: Array<{ type: DatabaseInfo['type']; patterns: string[] }> = [
      { type: 'postgresql', patterns: ['postgresql', 'postgres', 'pg'] },
      { type: 'mysql', patterns: ['mysql', 'mariadb'] },
      { type: 'mongodb', patterns: ['mongodb', 'mongoose'] },
      { type: 'redis', patterns: ['redis', 'ioredis'] },
      { type: 'dynamodb', patterns: ['dynamodb', 'aws-sdk'] }
    ];

    for (const { type, patterns } of dbIndicators) {
      const detected = patterns.some(p => allContent.includes(p));
      if (detected) {
        databases.push({ type, detected: true });
      }
    }

    return databases;
  }

  private async extractDependencies(services: ServiceInfo[]): Promise<DependencyInfo[]> {
    const allDeps = new Set<string>();

    for (const service of services) {
      service.dependencies.forEach(dep => allDeps.add(dep));
    }

    return Array.from(allDeps).map(name => ({
      name,
      type: 'runtime' as const
    }));
  }

  private async calculateProjectSize(projectPath: string): Promise<{
    linesOfCode: number;
    fileCount: number;
    totalSizeMB: number;
  }> {
    const files = await this.getAllFiles(projectPath);
    let linesOfCode = 0;
    let totalSizeBytes = 0;

    for (const file of files) {
      try {
        const stats = await stat(file);
        totalSizeBytes += stats.size;

        if (this.isCodeFile(file)) {
          const content = await readFile(file, 'utf-8');
          linesOfCode += content.split('\n').length;
        }
      } catch {
        // Skip files we can't read
      }
    }

    return {
      linesOfCode,
      fileCount: files.length,
      totalSizeMB: Math.round(totalSizeBytes / (1024 * 1024) * 100) / 100
    };
  }

  private calculateComplexity(
    services: ServiceInfo[],
    languages: LanguageInfo[],
    size: { linesOfCode: number; fileCount: number }
  ): ProjectComplexity {
    let score = 0;

    // Service count
    if (services.length > 10) score += 3;
    else if (services.length > 5) score += 2;
    else if (services.length > 1) score += 1;

    // Language diversity
    if (languages.length > 3) score += 2;
    else if (languages.length > 1) score += 1;

    // Size
    if (size.linesOfCode > 100000) score += 3;
    else if (size.linesOfCode > 50000) score += 2;
    else if (size.linesOfCode > 10000) score += 1;

    if (score >= 7) return 'enterprise';
    if (score >= 4) return 'complex';
    if (score >= 2) return 'moderate';
    return 'simple';
  }

  private async getAllFiles(dir: string, fileList: string[] = []): Promise<string[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        // Skip common directories to ignore
        if (this.shouldIgnore(entry.name)) continue;

        if (entry.isDirectory()) {
          await this.getAllFiles(fullPath, fileList);
        } else {
          fileList.push(fullPath);
        }
      }
    } catch {
      // Skip directories we can't read
    }

    return fileList;
  }

  private shouldIgnore(name: string): boolean {
    const ignorePatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      'coverage',
      '.terraform',
      'target',
      '__pycache__',
      '.pytest_cache'
    ];

    return ignorePatterns.includes(name);
  }

  private isCodeFile(file: string): boolean {
    const ext = extname(file);
    return Object.keys(this.languageExtensions).includes(ext);
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}
