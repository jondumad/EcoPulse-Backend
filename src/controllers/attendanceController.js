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
      include: { collaborators: { select: { id: true } } }
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    const userRole = req.user.role?.name || "";
    const isSuperAdmin = userRole === 'SuperAdmin' || req.user.roleId === 1;
    const isCollaborator = mission.collaborators.some(c => c.id === coordinatorId);
    const isCreator = mission.createdBy === coordinatorId;

    if (!isCreator && !isCollaborator && !isSuperAdmin) {
      return res.status(403).json({
        error: 'Unauthorized: Only mission team can generate QR codes',
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
      include: {
        user: { select: { id: true, name: true, email: true } },
        mission: { select: { id: true, title: true } }
      }
    });

    // Notify Coordinators via Socket
    const { getIO } = require('../socket');
    try {
        const io = getIO();
        io.to('coordinator_feed').emit('live_update', {
            type: 'check_in',
            data: attendance
        });
    } catch (err) {
        console.error('Socket notification failed:', err);
    }

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
      include: {
        user: { select: { id: true, name: true, email: true } },
        mission: { select: { id: true, title: true } }
      }
    });

    // Notify Coordinators via Socket
    const { getIO } = require('../socket');
    try {
        const io = getIO();
        io.to('coordinator_feed').emit('live_update', {
            type: 'check_out',
            data: updatedAttendance
        });
    } catch (err) {
        console.error('Socket notification failed:', err);
    }

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
    const coordinatorId = req.user.id;
    const userRole = req.user.role?.name;
    const isSuperAdmin = userRole === 'SuperAdmin' || req.user.roleId === 1;

    // Coordinators can see pending verifications
    // BUT we filter out missions they created to enforce separation of duties
    const where = {
      status: 'Pending',
      checkOutTime: { not: null }, // Only verify after check-out
    };

    if (!isSuperAdmin) {
      where.mission = {
        createdBy: { not: coordinatorId }
      };
    }

    const pending = await prisma.attendance.findMany({
      where,
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
      include: { mission: { include: { collaborators: { select: { id: true } } } }, user: true },
    });

    if (!attendance) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    // Access Check
    const userRole = req.user.role?.name;
    const isSuperAdmin = userRole === 'SuperAdmin' || req.user.roleId === 1;
    const isCreator = attendance.mission.createdBy === coordinatorId;
    const isCollaborator = attendance.mission.collaborators.some(c => c.id === coordinatorId);

    // Policy Update: Only team (creator/collab) can verify.
    // Separation of Duties (old policy) removed in favor of Team Access.
    if (!isSuperAdmin && !isCreator && !isCollaborator) {
      return res.status(403).json({
        error: 'Unauthorized: Only mission team can verify attendance.'
      });
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
  const { reason } = req.body;
  const coordinatorId = req.user.id;

  if (!reason) {
    return res.status(400).json({ error: 'Manual override requires a reason.' });
  }

  try {
    const mId = parseInt(missionId);
    const uId = parseInt(userId);

    // Access Check
    const mission = await prisma.mission.findUnique({
      where: { id: mId },
      include: { collaborators: { select: { id: true } } }
    });
    if (!mission) return res.status(404).json({ error: 'Mission not found' });

    const isCollaborator = mission.collaborators.some(c => c.id === coordinatorId);
    const isAuthorized = req.user.role?.name === 'SuperAdmin' || 
                         mission.createdBy === coordinatorId || 
                         isCollaborator;

    if (!isAuthorized) return res.status(403).json({ error: 'Unauthorized' });

    // 1. Create/Update Attendance
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
        overrideReason: reason,
      },
      create: {
        userId: uId,
        missionId: mId,
        checkInTime: new Date(),
        gpsProof: 'manual_override',
        status: 'Pending',
        overrideReason: reason,
      },
    });

    // 2. Update Registration
    await prisma.registration.update({
      where: {
        userId_missionId: {
          userId: uId,
          missionId: mId,
        },
      },
      data: { status: 'CheckedIn' },
    });

    // 3. Log the override
    await prisma.manualOverrideLog.create({
      data: {
        coordinatorId,
        missionId: mId,
        userId: uId,
        actionType: 'check_in',
        reason
      }
    });

    res.json({ message: 'User manually checked in and logged' });
  } catch (error) {
    console.error('Manual check-in error:', error);
    res.status(500).json({ error: 'Manual check-in failed' });
  }
};

const manualComplete = async (req, res) => {
  const { missionId, userId } = req.params;
  const { reason } = req.body;
  const coordinatorId = req.user.id;

  if (!reason) {
    return res.status(400).json({ error: 'Manual override requires a reason.' });
  }

  try {
    const mId = parseInt(missionId);
    const uId = parseInt(userId);

    // Access Check
    const mission = await prisma.mission.findUnique({
      where: { id: mId },
      include: { collaborators: { select: { id: true } } }
    });
    if (!mission) return res.status(404).json({ error: 'Mission not found' });

    const isCollaborator = mission.collaborators.some(c => c.id === coordinatorId);
    const isAuthorized = req.user.role?.name === 'SuperAdmin' || 
                         mission.createdBy === coordinatorId || 
                         isCollaborator;

    if (!isAuthorized) return res.status(403).json({ error: 'Unauthorized' });

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
        overrideReason: reason,
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
        overrideReason: reason,
      },
    });

    // 2. Award Points (if not already awarded)
    const points = mission.pointsValue;

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
        }),
        // 3. Log the override
        prisma.manualOverrideLog.create({
          data: {
            coordinatorId,
            missionId: mId,
            userId: uId,
            actionType: 'complete',
            reason
          }
        })
      ]);
    } else {
      // If already completed, still log the override if it was called (though UI should prevent)
      await prisma.manualOverrideLog.create({
        data: {
          coordinatorId,
          missionId: mId,
          userId: uId,
          actionType: 'complete',
          reason
        }
      });
    }

    res.json({ message: 'User manually marked as completed and logged', attendance });
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
