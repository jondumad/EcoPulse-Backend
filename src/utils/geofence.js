/**
 * Calculates the distance between two points on the Earth's surface using the Haversine formula.
 * @param {number} lat1 - Latitude of point 1 in degrees
 * @param {number} lon1 - Longitude of point 1 in degrees
 * @param {number} lat2 - Latitude of point 2 in degrees
 * @param {number} lon2 - Longitude of point 2 in degrees
 * @returns {number} - Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Validates if a user is within a certain distance from a mission location.
 * @param {string} userGps - User's GPS coordinates as "lat,lng"
 * @param {string} missionGps - Mission's GPS coordinates as "lat,lng"
 * @param {number} radiusMeters - Maximum allowed distance in meters (default 100m)
 * @returns {object} - { isInRange: boolean, distance: number }
 */
function validateGeofence(userGps, missionGps, radiusMeters = 100) {
  const [lat1, lon1] = userGps.split(',').map(Number);
  const [lat2, lon2] = missionGps.split(',').map(Number);

  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
    throw new Error('Invalid GPS coordinates');
  }

  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  return {
    isInRange: distance <= radiusMeters,
    distance: Math.round(distance),
  };
}

module.exports = {
  calculateDistance,
  validateGeofence,
};
