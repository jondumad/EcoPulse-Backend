const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const app = express();
const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
});
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Basic Route
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the Civic API' });
});

// Sample API: Get Users
app.get('/api/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Sample API: Create User
app.post('/api/users', async (req, res) => {
    const { email, name } = req.body;
    try {
        const newUser = await prisma.user.create({
            data: { email, name },
        });
        res.status(201).json(newUser);
    } catch (error) {
        res.status(400).json({ error: 'User already exists or invalid data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
