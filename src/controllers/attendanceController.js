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

    // 3. Validate Time Window
    const now = new Date();
    const startTime = new Date(mission.startTime);
    const endTime = new Date(mission.endTime);
    const thirtyMinutesBefore = new Date(startTime.getTime() - 30 * 60000);

    if (now < thirtyMinutesBefore) {
      return res.status(400).json({
        error: `Check-in allows only 30 mins before start. Please wait until ${thirtyMinutesBefore.toLocaleTimeString()}`
      });
    }

    if (now > endTime) {
      return res.status(400).json({ error: 'This mission has already ended.' });
    }

    // 4. Check for Double Booking (Already checked in elsewhere?)
    const existingActiveAttendance = await prisma.attendance.findFirst({
      where: {
        userId,
        checkOutTime: null,
        missionId: { not: parseInt(missionId) } // Not this mission
      }
    });

    if (existingActiveAttendance) {
      return res.status(400).json({ error: 'You are already checked in to another mission!' });
    }

    // 5. Create Attendance Record
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

const getRecentActivity = async (req, res) => {
  try {
    const activity = await prisma.attendance.findMany({
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: { name: true, email: true },
        },
        mission: {
          select: { title: true },
        },
      },
    });
    res.json(activity);
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Manual Management by Coordinator
const manualCheckIn = async (req, res) => {
  const { missionId, userId } = req.params;
  const coordinatorId = req.user.id; // User performing the action

  try {
    const mId = parseInt(missionId);
    const uId = parseInt(userId);

    // Create/Update Attendance
    await prisma.attendance.upsert({
      where: {
        userId_missionId: {
          userId: uId,
          missionId: mId,
        },
      },
      update: {
        checkInTime: new Date(),
        gpsProof: 'manual_override',
        status: 'Pending',
      },
      create: {
        userId: uId,
        missionId: mId,
        checkInTime: new Date(),
        gpsProof: 'manual_override',
        status: 'Pending',
      },
    });

    // Update Registration
    await prisma.registration.update({
      where: {
        userId_missionId: {
          userId: uId,
          missionId: mId,
        },
      },
      data: { status: 'CheckedIn' },
    });

    res.json({ message: 'User manually checked in' });
  } catch (error) {
    console.error('Manual check-in error:', error);
    res.status(500).json({ error: 'Manual check-in failed' });
  }
};

const manualComplete = async (req, res) => {
  const { missionId, userId } = req.params;
  const coordinatorId = req.user.id;

  try {
    const mId = parseInt(missionId);
    const uId = parseInt(userId);

    // 1. Ensure Attendance exists and is verified
    const attendance = await prisma.attendance.upsert({
      where: {
        userId_missionId: {
          userId: uId,
          missionId: mId,
        },
      },
      update: {
        checkOutTime: new Date(), // Set checkout if needed
        status: 'Verified',
        verifiedBy: coordinatorId,
        verifiedAt: new Date(),
      },
      create: {
        userId: uId,
        missionId: mId,
        checkInTime: new Date(), // Assume they were there
        checkOutTime: new Date(),
        gpsProof: 'manual_override',
        status: 'Verified',
        verifiedBy: coordinatorId,
        verifiedAt: new Date(),
      },
    });

    // 2. Award Points (if not already awarded)
    // Check if transaction exists to avoid double dip, though Transaction usually unique?
    // Let's rely on logic similar to verifyAttendance
    const mission = await prisma.mission.findUnique({ where: { id: mId } });
    const points = mission.pointsValue;

    // We need to be careful not to award points twice if they were already 'Completed'?
    // The UI should prevent calling this on 'Completed' users, but backend safety is good.
    // However, for simplicity/override, we might assume the Coordinator knows what they are doing.
    // Let's wrap in transaction and check existing reg status?

    // Simplification: Upsert logic is safe-ish. Points logic:
    // If registration was NOT completed, award points.
    const registration = await prisma.registration.findUnique({
      where: { userId_missionId: { userId: uId, missionId: mId } }
    });

    if (registration.status !== 'Completed') {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: uId },
          data: { totalPoints: { increment: points } },
        }),
        prisma.registration.update({
          where: { userId_missionId: { userId: uId, missionId: mId } },
          data: { status: 'Completed' }
        }),
        prisma.pointTransaction.create({
          data: {
            userId: uId,
            missionId: mId,
            amount: points,
            reason: 'mission_completed_manual',
            description: `Points awarded manually for mission: ${mission.title}`,
          },
        }),
        prisma.notification.create({
          data: {
            userId: uId,
            title: 'Mission Completed!',
            message: `Your participation in "${mission.title}" has been verified by the coordinator. You earned ${points} points.`,
            type: 'points_awarded',
            relatedId: mId
          }
        })
      ]);
    }

    res.json({ message: 'User manually marked as completed', attendance });
  } catch (error) {
    console.error('Manual completion error:', error);
    res.status(500).json({ error: 'Manual completion failed' });
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
  getRecentActivity,
  manualCheckIn,
  manualComplete
};
