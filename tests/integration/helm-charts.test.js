/**
 * Integration tests for Helm charts
 * Validates generated Helm charts for all microservices
 */

import { access, readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { load as loadYaml } from 'js-yaml';
import { jest } from '@jest/globals';

describe('Helm Charts Validation', () => {
  const helmDir = join(process.cwd(), 'devops-generated', 'helm', 'charts');
  const microservices = ['analyzers', 'calculators', 'generators', 'tools', 'types'];

  describe.each(microservices)('%s chart', (service) => {
    const chartDir = join(helmDir, service);

    test('should have Chart.yaml', async () => {
      const chartPath = join(chartDir, 'Chart.yaml');
      await expect(access(chartPath)).resolves.not.toThrow();

      const chartContent = await readFile(chartPath, 'utf-8');
      const chart = loadYaml(chartContent);

      expect(chart.name).toBe(service);
      expect(chart.version).toBeDefined();
      expect(chart.apiVersion).toBe('v2');
    });

    test('should have values.yaml', async () => {
      const valuesPath = join(chartDir, 'values.yaml');
      await expect(access(valuesPath)).resolves.not.toThrow();

      const valuesContent = await readFile(valuesPath, 'utf-8');
      const values = loadYaml(valuesContent);

      expect(values.replicaCount).toBeDefined();
      expect(values.image).toBeDefined();
      expect(values.service).toBeDefined();
      expect(values.resources).toBeDefined();
    });

    test('should have NOTES.txt template', async () => {
      const notesPath = join(chartDir, 'templates', 'NOTES.txt');
      await expect(access(notesPath)).resolves.not.toThrow();

      const notesContent = await readFile(notesPath, 'utf-8');

      expect(notesContent).toContain('RELEASE INFORMATION');
      expect(notesContent).toContain('SERVICE ACCESS');
      expect(notesContent).toContain('USEFUL COMMANDS');
    });

    test('should have required templates', async () => {
      const requiredTemplates = [
        'deployment.yaml',
        'service.yaml',
        'serviceaccount.yaml',
        'configmap.yaml',
        'hpa.yaml',
        'ingress.yaml',
        '_helpers.tpl',
      ];

      for (const template of requiredTemplates) {
        const templatePath = join(chartDir, 'templates', template);
        await expect(access(templatePath)).resolves.not.toThrow();
      }
    });

    test('should have proper security context in values', async () => {
      const valuesPath = join(chartDir, 'values.yaml');
      const valuesContent = await readFile(valuesPath, 'utf-8');
      const values = loadYaml(valuesContent);

      expect(values.securityContext).toBeDefined();
      expect(values.securityContext.allowPrivilegeEscalation).toBe(false);
      expect(values.securityContext.readOnlyRootFilesystem).toBe(true);
      expect(values.securityContext.capabilities).toBeDefined();
      expect(values.securityContext.capabilities.drop).toContain('ALL');
    });

    test('should have resource limits configured', async () => {
      const valuesPath = join(chartDir, 'values.yaml');
      const valuesContent = await readFile(valuesPath, 'utf-8');
      const values = loadYaml(valuesContent);

      expect(values.resources.limits).toBeDefined();
      expect(values.resources.limits.cpu).toBeDefined();
      expect(values.resources.limits.memory).toBeDefined();
      expect(values.resources.requests).toBeDefined();
      expect(values.resources.requests.cpu).toBeDefined();
      expect(values.resources.requests.memory).toBeDefined();
    });

    test('should have health probes configured', async () => {
      const valuesPath = join(chartDir, 'values.yaml');
      const valuesContent = await readFile(valuesPath, 'utf-8');
      const values = loadYaml(valuesContent);

      expect(values.livenessProbe).toBeDefined();
      expect(values.livenessProbe.httpGet).toBeDefined();
      expect(values.readinessProbe).toBeDefined();
      expect(values.readinessProbe.httpGet).toBeDefined();
    });

    test('should have autoscaling configured', async () => {
      const valuesPath = join(chartDir, 'values.yaml');
      const valuesContent = await readFile(valuesPath, 'utf-8');
      const values = loadYaml(valuesContent);

      expect(values.autoscaling).toBeDefined();
      expect(values.autoscaling.enabled).toBe(true);
      expect(values.autoscaling.minReplicas).toBeGreaterThan(0);
      expect(values.autoscaling.maxReplicas).toBeGreaterThan(values.autoscaling.minReplicas);
    });

    test('should have ServiceMonitor for Prometheus', async () => {
      const valuesPath = join(chartDir, 'values.yaml');
      const valuesContent = await readFile(valuesPath, 'utf-8');
      const values = loadYaml(valuesContent);

      expect(values.serviceMonitor).toBeDefined();
      expect(values.serviceMonitor.enabled).toBe(true);
      expect(values.serviceMonitor.interval).toBeDefined();
      expect(values.serviceMonitor.path).toBe('/metrics');
    });
  });

  test('should have umbrella chart', async () => {
    const umbrellaPath = join(helmDir, 'umbrella', 'Chart.yaml');
    await expect(access(umbrellaPath)).resolves.not.toThrow();

    const chartContent = await readFile(umbrellaPath, 'utf-8');
    const chart = loadYaml(chartContent);

    expect(chart.name).toBe('mcp-devops-automation');
    expect(chart.dependencies).toBeDefined();
    expect(chart.dependencies.length).toBe(microservices.length);
  });
});
