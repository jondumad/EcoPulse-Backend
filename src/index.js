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

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const missionRoutes = require('./routes/missions');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// Basic Route
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the Eco-Pulse API' });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
