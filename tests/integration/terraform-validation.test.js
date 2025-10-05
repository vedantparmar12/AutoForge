/**
 * Integration tests for Terraform configurations
 * Validates generated Terraform files and backend setup
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { access, readFile } from 'fs/promises';
import { join } from 'path';
import { jest } from '@jest/globals';

const exec = promisify(require('child_process').exec);

describe('Terraform Configuration Validation', () => {
  const terraformDir = join(process.cwd(), 'devops-generated', 'terraform');
  const backendDir = join(process.cwd(), 'devops-generated', 'terraform', 'backend-setup');

  test('should have all required Terraform files', async () => {
    const requiredFiles = [
      'main.tf',
      'variables.tf',
      'outputs.tf',
      'vpc.tf',
      'eks.tf',
      'rds.tf',
      'ecr.tf',
      'iam.tf',
    ];

    for (const file of requiredFiles) {
      const filePath = join(terraformDir, file);
      await expect(access(filePath)).resolves.not.toThrow();
    }
  });

  test('should have environment-specific tfvars files', async () => {
    const envFiles = [
      'environments/dev.tfvars',
      'environments/staging.tfvars',
      'environments/prod.tfvars',
      'terraform.tfvars.example',
    ];

    for (const file of envFiles) {
      const filePath = join(terraformDir, file);
      await expect(access(filePath)).resolves.not.toThrow();
    }
  });

  test('should have backend configuration with DynamoDB', async () => {
    const mainTfContent = await readFile(join(terraformDir, 'main.tf'), 'utf-8');

    expect(mainTfContent).toContain('backend "s3"');
    expect(mainTfContent).toContain('dynamodb_table');
    expect(mainTfContent).toContain('mcp-devops-automation-terraform-lock');
  });

  test('should have backend setup infrastructure', async () => {
    const backendFiles = ['main.tf', 'variables.tf', 'outputs.tf', 'README.md'];

    for (const file of backendFiles) {
      const filePath = join(backendDir, file);
      await expect(access(filePath)).resolves.not.toThrow();
    }
  });

  test('should have proper RDS configuration with secrets management', async () => {
    const rdsContent = await readFile(join(terraformDir, 'rds.tf'), 'utf-8');

    expect(rdsContent).toContain('random_password');
    expect(rdsContent).toContain('aws_secretsmanager_secret');
    expect(rdsContent).toContain('storage_encrypted = true');
  });

  test('tfvars.example should not contain sensitive values', async () => {
    const exampleContent = await readFile(
      join(terraformDir, 'terraform.tfvars.example'),
      'utf-8'
    );

    expect(exampleContent).not.toMatch(/password\s*=\s*"[^"]+"/i);
    expect(exampleContent).not.toMatch(/secret\s*=\s*"[^"]+"/i);
    expect(exampleContent).not.toMatch(/key\s*=\s*"[^"]+"/i);
  });

  test('environment configs should have unique VPC CIDRs', async () => {
    const devContent = await readFile(
      join(terraformDir, 'environments/dev.tfvars'),
      'utf-8'
    );
    const stagingContent = await readFile(
      join(terraformDir, 'environments/staging.tfvars'),
      'utf-8'
    );
    const prodContent = await readFile(
      join(terraformDir, 'environments/prod.tfvars'),
      'utf-8'
    );

    const devCidr = devContent.match(/vpc_cidr\s*=\s*"([^"]+)"/)[1];
    const stagingCidr = stagingContent.match(/vpc_cidr\s*=\s*"([^"]+)"/)[1];
    const prodCidr = prodContent.match(/vpc_cidr\s*=\s*"([^"]+)"/)[1];

    expect(devCidr).not.toBe(stagingCidr);
    expect(stagingCidr).not.toBe(prodCidr);
    expect(devCidr).not.toBe(prodCidr);
  });

  test('should validate Terraform syntax', async () => {
    try {
      const { stdout, stderr } = await exec('terraform fmt -check -recursive', {
        cwd: terraformDir,
      });

      // If no error thrown, format is correct
      expect(stderr).toBeFalsy();
    } catch (error) {
      // If terraform is not installed, skip this test
      if (error.message.includes('terraform: not found') ||
          error.message.includes('terraform is not recognized')) {
        console.warn('Terraform not installed, skipping syntax validation');
      } else {
        throw error;
      }
    }
  }, 30000);
});
