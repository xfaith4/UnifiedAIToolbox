# Prompt Chain Quick Reference

**Quick guide for recreating UnifiedAIToolbox using the prompt chain approach.**

## 📋 Phase Overview

| Phase | Focus | Prompts | Estimated Time |
|-------|-------|---------|----------------|
| **Phase 1** | Foundation & Project Structure | 3 prompts | 2-3 hours |
| **Phase 2** | Backend Infrastructure | 5 prompts | 8-12 hours |
| **Phase 3** | Frontend Web Application | 5 prompts | 10-15 hours |
| **Phase 4** | Integration & Orchestration | 4 prompts | 6-8 hours |
| **Phase 5** | Testing, Deployment & Docs | 5 prompts | 8-10 hours |
| **Phase 6** | Advanced Features (Optional) | 3 prompts | 4-6 hours |

**Total Time: 38-54 hours** (about 1-2 weeks for full rebuild)

---

## 🚀 Quick Start

### Prerequisites
- AI assistant with code generation capabilities (GPT-4 or better)
- Development environment: Python 3.12+, Node.js 18+
- OpenAI API key
- Git installed

### Execution Steps

1. **Start with Phase 1, Prompt 1.1**
2. **Execute each prompt in order**
3. **Test after each prompt**
4. **Commit to Git after each phase**
5. **Don't skip prompts** - they build on each other

---

## 📝 Prompt Template

When using prompts with an AI assistant, follow this template:

```
I'm rebuilding the UnifiedAIToolbox application. I'm currently on:

Phase: [X]
Prompt: [X.Y]
Title: [Prompt Title]

[Paste the full prompt from PROMPT_CHAIN_REBUILD.md]

Context from previous steps:
- [What has been completed]
- [Current file structure]
- [Any relevant changes made]

Please generate the code and configurations as specified.
```

---

## 🎯 Quick Checklist

Use this checklist to track progress:

### Phase 1: Foundation ✓
- [ ] 1.1: Project structure and workspace setup
- [ ] 1.2: Core documentation created
- [ ] 1.3: Build and launch scripts working

### Phase 2: Backend ✓
- [ ] 2.1: FastAPI application structure
- [ ] 2.2: Prompt management system with YAML + SQLite
- [ ] 2.3: Multi-agent orchestration engine
- [ ] 2.4: GitHub integration for repo operations
- [ ] 2.5: Artifact normalization pipeline

### Phase 3: Frontend ✓
- [ ] 3.1: Next.js application initialized
- [ ] 3.2: Core UI components and layout
- [ ] 3.3: Prompt library interface
- [ ] 3.4: Orchestration visual designer
- [ ] 3.5: GitHub integration interface

### Phase 4: Integration ✓
- [ ] 4.1: Cost tracking and analytics
- [ ] 4.2: MCP server integration
- [ ] 4.3: Run observatory and tracking
- [ ] 4.4: Telemetry and monitoring

### Phase 5: Quality & Deployment ✓
- [ ] 5.1: Comprehensive test suite
- [ ] 5.2: Deployment configurations (Docker, CI/CD)
- [ ] 5.3: User documentation
- [ ] 5.4: Developer documentation
- [ ] 5.5: Final QA and release prep

### Phase 6: Advanced (Optional) ✓
- [ ] 6.1: Parallel teams orchestration
- [ ] 6.2: Requirement wizard
- [ ] 6.3: Hardening pipeline

---

## ⚡ Critical Success Factors

### After Each Prompt
1. ✅ **Test the generated code** - Don't move forward with broken code
2. ✅ **Run linters** - Keep code quality high from the start
3. ✅ **Commit changes** - Version control is essential
4. ✅ **Update docs** - Documentation decay is real

### After Each Phase
1. ✅ **Full integration test** - Ensure all components work together
2. ✅ **Manual testing** - Click through the UI, test API endpoints
3. ✅ **Review code** - AI-generated code needs human review
4. ✅ **Update README** - Keep project documentation current

---

## 🔧 Common Issues & Solutions

### Issue: Dependencies Conflict
**Solution**: Pin specific versions in requirements.txt and package.json

### Issue: Tests Failing
**Solution**: Mock external APIs (OpenAI, GitHub), use fixtures

### Issue: Build Errors
**Solution**: Check Node.js and Python versions, clear cache and reinstall

### Issue: API Connection Issues
**Solution**: Verify .env configuration, check CORS settings

