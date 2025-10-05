#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function testMCPServer() {
  console.log('🔧 Testing MCP DevOps Automation Server...\n');

  // Create client
  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  // Start the server process
  const serverProcess = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Create transport
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
  });

  try {
    // Connect to server
    await client.connect(transport);
    console.log('✅ Connected to MCP server\n');

    // List available tools
    console.log('📋 Listing available tools...');
    const toolsResponse = await client.request({
      method: 'tools/list',
    }, { tools: [] });

    console.log('Available tools:');
    toolsResponse.tools.forEach((tool) => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    console.log('');

    // Test 1: analyze-project
    console.log('🧪 Test 1: Testing analyze-project tool...');
    try {
      const projectPath = process.cwd(); // Current directory
      const analyzeResult = await client.request({
        method: 'tools/call',
        params: {
          name: 'analyze-project',
          arguments: {
            projectPath: projectPath,
          },
        },
      }, { content: [] });

      console.log('✅ analyze-project result:');
      console.log(analyzeResult.content[0].text);
      console.log('');
    } catch (error) {
      console.log('❌ analyze-project failed:', error.message);
      console.log('');
    }

    // Test 2: calculate-resources
    console.log('🧪 Test 2: Testing calculate-resources tool...');
    try {
      const projectPath = process.cwd();
      const resourcesResult = await client.request({
        method: 'tools/call',
        params: {
          name: 'calculate-resources',
          arguments: {
            projectPath: projectPath,
          },
        },
      }, { content: [] });

      console.log('✅ calculate-resources result:');
      console.log(resourcesResult.content[0].text);
      console.log('');
    } catch (error) {
      console.log('❌ calculate-resources failed:', error.message);
      console.log('');
    }

    // Test 3: generate-devops-setup (dry run)
    console.log('🧪 Test 3: Testing generate-devops-setup tool (minimal config)...');
    try {
      const projectPath = process.cwd();
      const generateResult = await client.request({
        method: 'tools/call',
        params: {
          name: 'generate-devops-setup',
          arguments: {
            projectPath: projectPath,
            dryRun: true,
          },
        },
      }, { content: [] });

      console.log('✅ generate-devops-setup result:');
      console.log(generateResult.content[0].text.substring(0, 500) + '...');
      console.log('');
    } catch (error) {
      console.log('❌ generate-devops-setup failed:', error.message);
      console.log('');
    }

    // Test 4: deploy-to-aws (dry run)
    console.log('🧪 Test 4: Testing deploy-to-aws tool (dry run)...');
    try {
      const projectPath = process.cwd();
      const deployResult = await client.request({
        method: 'tools/call',
        params: {
          name: 'deploy-to-aws',
          arguments: {
            projectPath: projectPath,
            dryRun: true,
          },
        },
      }, { content: [] });

      console.log('✅ deploy-to-aws result:');
      console.log(deployResult.content[0].text);
      console.log('');
    } catch (error) {
      console.log('❌ deploy-to-aws failed:', error.message);
      console.log('');
    }

    console.log('✅ All tests completed!\n');
  } catch (error) {
    console.error('❌ Error during testing:', error);
  } finally {
    // Clean up
    await client.close();
    serverProcess.kill();
  }
}

testMCPServer().catch(console.error);
