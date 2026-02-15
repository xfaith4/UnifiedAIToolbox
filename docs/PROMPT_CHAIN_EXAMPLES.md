# Prompt Chain Usage Examples

**Real-world examples of using the UnifiedAIToolbox prompt chain with AI assistants.**

---

## Example 1: Starting from Scratch

### Scenario

You want to rebuild the entire UnifiedAIToolbox application from scratch.

### Step-by-Step

#### 1. Prepare Your Environment

```bash
# Create a new directory
mkdir UnifiedAIToolbox-Rebuild
cd UnifiedAIToolbox-Rebuild

# Initialize Git
git init

# Create a reference document
cp /path/to/original/docs/PROMPT_CHAIN_REBUILD.md ./REFERENCE.md
```

#### 2. Start with Phase 1, Prompt 1.1

**To your AI assistant (e.g., ChatGPT, Claude):**

```
I'm rebuilding the UnifiedAIToolbox application using a structured prompt chain approach.

Phase: 1 - Foundation & Project Structure
Prompt: 1.1 - Initialize Project Structure

Please execute the following prompt:

---

[Paste Prompt 1.1 from PROMPT_CHAIN_REBUILD.md]

---

Current State:
- Empty directory initialized with Git
- No existing files

Please generate:
1. Complete directory structure
2. package.json with workspace configuration
3. README.md with project overview
4. .env.example with all configuration options
5. Proper .gitignore for Python, Node.js, and IDE files

After completion, show me the file tree and contents of key files.
```

#### 3. Review and Apply

The AI will generate code. Review it, then:

```bash
# Create files as generated
# For example:
cat > package.json << 'EOF'
[Generated content]
EOF

cat > README.md << 'EOF'
[Generated content]
EOF

# And so on...

# Commit after verification
git add .
git commit -m "Phase 1.1: Initialize project structure"
```

#### 4. Continue with Prompt 1.2

Repeat the process for each prompt in sequence.

---

## Example 2: Adding Missing Component

### Scenario

Your application is mostly complete, but you need to add the cost analytics feature.

### Targeted Approach

**To your AI assistant:**

```
I have an existing UnifiedAIToolbox application and need to add the cost tracking and analytics feature.

Phase: 4 - Integration & Orchestration Features
Prompt: 4.1 - Implement Cost Tracking and Analytics

Context:
- FastAPI backend is running at apps/UnifiedPromptApp/services/prompt-api/
- Next.js frontend is at apps/unifiedtoolbox.webapp/
- SQLite database is set up for prompts and runs
- OpenAI integration is working

Please execute Prompt 4.1:

[Paste Prompt 4.1 from PROMPT_CHAIN_REBUILD.md]

Show me:
1. The cost_metrics.py module
2. The telemetry.py module
3. The routers/analytics.py endpoints
4. The frontend analytics page component
5. Test cases for cost calculations
```

---

## Example 3: Debugging with Prompt Chain

### Scenario

Your prompt management system isn't working correctly. Use the prompt chain to rebuild it properly.

### Debugging Approach

**To your AI assistant:**

```
I'm experiencing issues with the prompt management system in my UnifiedAIToolbox application. I want to rebuild it following the proper structure from the prompt chain.

Phase: 2 - Backend Infrastructure
Prompt: 2.2 - Implement Prompt Management System

Current Issues:
- Full-text search not returning results
- YAML parsing errors for some prompts
- Variable substitution not working

Existing Structure:
[Show your current file structure and relevant code]

Please execute Prompt 2.2 with emphasis on:
1. Proper FTS5 full-text search setup
2. Robust YAML parsing with error handling
3. Correct variable substitution implementation
4. Comprehensive tests for these features

Generate the corrected code and highlight what was wrong with my current implementation.
```

---

## Example 4: Customizing for Different Tech Stack

### Scenario

You want to use PostgreSQL instead of SQLite and PostgreSQL's full-text search instead of FTS5.

### Customization Approach

**To your AI assistant:**

