#!/usr/bin/env python3
"""
Simple test to verify frontend-backend orchestration connection configuration.
This script checks that all necessary configuration is in place.
"""
import os
import sys
from pathlib import Path

def test_webapp_env():
    """Check that webapp has proper .env.local configuration."""
    webapp_dir = Path(__file__).parent / "apps" / "unifiedtoolbox.webapp"
    env_local = webapp_dir / ".env.local"
    env_example = webapp_dir / ".env.local.example"
    
    print("📋 Checking webapp environment configuration...")
    
    if not env_example.exists():
        print("  ❌ .env.local.example not found")
        return False
    else:
        print("  ✅ .env.local.example exists")
    
    if not env_local.exists():
        print("  ⚠️  .env.local not found (will use defaults)")
        print(f"     Create it from: {env_example}")
    else:
        print("  ✅ .env.local exists")
        
        # Check content
        content = env_local.read_text()
        if "NEXT_PUBLIC_API_BASE" in content:
            print("  ✅ NEXT_PUBLIC_API_BASE is configured")
        else:
            print("  ⚠️  NEXT_PUBLIC_API_BASE not found in .env.local")
    
    return True

def test_docker_compose():
    """Check docker-compose configuration."""
    docker_compose = Path(__file__).parent / "docker-compose.yml"
    
    print("\n🐳 Checking docker-compose configuration...")
    
    if not docker_compose.exists():
        print("  ❌ docker-compose.yml not found")
        return False
    
    content = docker_compose.read_text()
    
    # Check if unified-webapp service has NEXT_PUBLIC_API_BASE
    if "unified-webapp:" in content:
        print("  ✅ unified-webapp service found")
        
        if "NEXT_PUBLIC_API_BASE" in content:
            print("  ✅ NEXT_PUBLIC_API_BASE is configured in docker-compose")
        else:
            print("  ❌ NEXT_PUBLIC_API_BASE not set in unified-webapp service")
            return False
    else:
        print("  ⚠️  unified-webapp service not found")
    
    # Check if prompt-api service exists
    if "prompt-api:" in content:
        print("  ✅ prompt-api service found")
    else:
        print("  ⚠️  prompt-api service not found")
    
    return True

def test_orchestrator_api():
    """Check orchestratorApi.ts configuration."""
    api_file = Path(__file__).parent / "apps" / "unifiedtoolbox.webapp" / "src" / "lib" / "services" / "orchestratorApi.ts"
    
    print("\n🔌 Checking orchestratorApi.ts...")
    
    if not api_file.exists():
        print("  ❌ orchestratorApi.ts not found")
        return False
    
    content = api_file.read_text()
    
    if "validateApiConnection" in content:
        print("  ✅ validateApiConnection function exists")
    else:
        print("  ⚠️  validateApiConnection function not found")
    
    if "NEXT_PUBLIC_API_BASE" in content:
        print("  ✅ Reads NEXT_PUBLIC_API_BASE environment variable")
    else:
        print("  ❌ Does not read NEXT_PUBLIC_API_BASE")
        return False
    
    if "DEFAULT_API_BASE" in content or "localhost:8000" in content:
        print("  ✅ Has fallback to localhost:8000")
    else:
        print("  ⚠️  No fallback configuration found")
    
    return True

def test_next_config():
    """Check next.config.ts."""
    config_file = Path(__file__).parent / "apps" / "unifiedtoolbox.webapp" / "next.config.ts"
    
    print("\n⚙️  Checking next.config.ts...")
    
    if not config_file.exists():
        print("  ❌ next.config.ts not found")
        return False
    
    content = config_file.read_text()
    
    if "NEXT_PUBLIC_API_BASE" in content:
        print("  ✅ Configures NEXT_PUBLIC_API_BASE")
    else:
        print("  ⚠️  NEXT_PUBLIC_API_BASE not configured")
    
    if "rewrites" in content:
        print("  ✅ Has API rewrites configuration")
    else:
        print("  ℹ️  No API rewrites (may use direct connection)")
    
    return True

def main():
    print("=" * 60)
    print("Frontend-Backend Orchestration Connection Test")
    print("=" * 60)
    print()
    
    results = []
    
    results.append(("Webapp Environment", test_webapp_env()))
    results.append(("Docker Compose", test_docker_compose()))
    results.append(("Orchestrator API", test_orchestrator_api()))
    results.append(("Next.js Config", test_next_config()))
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {name}")
    
    all_passed = all(result for _, result in results)
    
    print("\n" + "=" * 60)
    if all_passed:
        print("✅ All configuration checks passed!")
        print("\nNext steps:")
        print("1. Start the Prompt API backend:")
        print("   cd apps/UnifiedPromptApp/services/prompt-api")
        print("   python3 app.py")
        print()
        print("2. In another terminal, start the webapp:")
        print("   cd apps/unifiedtoolbox.webapp")
        print("   npm install")
        print("   npm run dev")
        print()
        print("3. Open http://localhost:3000/orchestrator")
        print("   You should see a green 'Connected to Prompt API' banner")
        return 0
    else:
        print("❌ Some configuration checks failed")
        print("\nPlease review the errors above and fix the configuration.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
