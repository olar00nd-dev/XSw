#!/usr/bin/env node

/**
 * Simplified WFLY Music Server for testing
 * Runs without MongoDB dependency
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');

const app = express();

// Basic middleware
app.use(helmet());
app.use(cors({
    origin: true, // Allow all origins for testing
    credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Rate limiting
const limiter = rateLimit({ windowMs: 60 * 1000, limit: 300 });
app.use('/api/', limiter);

// Schemas
const AuthLoginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

const ArtistLoginSchema = z.object({
    username: z.string(),
    password: z.string(),
});

// Routes
app.get('/healthz', (req, res) => {
    res.json({ ok: true, now: Date.now(), message: 'WFLY Music Server is running!' });
});

app.get('/api/home', (req, res) => {
    res.json({
        sections: [
            {
                id: 'new',
                title: 'New Releases',
                items: []
            },
            {
                id: 'trending',
                title: 'Trending',
                items: []
            }
        ]
    });
});

app.get('/api/search', (req, res) => {
    const query = req.query.q || '';
    res.json({
        tracks: [],
        artists: [],
        albums: []
    });
});

app.post('/api/auth/login', (req, res) => {
    try {
        const body = AuthLoginSchema.parse(req.body);
        res.status(401).json({ error: 'Authentication not implemented in test mode' });
    } catch (e) {
        if (e instanceof z.ZodError) {
            const emailError = e.issues.find(issue => issue.path.includes('email'));
            if (emailError) {
                return res.status(400).json({ 
                    error: 'Please provide a valid email address for user login. Use /api/artists/auth/login for artist login with username.' 
                });
            }
            return res.status(400).json({ error: e.issues });
        }
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/artists/auth/login', (req, res) => {
    try {
        const body = ArtistLoginSchema.parse(req.body);
        res.status(401).json({ error: 'Authentication not implemented in test mode' });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ error: e.issues });
        }
        res.status(500).json({ error: 'Login failed' });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = process.env.PORT || 7412;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`🚀 WFLY Music Test Server running on http://${HOST}:${PORT}`);
    console.log(`📊 Health check: http://${HOST}:${PORT}/healthz`);
    console.log(`🔍 Search API: http://${HOST}:${PORT}/api/search?q=test`);
    console.log(`\n✨ Server is ready for testing!`);
});