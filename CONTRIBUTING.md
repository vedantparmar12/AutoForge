# Contributing to MCP DevOps Automation

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/your-username/mcp-devops-automation.git
   cd mcp-devops-automation
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run in development mode**
   ```bash
   npm run dev
   ```

## Project Structure

```
src/
├── analyzers/          # Project analysis logic
├── calculators/        # Resource calculation
├── generators/         # Config file generators
├── tools/             # MCP tool implementations
├── types/             # TypeScript type definitions
└── index.ts           # Server entry point
```

## Adding New Features

### Adding a New Language/Framework

1. **Update `project-analyzer.ts`**:
   ```typescript
   // Add language extension mapping
   private languageExtensions: Record<string, string> = {
     '.newext': 'NewLanguage',
     // ...
   };

   // Add framework detection
   private async detectServiceFramework(...) {
     if (language === 'NewLanguage') {
       // Detection logic
     }
   }
   ```

2. **Update `resource-calculator.ts`**:
   ```typescript
   private getBaseResources(...) {
     const resourceMap = {
       'NewLanguage': {
         cpu: { request: '300m', limit: '600m' },
         memory: { request: '256Mi', limit: '512Mi' }
       }
     };
   }
   ```

3. **Update `cicd-generator.ts`**:
   ```typescript
   private getTestCommand(language: string) {
     switch (language) {
       case 'NewLanguage':
         return 'newlang test';
     }
   }
   ```

### Adding a New Cloud Provider

Currently supports AWS. To add GCP/Azure:

1. Create new generator: `src/generators/gcp-generator.ts`
2. Implement Terraform/Pulumi config generation
3. Update `devops-tools.ts` to support provider selection
4. Add provider-specific resource calculations

### Adding a New CI/CD Provider

1. **Create generator**:
   ```typescript
   // src/generators/gitlab-ci-generator.ts
   export class GitLabCIGenerator {
     generatePipeline(analysis: ProjectAnalysis): string {
       // Generate .gitlab-ci.yml
     }
   }
   ```

2. **Update tool**:
   ```typescript
   // src/tools/devops-tools.ts
   if (config.cicdProvider === 'gitlab-ci') {
     const gitlabGenerator = new GitLabCIGenerator();
     // Generate configs
   }
   ```

## Code Style

- **TypeScript**: Use strict mode
- **Formatting**: Prettier with 2-space indentation
- **Linting**: ESLint with recommended rules
- **Naming**: camelCase for functions, PascalCase for classes

Run formatters before committing:
```bash
npm run lint
npm run format
```

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
# Test with a real project
npm start
# In another terminal, use MCP client to test tools
```

### Manual Testing

1. Create a test project or use the retail-store-sample-app
2. Run analysis: `analyze-project`
3. Verify output matches expectations
4. Test resource calculations
5. Generate configs and verify file structure

## Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clear, concise code
   - Add/update tests
   - Update documentation

3. **Test thoroughly**
   ```bash
   npm test
   npm run lint
   npm run build
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "feat: add support for Ruby/Rails detection"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

## Commit Message Format

Follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Adding/updating tests
- `chore:` Maintenance tasks

Examples:
```
feat: add Python/Django project detection
fix: correct memory calculation for Java services
docs: update README with new examples
```

## Documentation

- Update README.md for user-facing changes
- Update EXAMPLE_USAGE.md for new features
- Add JSDoc comments for public APIs
- Update type definitions in `types/index.ts`

## Questions or Need Help?

- Open an issue for bugs or feature requests
- Join our Discord for discussions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
