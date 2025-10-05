#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { DevOpsTools } from './tools/devops-tools.js';
import type { DevOpsConfig } from './types/index.js';

const SERVER_NAME = 'mcp-devops-automation';
const SERVER_VERSION = '1.0.0';

class DevOpsAutomationServer {
  private server: Server;
  private devopsTools: DevOpsTools;

  constructor() {
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.devopsTools = new DevOpsTools();
    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getTools(),
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (!args) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Missing arguments for tool: ${name}`,
              },
            ],
            isError: true,
          };
        }

        switch (name) {
          case 'analyze-project':
            return await this.devopsTools.analyzeProject(args.projectPath as string);

          case 'calculate-resources':
            return await this.devopsTools.calculateResources(args.projectPath as string);

          case 'generate-devops-setup':
            return await this.devopsTools.generateDevOpsSetup(args as unknown as DevOpsConfig);

          case 'deploy-to-aws':
            return await this.devopsTools.deployToAWS(args as unknown as DevOpsConfig);

          default:
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Unknown tool: ${name}`,
                },
              ],
              isError: true,
            };
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error executing ${name}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private getTools(): Tool[] {
    return [
      {
        name: 'analyze-project',
        description: 'Analyzes a project to detect languages, frameworks, services, and complexity. This is the first step in the DevOps automation pipeline.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory to analyze',
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'calculate-resources',
        description: 'Calculates optimal Kubernetes resources (CPU, memory, replicas) and infrastructure requirements based on project complexity. Also estimates AWS costs.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'generate-devops-setup',
        description: 'Generates complete DevOps setup including Kubernetes manifests, Terraform configurations, CI/CD pipelines (GitHub Actions), and deployment guides. This creates all files needed for automated deployment.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            outputDir: {
              type: 'string',
              description: 'Directory where generated files will be saved (optional, defaults to <projectPath>/devops-generated)',
            },
            awsRegion: {
              type: 'string',
              description: 'AWS region for deployment (optional, defaults to us-east-1)',
              default: 'us-east-1',
            },
            clusterName: {
              type: 'string',
              description: 'Name for the EKS cluster (optional, auto-generated from project name)',
            },
            deploymentStrategy: {
              type: 'string',
              enum: ['basic', 'gitops', 'blue-green', 'canary'],
              description: 'Deployment strategy (optional, defaults to gitops)',
              default: 'gitops',
            },
            cicdProvider: {
              type: 'string',
              enum: ['github-actions', 'gitlab-ci', 'jenkins'],
              description: 'CI/CD provider (optional, defaults to github-actions)',
              default: 'github-actions',
            },
            enableMonitoring: {
              type: 'boolean',
              description: 'Enable Prometheus and Grafana monitoring (optional, defaults to true)',
              default: true,
            },
            enableLogging: {
              type: 'boolean',
              description: 'Enable centralized logging (optional, defaults to true)',
              default: true,
            },
            dryRun: {
              type: 'boolean',
              description: 'Generate files without deploying (optional, defaults to false)',
              default: false,
            },
          },
          required: ['projectPath'],
        },
      },
      {
        name: 'deploy-to-aws',
        description: 'Deploys the application to AWS EKS. Executes Terraform to create infrastructure, builds Docker images, pushes to ECR, and deploys to Kubernetes. Use dryRun: true to see what would be deployed without executing.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
            awsRegion: {
              type: 'string',
              description: 'AWS region for deployment',
              default: 'us-east-1',
            },
            dryRun: {
              type: 'boolean',
              description: 'Show what would be deployed without executing (defaults to true for safety)',
              default: true,
            },
          },
          required: ['projectPath'],
        },
      },
    ];
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('MCP DevOps Automation Server running on stdio');
    console.error(`Version: ${SERVER_VERSION}`);
    console.error('Available tools:');
    this.getTools().forEach((tool) => {
      console.error(`  - ${tool.name}: ${tool.description}`);
    });
  }
}

// Start the server
const server = new DevOpsAutomationServer();
server.run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
