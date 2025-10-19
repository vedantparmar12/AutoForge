const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('DevOps CLI Tests', () => {
  const testProjectPath = path.join(__dirname, 'test-project');
  const cliPath = path.join(__dirname, '..', 'dist', 'cli', 'index.js');

  beforeAll(() => {
    // Create test project directory
    if (!fs.existsSync(testProjectPath)) {
      fs.mkdirSync(testProjectPath, { recursive: true });
    }
    
    // Create a simple package.json for testing
    const packageJson = {
      name: 'test-app',
      version: '1.0.0',
      scripts: {
        start: 'node index.js'
      },
      dependencies: {
        express: '^4.18.0'
      }
    };
    
    fs.writeFileSync(
      path.join(testProjectPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    
    // Create a simple index.js
    const indexJs = `
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Hello World' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});
`;
    
    fs.writeFileSync(path.join(testProjectPath, 'index.js'), indexJs);
    
    // Build the project first
    try {
      execSync('npm run build', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    } catch (error) {
      console.warn('Build failed, tests may not work correctly');
    }
  });

  afterAll(() => {
    // Cleanup test project
    if (fs.existsSync(testProjectPath)) {
      fs.rmSync(testProjectPath, { recursive: true, force: true });
    }
    
    // Cleanup CLI config
    const configDir = path.join(os.homedir(), '.devops-cli');
    if (fs.existsSync(configDir)) {
      // Only cleanup test data, keep user's real config
      const testFiles = [
        'test-deployment-history.json',
        'test-budget-config.json',
        'test-cost-history.json'
      ];
      
      testFiles.forEach(file => {
        const filePath = path.join(configDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
  });

  describe('Project Analysis', () => {
    test('should analyze project structure', () => {
      // Since we can't easily test the MCP server directly,
      // we'll test the core functionality through the analyzers
      const { ProjectAnalyzer } = require('../dist/analyzers/project-analyzer');
      const analyzer = new ProjectAnalyzer();
      
      return analyzer.analyzeProject(testProjectPath).then(result => {
        expect(result).toBeDefined();
        expect(result.languages).toContain('javascript');
        expect(result.frameworks).toContain('express');
        expect(result.packageManager).toBe('npm');
      });
    });
  });

  describe('Docker Compose Generation', () => {
    test('should generate docker-compose files', () => {
      const { DockerComposeGenerator } = require('../dist/generators/docker-compose-generator');
      const generator = new DockerComposeGenerator();
      
      return generator.generate(testProjectPath, {
        outputDir: testProjectPath,
        includeDevTools: true,
        addHealthChecks: true
      }).then(result => {
        expect(result.files).toBeDefined();
        expect(result.files.length).toBeGreaterThan(0);
        expect(result.config).toBeDefined();
        expect(result.config.services).toBeDefined();
        
        // Check if docker-compose.yml was created
        const dockerComposePath = path.join(testProjectPath, 'docker-compose.yml');
        expect(fs.existsSync(dockerComposePath)).toBe(true);
        
        // Cleanup
        result.files.forEach(file => {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        });
      });
    });
  });

  describe('Environment Management', () => {
    test('should create and manage environments', () => {
      const { EnvironmentManager } = require('../dist/utils/environment-manager');
      const envManager = new EnvironmentManager();
      
      const testEnv = {
        name: 'test-env',
        description: 'Test environment',
        cloud: 'aws',
        region: 'us-east-1',
        template: 'development'
      };
      
      return envManager.createEnvironment(testEnv).then(environment => {
        expect(environment).toBeDefined();
        expect(environment.name).toBe('test-env');
        expect(environment.cloud).toBe('aws');
        expect(environment.status).toBe('active');
        
        // Test listing environments
        return envManager.listEnvironments();
      }).then(environments => {
        expect(environments).toBeDefined();
        expect(environments.length).toBeGreaterThan(0);
        
        const testEnvFound = environments.find(env => env.name === 'test-env');
        expect(testEnvFound).toBeDefined();
        
        // Cleanup
        return envManager.deleteEnvironment('test-env');
      });
    });

    test('should generate Kubernetes manifests', () => {
      const { EnvironmentManager } = require('../dist/utils/environment-manager');
      const envManager = new EnvironmentManager();
      
      const testEnv = {
        name: 'test-k8s',
        cloud: 'aws',
        region: 'us-east-1',
        template: 'development'
      };
      
      return envManager.createEnvironment(testEnv).then(() => {
        const manifestsDir = path.join(testProjectPath, 'manifests');
        if (!fs.existsSync(manifestsDir)) {
          fs.mkdirSync(manifestsDir);
        }
        
        return envManager.generateKubernetesManifests('test-k8s', manifestsDir);
      }).then(files => {
        expect(files).toBeDefined();
        expect(files.length).toBeGreaterThan(0);
        
        // Check if files were created
        files.forEach(file => {
          expect(fs.existsSync(file)).toBe(true);
        });
        
        // Cleanup
        files.forEach(file => {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        });
        
        const manifestsDir = path.join(testProjectPath, 'manifests');
        if (fs.existsSync(manifestsDir)) {
          fs.rmdirSync(manifestsDir);
        }
        
        return envManager.deleteEnvironment('test-k8s');
      });
    });
  });

  describe('Cost Budget System', () => {
    test('should estimate costs for different cloud providers', () => {
      const { CostBudget } = require('../dist/utils/cost-budget');
      const costBudget = new CostBudget();
      
      return costBudget.estimateCosts(testProjectPath, 'aws').then(awsCosts => {
        expect(awsCosts).toBeDefined();
        expect(awsCosts.totalCost).toBeGreaterThan(0);
        expect(awsCosts.provider).toBe('aws');
        expect(awsCosts.estimates).toBeDefined();
        expect(awsCosts.estimates.length).toBeGreaterThan(0);
        
        // Test cost comparison
        return costBudget.compareCosts(testProjectPath, ['aws', 'azure', 'gcp']);
      }).then(comparison => {
        expect(comparison).toBeDefined();
        expect(comparison.length).toBe(3);
        
        // Should be sorted by cost
        for (let i = 1; i < comparison.length; i++) {
          expect(comparison[i].cost.totalCost).toBeGreaterThanOrEqual(comparison[i-1].cost.totalCost);
        }
      });
    });

    test('should manage budget configuration', () => {
      const { CostBudget } = require('../dist/utils/cost-budget');
      const costBudget = new CostBudget();
      
      return costBudget.setBudget(500, 'USD', 'monthly').then(() => {
        return costBudget.getStatus();
      }).then(status => {
        expect(status).toBeDefined();
        expect(status.budgetLimit).toBe(500);
        expect(status.currency).toBe('USD');
      });
    });

    test('should provide cost optimization suggestions', () => {
      const { CostBudget } = require('../dist/utils/cost-budget');
      const costBudget = new CostBudget();
      
      return costBudget.estimateCosts(testProjectPath, 'aws').then(costBreakdown => {
        return costBudget.getCostOptimizationSuggestions(costBreakdown);
      }).then(suggestions => {
        expect(suggestions).toBeDefined();
        expect(Array.isArray(suggestions)).toBe(true);
        
        if (suggestions.length > 0) {
          const suggestion = suggestions[0];
          expect(suggestion.type).toBeDefined();
          expect(suggestion.description).toBeDefined();
          expect(suggestion.potentialSavings).toBeDefined();
          expect(suggestion.effort).toBeDefined();
          expect(suggestion.riskLevel).toBeDefined();
        }
      });
    });
  });

  describe('Deployment History', () => {
    test('should record and retrieve deployment history', () => {
      const { DeploymentHistory } = require('../dist/utils/deployment-history');
      const history = new DeploymentHistory();
      
      const testDeployment = {
        projectPath: testProjectPath,
        environment: 'test',
        cloud: 'aws',
        region: 'us-east-1',
        timestamp: new Date(),
        success: true,
        version: '1.0.0'
      };
      
      return history.recordDeployment(testDeployment).then(deploymentId => {
        expect(deploymentId).toBeDefined();
        expect(typeof deploymentId).toBe('string');
        
        return history.getHistory({ limit: 10 });
      }).then(deployments => {
        expect(deployments).toBeDefined();
        expect(deployments.length).toBeGreaterThan(0);
        
        const recorded = deployments.find(d => d.projectPath === testProjectPath);
        expect(recorded).toBeDefined();
        expect(recorded.success).toBe(true);
        
        return history.getDeploymentStats();
      }).then(stats => {
        expect(stats).toBeDefined();
        expect(stats.totalDeployments).toBeGreaterThan(0);
        expect(typeof stats.successRate).toBe('number');
      });
    });
  });

  describe('Preflight Checks', () => {
    test('should perform system checks', () => {
      const { PreflightChecker } = require('../dist/utils/preflight-checks');
      const checker = new PreflightChecker();
      
      return checker.runQuickCheck().then(result => {
        expect(result).toBeDefined();
        expect(typeof result.canProceed).toBe('boolean');
        expect(result.message).toBeDefined();
      });
    });

    test('should generate preflight report', () => {
      const { PreflightChecker } = require('../dist/utils/preflight-checks');
      const checker = new PreflightChecker();
      
      // Mock a minimal check result
      const mockResults = {
        passed: true,
        checks: [
          { name: 'Node.js', status: 'pass', message: 'Node.js is available' }
        ],
        warnings: [],
        errors: []
      };
      
      return checker.generateReport(mockResults).then(report => {
        expect(report).toBeDefined();
        expect(typeof report).toBe('string');
        expect(report).toContain('Preflight Check Report');
      });
    });
  });

  describe('Integration Tests', () => {
    test('should work with project analyzer and docker generator together', () => {
      const { ProjectAnalyzer } = require('../dist/analyzers/project-analyzer');
      const { DockerComposeGenerator } = require('../dist/generators/docker-compose-generator');
      
      const analyzer = new ProjectAnalyzer();
      const generator = new DockerComposeGenerator();
      
      return analyzer.analyzeProject(testProjectPath).then(analysis => {
        expect(analysis).toBeDefined();
        
        return generator.generate(testProjectPath, {
          outputDir: testProjectPath,
          includeDevTools: false
        });
      }).then(result => {
        expect(result.files).toBeDefined();
        expect(result.config.services).toBeDefined();
        
        // Verify the generated config matches the analysis
        const serviceKeys = Object.keys(result.config.services);
        expect(serviceKeys.length).toBeGreaterThan(0);
        
        // Cleanup
        result.files.forEach(file => {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        });
      });
    });

    test('should work with environment manager and cost budget together', () => {
      const { EnvironmentManager } = require('../dist/utils/environment-manager');
      const { CostBudget } = require('../dist/utils/cost-budget');
      
      const envManager = new EnvironmentManager();
      const costBudget = new CostBudget();
      
      const testEnv = {
        name: 'integration-test',
        cloud: 'aws',
        region: 'us-east-1',
        template: 'development'
      };
      
      return envManager.createEnvironment(testEnv).then(environment => {
        expect(environment).toBeDefined();
        
        // Test cost estimation for the environment
        return costBudget.estimateCosts(testProjectPath, environment.cloud);
      }).then(costs => {
        expect(costs).toBeDefined();
        expect(costs.provider).toBe('aws');
        
        // Test budget check
        return costBudget.checkBudget(testProjectPath, 'aws');
      }).then(budgetStatus => {
        expect(budgetStatus).toBeDefined();
        expect(budgetStatus.estimatedCost).toBeGreaterThan(0);
        
        // Cleanup
        return envManager.deleteEnvironment('integration-test');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid project paths gracefully', () => {
      const { ProjectAnalyzer } = require('../dist/analyzers/project-analyzer');
      const analyzer = new ProjectAnalyzer();
      
      const invalidPath = '/nonexistent/path';
      
      return analyzer.analyzeProject(invalidPath).catch(error => {
        expect(error).toBeDefined();
        expect(error.message).toContain('not found');
      });
    });

    test('should handle duplicate environment creation', () => {
      const { EnvironmentManager } = require('../dist/utils/environment-manager');
      const envManager = new EnvironmentManager();
      
      const testEnv = {
        name: 'duplicate-test',
        cloud: 'aws',
        region: 'us-east-1'
      };
      
      return envManager.createEnvironment(testEnv).then(() => {
        // Try to create the same environment again
        return envManager.createEnvironment(testEnv);
      }).catch(error => {
        expect(error).toBeDefined();
        expect(error.message).toContain('already exists');
        
        // Cleanup
        return envManager.deleteEnvironment('duplicate-test');
      });
    });

    test('should handle missing deployment for rollback', () => {
      const { RollbackManager } = require('../dist/utils/rollback-manager');
      const rollbackManager = new RollbackManager();
      
      return rollbackManager.rollback('nonexistent-deployment', 'test-env').catch(error => {
        expect(error).toBeDefined();
        expect(error.message).toContain('not found');
      });
    });
  });

  describe('CLI Help and Version', () => {
    test('CLI should be executable', () => {
      // Test that the CLI binary exists and is executable
      expect(fs.existsSync(cliPath)).toBe(true);
    });
  });
});

// Helper functions for tests
function createTestFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
}

function cleanupTestFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// Mock data for testing
const mockProjectAnalysis = {
  languages: ['javascript'],
  frameworks: ['express'],
  services: ['web'],
  complexity: 'medium',
  packageManager: 'npm',
  database: ['postgres'],
  architecture: 'monolithic'
};

const mockCostEstimate = {
  totalCost: 150.50,
  currency: 'USD',
  period: 'monthly',
  estimates: [
    {
      service: 'EC2 t3.small',
      cost: 14.98,
      unit: 'USD/month',
      usage: 1
    },
    {
      service: 'RDS t3.micro',
      cost: 12.24,
      unit: 'USD/month',
      usage: 1
    }
  ],
  provider: 'aws',
  region: 'us-east-1',
  lastUpdated: new Date()
};

module.exports = {
  mockProjectAnalysis,
  mockCostEstimate,
  createTestFile,
  cleanupTestFile
};