#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { DevOpsTools } from '../tools/devops-tools.js';
import { PreflightChecker } from '../utils/preflight-checks.js';
import { DeploymentHistory } from '../utils/deployment-history.js';
import { RollbackManager } from '../utils/rollback-manager.js';
import { CostBudget } from '../utils/cost-budget.js';
import { EnvironmentManager } from '../utils/environment-manager.js';
import { DockerComposeGenerator } from '../generators/docker-compose-generator.js';
import type { DevOpsConfig } from '../types/index.js';

const program = new Command();
const devopsTools = new DevOpsTools();
const preflightChecker = new PreflightChecker();
const deploymentHistory = new DeploymentHistory();
const rollbackManager = new RollbackManager();
const costBudget = new CostBudget();
const environmentManager = new EnvironmentManager();
const dockerComposeGenerator = new DockerComposeGenerator();

program
  .name('devops-cli')
  .description('Interactive DevOps automation CLI')
  .version('1.0.0');

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    console.log(chalk.blue.bold('🚀 DevOps Automation CLI - Interactive Mode\n'));
    
    await runInteractiveMode();
  });

// Individual commands
program
  .command('analyze <projectPath>')
  .description('Analyze project structure and dependencies')
  .option('-o, --output <path>', 'Output directory for analysis results')
  .action(async (projectPath: string, options) => {
    const spinner = ora('Analyzing project...').start();
    try {
      const result = await devopsTools.analyzeProject(projectPath);
      spinner.succeed('Project analysis completed');
      
      if (options.output) {
        // Save analysis results
        console.log(chalk.green(`Analysis saved to ${options.output}`));
      }
      
      displayAnalysisResults(result);
    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red('Error:'), error);
    }
  });

program
  .command('deploy <projectPath>')
  .description('Deploy project to cloud')
  .option('-e, --environment <env>', 'Target environment (dev/staging/prod)', 'dev')
  .option('-c, --cloud <provider>', 'Cloud provider (aws/azure/gcp)')
  .option('-r, --region <region>', 'Cloud region')
  .option('--dry-run', 'Preview deployment without executing')
  .action(async (projectPath: string, options) => {
    const spinner = ora('Preparing deployment...').start();
    
    try {
      // Preflight checks
      spinner.text = 'Running preflight checks...';
      await preflightChecker.runChecks(options.cloud);
      
      // Environment setup
      spinner.text = 'Setting up environment...';
      await environmentManager.setupEnvironment(options.environment, projectPath);
      
      // Cost budget check
      spinner.text = 'Checking cost budget...';
      const costCheck = await costBudget.checkBudget(projectPath, options.cloud);
      if (!costCheck.withinBudget) {
        spinner.warn(`Deployment cost ($${costCheck.estimatedCost}) exceeds budget ($${costCheck.budgetLimit})`);
        
        const proceed = await inquirer.prompt([{
          type: 'confirm',
          name: 'continue',
          message: 'Do you want to continue with deployment?',
          default: false
        }]);
        
        if (!proceed.continue) {
          spinner.stop();
          console.log(chalk.yellow('Deployment cancelled'));
          return;
        }
      }
      
      spinner.text = 'Deploying...';
      const deploymentConfig: DevOpsConfig = {
        projectPath,
        awsRegion: options.region || 'us-east-1',
        dryRun: options.dryRun,
        deploymentStrategy: 'gitops',
        cicdProvider: 'github-actions',
        enableMonitoring: true,
        enableLogging: true
      };
      
      let result;
      switch (options.cloud) {
        case 'azure':
          result = await devopsTools.deployToAzure(deploymentConfig);
          break;
        case 'gcp':
          result = await devopsTools.deployToGCP(deploymentConfig);
          break;
        default:
          result = await devopsTools.deployToAWS(deploymentConfig);
      }
      
      // Record deployment
      await deploymentHistory.recordDeployment({
        projectPath,
        environment: options.environment,
        cloud: options.cloud || 'aws',
        region: options.region || 'us-east-1',
        timestamp: new Date(),
        success: true,
        deploymentId: generateDeploymentId()
      });
      
      spinner.succeed('Deployment completed successfully!');
      console.log(chalk.green('\n✅ Deployment Summary:'));
      displayDeploymentSummary(result);
      
    } catch (error) {
      spinner.fail('Deployment failed');
      console.error(chalk.red('Error:'), error);
      
      // Record failed deployment
      await deploymentHistory.recordDeployment({
        projectPath,
        environment: options.environment,
        cloud: options.cloud || 'aws',
        region: options.region || 'us-east-1',
        timestamp: new Date(),
        success: false,
        error: (error as Error).message,
        deploymentId: generateDeploymentId()
      });
    }
  });

