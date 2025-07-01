# Domain Modeling and Functional Programming Rules

## Domain Modeling

1. **Domain-First Organization**
   - Organize code around domain concepts, not technical concepts
   - Keep domain logic close to where it's used
   - Avoid generic folders like "utils", "services", "helpers"
   - Name files and folders after domain concepts
   - Create small, focused modules that do one thing well

2. **Strong Domain Types**
   - Use TypeScript to model domain concepts explicitly
   - Create domain-specific types and interfaces
   - Avoid using generic types like `any` or `unknown`
   - Use discriminated unions for domain states
   - Make invalid states unrepresentable

3. **Domain-Driven Error Handling**
   - Create domain-specific error types
   - Use error types to represent domain failure cases
   - Keep error handling close to the domain logic
   - Provide meaningful error messages and guidance

4. **API Organization**
   - Group API routes by domain concept
   - Keep domain logic within the route's directory
   - Share domain code between routes explicitly
   - Make dependencies between routes clear

## Functional Programming

1. **Pure Functions**
   - Write pure functions where possible
   - Separate side effects from business logic
   - Use function composition
   - Avoid mutating state

2. **Immutability**
   - Use immutable data structures
   - Avoid mutating objects and arrays
   - Use spread operators and array methods
   - Consider using libraries like Immer for complex state

3. **Type Safety**
   - Use TypeScript's type system effectively
   - Leverage type inference
   - Use type guards and narrowing
   - Make types as specific as possible

4. **Error Handling**
   - Use Result/Either types for error handling
   - Avoid throwing exceptions for expected errors
   - Handle errors at the appropriate level
   - Provide meaningful error types

5. **State Management**
   - Use React's built-in state management
   - Keep state as local as possible
   - Lift state up only when necessary
   - Consider using reducers for complex state

## Code Organization

1. **File Structure**
   ```
   src/
   ├── app/
   │   └── api/
   │       └── [domain]/
   │           ├── route.ts
   │           ├── parse-wordpress-export.ts
   │           ├── validate-wordpress-posts.ts
   │           ├── convert-to-markdown.ts
   │           ├── handle-wordpress-errors.ts
   │           └── types.ts
   └── components/
       └── [domain]/
           ├── [component].tsx
           └── types.ts
   ```

2. **Naming Conventions**
   - Name files after specific domain actions, not generic operations
   - Use domain-specific verbs and nouns in filenames
   - Be explicit about what domain concept is being handled
   - Avoid generic terms like "process", "validate", "transform"
   - Examples of good naming:
     - Instead of `validate-data.ts` → `validate-wordpress-posts.ts`
     - Instead of `transform-data.ts` → `convert-to-markdown.ts`
     - Instead of `parse-input.ts` → `parse-wordpress-export.ts`
     - Instead of `handle-errors.ts` → `handle-wordpress-errors.ts`
     - Instead of `file-operations.ts` → `read-wordpress-export.ts`, `write-markdown-files.ts`
     - Instead of `migration-service.ts` → `prepare-wordpress-migration.ts`, `validate-wordpress-content.ts`

3. **Module Design**
   - Keep modules small and focused
   - Each module should have a single responsibility
   - Export only what's necessary
   - Make dependencies explicit
   - Example module structure:
     ```typescript
     // parse-wordpress-export.ts
     import { WordPressExport } from './types'
     import { handleWordPressParseErrors } from './handle-wordpress-errors'

     export function parseWordPressExport(input: string): WordPressExport {
       // Single responsibility: parse WordPress export file
     }

     // validate-wordpress-posts.ts
     import { WordPressPost } from './types'
     import { handleWordPressValidationErrors } from './handle-wordpress-errors'

     export function validateWordPressPosts(posts: WordPressPost[]): boolean {
       // Single responsibility: validate WordPress post structure
     }
     ```

4. **Code Splitting**
   - Split code by domain boundaries
   - Keep related code together
   - Make dependencies explicit
   - Avoid circular dependencies

## Best Practices

1. **Testing**
   - Write tests for domain logic
   - Test error cases explicitly
   - Use property-based testing where appropriate
   - Keep tests close to the code they test

2. **Documentation**
   - Document domain concepts
   - Use TypeScript for self-documenting code
   - Add JSDoc comments for complex logic
   - Keep documentation close to the code

3. **Performance**
   - Use React.memo for expensive components
   - Implement proper memoization
   - Avoid unnecessary re-renders
   - Profile and optimize based on data

4. **Security**
   - Validate input at domain boundaries
   - Use proper type checking
   - Handle errors gracefully
   - Follow security best practices 
