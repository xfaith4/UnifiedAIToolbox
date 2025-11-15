#!/usr/bin/env node

/**
 * Port Availability Checker
 * Utility to check which ports are available for development
 */

const net = require('net');

const DEFAULT_PORTS = [3000, 8000, 8080, 3001, 5000, 8001, 8888, 9000, 4200, 5173, 3030];

/**
 * Check if a port is available
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} - True if port is available
 */
function checkPort(port) {
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
 * Check multiple ports and display results
 * @param {number[]} ports - Array of ports to check
 */
async function checkPorts(ports) {
    console.log('🔍 Checking port availability...\n');

    const results = [];

    for (const port of ports) {
        const available = await checkPort(port);
        const status = available ? '✅ Available' : '❌ In use';
        const emoji = available ? '🟢' : '🔴';

        console.log(`${emoji} Port ${port.toString().padEnd(4)} - ${status}`);

        results.push({ port, available });
    }

    console.log('\n📊 Summary:');
    const availablePorts = results.filter(r => r.available).map(r => r.port);
    const usedPorts = results.filter(r => !r.available).map(r => r.port);

    console.log(`   Available ports: ${availablePorts.length > 0 ? availablePorts.join(', ') : 'None'}`);
    console.log(`   Used ports:      ${usedPorts.length > 0 ? usedPorts.join(', ') : 'None'}`);

    if (availablePorts.length > 0) {
        console.log(`\n💡 Recommended port: ${availablePorts[0]}`);
    } else {
        console.log('\n⚠️  No available ports found. Try stopping other applications or use different ports.');
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
let portsToCheck = DEFAULT_PORTS;

if (args.length > 0) {
    // Custom ports provided
    portsToCheck = args.map(arg => {
        const port = parseInt(arg, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            console.error(`❌ Invalid port: ${arg}`);
            process.exit(1);
        }
        return port;
    });
}

// Display usage if help requested
if (args.includes('--help') || args.includes('-h')) {
    console.log('🔍 Port Availability Checker\n');
    console.log('Usage:');
    console.log('  node check-ports.js                    # Check default ports');
    console.log('  node check-ports.js 3000 8000 9000     # Check specific ports');
    console.log('  node check-ports.js --help             # Show this help\n');
    console.log('Default ports checked:', DEFAULT_PORTS.join(', '));
    process.exit(0);
}

// Run the port checker
checkPorts(portsToCheck).catch(console.error);
