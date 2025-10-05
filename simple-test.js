#!/usr/bin/env node

import { spawn } from 'child_process';
import { createInterface } from 'readline';

async function testServer() {
  console.log('🔧 Testing MCP Server Tools...\n');

  // Spawn the MCP server
  const server = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let messageId = 1;
  const pendingRequests = new Map();

  // Handle server output
  const rl = createInterface({
    input: server.stdout,
    crlfDelay: Infinity,
  });

  rl.on('line', (line) => {
    try {
      const message = JSON.parse(line);

      if (message.id && pendingRequests.has(message.id)) {
        const { resolve, reject, name } = pendingRequests.get(message.id);

        if (message.error) {
          console.log(`❌ ${name} failed:`, message.error.message);
          reject(message.error);
        } else {
          console.log(`✅ ${name} succeeded!\n`);
          if (message.result && message.result.content) {
            const text = message.result.content[0]?.text;
            if (text) {
              try {
                const parsed = JSON.parse(text);
                console.log(JSON.stringify(parsed, null, 2).substring(0, 1000));
              } catch {
                console.log(text.substring(0, 500));
              }
            }
          }
          console.log('');
          resolve(message.result);
        }

        pendingRequests.delete(message.id);
      }
    } catch (err) {
      // Ignore non-JSON lines (like log messages)
    }
  });

  server.stderr.on('data', (data) => {
    // Server logs - ignore
  });

  function sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      pendingRequests.set(id, {
        resolve,
        reject,
        name: params?.name || method
      });

      server.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  try {
    // Initialize
    console.log('Initializing...');
    await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    });

    // List tools
    console.log('\n📋 Listing tools...');
    await sendRequest('tools/list', {});

    // Test analyze-project
    console.log('\n🧪 Test 1: analyze-project');
    await sendRequest('tools/call', {
      name: 'analyze-project',
      arguments: {
        projectPath: process.cwd(),
      },
    });

    // Test calculate-resources
    console.log('\n🧪 Test 2: calculate-resources');
    await sendRequest('tools/call', {
      name: 'calculate-resources',
      arguments: {
        projectPath: process.cwd(),
      },
    });

    // Test deploy-to-aws (dry run)
    console.log('\n🧪 Test 3: deploy-to-aws (dry run)');
    await sendRequest('tools/call', {
      name: 'deploy-to-aws',
      arguments: {
        projectPath: process.cwd(),
        dryRun: true,
      },
    });

    console.log('\n✅ All tests completed!\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    server.kill();
    process.exit(0);
  }
}

testServer().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
