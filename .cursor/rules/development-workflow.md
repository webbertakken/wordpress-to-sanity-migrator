# Development Workflow Rules

## Package Management

1. **Yarn Usage**
   - Use Yarn as the package manager
   - Keep `yarn.lock` in version control
   - Use exact versions in `package.json`
   - Document package versions in commit messages

2. **Dependencies**
   - Use `yarn add` for new dependencies
   - Use `yarn remove` to remove dependencies
   - Use `yarn upgrade` to update dependencies
   - Review dependency changes before committing

3. **Scripts**
   - Use Yarn scripts in `package.json`
   - Keep scripts focused and composable
   - Document script purposes
   - Use consistent script naming

## Development Server

1. **Error Handling**
   - Monitor dev server output
   - Fix errors immediately
   - Use TypeScript for type checking
   - Enable strict mode

2. **Hot Reloading**
   - Use Next.js fast refresh
   - Keep components pure for better HMR
   - Avoid breaking hot reloading
   - Test changes in development

3. **Performance**
   - Monitor build times
   - Use production builds for testing
   - Profile performance regularly
   - Optimize based on metrics

## Code Quality

1. **Linting**
   - Use ESLint for code quality
   - Fix linting errors immediately
   - Use Prettier for formatting
   - Keep consistent style

2. **Type Checking**
   - Enable strict TypeScript checks
   - Fix type errors immediately
   - Use proper type definitions
   - Avoid type assertions

3. **Testing**
   - Write tests for new features
   - Run tests before committing
   - Keep tests fast and focused
   - Use proper test isolation

## Git Workflow

1. **Commits**
   - Write meaningful commit messages
   - Keep commits focused
   - Reference issues in commits
   - Use conventional commits

2. **Branches**
   - Use feature branches
   - Keep branches up to date
   - Delete merged branches
   - Use descriptive branch names

3. **Code Review**
   - Review code before merging
   - Check for domain alignment
   - Verify error handling
   - Test changes locally

## Documentation

1. **Code Documentation**
   - Document complex logic
   - Keep documentation up to date
   - Use JSDoc for functions
   - Document domain concepts

2. **Project Documentation**
   - Keep README updated
   - Document setup steps
   - Include troubleshooting
   - Document domain model

## Deployment

1. **Build Process**
   - Use production builds
   - Optimize for production
   - Test production builds
   - Monitor build output

2. **Environment**
   - Use environment variables
   - Keep secrets secure
   - Document environment setup
   - Use proper configuration

## Monitoring

1. **Error Tracking**
   - Monitor runtime errors
   - Track build errors
   - Log important events
   - Set up error alerts

2. **Performance**
   - Monitor load times
   - Track resource usage
   - Profile bottlenecks
   - Optimize based on data

## Testing

### Testing Framework
- Use Vitest as the testing framework
- Configure Vitest with appropriate environment settings:
  - Use `jsdom` environment for UI/React component tests
  - Use `node` environment for API/backend tests
- Write tests in a descriptive, behavior-focused manner:
  - Use `it('returns...'` instead of `test('it should return...'`
  - Focus on behavior and outcomes rather than implementation details
  - Group related tests using `describe` blocks
- Follow the Arrange-Act-Assert pattern:
  - Arrange: Set up test data and conditions
  - Act: Execute the code being tested
  - Assert: Verify the results

### Test Organization
- Place test files next to the code they test
- Use `.test.ts` or `.test.tsx` extension for test files
- Group related tests in describe blocks
- Use clear, descriptive test names

### Mocking
- Use Vitest's built-in mocking capabilities
- Mock external dependencies and services
- Keep mocks simple and focused
- Reset mocks between tests using `beforeEach`

### Coverage
- Aim for high test coverage
- Focus on critical paths and edge cases
- Include both unit and integration tests
- Run tests before committing changes
