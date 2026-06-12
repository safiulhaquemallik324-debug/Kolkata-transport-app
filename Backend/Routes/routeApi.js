// Backend/Routes/routeApi.js

import express from 'express';
import { nodes } from '../data/nodes.js';
import { buildGraph, findRoutes, extractOptions } from '../Utils/graph.js';
import { buildNormalizedLookup, resolveStopKey } from '../Utils/normalize.js';
import { calculateFare, estimateTime } from '../Utils/fareCalc.js';
import { calculateDistance } from '../Utils/distanceHelper.js';
import { getOSRMRoute, generatePolyline } from '../Utils/osrm.js';
import { metroSchedule, trainSchedule } from '../data/schedules.js';

const router = express.Router();

const graph = buildGraph();
const normalizedLookup = buildNormalizedLookup(nodes);

function resolveNode(query) {
  if (!query) return null;
  const q = query.trim();

  if (nodes[q]) return { key: q, node: nodes[q] };

  const resolvedKey = resolveStopKey(q, normalizedLookup);
  if (nodes[resolvedKey]) return { key: resolvedKey, node: nodes[resolvedKey] };

  let bestKey = null;
  let bestScore = 0;
  const qLower = q.toLowerCase();

  for (const [key, node] of Object.entries(nodes)) {
    let score = 0;
    const name = (node.name || "").toLowerCase();

    if (name === qLower) score += 120;
    else if (name.startsWith(qLower)) score += 90;
    else if (name.includes(qLower)) score += 60;

    if (Array.isArray(node.aliases)) {
      for (const alias of node.aliases) {
        const a = alias.toLowerCase();
        if (a === qLower) score += 100;
        else if (a.startsWith(qLower)) score += 75;
        else if (a.includes(qLower)) score += 50;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  if (bestKey && bestScore >= 50) {
    return { key: bestKey, node: nodes[bestKey] };
  }

  return null;
}

function buildDescription({ mode, routes, startName, endName, isTransfer, transferStop }) {
  const routeIds = routes.map(r => r.routeId).filter(Boolean);
  const first3 = routeIds.slice(0, 3).join(", ");
  const moreCount = routeIds.length > 3 ? ` (+${routeIds.length - 3} more)` : "";
  const labelRoute = (route) => {
    if (!route) return "";
    if (route.mode === "Metro") return `${route.routeId} Line Metro`;
    if (route.mode === "Rail") return `${String(route.routeId).replace(/_/g, " ")} train`;
    if (route.mode === "Bus") return `Bus ${route.routeId}`;
    return route.routeId || route.name || "";
  };

  switch (mode) {
    case "Bus":
      if (isTransfer && transferStop) {
        const leg1 = routes[0]?.routeId || "";
        const leg2 = routes[1]?.routeId || "";
        const transferName = nodes[transferStop]?.name || transferStop;
        return [
          `Board Bus ${leg1} at ${startName}.`,
          `Change at ${transferName} to Bus ${leg2}.`,
          `Continue to ${endName}.`
        ];
      }
      return [
        `Board one of these buses at ${startName}: ${first3}${moreCount}.`,
        `This is a direct bus option to ${endName}.`,
        `Choose whichever listed bus arrives first.`
      ];

    case "Metro":
      if (isTransfer && transferStop) {
        const leg1 = routes[0]?.routeId || "";
        const leg2 = routes[1]?.routeId || "";
        const transferName = nodes[transferStop]?.name || transferStop;
        return [
          `Board the ${leg1} Line Metro near ${startName}.`,
          `Change at ${transferName} to the ${leg2} Line Metro.`,
          `Alight near ${endName}.`
        ];
      }
      return [
        `Walk to the nearest metro station near ${startName}.`,
        `Board the ${first3} Line Metro.`,
        `Alight at the station nearest to ${endName}.`,
        `Metro usually runs every 5-10 minutes.`
      ];

    case "Rail":
      if (isTransfer && transferStop) {
        const leg1 = labelRoute(routes[0]);
        const leg2 = labelRoute(routes[1]);
        const transferName = nodes[transferStop]?.name || transferStop;
        return [
          `Board the ${leg1} near ${startName}.`,
          `Change at ${transferName} to ${leg2}.`,
          `Alight near ${endName}.`,
          `Check the local train schedule before travel.`
        ];
      }
      return [
        `Go to the nearest suburban rail station near ${startName}.`,
        `Board the ${first3.replace(/_/g, " ")} train.`,
        `Alight near ${endName}.`,
        `Check the local train schedule before travel.`
      ];

    case "Auto":
      return [
        `Take a shared auto-rickshaw from ${startName}.`,
        `Direct auto corridor to ${endName}.`,
        `Shared autos are usually available during daytime hours.`
      ];

    case "Cab":
      return [
        `Book an Uber, Ola, InDrive, or yellow taxi from ${startName}.`,
        `Direct ride to ${endName}.`,
        `Use this when public transport is unavailable or slower.`
      ];

    default:
      return [`Travel from ${startName} to ${endName} via ${mode}.`];
  }
}
// POST /api/route
router.post('/', async (req, res) => {
  try {
    const fromQuery = String(req.body?.from || "").trim();
    const toQuery = String(req.body?.to || "").trim();

    if (!fromQuery || !toQuery) {
      return res.status(400).json({ error: "Both 'from' and 'to' are required." });
    }

    const startResolved = resolveNode(fromQuery);
    const endResolved = resolveNode(toQuery);

    if (!startResolved) {
      return res.status(404).json({ error: `Location not found: "${fromQuery}". Try a nearby landmark.` });
    }
    if (!endResolved) {
      return res.status(404).json({ error: `Location not found: "${toQuery}". Try a nearby landmark.` });
    }

    const { key: startKey, node: startNode } = startResolved;
    const { key: endKey, node: endNode } = endResolved;

    const startName = startNode.name || startKey;
    const endName = endNode.name || endKey;

    const distanceKm = calculateDistance(
      startNode.lat, startNode.lon,
      endNode.lat, endNode.lon
    );

    // OSRM real road path
    const osrmData = await getOSRMRoute(
      startNode.lat, startNode.lon,
      endNode.lat, endNode.lon
    );
    const path = osrmData?.coords || generatePolyline(
      { lat: startNode.lat, lng: startNode.lon },
      { lat: endNode.lat, lng: endNode.lon }
    );

    // BFS + extract DIRECT routes only
    const paths = findRoutes(graph, startKey, endKey);
    const options = extractOptions(paths, startKey, endKey);


    const resultRoutes = [];

    // Cab â€” always available
    const cabFare = calculateFare("Cab", distanceKm);
    const cabTime = estimateTime("Cab", distanceKm);
    resultRoutes.push({
      mode: "Cab",
      name: "App Cab / Yellow Taxi",
      time: cabTime,
      price: cabFare.fare,
      fareBreakdown: cabFare.breakdown,  // string â€” frontend handles both
      bestChoice: false,
      description: buildDescription({ mode: "Cab", routes: [], startName, endName }),
      path
    });

    // Graph-found options
    for (const opt of options) {
      const fare = calculateFare(opt.mode, distanceKm, {
        busType: opt.routes[0]?.type || "",
        corridorFare: opt.routes[0]?.fare || null
      });
      const time = estimateTime(opt.mode, distanceKm);

      // Bus name: show first 3, rest as "see more"
      let routeName = "";
      if (opt.mode === "Bus") {
        const first3 = opt.routes.slice(0, 3).map(r => r.routeId).join(" / ");
        const extra = opt.routes.length > 3 ? ` (+${opt.routes.length - 3} more)` : "";
        routeName = `Bus ${first3}${extra}`;
      } else if (opt.isTransfer) {
        routeName = opt.routes.map(r => {
          if (r.mode === "Metro") return `${r.routeId} Line Metro`;
          if (r.mode === "Rail") return String(r.routeId).replace(/_/g, " ");
          if (r.mode === "Bus") return `Bus ${r.routeId}`;
          return r.name || r.routeId;
        }).join(" + ");
      } else {
        routeName = opt.routes[0]?.name || opt.mode;
      }

      resultRoutes.push({
        mode: opt.mode,
        name: routeName,
        allRoutes: opt.routes.map(r => ({
          id: r.routeId,
          name: r.name || r.routeId,
          type: r.type || "",
          mode: r.mode || opt.mode
        })),
        time,
        price: fare.fare,
        fareBreakdown: fare.breakdown,  // string from calculateFare
        bestChoice: opt.mode === "Metro" || opt.mode === "Rail",
        isTransfer: opt.isTransfer || false,
        transferStop: opt.transferStop || null,
        description: buildDescription({
          mode: opt.mode,
          routes: opt.routes,
          startName,
          endName,
          isTransfer: opt.isTransfer || false,
          transferStop: opt.transferStop || null
        }),
        path
      });
    }

    // Sort: Metro > Rail > Bus > Auto > Cab
    const modeOrder = { Metro: 0, Rail: 1, Bus: 2, Auto: 3, Cab: 4 };
    resultRoutes.sort((a, b) => (modeOrder[a.mode] ?? 5) - (modeOrder[b.mode] ?? 5));

    res.json({
      from: startName,
      to: endName,
      distance: distanceKm,
      routes: resultRoutes
    });

  } catch (err) {
    console.error("Routing error:", err);
    res.status(500).json({ error: "Routing failed. Please try again." });
  }
});

router.post("/chat", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    const route = req.body?.route || {};
    const from = String(req.body?.from || "");
    const to = String(req.body?.to || "");

    // Tavily search
    let webContext = "";
    if (process.env.TAVILY_API_KEY) {
      try {
        const searchRes = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
            query: `${question} Kolkata transport ${from} ${to}`,
            search_depth: "basic",
            max_results: 3
          })
        });
        const searchData = await searchRes.json();
        webContext = (searchData.results || [])
          .map((r, i) => `${i + 1}. ${r.title}: ${r.content}`)
          .join("\n");
      } catch (e) {
        console.warn("Tavily failed:", e.message);
      }
    }

    const steps = Array.isArray(route.description)
      ? route.description.join(" ")
      : String(route.description || "");

    // Groq call
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 400,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `You are a helpful Kolkata transit assistant. Always respond in structured format:
  - Use short section titles ending with ":"
  - Use bullet points starting with "- "
  - Use **bold** for key info like bus numbers, times, fares
  - Keep response concise, max 6-8 lines
  - Reply in the same language the user asked (Bengali or English)
  - If user asks for alternative routes, suggest realistic Kolkata transit alternatives using web info`
          },
          {
            role: "user",
            content: `Route info:
  From: ${from} → To: ${to}
  Mode: ${route.mode} | Time: ${route.time} min | Fare: ₹${route.price}
  ${route.allRoutes?.length ? `Available: ${route.allRoutes.map(r => r.id).join(", ")}` : ""}
  Steps: ${steps}
  ${webContext ? `\nWeb search results:\n${webContext}` : ""}
  
  User question: ${question}`
          }
        ]
      })
    });

    const groqData = await groqRes.json();

    if (groqData.error) {
      console.error("Groq error:", groqData.error);
      return res.status(500).json({ answer: "AI is unavailable right now." });
    }

    const answer = groqData?.choices?.[0]?.message?.content
      || "I could not answer that right now.";

    res.json({ answer });

  } catch (err) {
    console.error("Route chat error:", err);
    res.status(500).json({ answer: "Route chat is unavailable right now." });
  }
});

