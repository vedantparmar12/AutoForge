#!/usr/bin/env node

import { spawn } from 'child_process';
import { createInterface } from 'readline';

async function testGenerateSetup() {
  console.log('🔧 Testing generate-devops-setup tool...\n');

  const server = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let messageId = 1;
  const pendingRequests = new Map();

  const rl = createInterface({
    input: server.stdout,
    crlfDelay: Infinity,
  });

  rl.on('line', (line) => {
    try {
      const message = JSON.parse(line);

      if (message.id && pendingRequests.has(message.id)) {
        const { resolve, reject } = pendingRequests.get(message.id);

        if (message.error) {
          console.log('❌ Failed:', message.error.message);
          reject(message.error);
        } else {
          resolve(message.result);
        }

        pendingRequests.delete(message.id);
      }
    } catch (err) {
      // Ignore non-JSON lines
    }
  });

  server.stderr.on('data', () => {});

  function sendRequest(method, params) {
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
  }

  try {
    // Initialize
    await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    });

    // Test generate-devops-setup
    console.log('🧪 Testing generate-devops-setup with minimal config...\n');
    const result = await sendRequest('tools/call', {
      name: 'generate-devops-setup',
      arguments: {
        projectPath: process.cwd(),
        outputDir: process.cwd() + '/devops-generated',
        awsRegion: 'us-east-1',
        enableMonitoring: true,
        enableLogging: true,
      },
    });

    console.log('✅ generate-devops-setup succeeded!\n');

    if (result.content && result.content[0]) {
      const text = result.content[0].text;
      try {
        const parsed = JSON.parse(text);
        console.log('📦 Generated Files:\n');
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(text);
      }
    }

    console.log('\n✅ Test completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    server.kill();
    process.exit(0);
  }
}

testGenerateSetup().catch(console.error);
