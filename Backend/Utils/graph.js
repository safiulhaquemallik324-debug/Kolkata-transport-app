// Backend/Utils/graph.js

import busRoutes from '../data/busroute.js';
import { metroLines } from '../data/metroroute.js';
import { trainRoutes } from '../data/trainroute.js';
import { autoRickshawCorridors } from '../data/autoroute.js';
import { nodes } from '../data/nodes.js';
import { buildNormalizedLookup, resolveStopKey } from './normalize.js';

const normalizedLookup = buildNormalizedLookup(nodes);

// Common suffixes in bus route stop names that don't appear in node names /////

const BUS_STOP_SUFFIXES = [
  " bus terminus", " bus stand", " bus stop",
  " station bus terminus", " railway station",
  " crossing", " more", " mor", " crossing more",
  " junction", " metro station", " metro",
  " terminus", " stand",
  " 5 point", " 7 point", " 4 point",
  " hospital more", " hospital",
  " gate no 1", " gate no 2", " gate no 3",
  " p.s.", " ps", " thana",
  " bazar", " bazaar",
  " road crossing", " road",
  " avenue", " street",
];

function stripBusStopSuffix(name) {
  let n = name.toLowerCase().trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of BUS_STOP_SUFFIXES) {
      if (n.endsWith(suffix)) {
        n = n.slice(0, n.length - suffix.length).trim();
        changed = true;
        break;
      }
    }
  }
  return n;
}

function normalize(stop) {
  if (!stop) return stop;

  const candidates = [
    stop,
    String(stop).replace(/\(.+?\)/g, " "),
    ...String(stop).split("/")
  ].map(s => s.trim()).filter(Boolean);

  for (const candidate of candidates) {
    const direct = resolveStopKey(candidate, normalizedLookup);
    if (nodes[direct]) return direct;

    const stripped = stripBusStopSuffix(candidate);
    if (stripped !== candidate.toLowerCase().trim()) {
      const stripped2 = resolveStopKey(stripped, normalizedLookup);
      if (nodes[stripped2]) return stripped2;
    }
  }

  return stop;
}

// Graph stores: for each (from, to) pair, which DIRECT routes connect them
// A route is "direct" if both stops appear in its path (order matters for buses)

export function buildGraph() {
  const graph = {}; // graph[from][to] = [{ mode, routeId, name, ... }]

  function addEdge(from, to, edgeData) {
    const f = normalize(from);
    const t = normalize(to);
    if (!f || !t || f === t) return;
    if (!graph[f]) graph[f] = {};
    if (!graph[f][t]) graph[f][t] = [];
    const exists = graph[f][t].some(
      e => e.routeId === edgeData.routeId && e.mode === edgeData.mode
    );
    if (!exists) graph[f][t].push(edgeData);
  }

// BUS â€” bidirectional, adjacent stops only
// BUS — oneway flag check ///

for (const route of busRoutes) {
  for (let i = 0; i < route.path.length - 1; i++) {
    const edge = {
      mode: "Bus",
      routeId: route.no,
      name: `Bus ${route.no}`,
      type: route.type || "",
      status: route.status || ""
    };
    addEdge(route.path[i], route.path[i + 1], edge);
    // Oneway flag na thakle bidirectional
    addEdge(route.path[i + 1], route.path[i], edge);
  }
}

  // METRO â€” bidirectional, adjacent stations only
  for (const [lineName, stations] of Object.entries(metroLines)) {
    for (let i = 0; i < stations.length - 1; i++) {
      const edge = { mode: "Metro", routeId: lineName, name: `${lineName} Line Metro` };
      addEdge(stations[i], stations[i + 1], edge);
      addEdge(stations[i + 1], stations[i], edge);
    }
  }

  // TRAIN â€” bidirectional, adjacent stations only
  for (const [lineName, stations] of Object.entries(trainRoutes)) {
    for (let i = 0; i < stations.length - 1; i++) {
      const edge = { mode: "Rail", routeId: lineName, name: lineName.replace(/_/g, " ") };
      addEdge(stations[i], stations[i + 1], edge);
      addEdge(stations[i + 1], stations[i], edge);
    }
  }

  // AUTO â€” bidirectional
  for (const corridor of autoRickshawCorridors) {
    const [from, to] = corridor.path;
    const edge = {
      mode: "Auto",
      routeId: corridor.name,
      name: corridor.name,
      fare: corridor.fare
    };
    addEdge(from, to, edge);
    addEdge(to, from, edge);
  }

  return graph;
}

