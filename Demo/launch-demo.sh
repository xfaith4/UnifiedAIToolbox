#!/bin/bash
# Launch the Unified AI Toolbox Animated Demo
# This script starts a simple HTTP server and opens the demo in your browser

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_FILE="demo-animated.html"
PORT=8765

echo "🚀 Launching Unified AI Toolbox Animated Demo..."
echo ""

# Check if the demo file exists
if [ ! -f "$SCRIPT_DIR/$DEMO_FILE" ]; then
    echo "❌ Error: $DEMO_FILE not found in $SCRIPT_DIR"
    exit 1
fi

echo "✓ Demo file found"

# Check if port is already in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port $PORT is already in use"
    echo "   Attempting to open demo in existing server..."
    
    # Try to open in browser
    if command -v xdg-open > /dev/null 2>&1; then
        xdg-open "http://localhost:$PORT/$DEMO_FILE"
    elif command -v open > /dev/null 2>&1; then
        open "http://localhost:$PORT/$DEMO_FILE"
    else
        echo "   Please open http://localhost:$PORT/$DEMO_FILE in your browser"
    fi
    
    exit 0
fi

# Start HTTP server
echo "🌐 Starting HTTP server on port $PORT..."

if command -v python3 > /dev/null 2>&1; then
    echo "   Using Python 3 HTTP server"
    cd "$SCRIPT_DIR"
    python3 -m http.server $PORT --bind 127.0.0.1 > /dev/null 2>&1 &
    SERVER_PID=$!
elif command -v python > /dev/null 2>&1; then
    echo "   Using Python 2 HTTP server"
    cd "$SCRIPT_DIR"
    python -m SimpleHTTPServer $PORT > /dev/null 2>&1 &
    SERVER_PID=$!
else
    echo "❌ Error: Python not found. Please install Python or use another HTTP server."
    exit 1
fi

echo "✓ Server started (PID: $SERVER_PID)"
echo ""

# Wait for server to start
sleep 2

# Open in browser
DEMO_URL="http://localhost:$PORT/$DEMO_FILE"
echo "🎬 Opening demo at $DEMO_URL"
echo ""

if command -v xdg-open > /dev/null 2>&1; then
    xdg-open "$DEMO_URL" > /dev/null 2>&1 || true
elif command -v open > /dev/null 2>&1; then
    open "$DEMO_URL" || true
elif command -v start > /dev/null 2>&1; then
    start "$DEMO_URL" || true
else
    echo "⚠️  Could not automatically open browser"
    echo "   Please open $DEMO_URL manually"
fi

echo "✨ Demo is now running!"
echo ""
echo "📖 To view the demo, navigate to: $DEMO_URL"
echo "🛑 To stop the server, press Ctrl+C or run: kill $SERVER_PID"
echo ""

# Keep script running to maintain server
trap "echo ''; echo '🛑 Stopping server...'; kill $SERVER_PID 2>/dev/null; echo '✓ Server stopped'; exit 0" INT TERM

wait $SERVER_PID