```
I'm using the UnifiedAIToolbox prompt chain but need to customize for PostgreSQL instead of SQLite.

Phase: 2 - Backend Infrastructure
Prompt: 2.2 - Implement Prompt Management System

MODIFICATIONS NEEDED:
- Replace SQLite with PostgreSQL
- Use PostgreSQL's full-text search (tsvector/tsquery) instead of FTS5
- Use SQLAlchemy ORM for database operations
- Add database migrations using Alembic

Please execute Prompt 2.2 with these modifications:

[Paste Prompt 2.2]

Additional Requirements:
1. Create database.py with SQLAlchemy setup
2. Create models/ directory with SQLAlchemy models
3. Create alembic/ directory for migrations
4. Update requirements.txt with psycopg2 and sqlalchemy
5. Provide initial migration script

Show me the modified architecture and all changed files.
```

---

## Example 5: Incremental Enhancement

### Scenario

Your basic application works, but you want to add advanced orchestration features.

### Enhancement Approach

**To your AI assistant:**

```
My UnifiedAIToolbox application is functional with basic features. I want to add advanced orchestration capabilities.

Phase: 6 - Advanced Features (Optional)
Prompt: 6.1 - Implement Parallel Teams

Current State:
- Basic orchestration works (single team, sequential)
- Supervisor, Researcher, Engineer agents are functional
- Run tracking and logging is in place

Please execute Prompt 6.1:

[Paste Prompt 6.1]

Integration Requirements:
- Must work with existing orchestration engine
- Should reuse existing agent implementations
- Need clear conflict resolution strategy
- Add UI controls for parallel team configuration

Show me:
1. How parallel team execution integrates with current code
2. Modified orchestration engine
3. UI components for team management
4. Configuration options in .env
```

---

## Example 6: Multiple Prompts in One Session

### Scenario

You have a few hours and want to complete multiple related prompts efficiently.

### Batch Approach

**To your AI assistant:**

```
I want to complete multiple related prompts in the Backend Infrastructure phase today.

Prompts to Execute:
1. Phase 2.1 - Create FastAPI Application Structure
2. Phase 2.2 - Implement Prompt Management System

Please execute these prompts in sequence. After each prompt:
1. Show me a summary of files created/modified
2. Show me the key code snippets
3. Wait for my confirmation before proceeding

Let's start with Prompt 2.1:

[Paste Prompt 2.1]

Current State:
- Project structure from Phase 1 is complete
- Python virtual environment is set up
- .env file is configured with OpenAI API key
```

Then after reviewing 2.1:

```
Prompt 2.1 looks good. I've created all the files and tested the basic server startup.

Now please proceed with Prompt 2.2:

[Paste Prompt 2.2]

Current State:
- FastAPI server structure is in place from 2.1
- Basic routing and auth are functional
- Ready to add prompt management
```

---

## Example 7: Using Prompt Chain for Learning

### Scenario

You want to learn how the application is architected by building it step by step.

### Learning Approach

**To your AI assistant:**

```
I'm using the UnifiedAIToolbox prompt chain to learn about building AI orchestration platforms. I want to understand each design decision.

Phase: 2 - Backend Infrastructure
Prompt: 2.3 - Create Multi-Agent Orchestration Engine

Please execute Prompt 2.3, but also:
1. Explain WHY you're making each design choice
2. Describe alternative approaches and their trade-offs
3. Point out best practices being followed
4. Highlight potential pitfalls to avoid

[Paste Prompt 2.3]

As you generate code, please add detailed comments explaining:
- The purpose of each major function/class
- Design patterns being used
- Why this approach is suitable for AI orchestration
- How different components interact

After showing the code, provide a high-level architecture diagram (as text/ASCII) showing how the orchestration engine fits into the overall system.
```

---

## Tips for Effective Prompt Chain Usage

### 1. Provide Context

Always tell the AI where you are in the process:

```
Current Phase: 3.4
Completed Phases: 1.1-1.3, 2.1-2.5, 3.1-3.3
Current State: Frontend components created, need orchestration UI
```

### 2. Show Your Work

Share relevant code when asking for next steps:

```
Here's my current prompt_registry.py:
[Code snippet]

Now I'm ready for Prompt 2.3 - Orchestration Engine
```

### 3. Ask for Explanations

Don't just accept generated code:

```
Execute Prompt 2.2, and after generating the code, please explain:
- Why use FTS5 over regex search?
- How does the indexing improve performance?
- What are the limitations of this approach?
```

### 4. Request Validation

Ask the AI to help you verify:

```
Execute Prompt 2.4, and then provide:
1. curl commands to test each endpoint
2. Expected responses
3. Common error scenarios and how to handle them
```

