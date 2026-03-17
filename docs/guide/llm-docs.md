# LLM Documentation

`@fozooni/nestjs-storage` ships with **AI-ready documentation** designed specifically for large language models. Two files at the project root -- `llm.md` and `llm-full.md` -- give AI coding assistants the context they need to generate correct, idiomatic storage code on the first try.

## What Are llm.md and llm-full.md?

These are structured reference documents optimized for AI consumption:

| File | Size | Contents | Best For |
|------|------|----------|----------|
| `llm.md` | Compact | API signatures, configuration shapes, quick-reference tables, key patterns | Fast lookups, small context windows, inline hints |
| `llm-full.md` | Comprehensive | Full API docs, all method signatures with parameter descriptions, complete examples, error handling patterns, decorator disk details | Deep implementation tasks, complex integrations, architectural decisions |

Both files are plain Markdown with no special formatting requirements -- any tool that can read text files can use them.

## Why AI-Ready Documentation Matters

When you ask an AI coding assistant to "add S3 file upload to my NestJS app," the AI needs to know:

1. **What package to import** -- `@fozooni/nestjs-storage`, not a generic S3 SDK wrapper
2. **How to configure the module** -- `StorageModule.forRoot()` with the correct config shape
3. **Which methods to call** -- `disk.put()`, `disk.putFile()`, `StorageFileInterceptor`
4. **How decorators compose** -- `RetryDisk` wrapping `EncryptedDisk` wrapping `S3Disk`
5. **Error handling patterns** -- `StorageFileNotFoundError`, exception filters

Without explicit documentation in the AI's context, it will guess -- often generating outdated patterns, wrong import paths, or non-existent API methods. The LLM docs eliminate this guesswork entirely.

::: tip
Including `llm.md` in your AI tool's context can dramatically reduce the number of iterations needed to get working storage code. Instead of back-and-forth corrections, the AI generates correct code on the first attempt.
:::

## Using with Cursor

### Option 1: Add to .cursorrules

Create or edit `.cursorrules` in your project root:

```
When working with file storage in this project, refer to the @fozooni/nestjs-storage
documentation in node_modules/@fozooni/nestjs-storage/llm.md for API reference.

Key patterns:
- Use StorageModule.forRoot() or forRootAsync() for configuration
- Inject StorageService for runtime disk access
- Use @InjectDisk('name') for direct disk injection
- Use FakeDisk from @fozooni/nestjs-storage/testing for tests
```

### Option 2: @-mention in Chat

Reference the file directly in Cursor's chat:

```
@llm.md How do I add encrypted S3 storage to my app?
```

Or reference the full version for complex tasks:

```
@llm-full.md I need to implement a multi-tenant storage system
with per-tenant quotas and encryption. Show me the full setup.
```

### Option 3: Add to Docs Context

In Cursor's settings, add the LLM docs as documentation context:

1. Open Cursor Settings
2. Navigate to **Features** > **Docs**
3. Add a new doc entry pointing to `node_modules/@fozooni/nestjs-storage/llm.md`

## Using with Claude Code

### Option 1: Reference in CLAUDE.md

Add to your project's `CLAUDE.md` file:

```markdown
## Storage

This project uses @fozooni/nestjs-storage for all file storage operations.
For API reference, see:
- Compact: node_modules/@fozooni/nestjs-storage/llm.md
- Full: node_modules/@fozooni/nestjs-storage/llm-full.md

Key conventions:
- All storage operations go through StorageService
- Use FakeDisk in tests, never real drivers
- S3 is the default production driver
- Local driver for development only
```

### Option 2: Project Instructions

In Claude Code's project configuration (`.claude/settings.json`), reference the docs:

```json
{
  "permissions": {},
  "project_instructions": "For storage operations, always reference node_modules/@fozooni/nestjs-storage/llm.md before generating code. Use the patterns documented there rather than guessing API shapes."
}
```

### Option 3: Direct File Reference

When chatting with Claude Code, reference the file directly:

```
Look at node_modules/@fozooni/nestjs-storage/llm-full.md and then
help me add versioned storage with automatic snapshots to my documents service.
```

## Using with GitHub Copilot Chat

### Workspace Context

In VS Code with GitHub Copilot, use the `#file` reference:

```
#file:node_modules/@fozooni/nestjs-storage/llm.md

How do I set up GCS with CloudFront CDN in this project?
```

