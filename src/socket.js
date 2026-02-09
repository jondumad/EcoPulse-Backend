const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let io;
const onlineUsers = new Map(); // Room ID -> Set of User Objects

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*", // Adjust as needed for Flutter
            methods: ["GET", "POST"]
        }
    });

    // Authentication Middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers.token;
        console.log(`Socket: Auth attempt. Token present: ${!!token}`);

        if (!token) return next(new Error('Authentication error: Token missing'));

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded; // { id, role, ... }
            next();
        } catch (err) {
            next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.user.id} (${socket.id})`);

        socket.on('join_mission', async ({ missionId }) => {
            const roomName = `mission_${missionId}`;
            socket.join(roomName);

            // Add user to presence list
            if (!onlineUsers.has(roomName)) {
                onlineUsers.set(roomName, new Set());
            }

            // Get user info from DB for presence
            const user = await prisma.user.findUnique({
                where: { id: socket.user.id },
                select: { id: true, name: true, role: true }
            });

            onlineUsers.get(roomName).add(JSON.stringify(user));

            // Broadcast updated presence list
            io.to(roomName).emit('presence_update', Array.from(onlineUsers.get(roomName)).map(u => JSON.parse(u)));

            console.log(`User ${socket.user.id} joined room ${roomName}`);
        });

        socket.on('leave_mission', ({ missionId }) => {
            const roomName = `mission_${missionId}`;
            socket.leave(roomName);

            if (onlineUsers.has(roomName)) {
                // Find and remove user
                const users = onlineUsers.get(roomName);
                for (let u of users) {
                    if (JSON.parse(u).id === socket.user.id) {
                        users.delete(u);
                        break;
                    }
                }
                io.to(roomName).emit('presence_update', Array.from(users).map(u => JSON.parse(u)));
            }
        });

        socket.on('send_comment', async ({ missionId, content }) => {
            console.log(`Socket: send_comment missionId=${missionId} from user=${socket.user.id}`);
            try {
                const comment = await prisma.missionComment.create({
                    data: {
                        missionId: parseInt(missionId),
                        userId: socket.user.id,
                        content
                    },
                    include: {
                        user: { select: { name: true, id: true } }
                    }
                });
                console.log(`Socket: Broadcasting new_comment to room mission_${missionId}`);
                io.to(`mission_${missionId}`).emit('new_comment', comment);
            } catch (err) {
                console.error('Error saving comment:', err);
            }
        });

        socket.on('toggle_pin', async ({ missionId, commentId, isPinned }) => {
            console.log(`Socket: toggle_pin commentId=${commentId} isPinned=${isPinned}`);
            try {
                const updatedComment = await prisma.missionComment.update({
                    where: { id: commentId },
                    data: { isPinned },
                    include: { user: { select: { name: true, id: true } } }
                });

                io.to(`mission_${missionId}`).emit('comment_updated', updatedComment);
            } catch (err) {
                console.error('Error toggling pin:', err);
            }
        });

        socket.on('add_checklist_item', async ({ missionId, content }) => {
            console.log(`Socket: add_checklist_item missionId=${missionId}`);
            try {
                const item = await prisma.missionChecklistItem.create({
                    data: {
                        missionId: parseInt(missionId),
                        content
                    }
                });
                console.log(`Socket: Broadcasting checklist_item_added to room mission_${missionId}`);
                io.to(`mission_${missionId}`).emit('checklist_item_added', item);
            } catch (err) {
                console.error('Error adding checklist item:', err);
            }
        });

        socket.on('toggle_checklist_item', async ({ missionId, itemId, isCompleted }) => {
            console.log(`Socket: toggle_checklist_item itemId=${itemId} isCompleted=${isCompleted}`);
            try {
                const item = await prisma.missionChecklistItem.update({
                    where: { id: itemId },
                    data: {
                        isCompleted,
                        completedBy: isCompleted ? socket.user.id : null
                    }
                });

                io.to(`mission_${missionId}`).emit('checklist_item_updated', item);
            } catch (err) {
                console.error('Error toggling checklist item:', err);
            }
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user.id}`);
            // Cleanup presence in all rooms
            onlineUsers.forEach((users, roomName) => {
                for (let u of users) {
                    if (JSON.parse(u).id === socket.user.id) {
                        users.delete(u);
                        io.to(roomName).emit('presence_update', Array.from(users).map(u => JSON.parse(u)));
                    }
                }
            });
        });
    });

    return io;
};

const getIO = () => {
    if (!io) throw new Error('Socket.io not initialized');
    return io;
};

module.exports = { initSocket, getIO };
