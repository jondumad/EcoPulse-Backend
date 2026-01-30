const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { validateGeofence } = require('../utils/geofence');
const { generateQRToken, verifyQRToken } = require('../utils/qrGenerator');

const validateLocation = async (req, res) => {
  const { missionId, userGps } = req.body;

  try {
    const mission = await prisma.mission.findUnique({
      where: { id: parseInt(missionId) },
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    const validation = validateGeofence(userGps, mission.locationGps);
    res.json(validation);
  } catch (error) {
    console.error('Validate location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getQRCode = async (req, res) => {
  const { id } = req.params;
  const coordinatorId = req.user.id;

  try {
    const mission = await prisma.mission.findUnique({
      where: { id: parseInt(id) },
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    // Check if the user is the creator or an admin (if we had admin roles)
    // For now, any Coordinator can probably generate QR if they are associated,
    // but the requirement says "Coordinator only".
    const userRole = req.user.role?.name || "";
    const isCoordinator = userRole === 'Coordinator' || req.user.roleId === 2;
    const isSuperAdmin = userRole === 'SuperAdmin' || req.user.roleId === 1;

    console.log(`[QR Check] User: ${req.user.email}, RoleName: "${userRole}", RoleId: ${req.user.roleId}, isCoord: ${isCoordinator}, isSA: ${isSuperAdmin}`);

    if (!isCoordinator && !isSuperAdmin) {
      return res.status(403).json({ 
        error: 'Only coordinators can generate QR codes',
        debug: { userRole, roleId: req.user.roleId }
      });
    }

    const token = generateQRToken(mission.id, coordinatorId);
    res.json({ qrToken: token, expiresIn: '5m' });
  } catch (error) {
    console.error('Get QR code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const checkIn = async (req, res) => {
  const { missionId, qrToken, userGps } = req.body;
  const userId = req.user.id;

  try {
    // 1. Validate QR Token
    let decoded;
    try {
      decoded = verifyQRToken(qrToken);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    if (decoded.missionId !== parseInt(missionId)) {
      return res.status(400).json({ error: 'QR code is for a different mission' });
    }

    // 2. Validate Geofence
    const mission = await prisma.mission.findUnique({
      where: { id: parseInt(missionId) },
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    const validation = validateGeofence(userGps, mission.locationGps);
    if (!validation.isInRange) {
      return res.status(400).json({
        error: `You are too far from the mission location (${validation.distance}m away)`,
      });
    }

    // 3. Create Attendance Record
    const attendance = await prisma.attendance.upsert({
      where: {
        userId_missionId: {
          userId,
          missionId: parseInt(missionId),
        },
      },
      update: {
        checkInTime: new Date(),
        gpsProof: userGps,
        status: 'Pending',
      },
      create: {
        userId,
        missionId: parseInt(missionId),
        checkInTime: new Date(),
        gpsProof: userGps,
        status: 'Pending',
      },
    });

    // 4. Update Registration Status
    await prisma.registration.update({
      where: {
        userId_missionId: {
          userId,
          missionId: parseInt(missionId),
        },
      },
      data: { status: 'CheckedIn' },
    });

    res.status(201).json({
      message: 'Checked in successfully',
      attendance,
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const checkOut = async (req, res) => {
  const { missionId } = req.body;
  const userId = req.user.id;

  try {
    const attendance = await prisma.attendance.findUnique({
      where: {
        userId_missionId: {
          userId,
          missionId: parseInt(missionId),
        },
      },
    });

    if (!attendance || !attendance.checkInTime) {
      return res.status(400).json({ error: 'No active check-in found for this mission' });
    }

    if (attendance.checkOutTime) {
      return res.status(400).json({ error: 'Already checked out' });
    }

    const checkOutTime = new Date();
    const durationMs = checkOutTime - new Date(attendance.checkInTime);
    const totalHours = durationMs / (1000 * 60 * 60);

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOutTime,
        totalHours: parseFloat(totalHours.toFixed(2)),
      },
    });

    res.json({
      message: 'Checked out successfully',
      attendance: updatedAttendance,
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getCurrentAttendance = async (req, res) => {
  const userId = req.user.id;

  try {
    const currentAttendance = await prisma.attendance.findFirst({
      where: {
        userId,
        checkOutTime: null,
      },
      include: {
        mission: true,
      },
    });

    res.json(currentAttendance);
  } catch (error) {
    console.error('Get current attendance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getPendingVerifications = async (req, res) => {
  try {
    // Coordinators can see pending verifications
    // In a real app, maybe only for missions they created or are assigned to.
    const pending = await prisma.attendance.findMany({
      where: {
        status: 'Pending',
        checkOutTime: { not: null }, // Only verify after check-out
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        mission: {
          select: { id: true, title: true, pointsValue: true },
        },
      },
    });

    res.json(pending);
  } catch (error) {
    console.error('Get pending verifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const verifyAttendance = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'Verified' or 'Rejected'
  const coordinatorId = req.user.id;

  if (!['Verified', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const attendance = await prisma.attendance.findUnique({
      where: { id: parseInt(id) },
      include: { mission: true, user: true },
    });

    if (!attendance) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    const updatedAttendance = await prisma.attendance.update({
      where: { id: parseInt(id) },
      data: {
        status,
        verifiedBy: coordinatorId,
        verifiedAt: new Date(),
      },
    });

    // If verified, award points and update registration status
    if (status === 'Verified') {
      const points = attendance.mission.pointsValue;

      await prisma.$transaction([
        prisma.user.update({
          where: { id: attendance.userId },
          data: {
            totalPoints: { increment: points },
          },
        }),
        prisma.registration.update({
          where: {
            userId_missionId: {
              userId: attendance.userId,
              missionId: attendance.missionId
            }
          },
          data: { status: 'Completed' }
        }),
        prisma.pointTransaction.create({
          data: {
            userId: attendance.userId,
            missionId: attendance.missionId,
            amount: points,
            reason: 'mission_completed',
            description: `Points awarded for completing mission: ${attendance.mission.title}`,
          },
        }),
        prisma.notification.create({
            data: {
                userId: attendance.userId,
                title: 'Points Awarded!',
                message: `You earned ${points} points for your participation in "${attendance.mission.title}".`,
                type: 'points_awarded',
                relatedId: attendance.missionId
            }
        })
      ]);
    }

    res.json({
      message: `Attendance ${status.toLowerCase()} successfully`,
      attendance: updatedAttendance,
    });
  } catch (error) {
    console.error('Verify attendance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  validateLocation,
  getQRCode,
  checkIn,
  checkOut,
  getCurrentAttendance,
  getPendingVerifications,
  verifyAttendance,
};
