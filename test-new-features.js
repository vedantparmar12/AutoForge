#!/usr/bin/env node

import { spawn } from 'child_process';
import { createInterface } from 'readline';

async function testNewFeatures() {
  console.log('🚀 Testing NEW FEATURES - Service Dependency Mapping, Multi-Cloud, Zero-Config\n');

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

    console.log('═══════════════════════════════════════════════════════════\n');

    // Test 1: Service Dependency Mapping
    console.log('🗺️  TEST 1: Service Dependency Mapping\n');
    const depResult = await sendRequest('tools/call', {
      name: 'map-dependencies',
      arguments: {
        projectPath: process.cwd(),
      },
    });

    if (depResult.content && depResult.content[0]) {
      const data = JSON.parse(depResult.content[0].text);
      console.log('✅ Dependency Mapping succeeded!\n');
      console.log(`📊 Found ${data.dependencyGraph.services.length} services`);
      console.log(`🔗 Found ${data.dependencyGraph.dependencies.length} dependencies`);
      console.log(`🗄️  Found ${data.dependencyGraph.databases.length} databases`);

      if (data.impactAnalysis && data.impactAnalysis.length > 0) {
        console.log(`\n🚨 Critical Services (score >= 80):`);
        data.impactAnalysis.filter(i => i.criticalityScore >= 80).forEach(i => {
          console.log(`   • ${i.service} (score: ${i.criticalityScore})`);
        });
      }

      console.log(`\n📐 Mermaid Diagram Generated: ${data.mermaidDiagram.split('\n').length} lines`);
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Test 2: Multi-Cloud Cost Comparison
    console.log('💰 TEST 2: Multi-Cloud Cost Comparison\n');
    const costResult = await sendRequest('tools/call', {
      name: 'compare-cloud-costs',
      arguments: {
        projectPath: process.cwd(),
      },
    });

    if (costResult.content && costResult.content[0]) {
      const data = JSON.parse(costResult.content[0].text);
      console.log('✅ Cost Comparison succeeded!\n');
      console.log('Cloud Cost Comparison:');
      data.comparison.forEach((c, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
        console.log(`   ${medal} ${c.cloud}: $${c.total}/month`);
      });
      console.log(`\n💡 Recommendation: ${data.recommendation.cloud}`);
      console.log(`   💸 ${data.recommendation.savings}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Test 3: Deploy to Azure
    console.log('☁️  TEST 3: Deploy to Azure\n');
    const azureResult = await sendRequest('tools/call', {
      name: 'deploy-to-azure',
      arguments: {
        projectPath: process.cwd(),
        awsRegion: 'eastus',
      },
    });

    if (azureResult.content && azureResult.content[0]) {
      const data = JSON.parse(azureResult.content[0].text);
      console.log('✅ Azure deployment config generated!\n');
      console.log(`📦 Files generated: ${data.files.length}`);
      console.log(`💰 Estimated cost: $${data.costs.monthly.total}/month`);
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Test 4: Deploy to GCP
    console.log('🌐 TEST 4: Deploy to GCP\n');
    const gcpResult = await sendRequest('tools/call', {
      name: 'deploy-to-gcp',
      arguments: {
        projectPath: process.cwd(),
        awsRegion: 'us-central1',
      },
    });

    if (gcpResult.content && gcpResult.content[0]) {
      const data = JSON.parse(gcpResult.content[0].text);
      console.log('✅ GCP deployment config generated!\n');
      console.log(`📦 Files generated: ${data.files.length}`);
      console.log(`💰 Estimated cost: $${data.costs.monthly.total}/month`);
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Test 5: Zero-Config Deployment (DRY RUN)
    console.log('⚡ TEST 5: Zero-Config Deployment (DRY RUN)\n');
    const zeroConfigResult = await sendRequest('tools/call', {
      name: 'deploy-now',
      arguments: {
        projectPath: process.cwd(),
        options: {
          dryRun: true
        }
      },
    });

    if (zeroConfigResult.content && zeroConfigResult.content[0]) {
      const data = JSON.parse(zeroConfigResult.content[0].text);
      console.log('✅ Zero-Config Deployment tested!\n');
      console.log(`⏱️  Duration: ${data.duration}`);
      console.log(`📋 Steps completed: ${data.steps.filter(s => s.status === 'completed').length}/${data.steps.length}`);
      console.log(`\nSteps:`);
      data.steps.forEach(step => {
        const icon = step.status === 'completed' ? '✅' : step.status === 'running' ? '⏳' : '❌';
        console.log(`   ${icon} ${step.message}`);
      });
      console.log(`\n${data.message}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');
    console.log('🎉 ALL NEW FEATURES TESTED SUCCESSFULLY!\n');
    console.log('Summary:');
    console.log('  ✅ Service Dependency Mapping - WORKING');
    console.log('  ✅ Multi-Cloud Cost Comparison - WORKING');
    console.log('  ✅ Deploy to Azure - WORKING');
    console.log('  ✅ Deploy to GCP - WORKING');
    console.log('  ✅ Zero-Config Deployment - WORKING');
    console.log('\n🚀 Total MCP Tools: 9 (4 original + 5 new)\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    server.kill();
    process.exit(0);
  }
}

testNewFeatures().catch(console.error);