// For each route, store its full stop list (normalized)
// So we can check: does route X actually go from A to B directly?

function buildRouteIndex() {
  const entries = [];

  for (const route of busRoutes) {
    entries.push({
      key: `Bus:${route.no}:${entries.length}`,
      routeId: route.no,
      mode: "Bus",
      name: `Bus ${route.no}`,
      type: route.type || "",
      status: route.status || "",
      stops: route.path.map(normalize)
    });
  }

  for (const [lineName, stations] of Object.entries(metroLines)) {
    entries.push({
      key: `Metro:${lineName}`,
      routeId: lineName,
      mode: "Metro",
      name: `${lineName} Line Metro`,
      stops: stations.map(normalize)
    });
  }

  for (const [lineName, stations] of Object.entries(trainRoutes)) {
    entries.push({
      key: `Rail:${lineName}`,
      routeId: lineName,
      mode: "Rail",
      name: lineName.replace(/_/g, " "),
      stops: stations.map(normalize)
    });
  }

  for (const corridor of autoRickshawCorridors) {
    entries.push({
      key: `Auto:${corridor.name}`,
      routeId: corridor.name,
      mode: "Auto",
      name: corridor.name,
      fare: corridor.fare,
      stops: corridor.path.map(normalize)
    });
  }

  return entries;
}
const routeIndex = buildRouteIndex();

// //////////////// ////////////////////////////////////////////////DIRECT ROUTE FINDER ////////////////////////////////////////////////////////////
// Check if a single route goes from startKey to endKey
// (both stops must exist in route, start before end)

function routeCoversTrip(route, startKey, endKey) {
  if (!route) return false;

  const stops = route.stops;
  const normStart = normalize(startKey);
  const normEnd = normalize(endKey);

  const startIdx = stops.indexOf(normStart);
  const endIdx = stops.indexOf(normEnd);

  if (startIdx === -1 || endIdx === -1) return false;

  if (route.mode === "Bus") {
    return startIdx < endIdx;
  }
  
  return startIdx !== endIdx;// Strict — direction matters
}

function findRouteEntry(routeId, mode) {
  return routeIndex.find(route => route.routeId === routeId && route.mode === mode);
}

function findDirectRoutes(startKey, endKey) {
  const routes = new Map();

  for (const route of routeIndex) {
    if (!routeCoversTrip(route, startKey, endKey)) continue;

    const key = `${route.mode}:${route.routeId}`;
    if (!routes.has(key)) {
      routes.set(key, {
        mode: route.mode,
        routeId: route.routeId,
        name: route.name,
        type: route.type || "",
        fare: route.fare || null
      });
    }
  }

  return Array.from(routes.values());
}

////////////////////////////////////////////////// BFS WITH ROUTE CONTINUITY CHECK //////////////////////////////////////////////////////////////
// Find paths from start to end, tracking which routes are used
// A route must be "continuous" â€” same routeId covers the whole segment