### Issue: Authentication Not Working
**Solution**: Check JWT secret, verify token expiration settings

---

## 📊 Quality Gates

Don't proceed to the next phase until these pass:

### Phase 1 Gates
- ✓ Repository structure created
- ✓ All documentation files present
- ✓ Launch scripts execute without errors

### Phase 2 Gates
- ✓ FastAPI server starts on port 8000
- ✓ `/docs` endpoint shows OpenAPI documentation
- ✓ All backend tests pass
- ✓ Can create and retrieve prompts via API

### Phase 3 Gates
- ✓ Next.js app starts on port 3000
- ✓ Can navigate between pages
- ✓ API integration works (fetch prompts)
- ✓ UI renders without console errors

### Phase 4 Gates
- ✓ Can run full orchestration workflow
- ✓ GitHub integration works (create PR)
- ✓ Cost tracking displays correctly
- ✓ MCP servers load and respond

### Phase 5 Gates
- ✓ Test coverage >80% backend, >70% frontend
- ✓ Docker compose starts all services
- ✓ CI pipeline passes
- ✓ Documentation is complete and accurate

---

## 🎬 Quick Command Reference

### Start Development
```bash
# Linux/Mac/WSL
./launch.sh

# Windows PowerShell
.\Start-Toolbox.ps1
```

### Run Tests
```bash
# Backend tests
cd apps/UnifiedPromptApp/services/prompt-api
pytest

# Frontend tests
cd apps/unifiedtoolbox.webapp
npm test
```

### Build for Production
```bash
# Backend
cd apps/UnifiedPromptApp/services/prompt-api
pip install -r requirements.txt
python app.py

# Frontend
cd apps/unifiedtoolbox.webapp
npm run build
npm start
```

### Docker
```bash
# Build and run all services
docker-compose up --build

# Stop services
docker-compose down
```

---

## 📚 Key Files Reference

### Configuration
- `.env` - Environment variables
- `package.json` - Root workspace config
- `requirements.txt` - Python dependencies

### Entry Points
- `launch.sh` - Linux/Mac launcher
- `Start-Toolbox.ps1` - Windows launcher
- `apps/UnifiedPromptApp/services/prompt-api/app.py` - API server
- `apps/unifiedtoolbox.webapp/src/app/page.tsx` - Web portal home

### Documentation
- `README.md` - Project overview
- `docs/PROMPT_CHAIN_REBUILD.md` - Full prompt chain
- `docs/architecture.md` - System architecture
- `docs/getting-started.md` - User guide
- `AGENTS.md` - Orchestration rules

---

## 💡 Tips for Success

1. **Use the right AI model**: GPT-4 or better recommended for code generation
2. **Provide context**: Always include relevant file contents and structure
3. **Iterate**: First attempt may not be perfect, refine as needed
4. **Test frequently**: Catch issues early
5. **Read generated code**: Don't blindly accept AI output
6. **Ask for explanations**: If something is unclear, ask the AI to explain
7. **Keep prompts focused**: Don't try to do too much in one prompt
8. **Maintain consistency**: Use the same AI model throughout for consistency

---

## 🔗 Related Resources

- **Full Prompt Chain**: [PROMPT_CHAIN_REBUILD.md](./PROMPT_CHAIN_REBUILD.md)
- **Architecture**: [architecture.md](./architecture.md)
- **Getting Started**: [getting-started.md](./getting-started.md)
- **API Reference**: OpenAPI docs at `http://localhost:8000/docs`
- **GitHub Repository**: https://github.com/xfaith4/UnifiedAIToolbox

---

## 📞 Support

If you encounter issues using this prompt chain:

1. Check the [Troubleshooting Guide](./getting-started.md#troubleshooting)
2. Review the [FAQ](./FAQ.md)
3. Open an issue on GitHub
4. Consult the community discussions

---

## 🎯 Success Metrics

You've successfully rebuilt the application when:

- ✅ `./launch.sh` starts all services without errors
- ✅ Web portal at http://localhost:3000 is functional
- ✅ API docs at http://localhost:8000/docs are accessible
- ✅ Can create, save, and search prompts
- ✅ Can run an orchestration workflow end-to-end
- ✅ GitHub integration creates a PR successfully
- ✅ Tests pass with >80% coverage
- ✅ Docker deployment works

---

**Last Updated**: 2026-02-14  
**Version**: 1.0.0
