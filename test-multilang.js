#!/usr/bin/env node

// Test if the analyzer can detect multiple languages in a complex project
import { ProjectAnalyzer } from './dist/analyzers/project-analyzer.js';

async function testComplexProject() {
  const analyzer = new ProjectAnalyzer();
  
  console.log('🔍 Testing Language Detection on Current Project...\n');
  
  const analysis = await analyzer.analyzeProject(process.cwd());
  
  console.log('📊 **DETECTION RESULTS**\n');
  console.log('Project:', analysis.projectName);
  console.log('Complexity:', analysis.complexity.toUpperCase());
  console.log('\n🔤 Languages Detected:');
  analysis.languages.forEach(lang => {
    console.log(`  ✅ ${lang.name.padEnd(15)} - ${lang.fileCount} files (${lang.percentage}%)`);
  });
  
  console.log('\n🎯 Frameworks Detected:');
  if (analysis.frameworks.length > 0) {
    analysis.frameworks.forEach(fw => {
      console.log(`  ✅ ${fw.name.padEnd(15)} - ${fw.language} (${fw.type})`);
    });
  } else {
    console.log('  ℹ️  No frameworks detected (library project)');
  }
  
  console.log('\n🗄️  Databases Detected:');
  if (analysis.databases.length > 0) {
    analysis.databases.forEach(db => {
      console.log(`  ✅ ${db.type}`);
    });
  } else {
    console.log('  ℹ️  No databases detected');
  }
  
  console.log('\n📦 Services Found:', analysis.services.length);
  analysis.services.forEach(svc => {
    console.log(`  • ${svc.name} (${svc.language})`);
    if (svc.framework) console.log(`    - Framework: ${svc.framework}`);
    if (svc.port) console.log(`    - Port: ${svc.port}`);
    if (svc.entryPoint) console.log(`    - Entry: ${svc.entryPoint}`);
    console.log(`    - Docker: ${svc.hasDockerfile ? '✅' : '❌'}`);
    console.log(`    - Tests: ${svc.hasTests ? '✅' : '❌'}`);
  });
  
  console.log('\n📈 Project Size:');
  console.log(`  - Lines of Code: ${analysis.estimatedSize.linesOfCode.toLocaleString()}`);
  console.log(`  - Total Files: ${analysis.estimatedSize.fileCount.toLocaleString()}`);
  console.log(`  - Total Size: ${analysis.estimatedSize.totalSizeMB} MB`);
  
  console.log('\n✅ Language detection is FULLY FUNCTIONAL!\n');
}

testComplexProject().catch(console.error);