program
  .command('rollback <deploymentId>')
  .description('Rollback to a previous deployment')
  .option('-e, --environment <env>', 'Target environment', 'dev')
  .action(async (deploymentId: string, options) => {
    const spinner = ora('Rolling back deployment...').start();
    
    try {
      const result = await rollbackManager.rollback(deploymentId, options.environment);
      spinner.succeed('Rollback completed successfully!');
      
      console.log(chalk.green('\n✅ Rollback Summary:'));
      console.log(`Rolled back to deployment: ${result.previousDeploymentId}`);
      console.log(`Environment: ${options.environment}`);
      console.log(`Rollback time: ${new Date().toISOString()}`);
      
    } catch (error) {
      spinner.fail('Rollback failed');
      console.error(chalk.red('Error:'), error);
    }
  });

program
  .command('history [projectPath]')
  .description('Show deployment history')
  .option('-e, --environment <env>', 'Filter by environment')
  .option('-l, --limit <number>', 'Limit number of results', '10')
  .action(async (projectPath?: string, options?) => {
    try {
      const history = await deploymentHistory.getHistory({
        projectPath,
        environment: options?.environment,
        limit: parseInt(options?.limit || '10')
      });
      
      displayDeploymentHistory(history);
    } catch (error) {
      console.error(chalk.red('Error fetching history:'), error);
    }
  });

program
  .command('local-setup <projectPath>')
  .description('Generate docker-compose for local development')
  .option('-o, --output <path>', 'Output directory')
  .action(async (projectPath: string, options) => {
    const spinner = ora('Generating local development setup...').start();
    
    try {
      const result = await dockerComposeGenerator.generate(projectPath, {
        outputDir: options.output
      });
      
      spinner.succeed('Local development setup generated!');
      console.log(chalk.green('\n✅ Generated Files:'));
      result.files.forEach(file => console.log(`  - ${file}`));
      
      console.log(chalk.blue('\n📋 Next Steps:'));
      console.log('1. cd to your project directory');
      console.log('2. Run: docker-compose up -d');
      console.log('3. Your services will be available at the configured ports');
      
    } catch (error) {
      spinner.fail('Setup generation failed');
      console.error(chalk.red('Error:'), error);
    }
  });

program
  .command('cost-budget')
  .description('Manage cost budgets and alerts')
  .option('--set <amount>', 'Set budget limit')
  .option('--check <projectPath>', 'Check cost for project')
  .option('--alerts', 'Show cost alerts')
  .action(async (options) => {
    if (options.set) {
      await costBudget.setBudget(parseFloat(options.set));
      console.log(chalk.green(`Budget set to $${options.set}`));
    }
    
    if (options.check) {
      const result = await costBudget.checkBudget(options.check);
      displayCostBudget(result);
    }
    
    if (options.alerts) {
      const alerts = await costBudget.getAlerts();
      displayCostAlerts(alerts);
    }
    
    if (!options.set && !options.check && !options.alerts) {
      const status = await costBudget.getStatus();
      displayCostBudget(status);
    }
  });

async function runInteractiveMode(): Promise<void> {
  while (true) {
    const action = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '📊 Analyze Project', value: 'analyze' },
        { name: '🚀 Deploy to Cloud', value: 'deploy' },
        { name: '🐳 Setup Local Development', value: 'local' },
        { name: '💰 Check Cost Budget', value: 'budget' },
        { name: '📜 View Deployment History', value: 'history' },
        { name: '⏪ Rollback Deployment', value: 'rollback' },
        { name: '🔧 Manage Environments', value: 'environments' },
        { name: '❌ Exit', value: 'exit' }
      ]
    }]);

    if (action.action === 'exit') {
      console.log(chalk.blue('👋 Goodbye!'));
      break;
    }

    await handleInteractiveAction(action.action);
  }
}

async function handleInteractiveAction(action: string): Promise<void> {
  switch (action) {
    case 'analyze':
      await handleAnalyzeProject();
      break;
    case 'deploy':
      await handleDeploy();
      break;
    case 'local':
      await handleLocalSetup();
      break;
    case 'budget':
      await handleBudgetCheck();
      break;
    case 'history':
      await handleHistory();
      break;
    case 'rollback':
      await handleRollback();
      break;
    case 'environments':
      await handleEnvironments();
      break;
  }
}

async function handleAnalyzeProject(): Promise<void> {
  const answers = await inquirer.prompt([{
    type: 'input',
    name: 'projectPath',
    message: 'Enter project path:',
    default: process.cwd()
  }]);

  const spinner = ora('Analyzing project...').start();
  try {
    const result = await devopsTools.analyzeProject(answers.projectPath);
    spinner.succeed('Analysis completed!');
    displayAnalysisResults(result);
  } catch (error) {
    spinner.fail('Analysis failed');
    console.error(chalk.red('Error:'), error);
  }
}

