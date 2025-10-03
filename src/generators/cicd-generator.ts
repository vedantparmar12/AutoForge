import type { ProjectAnalysis, ServiceInfo } from '../types/index.js';

export class CICDGenerator {
  generateGitHubActions(analysis: ProjectAnalysis, region: string = 'us-east-1'): Record<string, string> {
    const projectName = analysis.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    return {
      '.github/workflows/ci.yml': this.generateCIWorkflow(analysis),
      '.github/workflows/build-and-push.yml': this.generateBuildPushWorkflow(analysis, region, projectName),
      '.github/workflows/deploy.yml': this.generateDeployWorkflow(analysis, projectName),
      '.github/workflows/terraform.yml': this.generateTerraformWorkflow(projectName)
    };
  }

  private generateCIWorkflow(analysis: ProjectAnalysis): string {
    return `name: CI - Test and Lint

on:
  pull_request:
    branches: [ main, develop ]
  push:
    branches: [ develop ]

jobs:
${analysis.services.map(service => this.generateServiceCI(service)).join('\n\n')}

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: [${analysis.services.map(s => `test-${s.name}`).join(', ')}]

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Start services with Docker Compose
        run: |
          docker-compose up -d
          sleep 30

      - name: Run integration tests
        run: |
          # Add integration test commands here
          echo "Running integration tests..."

      - name: Stop services
        if: always()
        run: docker-compose down
`;
  }

  private generateServiceCI(service: ServiceInfo): string {
    const testCommand = this.getTestCommand(service.language, service.framework);
    const lintCommand = this.getLintCommand(service.language);
    const setupSteps = this.getSetupSteps(service.language);

    return `  test-${service.name}:
    name: Test ${service.name}
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./src/${service.name}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

${setupSteps}

      - name: Install dependencies
        run: ${this.getInstallCommand(service.language)}

      - name: Run linter
        run: ${lintCommand}

      - name: Run tests
        run: ${testCommand}

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/coverage-final.json
          flags: ${service.name}`;
  }

  private generateBuildPushWorkflow(analysis: ProjectAnalysis, region: string, projectName: string): string {
    return `name: Build and Push Docker Images

on:
  push:
    branches: [ main ]
    paths:
      - 'src/**'
  workflow_dispatch:

env:
  AWS_REGION: ${region}
  ECR_REGISTRY: \${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${region}.amazonaws.com

jobs:
  build-matrix:
    name: Build and Push
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
${analysis.services.map(s => `          - ${s.name}`).join('\n')}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: \${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: \${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.ECR_REGISTRY }}/${projectName}-cluster/\${{ matrix.service }}
          tags: |
            type=sha,prefix=,format=short
            type=ref,event=branch
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: ./src/\${{ matrix.service }}
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Update image tag in GitOps repo
        run: |
          git config --global user.name "GitHub Actions"
          git config --global user.email "actions@github.com"

          # Update image tag in k8s manifests or Helm values
          sed -i "s|image: .*/${projectName}-cluster/\${{ matrix.service }}:.*|image: \${{ env.ECR_REGISTRY }}/${projectName}-cluster/\${{ matrix.service }}:\${{ github.sha }}|g" k8s/\${{ matrix.service }}/deployment.yaml

          git add k8s/
          git commit -m "Update \${{ matrix.service }} image to \${{ github.sha }}" || echo "No changes to commit"
          git push
`;
  }

  private generateDeployWorkflow(analysis: ProjectAnalysis, projectName: string): string {
    return `name: Deploy to EKS

on:
  push:
    branches: [ main ]
    paths:
      - 'k8s/**'
      - 'helm/**'
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        default: 'production'
        type: choice
        options:
          - production
          - staging
          - development

jobs:
  deploy:
    name: Deploy to Kubernetes
    runs-on: ubuntu-latest
    environment: \${{ github.event.inputs.environment || 'production' }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: \${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: \${{ secrets.AWS_REGION }}

      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig --name ${projectName}-cluster --region \${{ secrets.AWS_REGION }}

      - name: Deploy to Kubernetes
        run: |
          kubectl apply -f k8s/ -n ${projectName}

      - name: Wait for deployment
        run: |
          kubectl rollout status deployment -n ${projectName} --timeout=5m

      - name: Verify deployment
        run: |
          kubectl get pods -n ${projectName}
          kubectl get svc -n ${projectName}

      - name: Run smoke tests
        run: |
          # Add smoke tests here
          echo "Running smoke tests..."

      - name: Notify deployment status
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: \${{ job.status }}
          text: 'Deployment to \${{ github.event.inputs.environment || 'production' }} \${{ job.status }}'
          webhook_url: \${{ secrets.SLACK_WEBHOOK }}
`;
  }

