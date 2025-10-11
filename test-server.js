#!/usr/bin/env node

/**
 * Simple test script for WFLY Music Server
 * Tests basic functionality without requiring MongoDB
 */

const http = require('http');

const SERVER_URL = 'http://localhost:7412';

function makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 7412,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const jsonBody = body ? JSON.parse(body) : {};
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: jsonBody
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body
                    });
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function runTests() {
    console.log('🧪 Testing WFLY Music Server...\n');

    try {
        // Test 1: Health check
        console.log('1. Testing health endpoint...');
        const healthResponse = await makeRequest('/healthz');
        if (healthResponse.statusCode === 200) {
            console.log('   ✅ Health check passed');
        } else {
            console.log('   ❌ Health check failed:', healthResponse.statusCode);
        }

        // Test 2: Home endpoint (should work without auth)
        console.log('\n2. Testing home endpoint...');
        const homeResponse = await makeRequest('/api/home');
        if (homeResponse.statusCode === 200) {
            console.log('   ✅ Home endpoint accessible');
        } else {
            console.log('   ❌ Home endpoint failed:', homeResponse.statusCode);
        }

        // Test 3: Search endpoint
        console.log('\n3. Testing search endpoint...');
        const searchResponse = await makeRequest('/api/search?q=test');
        if (searchResponse.statusCode === 200) {
            console.log('   ✅ Search endpoint accessible');
        } else {
            console.log('   ❌ Search endpoint failed:', searchResponse.statusCode);
        }

        // Test 4: Artist login endpoint (should return validation error)
        console.log('\n4. Testing artist login validation...');
        const artistLoginResponse = await makeRequest('/api/artists/auth/login', 'POST', {
            username: 'test',
            password: 'test'
        });
        if (artistLoginResponse.statusCode === 401) {
            console.log('   ✅ Artist login validation working (expected 401)');
        } else {
            console.log('   ⚠️  Artist login response:', artistLoginResponse.statusCode);
        }

        // Test 5: User login endpoint (should return validation error)
        console.log('\n5. Testing user login validation...');
        const userLoginResponse = await makeRequest('/api/auth/login', 'POST', {
            email: 'invalid-email',
            password: 'test'
        });
        if (userLoginResponse.statusCode === 400) {
            console.log('   ✅ User login validation working (expected 400)');
        } else {
            console.log('   ⚠️  User login response:', userLoginResponse.statusCode);
        }

        console.log('\n🎉 Server tests completed!');
        console.log('\nNote: Some tests may fail without MongoDB running.');
        console.log('To run the full server, start MongoDB and run: node server.js');

    } catch (error) {
        console.log('\n❌ Test failed:', error.message);
        console.log('Make sure the server is running: node server.js');
    }
}

// Check if server is running
makeRequest('/healthz')
    .then(() => {
        runTests();
    })
    .catch(() => {
        console.log('❌ Server is not running. Please start it with: node server.js');
        process.exit(1);
    });