// Backend/Utils/osrm.js
import https from 'https';

export function getOSRMRoute(startLat, startLng, endLat, endLng) {
  return new Promise((resolve) => {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;

    https.get(url, { headers: { 'User-Agent': 'KolkataAITransit/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.routes && parsed.routes.length > 0) {
            const coords = parsed.routes[0].geometry.coordinates.map(pt => [pt[1], pt[0]]);
            const distance = parseFloat((parsed.routes[0].distance / 1000).toFixed(1));
            const duration = Math.round(parsed.routes[0].duration / 60);
            resolve({ coords, distance, duration });
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

export function generatePolyline(startNode, endNode, stepsCount = 10) {
  const latStart = startNode.lat;
  const lngStart = startNode.lng;
  const latEnd = endNode.lat;
  const lngEnd = endNode.lng;

  const path = [[latStart, lngStart]];

  for (let i = 1; i < stepsCount; i++) {
    const ratio = i / stepsCount;
    let lat = latStart + (latEnd - latStart) * ratio;
    let lng = lngStart + (lngEnd - lngStart) * ratio;

    const deviationScale = 0.002 * Math.sin(ratio * Math.PI);
    const perpLat = -(lngEnd - lngStart);
    const perpLng = (latEnd - latStart);
    const len = Math.sqrt(perpLat * perpLat + perpLng * perpLng);

    if (len > 0) {
      lat += (perpLat / len) * deviationScale;
      lng += (perpLng / len) * deviationScale;
    }

    path.push([parseFloat(lat.toFixed(5)), parseFloat(lng.toFixed(5))]);
  }

  path.push([latEnd, lngEnd]);
  return path;
}