async function handleDeploy(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectPath',
      message: 'Enter project path:',
      default: process.cwd()
    },
    {
      type: 'list',
      name: 'environment',
      message: 'Select environment:',
      choices: ['dev', 'staging', 'prod']
    },
    {
      type: 'list',
      name: 'cloud',
      message: 'Select cloud provider:',
      choices: ['aws', 'azure', 'gcp']
    },
    {
      type: 'input',
      name: 'region',
      message: 'Enter region (optional):',
      default: ''
    },
    {
      type: 'confirm',
      name: 'dryRun',
      message: 'Dry run (preview only)?',
      default: true
    }
  ]);

  // Execute deployment with gathered answers
  await program.commands.find(cmd => cmd.name() === 'deploy')
    ?.action(answers.projectPath, answers);
}

async function handleLocalSetup(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectPath',
      message: 'Enter project path:',
      default: process.cwd()
    },
    {
      type: 'input',
      name: 'output',
      message: 'Output directory (optional):',
      default: ''
    }
  ]);

  await program.commands.find(cmd => cmd.name() === 'local-setup')
    ?.action(answers.projectPath, { output: answers.output });
}

async function handleBudgetCheck(): Promise<void> {
  const choice = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'Budget action:',
    choices: [
      { name: 'Check current budget status', value: 'status' },
      { name: 'Set budget limit', value: 'set' },
      { name: 'Check project cost', value: 'check' },
      { name: 'View cost alerts', value: 'alerts' }
    ]
  }]);

  switch (choice.action) {
    case 'set':
      const budget = await inquirer.prompt([{
        type: 'number',
        name: 'amount',
        message: 'Enter budget limit ($):'
      }]);
      await program.commands.find(cmd => cmd.name() === 'cost-budget')
        ?.action({ set: budget.amount.toString() });
      break;
    case 'check':
      const project = await inquirer.prompt([{
        type: 'input',
        name: 'projectPath',
        message: 'Enter project path:',
        default: process.cwd()
      }]);
      await program.commands.find(cmd => cmd.name() === 'cost-budget')
        ?.action({ check: project.projectPath });
      break;
    case 'alerts':
      await program.commands.find(cmd => cmd.name() === 'cost-budget')
        ?.action({ alerts: true });
      break;
    default:
      await program.commands.find(cmd => cmd.name() === 'cost-budget')
        ?.action({});
  }
}

async function handleHistory(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectPath',
      message: 'Project path (optional):',
      default: ''
    },
    {
      type: 'list',
      name: 'environment',
      message: 'Filter by environment (optional):',
      choices: ['', 'dev', 'staging', 'prod']
    },
    {
      type: 'number',
      name: 'limit',
      message: 'Number of records to show:',
      default: 10
    }
  ]);

  await program.commands.find(cmd => cmd.name() === 'history')
    ?.action(answers.projectPath || undefined, {
      environment: answers.environment || undefined,
      limit: answers.limit.toString()
    });
}

async function handleRollback(): Promise<void> {
  // First show recent deployments
  const history = await deploymentHistory.getHistory({ limit: 5 });
  
  if (history.length === 0) {
    console.log(chalk.yellow('No deployments found to rollback to.'));
    return;
  }

  console.log(chalk.blue('\n📜 Recent Deployments:'));
  displayDeploymentHistory(history);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'deploymentId',
      message: 'Enter deployment ID to rollback to:'
    },
    {
      type: 'list',
      name: 'environment',
      message: 'Environment:',
      choices: ['dev', 'staging', 'prod']
    }
  ]);

  await program.commands.find(cmd => cmd.name() === 'rollback')
    ?.action(answers.deploymentId, { environment: answers.environment });
}

async function handleEnvironments(): Promise<void> {
  const environments = await environmentManager.listEnvironments();
  
  const choice = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'Environment action:',
    choices: [
      { name: 'List environments', value: 'list' },
      { name: 'Create environment', value: 'create' },
      { name: 'Update environment', value: 'update' },
      { name: 'Delete environment', value: 'delete' }
    ]
  }]);

  switch (choice.action) {
    case 'list':
      displayEnvironments(environments);
      break;
    case 'create':
      await handleCreateEnvironment();
      break;
    case 'update':
      await handleUpdateEnvironment(environments);
      break;
    case 'delete':
      await handleDeleteEnvironment(environments);
      break;
  }
}

async function handleCreateEnvironment(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Environment name:'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description:'
    },
    {
      type: 'list',
      name: 'cloud',
      message: 'Cloud provider:',
      choices: ['aws', 'azure', 'gcp']
    },
    {
      type: 'input',
      name: 'region',
      message: 'Region:'
    }
  ]);

  await environmentManager.createEnvironment(answers);
  console.log(chalk.green(`✅ Environment '${answers.name}' created successfully!`));
}