export function findRoutes(graph, startKey, endKey, maxDepth = 12) {
  if (startKey === endKey) return [];

  const results = [];
  const queue = [{ path: [startKey], routeSegments: [] }];
  const visited = new Set();
  // Stop early once we have enough results
  const MAX_RESULTS = 20;

  while (queue.length > 0 && results.length < MAX_RESULTS) {
    const { path, routeSegments } = queue.shift();
    const current = path[path.length - 1];

    if (path.length > maxDepth) continue;

    const neighbors = graph[current] || {};

    for (const [neighbor, edges] of Object.entries(neighbors)) {
      if (path.includes(neighbor)) continue;

      const newPath = [...path, neighbor];

      for (const edge of edges) {
        const visitKey = `${neighbor}:${edge.routeId}`;
        if (visited.has(visitKey)) continue;

        const newSegments = [...routeSegments, {
          routeId: edge.routeId,
          mode: edge.mode,
          name: edge.name,
          type: edge.type || "",
          from: current,
          to: neighbor
        }];

        if (neighbor === endKey) {
          results.push({ path: newPath, segments: newSegments });
          if (results.length >= MAX_RESULTS) return results;
        } else {
          visited.add(visitKey);
          queue.push({ path: newPath, routeSegments: newSegments });
        }
      }
    }
  }

  return results;
}

//////////////////////////////////////////////////////////////////////// EXTRACT OPTIONS/////////////////////////////////////////////////////////////////////////////////////////////
// From BFS results, extract ONLY routes that DIRECTLY cover startâ†’end
// Priority: direct single-route trips first, then transfers

export function extractOptions(paths, startKey, endKey) {
  const directRoutes = findDirectRoutes(startKey, endKey);
  const transferOptions = [];

  for (const { path, segments } of paths) {
    const legs = groupSegmentsByRoute(segments);

    if (legs.length === 2) {
      const transferStop = legs[0].stops[legs[0].stops.length - 1];
      const leg1Route = findRouteEntry(legs[0].routeId, legs[0].mode);
      const leg2Route = findRouteEntry(legs[1].routeId, legs[1].mode);

      if (
        !routeCoversTrip(leg1Route, startKey, transferStop) ||
        !routeCoversTrip(leg2Route, transferStop, endKey)
      ) {
        continue;
      }

      const key = `${legs[0].routeId}|${legs[1].routeId}`;
      if (!transferOptions.find(t => t.key === key)) {
        transferOptions.push({
          key,
          mode: legs[0].mode,
          legs,
          transferStop,
          path
        });
      }
    }
  }

  const modeMap = new Map();

  for (const info of directRoutes) {
    if (!modeMap.has(info.mode)) {
      modeMap.set(info.mode, {
        mode: info.mode,
        routes: [],
        path: [startKey, endKey]
      });
    }
    modeMap.get(info.mode).routes.push({
      routeId: info.routeId,
      name: info.name,
      type: info.type,
      fare: info.fare
    });
  }

  const result = Array.from(modeMap.values());

  for (const transfer of transferOptions) {
    const hasDirectForMode = result.find(r => r.mode === transfer.mode);
    if (!hasDirectForMode) {
      result.push({
        mode: transfer.mode,
        routes: transfer.legs.map(l => ({
          routeId: l.routeId,
          name: findRouteEntry(l.routeId, l.mode)?.name || l.routeId,
          mode: l.mode
        })),
        isTransfer: true,
        transferStop: transfer.transferStop,
        path: transfer.path
      });
    }
  }

  return result;
}
// Helper: group consecutive segments with same routeId into legs
function groupSegmentsByRoute(segments) {
  if (!segments.length) return [];

  const legs = [];
  let currentLeg = {
    routeId: segments[0].routeId,
    mode: segments[0].mode,
    name: segments[0].name,
    stops: [segments[0].from, segments[0].to]
  };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.routeId === currentLeg.routeId) {
      currentLeg.stops.push(seg.to);
    } else {
      legs.push(currentLeg);
      currentLeg = {
        routeId: seg.routeId,
        mode: seg.mode,
        name: seg.name,
        stops: [seg.from, seg.to]
      };
    }
  }
  legs.push(currentLeg);
  return legs;
}
