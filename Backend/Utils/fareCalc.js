// Backend/utils/fareCalc.js

/**
 * Fare calculation for all transport modes.
 * Future-proof: notun mode add korle ekhane ekta case add korle hobe.
 */

// Metro fare slabs (Kolkata Metro official)
const METRO_SLABS = [
    { maxKm: 2,  fare: 5  },
    { maxKm: 5,  fare: 10 },
    { maxKm: 10, fare: 15 },
    { maxKm: 17, fare: 20 },
    { maxKm: 25, fare: 25 },
    { maxKm: 99, fare: 30 },
  ];
  
  // Suburban rail fare slabs (approx WB Rail)
  const RAIL_SLABS = [
    { maxKm: 5,  fare: 5  },
    { maxKm: 10, fare: 10 },
    { maxKm: 20, fare: 15 },
    { maxKm: 35, fare: 20 },
    { maxKm: 50, fare: 30 },
    { maxKm: 99, fare: 40 },
  ];
  
  function slabFare(slabs, distanceKm) {
    for (const slab of slabs) {
      if (distanceKm <= slab.maxKm) return slab.fare;
    }
    return slabs[slabs.length - 1].fare;
  }
  
  /**
   * Calculate fare based on mode and distance.
   * @param {string} mode - "Bus" | "Metro" | "Rail" | "Auto" | "Cab"
   * @param {number} distanceKm
   * @param {object} options - extra info (autoFare, busType, etc.)
   * @returns {{ fare: number, breakdown: string }}
   */
  export function calculateFare(mode, distanceKm, options = {}) {
    const km = Math.max(0.5, distanceKm);
  
    switch (mode) {
  
      case "Metro": {
        const fare = slabFare(METRO_SLABS, km);
        return {
          fare,
          breakdown: `Metro fare (${km.toFixed(1)} km) -> ₹${fare}`
        };
      }
  
      case "Rail": {
        const fare = slabFare(RAIL_SLABS, km);
        return {
          fare,
          breakdown: `Suburban rail fare (${km.toFixed(1)} km) -> ₹${fare}`
        };
      }
  
      case "Bus": {
        const isAC = /ac|air.?con/i.test(options.busType || "");
      
        let fare;
      
        if (isAC) {
          if (km <= 5) fare = 18;
          else if (km <= 10) fare = 25;
          else if (km <= 15) fare = 30;
          else fare = 35;
        } else {
          if (km <= 4) fare = 10;
          else if (km <= 8) fare = 15;
          else if (km <= 15) fare = 18;
          else if (km <= 25) fare = 25;
          else fare = 30;
        }
      
        return {
          fare,
          breakdown: `${isAC ? "AC" : "Non-AC"} bus fare (${km.toFixed(1)} km) -> ₹${fare}`
        };
      }
  
      case "Auto": {
        // Use corridor fare if provided, else estimate
        const fare = options.corridorFare
          ? options.corridorFare
          : Math.max(15, Math.round(km * 8));
        return {
          fare,
          breakdown: `Auto fare (${km.toFixed(1)} km) -> ₹${fare}`
        };
      }
  
      case "Cab": {
        // Ola/Uber/Yellow Taxi estimate
        const baseFare = 50;
        const perKm = 14;
        const fare = Math.round(baseFare + km * perKm);
        return {
          fare,
          breakdown: `Cab fare: ₹${baseFare} base + ₹${perKm}/km x ${km.toFixed(1)} km -> ₹${fare}`
        };
      }
  
      default: {
        const fare = Math.round(km * 2);
        return {
          fare,
          breakdown: `Estimated fare (${km.toFixed(1)} km) -> ₹${fare}`
        };
      }
    }
  }
  
  /**
   * Estimate travel time based on mode and distance.
   * @returns {number} minutes
   */
  export function estimateTime(mode, distanceKm) {
    const km = Math.max(0.5, distanceKm);
  
    const speedKmPerMin = {
      "Metro": 0.55,   // ~33 km/h
      "Rail":  0.50,   // ~30 km/h
      "Bus":   0.30,   // ~18 km/h (traffic)
      "Auto":  0.28,   // ~17 km/h
      "Cab":   0.35,   // ~21 km/h
    };
  
    const speed = speedKmPerMin[mode] || 0.30;
    const raw = km / speed;
  
    // Add boarding/waiting time
    const waitTime = {
      "Metro": 5,
      "Rail":  8,
      "Bus":   5,
      "Auto":  3,
      "Cab":   4,
    };
  
    return Math.round(raw + (waitTime[mode] || 5));
  }