### Custom Instructions

Add to your `.github/copilot-instructions.md`:

```markdown
## File Storage

This project uses @fozooni/nestjs-storage. When generating storage-related code:

1. Import from '@fozooni/nestjs-storage'
2. Use StorageModule.forRoot() or forRootAsync() for configuration
3. Inject StorageService, not individual disk classes
4. Reference llm.md in node_modules for API details
```

## Using with Windsurf

Add to your Windsurf rules (`.windsurfrules`):

```
For file storage operations in this NestJS project, consult
node_modules/@fozooni/nestjs-storage/llm.md for the correct API.

Important: This project uses @fozooni/nestjs-storage, NOT direct AWS SDK,
multer-s3, or other storage packages. All file operations must go through
the StorageService or injected disk instances.
```

## Using with Other AI Tools

The LLM docs work with any AI tool that accepts text context. The general pattern is:

1. **Copy the contents** of `llm.md` (or `llm-full.md`) into the tool's context/system prompt
2. **Reference specific sections** when asking questions
3. **Include in project documentation** that the AI tool indexes

For tools with limited context windows, use `llm.md` (compact). For tools with larger context windows (128K+), use `llm-full.md` for more complete coverage.

## Compact vs. Full: When to Use Which

### Use `llm.md` (Compact) When:

- Your AI tool has a **small context window** (under 32K tokens)
- You need a **quick reference** for API signatures
- The task is **straightforward** -- simple CRUD, basic configuration
- You are **cost-conscious** about token usage with pay-per-token APIs
- You want to include it in a **system prompt** that has other content too

### Use `llm-full.md` (Full) When:

- Your AI tool has a **large context window** (128K+ tokens)
- The task is **complex** -- multi-disk setups, decorator composition, custom strategies
- You need **complete examples** with all options documented
- You are **architecting** a new storage subsystem from scratch
- You need to understand **error handling**, **testing patterns**, or **advanced features**

::: info
Both files are kept in sync with the package source code. When you update `@fozooni/nestjs-storage`, the LLM docs update automatically with the new version.
:::

## Example Workflow

Here is a real-world example of using LLM docs to add storage to an application:

### Task: "Add S3 upload with validation to my NestJS app"

**Step 1:** Point your AI tool to the docs

```
Read node_modules/@fozooni/nestjs-storage/llm.md and then help me
add an image upload endpoint that:
- Accepts JPEG and PNG files up to 5 MB
- Stores them on S3 with date-based paths
- Validates file types using magic bytes
- Returns the CDN URL
```

**Step 2:** The AI generates correct code on the first try because it has access to:

- The exact `StorageModule.forRoot()` config shape
- `StorageFileInterceptor` options including `namingStrategy`
- `MagicBytesValidator` with supported types
- `DatePathNamingStrategy` import and usage
- CDN URL configuration via the `cdn` config block

**Step 3:** The AI also generates tests using the documented patterns:

```typescript
// The AI knows about FakeDisk and StorageTestUtils
// because they are documented in the LLM docs
import { FakeDisk, StorageTestUtils } from '@fozooni/nestjs-storage/testing';
```

Without the LLM docs, the same request might require 3-5 iterations of corrections as the AI guesses wrong import paths, method names, or configuration shapes.

## Keeping Docs Updated

The LLM docs are maintained as part of the `@fozooni/nestjs-storage` package. When you update the package:

```bash
pnpm update @fozooni/nestjs-storage
```

The `llm.md` and `llm-full.md` files in `node_modules` are automatically updated to reflect the new version's API.

::: warning
If you copy the LLM docs into a project file (rather than referencing them from `node_modules`), remember to update your copy when you upgrade the package. Stale docs can cause AI tools to generate code for an older API version.
:::

## Next Steps

You have completed the guide. For more advanced topics, explore:

- **Decorator Disks** -- Compose encryption, caching, retry, quotas, CDN, tracing, versioning, and routing
- **StorageMigrator** -- Bulk cross-disk file migration with async generators
- **StorageArchiver** -- Create zip/tar archives from stored files
- **StorageEventsService** -- Subscribe to storage operation events
- **StorageUploadProgressService** -- Track upload progress with RxJS
- **Health Checks** -- Integrate storage health into `@nestjs/terminus`
