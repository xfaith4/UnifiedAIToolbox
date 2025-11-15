#!/usr/bin/env node

/**
 * Development Server with Port Availability Checking
 * This script checks for available ports and starts a local development server
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

// MIME types for common file extensions
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
};

/**
 * Check if a port is available
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} - True if port is available
 */
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.listen(port, () => {
            server.once('close', () => {
                resolve(true);
            });
            server.close();
        });

        server.on('error', () => {
            resolve(false);
        });
    });
}

/**
 * Find the first available port from a list of preferred ports
 * @param {number[]} ports - Array of port numbers to try
 * @returns {Promise<number|null>} - First available port or null
 */
async function findAvailablePort(ports) {
    for (const port of ports) {
        const available = await isPortAvailable(port);
        if (available) {
            return port;
        }
        console.log(`Port ${port} is already in use...`);
    }
    return null;
}

/**
 * Get the content type based on file extension
 * @param {string} filePath - File path
 * @returns {string} - MIME type
 */
function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Serve static files
 * @param {http.IncomingMessage} req - Request object
 * @param {http.ServerResponse} res - Response object
 */
function serveStaticFile(req, res) {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

    // Security: Prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }

        const contentType = getContentType(filePath);

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Internal server error');
                return;
            }

            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
    });
}

/**
 * Start the development server
 */
async function startServer() {
    // Preferred ports in order of preference
    const preferredPorts = [3000, 8000, 8080, 3001, 5000, 8001, 8888, 9000];

    console.log('🔍 Checking for available ports...');

    const availablePort = await findAvailablePort(preferredPorts);

    if (!availablePort) {
        console.error('❌ No available ports found from the preferred list:', preferredPorts);
        console.log('💡 Try stopping other development servers or specify a custom port.');
        process.exit(1);
    }

    const server = http.createServer((req, res) => {
        // Add CORS headers for development
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
        serveStaticFile(req, res);
    });

    server.listen(availablePort, () => {
        console.log('✅ Development server started successfully!');
        console.log(`🌐 Local:            http://localhost:${availablePort}`);
        console.log(`🌐 Network:          http://127.0.0.1:${availablePort}`);
        console.log(`📁 Serving files from: ${__dirname}`);
        console.log('');
        console.log('📝 Available endpoints:');
        console.log(`   • Main site:      http://localhost:${availablePort}`);
        console.log(`   • Prompts data:   http://localhost:${availablePort}/prompts.json`);
        console.log('');
        console.log('Press Ctrl+C to stop the server');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Server shutting down...');
        server.close(() => {
            console.log('✅ Server stopped successfully');
            process.exit(0);
        });
    });

    // Handle server errors
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`❌ Port ${availablePort} is now in use. This shouldn't happen!`);
        } else {
            console.error('❌ Server error:', err);
        }
        process.exit(1);
    });
}

// Start the server
startServer().catch(console.error);
