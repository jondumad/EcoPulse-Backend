const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const register = async (req, res) => {
    const { name, email, password, roleName } = req.body;

    try {
        // Check if user exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Validate role (default to Volunteer if not provided or invalid)
        let role = await prisma.role.findUnique({ where: { name: roleName } });
        if (!role) {
            // Fallback to finding 'Volunteer', or create it if missing for safety/seeding issues
            //Ideally 'Volunteer' role should exist from seed.
            role = await prisma.role.findUnique({ where: { name: 'Volunteer' } });
            if (!role) {
                return res.status(400).json({ error: 'Invalid role specified and default role not found.' });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = await prisma.user.create({
            data: {
                name,
                email,
                passwordHash: hashedPassword,
                roleId: role.id,
                totalPoints: 0,
            },
            include: { role: true },
        });

        const token = jwt.sign({ userId: user.id, role: user.role.name }, process.env.JWT_SECRET || 'secret_key', {
            expiresIn: '24h',
        });

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role.name,
                totalPoints: user.totalPoints,
            },
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { email },
            include: { role: true },
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(403).json({ error: 'Your account has been suspended. Please contact the administrator.' });
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id, role: user.role.name }, process.env.JWT_SECRET || 'secret_key', {
            expiresIn: '24h',
        });

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role.name,
                totalPoints: user.totalPoints,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const getMe = async (req, res) => {
    // req.user is populated by authenticateToken middleware
    const user = req.user;
    res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.name,
        totalPoints: user.totalPoints,
    });
};

module.exports = {
    register,
    login,
    getMe,
};
