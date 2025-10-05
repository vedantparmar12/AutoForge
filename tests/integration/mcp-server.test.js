/**
 * Integration tests for MCP DevOps Automation Server
 * Tests all tools: analyze-project, calculate-resources, generate-devops-setup, deploy-to-aws
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { jest } from '@jest/globals';

describe('MCP DevOps Automation Server Integration Tests', () => {
  let server;
  let messageId;
  let pendingRequests;
  let rl;

  const sendRequest = (method, params) => {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      pendingRequests.set(id, { resolve, reject });
      server.stdin.write(JSON.stringify(request) + '\n');
    });
  };

  beforeAll(() => {
    // Start the MCP server
    server = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    messageId = 1;
    pendingRequests = new Map();

    // Handle server output
    rl = createInterface({
      input: server.stdout,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      try {
        const message = JSON.parse(line);

        if (message.id && pendingRequests.has(message.id)) {
          const { resolve, reject } = pendingRequests.get(message.id);

          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message.result);
          }

          pendingRequests.delete(message.id);
        }
      } catch (err) {
        // Ignore non-JSON lines
      }
    });

    server.stderr.on('data', () => {
      // Ignore server logs
    });
  });

  afterAll(() => {
    if (server) {
      server.kill();
    }
  });

  test('should initialize server successfully', async () => {
    const result = await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    });

    expect(result).toBeDefined();
    expect(result.protocolVersion).toBe('2024-11-05');
    expect(result.serverInfo).toBeDefined();
    expect(result.serverInfo.name).toBe('mcp-devops-automation');
  }, 30000);

  test('should list available tools', async () => {
    const result = await sendRequest('tools/list', {});

    expect(result).toBeDefined();
    expect(result.tools).toBeInstanceOf(Array);
    expect(result.tools.length).toBeGreaterThan(0);

    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain('analyze-project');
    expect(toolNames).toContain('calculate-resources');
    expect(toolNames).toContain('generate-devops-setup');
    expect(toolNames).toContain('deploy-to-aws');
  }, 30000);

  test('should analyze project successfully', async () => {
    const result = await sendRequest('tools/call', {
      name: 'analyze-project',
      arguments: {
        projectPath: process.cwd(),
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0]).toBeDefined();

    const text = result.content[0].text;
    expect(text).toBeDefined();

    const analysis = JSON.parse(text);
    expect(analysis.projectType).toBeDefined();
    expect(analysis.services).toBeInstanceOf(Array);
  }, 30000);

  test('should calculate resources successfully', async () => {
    const result = await sendRequest('tools/call', {
      name: 'calculate-resources',
      arguments: {
        projectPath: process.cwd(),
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0]).toBeDefined();

    const text = result.content[0].text;
    expect(text).toBeDefined();

    const resources = JSON.parse(text);
    expect(resources.infrastructure).toBeDefined();
    expect(resources.estimatedCost).toBeDefined();
  }, 30000);

  test('should generate devops setup (dry run)', async () => {
    const result = await sendRequest('tools/call', {
      name: 'generate-devops-setup',
      arguments: {
        projectPath: process.cwd(),
        outputDir: process.cwd() + '/test-output',
        dryRun: true,
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0]).toBeDefined();

    const text = result.content[0].text;
    expect(text).toBeDefined();
    expect(text).toContain('generated');
  }, 30000);

  test('should deploy to AWS (dry run)', async () => {
    const result = await sendRequest('tools/call', {
      name: 'deploy-to-aws',
      arguments: {
        projectPath: process.cwd(),
        dryRun: true,
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0]).toBeDefined();

    const text = result.content[0].text;
    expect(text).toBeDefined();
  }, 30000);

  test('should handle invalid project path gracefully', async () => {
    await expect(
      sendRequest('tools/call', {
        name: 'analyze-project',
        arguments: {
          projectPath: '/invalid/path/does/not/exist',
        },
      })
    ).rejects.toThrow();
  }, 30000);

  test('should handle missing required arguments', async () => {
    await expect(
      sendRequest('tools/call', {
        name: 'analyze-project',
        arguments: {},
      })
    ).rejects.toThrow();
  }, 30000);
});