### 5. Iterate When Needed

If something doesn't work:

```
I executed Prompt 2.3, but I'm getting this error:
[Error message]

Can you review the code and fix the issue? Here's the current implementation:
[Code]
```

---

## Common Patterns

### Pattern 1: Progressive Enhancement

Build basic functionality first, then enhance:

```
1. Execute Prompt 2.2 for basic prompt management
2. Test basic CRUD operations
3. Execute Prompt 2.2 again, asking for enhancements:
   - Add versioning
   - Add search suggestions
   - Add usage analytics
```

### Pattern 2: Integration Checkpoints

After major components, verify integration:

```
Completed: Prompts 2.1 (FastAPI) and 2.2 (Prompt Management)

Before moving to 2.3, please help me verify integration:
1. Generate an integration test
2. Show me how to test the /api/prompts endpoints
3. Verify authentication works with prompt endpoints
```

### Pattern 3: Documentation as You Go

Generate docs alongside code:

```
Execute Prompt 2.3 (Orchestration Engine), and also create:
1. API documentation for orchestration endpoints
2. Architecture diagram showing agent interactions
3. User guide for running orchestrations
4. Troubleshooting guide for common issues
```

---

## Troubleshooting Prompt Execution

### Issue: AI Generates Incomplete Code

**Solution:**
```
The code you generated for Prompt 2.2 seems incomplete. I don't see:
- The FTS5 index creation
- The search endpoint implementation

Please provide the complete implementation of prompt_registry.py including all functions mentioned in Prompt 2.2.
```

### Issue: Generated Code Doesn't Match Existing Structure

**Solution:**
```
The code format doesn't match our existing structure. Here's our code style:

[Show example from existing code]

Please regenerate the code from Prompt 2.4 following this style and structure.
```

### Issue: Dependencies Not Working

**Solution:**
```
I'm getting import errors with the code from Prompt 2.1.

Error: ModuleNotFoundError: No module named 'fastapi'

Please provide:
1. Complete requirements.txt with pinned versions
2. Installation commands
3. Virtual environment setup steps
```

---

## Advanced Usage

### Using with Version Control

Track each prompt completion:

```bash
# After each prompt
git add .
git commit -m "Phase 2.2: Implement prompt management system

- Added prompt_registry.py with FTS5 search
- Created REST API endpoints
- Added Pydantic models
- Implemented tests

Prompt: 2.2 from PROMPT_CHAIN_REBUILD.md"
```

### Using with Multiple AI Assistants

Different AIs for different phases:

- **GPT-4**: Architecture and complex logic (Phase 2, Phase 4)
- **Claude**: Documentation and testing (Phase 5)
- **Codex**: Frontend components (Phase 3)

Maintain consistency by providing previous AI's output as context.

### Using for Code Reviews

Review AI-generated code:

```
Please review the code you generated for Prompt 2.3 and:
1. Identify potential bugs
2. Suggest performance improvements
3. Check for security issues
4. Verify error handling is adequate
```

---

## Success Stories

### Story 1: Weekend Rebuild
>
> "Used the prompt chain over a weekend to rebuild UnifiedAIToolbox for my company's internal use. Completed Phases 1-4 in 16 hours. The phased approach kept me organized and prevented scope creep."

### Story 2: Learning Project
>
> "As a student learning full-stack development, this prompt chain taught me how professional applications are structured. Each prompt includes best practices and explains the 'why' behind decisions."

### Story 3: Custom Variant
>
> "Used the prompt chain as a template to build a similar orchestration platform but for medical research. Modified the prompts to use our domain-specific requirements. Saved months of development time."

---

## Next Steps

After completing the prompt chain:

1. **Customize**: Adapt the application to your specific needs
2. **Extend**: Add features beyond the prompt chain
3. **Contribute**: Share your improvements back to the community
4. **Maintain**: Keep the application updated with latest dependencies

---

## Resources

- **Full Prompt Chain**: [PROMPT_CHAIN_REBUILD.md](./PROMPT_CHAIN_REBUILD.md)
- **Quick Reference**: [PROMPT_CHAIN_QUICK_REFERENCE.md](./PROMPT_CHAIN_QUICK_REFERENCE.md)
- **GitHub Repository**: https://github.com/xfaith4/UnifiedAIToolbox

---

**Last Updated**: 2026-02-14
**Version**: 1.0.0
