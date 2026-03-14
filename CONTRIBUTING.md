# Contributing to @fozooni/nestjs-storage

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

1. **Fork and clone** the repository
2. **Install dependencies:**
   ```bash
   pnpm install
   ```
3. **Run tests:**
   ```bash
   pnpm test
   ```
4. **Build:**
   ```bash
   pnpm build
   ```

## Development Workflow

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```
2. Make your changes
3. Write or update tests for your changes
4. Ensure all tests pass: `pnpm test`
5. Ensure the build succeeds: `pnpm build`
6. Ensure linting passes: `pnpm lint`
7. Commit your changes with a descriptive message
8. Push and open a pull request

## Code Guidelines

- Write TypeScript with strict types
- Follow the existing code style (enforced by ESLint and Prettier)
- All new features must include tests
- All public APIs must be exported from `src/index.ts`
- Keep driver implementations consistent with the `FilesystemContract` interface

## Adding a New Driver

1. Create `src/disk/my-driver-disk.ts` implementing `FilesystemContract`
2. If the driver needs an SDK wrapper, create `src/wrapper/my-driver-client.ts`
3. Register the driver in `StorageService` constructor
4. Add the driver type to the `DiskConfig.driver` union in `src/interfaces/storage.interface.ts`
5. Export all new classes from the barrel index files
6. Add tests for the new driver
7. Update the README with configuration and usage examples

## Testing

- Unit tests use Jest with `ts-jest`
- Mock external SDKs at the module level using `jest.mock()`
- Local disk tests use real filesystem with temp directories
- Run coverage with: `pnpm test -- --coverage`

## Commit Messages

Use clear, descriptive commit messages:

- `feat: add Azure Blob Storage driver`
- `fix: handle empty file in putFile`
- `docs: update R2 configuration example`
- `test: add multipart upload tests for GCS`
- `refactor: extract common S3 options`

## Reporting Issues

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) for bugs
- Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) for new features
- Include reproduction steps, expected vs actual behavior, and environment details

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
