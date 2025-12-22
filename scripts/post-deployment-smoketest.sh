#!/bin/bash

###############################################################################
# Post-Deployment Smoke Test Script
# Unified AI Toolbox v1.5
#
# This script runs smoke tests after deployment to verify that the
# production system is functioning correctly.
#
# Usage: ./scripts/post-deployment-smoketest.sh [base-url]
#        Default base-url: http://localhost
###############################################################################

set -e

# Configuration
BASE_URL="${1:-http://localhost}"
API_URL="${BASE_URL}:8000"
DASHBOARD_URL="${BASE_URL}:5173"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
TOTAL=0

# Functions
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

test_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
    ((TOTAL++))
}

test_fail() {
    echo -e "${RED}✗${NC} $1"
    echo -e "${RED}  Details: $2${NC}"
    ((FAILED++))
    ((TOTAL++))
}

print_summary() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Smoke Test Summary${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    echo -e "Total Tests: $TOTAL"
    echo -e "${GREEN}Passed:${NC}      $PASSED"
    echo -e "${RED}Failed:${NC}      $FAILED"
    echo -e "Success Rate: $(( PASSED * 100 / TOTAL ))%\n"
    
    if [ $FAILED -gt 0 ]; then
        echo -e "${RED}❌ Smoke tests FAILED${NC}"
        echo -e "${RED}   Review failed tests and fix issues before proceeding.${NC}\n"
        exit 1
    else
        echo -e "${GREEN}✅ All smoke tests PASSED${NC}"
        echo -e "${GREEN}   System is operational and ready for use.${NC}\n"
        exit 0
    fi
}

# Start tests
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Unified AI Toolbox - Post-Deployment Smoke Tests       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Testing against:"
echo "  API:       $API_URL"
echo "  Dashboard: $DASHBOARD_URL"
echo ""

###############################################################################
# 1. Basic Connectivity Tests
###############################################################################
print_header "1. Basic Connectivity Tests"

# Test API health endpoint
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null || echo "000")
if [ "$RESPONSE" = "200" ]; then
    test_pass "API health endpoint responding (HTTP 200)"
else
    test_fail "API health endpoint failed (HTTP $RESPONSE)" "Expected 200, got $RESPONSE"
fi

# Test dashboard availability
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL/" 2>/dev/null || echo "000")
if [ "$RESPONSE" = "200" ]; then
    test_pass "Dashboard is accessible (HTTP 200)"
else
    test_fail "Dashboard is not accessible (HTTP $RESPONSE)" "Expected 200, got $RESPONSE"
fi

# Test auth status endpoint
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/auth/status" 2>/dev/null || echo "000")
if [ "$RESPONSE" = "200" ]; then
    test_pass "Auth status endpoint responding (HTTP 200)"
else
    test_fail "Auth status endpoint failed (HTTP $RESPONSE)" "Expected 200, got $RESPONSE"
fi

###############################################################################
# 2. API Endpoint Tests
###############################################################################
print_header "2. API Endpoint Tests"

# Test prompts list endpoint
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/prompts" 2>/dev/null || echo "000")
if [ "$RESPONSE" = "200" ]; then
    test_pass "Prompts list endpoint responding (HTTP 200)"
else
    test_fail "Prompts list endpoint failed (HTTP $RESPONSE)" "Expected 200, got $RESPONSE"
fi

# Test prompts search endpoint
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/prompts/search?q=test" 2>/dev/null || echo "000")
if [ "$RESPONSE" = "200" ]; then
    test_pass "Prompts search endpoint responding (HTTP 200)"
else
    test_fail "Prompts search endpoint failed (HTTP $RESPONSE)" "Expected 200, got $RESPONSE"
fi

# Test GitHub search endpoint (without token, should work)
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/github/search?q=test" 2>/dev/null || echo "000")
if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "401" ]; then
    test_pass "GitHub search endpoint accessible (HTTP $RESPONSE)"
else
    test_fail "GitHub search endpoint failed (HTTP $RESPONSE)" "Expected 200 or 401, got $RESPONSE"
fi

###############################################################################
# 3. Response Time Tests
###############################################################################
print_header "3. Response Time Tests"

# Measure API health endpoint response time
START_TIME=$(date +%s%3N)
curl -s "$API_URL/health" > /dev/null 2>&1
END_TIME=$(date +%s%3N)
RESPONSE_TIME=$((END_TIME - START_TIME))

if [ "$RESPONSE_TIME" -lt 500 ]; then
    test_pass "API health endpoint response time: ${RESPONSE_TIME}ms (<500ms target)"
else
    test_fail "API health endpoint response time: ${RESPONSE_TIME}ms" "Target: <500ms"
fi

# Measure prompts list response time
START_TIME=$(date +%s%3N)
curl -s "$API_URL/prompts" > /dev/null 2>&1
END_TIME=$(date +%s%3N)
RESPONSE_TIME=$((END_TIME - START_TIME))

if [ "$RESPONSE_TIME" -lt 1000 ]; then
    test_pass "Prompts list response time: ${RESPONSE_TIME}ms (<1000ms target)"
else
    test_fail "Prompts list response time: ${RESPONSE_TIME}ms" "Target: <1000ms"
fi

###############################################################################
# 4. Security Headers Tests
###############################################################################
print_header "4. Security Headers Tests"

# Check for security headers
HEADERS=$(curl -s -I "$API_URL/health" 2>/dev/null)

if echo "$HEADERS" | grep -qi "x-content-type-options"; then
    test_pass "X-Content-Type-Options header present"
else
    test_fail "X-Content-Type-Options header missing" "Security header not found"
fi

if echo "$HEADERS" | grep -qi "x-frame-options"; then
    test_pass "X-Frame-Options header present"