  private generateTerraformWorkflow(projectName: string): string {
    return `name: Terraform Infrastructure

on:
  push:
    branches: [ main ]
    paths:
      - 'terraform/**'
  pull_request:
    branches: [ main ]
    paths:
      - 'terraform/**'
  workflow_dispatch:

env:
  TF_VERSION: 1.9.0

jobs:
  terraform-plan:
    name: Terraform Plan
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'

    defaults:
      run:
        working-directory: ./terraform

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: \${{ env.TF_VERSION }}

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: \${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: \${{ secrets.AWS_REGION }}

      - name: Terraform Init
        run: terraform init

      - name: Terraform Format Check
        run: terraform fmt -check

      - name: Terraform Validate
        run: terraform validate

      - name: Terraform Plan
        id: plan
        run: terraform plan -no-color
        continue-on-error: true

      - name: Comment PR with plan
        uses: actions/github-script@v7
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          script: |
            const output = \`#### Terraform Format and Style 🖌\`\${{ steps.fmt.outcome }}\`
            #### Terraform Initialization ⚙️\`\${{ steps.init.outcome }}\`
            #### Terraform Validation 🤖\`\${{ steps.validate.outcome }}\`
            #### Terraform Plan 📖\`\${{ steps.plan.outcome }}\`

            <details><summary>Show Plan</summary>

            \\\`\\\`\\\`terraform
            \${{ steps.plan.outputs.stdout }}
            \\\`\\\`\\\`

            </details>

            *Pushed by: @\${{ github.actor }}, Action: \`\${{ github.event_name }}\`*\`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: output
            })

  terraform-apply:
    name: Terraform Apply
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: production

    defaults:
      run:
        working-directory: ./terraform

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: \${{ env.TF_VERSION }}

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: \${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: \${{ secrets.AWS_REGION }}

      - name: Terraform Init
        run: terraform init

      - name: Terraform Apply
        run: terraform apply -auto-approve

      - name: Output cluster info
        run: |
          terraform output -json > cluster-info.json
          cat cluster-info.json

      - name: Upload cluster info
        uses: actions/upload-artifact@v4
        with:
          name: cluster-info
          path: terraform/cluster-info.json
`;
  }

  private getSetupSteps(language: string): string {
    switch (language) {
      case 'JavaScript/TypeScript':
        return `      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: ./src/*/package-lock.json`;

      case 'Java':
        return `      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '21'
          cache: 'maven'`;

      case 'Go':
        return `      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.23'
          cache-dependency-path: ./src/*/go.sum`;

      case 'Python':
        return `      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'`;

      default:
        return `      - name: Setup environment
        run: echo "Setting up ${ language}"`;
    }
  }

  private getInstallCommand(language: string): string {
    switch (language) {
      case 'JavaScript/TypeScript':
        return 'npm ci';
      case 'Java':
        return 'mvn clean install -DskipTests';
      case 'Go':
        return 'go mod download';
      case 'Python':
        return 'pip install -r requirements.txt';
      default:
        return 'echo "No install command"';
    }
  }

  private getTestCommand(language: string, framework?: string): string {
    switch (language) {
      case 'JavaScript/TypeScript':
        return 'npm test';
      case 'Java':
        return 'mvn test';
      case 'Go':
        return 'go test ./...';
      case 'Python':
        return 'pytest';
      default:
        return 'echo "No test command"';
    }
  }

  private getLintCommand(language: string): string {
    switch (language) {
      case 'JavaScript/TypeScript':
        return 'npm run lint || npx eslint .';
      case 'Java':
        return 'mvn checkstyle:check';
      case 'Go':
        return 'golangci-lint run';
      case 'Python':
        return 'flake8 . && black --check .';
      default:
        return 'echo "No lint command"';
    }
  }
}