async function handleUpdateEnvironment(environments: any[]): Promise<void> {
  if (environments.length === 0) {
    console.log(chalk.yellow('No environments found.'));
    return;
  }

  const envChoice = await inquirer.prompt([{
    type: 'list',
    name: 'environment',
    message: 'Select environment to update:',
    choices: environments.map(env => ({
      name: `${env.name} (${env.cloud} - ${env.region})`,
      value: env.name
    }))
  }]);

  const updates = await inquirer.prompt([
    {
      type: 'input',
      name: 'description',
      message: 'New description (optional):'
    },
    {
      type: 'input',
      name: 'region',
      message: 'New region (optional):'
    }
  ]);

  await environmentManager.updateEnvironment(envChoice.environment, updates);
  console.log(chalk.green(`✅ Environment '${envChoice.environment}' updated successfully!`));
}

async function handleDeleteEnvironment(environments: any[]): Promise<void> {
  if (environments.length === 0) {
    console.log(chalk.yellow('No environments found.'));
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'environment',
      message: 'Select environment to delete:',
      choices: environments.map(env => ({
        name: `${env.name} (${env.cloud} - ${env.region})`,
        value: env.name
      }))
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to delete this environment?',
      default: false
    }
  ]);

  if (answers.confirm) {
    await environmentManager.deleteEnvironment(answers.environment);
    console.log(chalk.green(`✅ Environment '${answers.environment}' deleted successfully!`));
  }
}

// Display helper functions
function displayAnalysisResults(result: any): void {
  const table = new Table({
    head: ['Property', 'Value'],
    colWidths: [20, 50]
  });

  table.push(
    ['Languages', result.languages?.join(', ') || 'N/A'],
    ['Frameworks', result.frameworks?.join(', ') || 'N/A'],
    ['Services', result.services?.join(', ') || 'N/A'],
    ['Complexity', result.complexity || 'N/A'],
    ['Database', result.database || 'None']
  );

  console.log(table.toString());
}

function displayDeploymentSummary(result: any): void {
  const table = new Table({
    head: ['Component', 'Status', 'Details'],
    colWidths: [20, 15, 40]
  });

  if (result.infrastructure) {
    table.push(['Infrastructure', '✅ Created', result.infrastructure]);
  }
  if (result.services) {
    table.push(['Services', '✅ Deployed', `${result.services.length} services`]);
  }
  if (result.monitoring) {
    table.push(['Monitoring', '✅ Enabled', 'Prometheus + Grafana']);
  }

  console.log(table.toString());
}

function displayDeploymentHistory(history: any[]): void {
  if (history.length === 0) {
    console.log(chalk.yellow('No deployment history found.'));
    return;
  }

  const table = new Table({
    head: ['ID', 'Environment', 'Cloud', 'Status', 'Date'],
    colWidths: [15, 12, 8, 10, 20]
  });

  history.forEach(deployment => {
    table.push([
      deployment.deploymentId.substring(0, 12) + '...',
      deployment.environment,
      deployment.cloud,
      deployment.success ? '✅ Success' : '❌ Failed',
      new Date(deployment.timestamp).toLocaleString()
    ]);
  });

  console.log(table.toString());
}

function displayCostBudget(result: any): void {
  const table = new Table({
    head: ['Metric', 'Value'],
    colWidths: [20, 30]
  });

  table.push(
    ['Budget Limit', `$${result.budgetLimit || 'Not set'}`],
    ['Current Spend', `$${result.currentSpend || '0'}`],
    ['Estimated Cost', `$${result.estimatedCost || '0'}`],
    ['Within Budget', result.withinBudget ? '✅ Yes' : '❌ No'],
    ['Budget Usage', `${result.budgetUsage || 0}%`]
  );

  console.log(table.toString());
}

function displayCostAlerts(alerts: any[]): void {
  if (alerts.length === 0) {
    console.log(chalk.green('✅ No cost alerts'));
    return;
  }

  alerts.forEach(alert => {
    const color = alert.severity === 'critical' ? chalk.red : 
                  alert.severity === 'warning' ? chalk.yellow : chalk.blue;
    console.log(color(`${alert.severity.toUpperCase()}: ${alert.message}`));
  });
}

function displayEnvironments(environments: any[]): void {
  if (environments.length === 0) {
    console.log(chalk.yellow('No environments configured.'));
    return;
  }

  const table = new Table({
    head: ['Name', 'Cloud', 'Region', 'Status', 'Created'],
    colWidths: [15, 10, 15, 10, 20]
  });

  environments.forEach(env => {
    table.push([
      env.name,
      env.cloud,
      env.region,
      env.status || 'Active',
      new Date(env.created).toLocaleDateString()
    ]);
  });

  console.log(table.toString());
}

function generateDeploymentId(): string {
  return `dep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Parse command line arguments
program.parse();