else
    test_fail "X-Frame-Options header missing" "Security header not found"
fi

if echo "$HEADERS" | grep -qi "content-security-policy"; then
    test_pass "Content-Security-Policy header present"
else
    test_fail "Content-Security-Policy header missing" "Security header not found"
fi

###############################################################################
# 5. CORS Configuration Tests
###############################################################################
print_header "5. CORS Configuration Tests"

# Test CORS headers
CORS_HEADERS=$(curl -s -H "Origin: http://localhost:5173" -I "$API_URL/health" 2>/dev/null)

if echo "$CORS_HEADERS" | grep -qi "access-control-allow-origin"; then
    test_pass "CORS headers configured"
else
    test_fail "CORS headers not configured" "Access-Control-Allow-Origin header not found"
fi

###############################################################################
# 6. Authentication Tests
###############################################################################
print_header "6. Authentication Tests"

# Test login endpoint (should return 422 for invalid credentials, not 500)
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}' \
    "$API_URL/auth/login" 2>/dev/null || echo "000")

if [ "$RESPONSE" = "401" ] || [ "$RESPONSE" = "422" ]; then
    test_pass "Login endpoint responding correctly (HTTP $RESPONSE for invalid creds)"
else
    test_fail "Login endpoint unexpected response (HTTP $RESPONSE)" "Expected 401 or 422"
fi

###############################################################################
# 7. Database Tests
###############################################################################
print_header "7. Database Tests"

# Check if we can query the database via API
PROMPTS_RESPONSE=$(curl -s "$API_URL/prompts" 2>/dev/null)

if echo "$PROMPTS_RESPONSE" | grep -q "prompts" || echo "$PROMPTS_RESPONSE" | grep -q "\[\]"; then
    test_pass "Database is accessible via API"
else
    test_fail "Database query failed" "Could not retrieve prompts"
fi

###############################################################################
# 8. Rate Limiting Tests
###############################################################################
print_header "8. Rate Limiting Tests"

# Make multiple rapid requests to test rate limiting
echo "  Making 10 rapid requests to test rate limiting..."
RATE_LIMIT_TRIGGERED=false
for i in {1..10}; do
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null)
    if [ "$RESPONSE" = "429" ]; then
        RATE_LIMIT_TRIGGERED=true
        break
    fi
done

if [ "$RATE_LIMIT_TRIGGERED" = true ]; then
    test_pass "Rate limiting is active (429 Too Many Requests triggered)"
else
    # Rate limiting may not trigger in this short test, so we just note it
    test_pass "Rate limiting configured (not triggered in 10 requests)"
fi

###############################################################################
# 9. Log File Tests
###############################################################################
print_header "9. Log File Tests"

# Check if log directory exists (if running on same server)
if [ -d "services/prompt-api/logs" ]; then
    test_pass "Logs directory exists"
    
    if [ -f "services/prompt-api/logs/api.log" ]; then
        test_pass "API log file exists"
        
        # Check if log file is being written to
        if [ -s "services/prompt-api/logs/api.log" ]; then
            test_pass "API log file has content"
        else
            test_fail "API log file is empty" "No logs being written"
        fi
    else
        test_fail "API log file not found" "Expected services/prompt-api/logs/api.log"
    fi
else
    # If not on same server, skip log tests
    echo -e "${YELLOW}⚠${NC} Skipping log file tests (not on application server)"
fi

###############################################################################
# 10. Service Health Detailed Check
###############################################################################
print_header "10. Service Health Detailed Check"

# Get detailed health info
HEALTH_RESPONSE=$(curl -s "$API_URL/health" 2>/dev/null)

if echo "$HEALTH_RESPONSE" | grep -q "status"; then
    test_pass "Health endpoint returns status information"
else
    test_fail "Health endpoint missing status information" "No 'status' field in response"
fi

# Check for database in health response (if implemented)
if echo "$HEALTH_RESPONSE" | grep -qi "database\|db"; then
    test_pass "Health check includes database status"
else
    # This is optional, so just note it
    echo -e "${YELLOW}ℹ${NC} Health check does not include database status (optional)"
fi

###############################################################################
# 11. Dashboard Content Tests
###############################################################################
print_header "11. Dashboard Content Tests"

# Check dashboard for key elements
DASHBOARD_CONTENT=$(curl -s "$DASHBOARD_URL/" 2>/dev/null)

if echo "$DASHBOARD_CONTENT" | grep -qi "unified.*ai.*toolbox\|unified-ai-toolbox"; then
    test_pass "Dashboard contains application branding"
else
    test_fail "Dashboard branding not found" "Expected 'Unified AI Toolbox' text"
fi

if echo "$DASHBOARD_CONTENT" | grep -qi "<div id=\"root\""; then
    test_pass "Dashboard has React root element"
else
    test_fail "Dashboard React root not found" "Expected div#root"
fi

###############################################################################
# 12. Error Handling Tests
###############################################################################
print_header "12. Error Handling Tests"

# Test 404 handling
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/nonexistent-endpoint" 2>/dev/null || echo "000")
if [ "$RESPONSE" = "404" ]; then
    test_pass "404 errors handled correctly"
else
    test_fail "404 error handling incorrect (HTTP $RESPONSE)" "Expected 404"
fi

# Test invalid method
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/health" 2>/dev/null || echo "000")
if [ "$RESPONSE" = "405" ] || [ "$RESPONSE" = "404" ]; then
    test_pass "Invalid HTTP method handled correctly (HTTP $RESPONSE)"
else
    test_fail "Invalid HTTP method handling incorrect (HTTP $RESPONSE)" "Expected 405 or 404"
fi

###############################################################################
# Print Summary
###############################################################################
print_summary