// Helper: next N trains from now
function getNextTrains(scheduleEntry, fromStation, toStation, count = 5) {
  if (!scheduleEntry) return [];

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [firstH, firstM] = scheduleEntry.firstTrain.split(":").map(Number);
  const [lastH, lastM] = scheduleEntry.lastTrain.split(":").map(Number);
  const firstMinutes = firstH * 60 + firstM;
  const lastMinutes = lastH * 60 + lastM;

  const isPeak = scheduleEntry.peakHours.some(([start, end]) => {
    const startMin = start * 60;
    const endMin = end * 60;
    return currentMinutes >= startMin && currentMinutes <= endMin;
  });

  const freq = isPeak ? scheduleEntry.peakFrequencyMin : scheduleEntry.frequencyMin;

  // Travel time estimate — 2 min per station gap (rough)
  const travelMinutes = 8; // default, will refine

  const trains = [];
  let t = firstMinutes;

  while (t <= lastMinutes && trains.length < count * 3) {
    if (t > currentMinutes) {
      const arrivalMin = t + travelMinutes;
      const depH = Math.floor(t / 60);
      const depM = t % 60;
      const arrH = Math.floor(arrivalMin / 60);
      const arrM = arrivalMin % 60;

      trains.push({
        departs: `${String(depH).padStart(2, "0")}:${String(depM).padStart(2, "0")}`,
        arrives: `${String(arrH % 24).padStart(2, "0")}:${String(arrM % 24).padStart(2, "0")}`,
        frequency: isPeak ? "Peak" : "Regular",
        waitMin: t - currentMinutes
      });

      if (trains.length >= count) break;
    }
    t += freq;
  }

  return trains;
}

// New endpoint — schedule
router.get("/schedule", (req, res) => {
  const mode = String(req.query.mode || "").trim();
  const line = String(req.query.line || "").trim();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();

  let scheduleEntry = null;

  if (mode === "Metro") {
    scheduleEntry = metroSchedule[line];
  } else if (mode === "Rail") {
    scheduleEntry = trainSchedule[line] || trainSchedule[line.replace(/ /g, "_")];
  }

  if (!scheduleEntry) {
    return res.json({ trains: [], message: "Schedule not available for this route." });
  }

  const trains = getNextTrains(scheduleEntry, from, to, 5);
  const isPeakTime = scheduleEntry.peakHours.some(([s, e]) => {
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    return cur >= s * 60 && cur <= e * 60;
  });
  
  res.json({
    line,
    from,
    to,
    mode,
    firstTrain: scheduleEntry.firstTrain,
    lastTrain: scheduleEntry.lastTrain,
    regularFrequency: scheduleEntry.frequencyMin,
    peakFrequency: scheduleEntry.peakFrequencyMin,
    peakHours: scheduleEntry.peakHours,
    isPeakTime,
    trains
  });
});

export default router;
