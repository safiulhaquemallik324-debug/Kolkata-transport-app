// Kolkata AI - Client Application Logic

document.addEventListener("DOMContentLoaded", () => {
  // --- STATE SYSTEM ---
  const state = {
    theme: localStorage.getItem("theme") || "light",
    is3dActive: false,
    mapRotateY: 0,
    isOrbiting: false,
    currentLocation: [22.5696, 88.3639], // Central Kolkata coords
    activeRouteData: null,
    activeRouteIndex: 0,
    navigationInterval: null,
    isNavigating: false,
    map: null,
    tileLayer: null,
    routePolyline: null,
    startMarker: null,
    endMarker: null,
    currentUserLocation: null,
    simulatedVehicleMarker: null,
    availableRoutes: [],
    // Free OpenStreetMap tiles â€” show rivers, bridges (Hooghly / Howrah Bridge) & street labels
    tiles: {
      light: {
        url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        subdomains: "abcd",
        maxZoom: 19
      },
      dark: {
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        subdomains: "abcd",
        maxZoom: 19
      },
    }
  };

  // --- DOM ELEMENTS ---
  const themeToggleBtn = document.getElementById("theme-toggle");
  const themeIconSun = document.getElementById("theme-icon-sun");
  const themeIconMoon = document.getElementById("theme-icon-moon");
  const toggle3dBtn = document.getElementById("toggle-3d-btn");
  const compassBtn = document.getElementById("compass-btn");
  const compassDial = document.getElementById("compass-dial");
  const searchInput = document.getElementById("search-input");
  const voiceSearchBtn = document.getElementById("voice-search-btn");
  const consoleStepsList = document.getElementById("console-steps-list");
  const consoleRouteList = document.getElementById("console-route-list");
  const aiBriefBox = document.getElementById("ai-brief-box");
  const aiChatLog = document.getElementById("ai-chat-log");
  const aiChatInput = document.getElementById("ai-chat-input");
  const aiChatSend = document.getElementById("ai-chat-send");
  const routeCardsContainer = document.getElementById("route-cards-container");
  const journeyDrawer = document.getElementById("journey-drawer");
  const appContainer = document.querySelector(".app-container");
  const mobileSheetToggle = document.getElementById("mobile-sheet-toggle");
  const mapSection = document.getElementById("map-section");
  const startJourneyBtn = document.getElementById("start-journey-btn");
  const navigationHud = document.getElementById("navigation-hud");
  const hudInstruction = document.getElementById("hud-instruction");
  const hudDistance = document.getElementById("hud-distance");

  // Drawer update elements
  const drawerFromInput = document.getElementById("drawer-from-input");
  const drawerToInput = document.getElementById("drawer-to-input");
  const drawerTime = document.getElementById("drawer-time");
  const drawerDistance = document.getElementById("drawer-distance");
  const drawerFare = document.getElementById("drawer-fare");
  const drawerSubtext = document.getElementById("drawer-subtext");


  const API_BASE = "https://kolkata-transport-app.onrender.com";


  // OpenStreetMap raster tiles (free, no API key)
  function createTileLayer(styleKey) {
    const cfg = state.tiles[styleKey];
    return L.tileLayer(cfg.url, {
      attribution: state.tiles.attribution,
      maxZoom: cfg.maxZoom || 19,
      subdomains: cfg.subdomains || "abc",
      keepBuffer: 2,
      updateWhenZooming: false,
      updateWhenIdle: true
    });
  }

  // --- 1. INITIALIZE LEAFLET MAP ---
  function initMap() {
    state.map = L.map("map", {
      center: state.currentLocation,
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      inertia: true,
      inertiaDeceleration: 2800
    });

    // Classic small pin markers
    state.createCustomMarker = function (iconHTML, typeClass) {
      return L.divIcon({
        className: 'custom-route-marker',
        html: `<div class="marker-pin ${typeClass}">${iconHTML}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      });
    };


    L.control.attribution({ position: "bottomright" }).addTo(state.map);

    state.tileLayer = createTileLayer(state.theme === "light" ? "light" : "dark").addTo(state.map);

    // âœ… Google style pin
    state.createGooglePin = function (label, variant = "default") {
      const safeLabel = String(label || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

      return L.divIcon({
        className: "google-pin-marker",
        html: `
            <div class="google-pin ${variant}">
              <div class="google-pin-label">${safeLabel}</div>
              <div class="google-pin-head"></div>
            </div>
          `,
        iconSize: [40, 56],
        iconAnchor: [20, 52]
      });
    };

    // Demo marker
    L.marker(state.currentLocation, {
      icon: state.createGooglePin("A"),
      zIndexOffset: 600
    }).addTo(state.map);
  }


  const swapBtn = document.getElementById("swapBtn");
  if (swapBtn) {
    swapBtn.addEventListener("click", () => {
      const tempVal = drawerFromInput.value;
      const tempId = drawerFromInput.dataset.nodeId;

      drawerFromInput.value = drawerToInput.value;
      if (drawerToInput.dataset.nodeId) {
        drawerFromInput.dataset.nodeId = drawerToInput.dataset.nodeId;
      } else {
        delete drawerFromInput.dataset.nodeId;
      }

      drawerToInput.value = tempVal;
      if (tempId) {
        drawerToInput.dataset.nodeId = tempId;
      } else {
        delete drawerToInput.dataset.nodeId;
      }

      // Reset so next Start Journey re-fetches with swapped values
      state.activeRouteData = null;
    });
  }



  // --- 2. DARK/LIGHT THEME SWITCHER ---

  // ðŸ‘‡ EI KHANE PASTE KORBI
  function applyTheme(theme) {
    state.theme = theme;

    if (!state.map) return; // ðŸ”¥ IMPORTANT

    if (theme === "dark") {
      document.body.removeAttribute("data-theme");

      themeIconSun.classList.add("hidden");
      themeIconMoon.classList.remove("hidden");

      if (state.tileLayer) state.map.removeLayer(state.tileLayer);
      state.tileLayer = createTileLayer("dark").addTo(state.map);

    } else {
      document.body.setAttribute("data-theme", "light");

      themeIconSun.classList.remove("hidden");
      themeIconMoon.classList.add("hidden");

      if (state.tileLayer) state.map.removeLayer(state.tileLayer);
      state.tileLayer = createTileLayer("light").addTo(state.map);
    }
  }


  themeToggleBtn.addEventListener("click", () => {
    const newTheme = state.theme === "dark" ? "light" : "dark";
    applyTheme(newTheme);
    localStorage.setItem("theme", newTheme);
  });

  // --- Mobile / tablet stacked layout ---
  function isMobileLayout() {
    return window.matchMedia("(max-width: 1024px)").matches;
  }

  function refreshMapLayout() {
    if (state.map) {
      setTimeout(() => state.map.invalidateSize(), 380);
    }
  }

  function setSheetExpanded(expanded) {
    if (!appContainer || !mobileSheetToggle) return;

    appContainer.classList.toggle("sheet-expanded", expanded);
    mobileSheetToggle.setAttribute("aria-expanded", String(expanded));

    const label = mobileSheetToggle.querySelector(".sheet-toggle-label");

    if (label) {
      label.textContent = expanded ? "Tap to close view" : "Tap to see view";
    }

    refreshMapLayout();
  }

  if (mobileSheetToggle && appContainer) {
    mobileSheetToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setSheetExpanded(!appContainer.classList.contains("sheet-expanded"));
    });

    setSheetExpanded(false);
  }

  window.addEventListener("resize", refreshMapLayout);

  // --- 3. LIGHT 3D VIEW (real tilt + Shift+drag orbit) ---
  const map3dStage = document.getElementById("map-3d-stage");

  function applyMapRotation() {
    if (!map3dStage) return;
    map3dStage.style.setProperty("--rotate-y", `${state.mapRotateY}deg`);
    updateCompass();
  }

  function resetMapRotation() {
    state.mapRotateY = 0;
    applyMapRotation();
  }

  function updateCompass() {
    if (!compassDial) return;
    compassDial.style.transform = `rotate(${-state.mapRotateY}deg)`;
  }

  function refreshMapAfter3dChange() {
    if (!state.map) return;
    state.map.invalidateSize({ animate: false, pan: false });
    if (state.tileLayer && state.tileLayer.redraw) {
      state.tileLayer.redraw();
    }
  }

  if (map3dStage) {
    let orbitStartX = 0;

    map3dStage.addEventListener("pointerdown", (e) => {
      if (!state.is3dActive || !e.shiftKey || e.button !== 0) return;
      state.isOrbiting = true;
      orbitStartX = e.clientX;
      map3dStage.classList.add("is-orbiting");
      if (state.map.dragging) state.map.dragging.disable();
      map3dStage.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    map3dStage.addEventListener("pointermove", (e) => {
      if (!state.isOrbiting) return;
      const dx = e.clientX - orbitStartX;
      orbitStartX = e.clientX;
      state.mapRotateY = Math.max(-55, Math.min(55, state.mapRotateY + dx * 0.35));
      applyMapRotation();
    });

    const endOrbit = () => {
      if (!state.isOrbiting) return;
      state.isOrbiting = false;
      map3dStage.classList.remove("is-orbiting");
      map3dStage.classList.remove("map-3d-transitioning");
      if (state.map.dragging && state.is3dActive) state.map.dragging.enable();
    };

    map3dStage.addEventListener("pointerup", endOrbit);
    map3dStage.addEventListener("pointercancel", endOrbit);
  }

  toggle3dBtn.addEventListener("click", () => {
    const mapSection = document.getElementById("map-section");
    state.is3dActive = !state.is3dActive;

    if (map3dStage) map3dStage.classList.add("map-3d-transitioning");

    if (state.is3dActive) {
      mapSection.classList.add("map-3d-active");
      toggle3dBtn.classList.add("active");
      toggle3dBtn.title = "Exit 3D (Shift+drag map to rotate)";
    } else {
      mapSection.classList.remove("map-3d-active");
      toggle3dBtn.classList.remove("active");
      toggle3dBtn.title = "3D View";
      resetMapRotation();
      if (state.map.dragging) state.map.dragging.enable();
    }

    let transitionDone = false;
    const finishTransition = () => {
      if (transitionDone) return;
      transitionDone = true;
      if (map3dStage) map3dStage.classList.remove("map-3d-transitioning");
      refreshMapAfter3dChange();
    };

    if (map3dStage) {
      map3dStage.addEventListener("transitionend", function onEnd(e) {
        if (e.propertyName !== "transform") return;
        map3dStage.removeEventListener("transitionend", onEnd);
        finishTransition();
      });
    }

    setTimeout(finishTransition, 420);
  });

  if (compassBtn) {
    compassBtn.addEventListener("click", () => {
      if (state.mapRotateY !== 0) {
        resetMapRotation();
        if (map3dStage) map3dStage.classList.add("map-3d-transitioning");
        setTimeout(() => {
          if (map3dStage) map3dStage.classList.remove("map-3d-transitioning");
          refreshMapAfter3dChange();
        }, 400);
      } else if (state.map) {
        state.map.setView(state.map.getCenter(), state.map.getZoom(), { animate: true });
      }
    });
  }

  // --- 4. REAL WEATHER & TIME API ---
  async function fetchRealWeather() {
    const tempEl = document.getElementById("weather-temp");
    const iconEl = document.getElementById("weather-icon");

    try {
      const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=22.5726&longitude=88.3639&current_weather=true");
      if (!res.ok) throw new Error("Weather request failed");

      const data = await res.json();
      const current = data.current_weather;
      const temp = Math.round(current.temperature);
      const code = current.weathercode;

      tempEl.textContent = `${temp}°C`;

      const icons = {
        sunny: "\u2600\uFE0F",  // ☀️
        partlyCloudy: "\u26C5",        // ⛅
        foggy: "\uD83C\uDF2B\uFE0F", // 🌫️
        rainy: "\uD83C\uDF27\uFE0F", // 🌧️
        snowy: "\u2744\uFE0F",  // ❄️
        thunder: "\u26C8\uFE0F",  // ⛈️
        cloudy: "\u2601\uFE0F",  // ☁️
      };

      if (code === 0) iconEl.textContent = icons.sunny;
      else if (code >= 1 && code <= 3) iconEl.textContent = icons.partlyCloudy;
      else if (code >= 45 && code <= 48) iconEl.textContent = icons.foggy;
      else if (code >= 51 && code <= 67) iconEl.textContent = icons.rainy;
      else if (code >= 71 && code <= 86) iconEl.textContent = icons.snowy;
      else if (code >= 95 && code <= 99) iconEl.textContent = icons.thunder;
      else iconEl.textContent = icons.cloudy;

    } catch (err) {
      console.warn("Could not fetch real-time weather, falling back:", err);
      tempEl.textContent = "29°C";
      iconEl.textContent = "\u2600\uFE0F"; // ☀️ fallback
    }
  }


  // Real-time clock tick updater (Kolkata Local Time format)
  function initClock() {
    const clockEl = document.getElementById("live-clock");

    const updateClock = () => {
      const now = new Date();
      // Formatted in Kolkata timezone
      const options = {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      };
      clockEl.textContent = now.toLocaleTimeString('en-US', options);
    };

    updateClock();
    setInterval(updateClock, 1000);
  }

  // --- 5. GOOGLE SPEECH SYNTHESIS / VOICE ASSISTANT SEARCH ---
  function initVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Speech recognition is not supported on this browser.");
      voiceSearchBtn.addEventListener("click", () => {
        alert("Web Speech Voice Assistant is not supported in this browser. Please type your route!");
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-IN'; // Indian English accent fits perfectly
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    voiceSearchBtn.addEventListener("click", () => {
      if (voiceSearchBtn.classList.contains("listening")) {
        recognition.stop();
        return;
      }

      voiceSearchBtn.classList.add("listening");
      searchInput.value = "";
      searchInput.placeholder = "Listening to your route choice...";
      recognition.start();
    });

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      searchInput.value = text;
      const toMatch = text.match(/(.+)\s+to\s+(.+)/i);
      if (toMatch) {
        drawerFromInput.value = toMatch[1].trim();
        drawerToInput.value = toMatch[2].trim();
      } else {
        drawerToInput.value = text.trim();
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      resetVoiceState();
    };

    recognition.onend = () => {
      resetVoiceState();
    };

    function resetVoiceState() {
      voiceSearchBtn.classList.remove("listening");
      searchInput.placeholder = "Where to in Kolkata? (e.g. Jadavpur to Amity)";
    }
  }

  // --- 6. ROUTE FETCHING & INTEGRATION CLIENT SIDE ---

  // Search input fills drawer only â€” route loads on Start Journey
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const query = searchInput.value.trim();
      if (!query) return;
      const toMatch = query.match(/(.+)\s+to\s+(.+)/i);
      if (toMatch) {
        drawerFromInput.value = toMatch[1].trim();
        drawerToInput.value = toMatch[2].trim();
      } else {
        drawerToInput.value = query;
      }
    }
  });

  // Call the Node.js Express backend api to get dynamically parsed Kolkata routes
  async function searchRoutes(queryText, routeOverride = null) {
    let fromVal = "Howrah Station";
    let toVal = queryText;

    if (routeOverride && routeOverride.from && routeOverride.to) {
      fromVal = routeOverride.from;
      toVal = routeOverride.to;
    } else {
      if (!queryText || queryText.trim() === "") return false;
      // Detect "to" token in string (e.g. "Jadavpur to Amity")
      const toMatch = queryText.match(/(.+)\s+to\s+(.+)/i);
      if (toMatch) {
        fromVal = toMatch[1].trim();
        toVal = toMatch[2].trim();
      } else {
        toVal = queryText.trim();
      }
    }

    // Visual feedback while loading
    searchInput.disabled = true;
    searchInput.style.opacity = 0.7;

    try {
      const body = { from: fromVal, to: toVal };
      if (routeOverride?.fromCoords) {
        body.fromLat = routeOverride.fromCoords.lat;
        body.fromLng = routeOverride.fromCoords.lng;
      }
      if (routeOverride?.fromNodeId) body.fromNodeId = routeOverride.fromNodeId;
      if (routeOverride?.toNodeId) body.toNodeId = routeOverride.toNodeId;
      if (!routeOverride?.fromNodeId && drawerFromInput?.dataset?.nodeId) {
        body.fromNodeId = drawerFromInput.dataset.nodeId;
      }
      if (!routeOverride?.toNodeId && drawerToInput?.dataset?.nodeId) {
        body.toNodeId = drawerToInput.dataset.nodeId;
      }

      const res = await fetch(`${API_BASE}/api/route`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        let apiMessage = "Routing failed";
        try {
          const errorPayload = await res.json();
          if (errorPayload?.error) apiMessage = errorPayload.error;
        } catch (_) {
          // ignore parse error and keep fallback message
        }
        throw new Error(apiMessage);
      }
      const data = await res.json();
      if (!data?.routes?.length) {
        throw new Error("No routes found");
      }

      // Render results on sidebar and map
      renderRouteQuery(data);
      return true;

    } catch (err) {
      console.error("Routing API error:", err);
      alert(`Route error: ${err.message}`);
      return false;
    } finally {
      searchInput.disabled = false;
      searchInput.style.opacity = 1;
    }
  }

  // Render the route data results
  function renderRouteQuery(data) {
    if (state.navigationInterval) {
      clearInterval(state.navigationInterval);
      state.isNavigating = false;
      startJourneyBtn.innerHTML = `<span>Start Journey</span><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
      startJourneyBtn.classList.remove("navigating");
      navigationHud.classList.remove("active");
    }

    state.activeRouteData = data;
    state.availableRoutes = data.routes;
    state.activeRouteIndex = 0;

    clearRouteGraphics();
    resetAiChat();

    routeCardsContainer.innerHTML = "";
    state.availableRoutes.forEach((route, idx) => {
      const card = document.createElement("div");
      card.className = `route-card ${idx === 0 ? 'active' : ''}`;
      card.setAttribute("data-index", idx);

      let iconSvg = '';
      let modeClass = route.mode.toLowerCase();
      if (modeClass === 'metro') {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><path d="M12 8h.01"/><path d="M9 16h6"/><path d="M8 12h8"/><path d="m14 8-2 2-2-2"/></svg>`;
      } else if (modeClass === 'bus') {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-1.1 0-2 .9-2 2v7c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`;
      } else if (modeClass === 'auto') {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`;
      } else if (modeClass === 'rail') {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16"/><path d="M10 14h4"/><path d="M12 2v20"/><path d="m17 12-5 5-5-5"/><path d="m12 17V9"/></svg>`;
      } else {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><circle cx="5" cy="18" r="2"/><path d="M7 18h4"/><circle cx="13" cy="18" r="2"/><path d="M15 18h5a1 1 0 0 0 1-1v-3.5a1.5 1.5 0 0 0-1.5-1.5H15Z"/></svg>`;
      }

      // Bus route tags
      const allRoutes = route.allRoutes || [];
      const visibleRoutes = allRoutes.slice(0, 3);
      const hiddenRoutes = allRoutes.slice(3);
      const showSeeMore = route.mode === "Bus" && hiddenRoutes.length > 0;

      const busListHTML = route.mode === "Bus" && allRoutes.length > 0
        ? `<div class="bus-route-list">
            ${visibleRoutes.map(r => `<span class="bus-tag">${r.id}</span>`).join("")}
            ${showSeeMore ? `
              <span class="bus-tag see-more-btn" data-idx="${idx}">+${hiddenRoutes.length} more</span>
              <div class="hidden-bus-list" id="hidden-buses-${idx}" style="display:none;">
                ${hiddenRoutes.map(r => `<span class="bus-tag">${r.id}</span>`).join("")}
              </div>
            ` : ""}
          </div>`
        : "";

      card.innerHTML = `
        <div class="card-left">
          <div class="card-icon ${modeClass}">${iconSvg}</div>
          <div class="card-info">
            <h3>${route.mode} ${route.bestChoice ? '<span class="best-choice-badge">Best Choice</span>' : ''}</h3>
            ${busListHTML}
            <div class="card-tags">
              <span class="card-tag">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Verified Vehicle
              </span>
              <span class="card-tag">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                Safe Route
              </span>
            </div>
          </div>
        </div>
        <div class="card-right">
          <div class="card-time">${route.time}<span>min</span></div>
          <div class="card-price">₹${route.price}</div>

            ${route.mode === "Bus" ? `
            <div class="fare-note">AC bus fare may be different</div>
             ` : ""}
        </div>
        <div class="arrow-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      `;

      // See more click
      card.addEventListener("click", (e) => {
        if (e.target.classList.contains("see-more-btn")) {
          e.stopPropagation();
          const dataIdx = e.target.getAttribute("data-idx");
          const hiddenList = document.getElementById(`hidden-buses-${dataIdx}`);
          if (hiddenList) {
            const isHidden = hiddenList.style.display === "none";
            hiddenList.style.display = isHidden ? "flex" : "none";
            e.target.textContent = isHidden ? "Show less" : `+${hiddenRoutes.length} more`;
          }
          return;
        }
        document.querySelectorAll(".route-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        selectRoute(idx);
      });

      routeCardsContainer.appendChild(card);
    });

    selectRoute(0);
  }

  function renderConsoleRouteList(route) {
    if (!consoleRouteList) return;

    const allRoutes = route.allRoutes || [];
    if (!allRoutes.length || route.mode !== "Bus") {
      consoleRouteList.style.display = "none";
      consoleRouteList.innerHTML = "";
      return;
    }

    const visibleCount = 8;
    const hasMore = allRoutes.length > visibleCount;
    const visible = allRoutes.slice(0, visibleCount);
    const hidden = allRoutes.slice(visibleCount);

    consoleRouteList.style.display = "block";
    consoleRouteList.innerHTML = `
      <div class="console-route-list-title">All buses sharing this stop pair</div>
      <div class="console-route-tags">
        ${visible.map(r => `<span class="bus-tag" title="${r.name || r.id}">${r.id}</span>`).join("")}
        ${hidden.map(r => `<span class="bus-tag hidden-console-route" style="display:none;" title="${r.name || r.id}">${r.id}</span>`).join("")}
      </div>
      ${hasMore ? `<button class="console-route-toggle" type="button">Show ${hidden.length} more buses</button>` : ""}
    `;

    const toggle = consoleRouteList.querySelector(".console-route-toggle");
    if (toggle) {
      toggle.addEventListener("click", () => {
        const hiddenTags = consoleRouteList.querySelectorAll(".hidden-console-route");
        const isHidden = hiddenTags[0]?.style.display === "none";
        hiddenTags.forEach(tag => {
          tag.style.display = isHidden ? "inline-flex" : "none";
        });
        toggle.textContent = isHidden ? "Show less" : `Show ${hidden.length} more buses`;
      });
    }
  }

  async function refreshAiBrief(route) {
    if (!aiBriefBox || !state.activeRouteData || !route) return;

    aiBriefBox.style.display = "block";
    aiBriefBox.textContent = "Preparing route brief...";

    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: state.activeRouteData.from,
          to: state.activeRouteData.to,
          mode: route.mode,
          name: route.name,
          time: route.time,
          price: route.price,
          steps: route.description,
          allRoutes: route.allRoutes || []
        })
      });
      const data = await res.json();
      aiBriefBox.textContent = data.summary || "No extra route brief available.";
      aiBriefBox.dataset.status = data.status || "fallback";
    } catch (err) {
      aiBriefBox.textContent = "Route brief is unavailable right now.";
      aiBriefBox.dataset.status = "error";
    }
  }

  function resetAiChat() {
    if (!aiChatLog) return;
    aiChatLog.innerHTML = `<div class="ai-chat-empty">Ask a route doubt after selecting a vehicle.</div>`;
  }

  function appendChatMessage(role, content) {
    if (!aiChatLog) return;
    const empty = aiChatLog.querySelector(".ai-chat-empty");
    if (empty) empty.remove();

    const row = document.createElement("div");
    row.className = `ai-chat-msg ${role}`;

    if (role === "assistant") {
      row.innerHTML = `
      <div class="ai-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
      </div>
      <div class="ai-chat-bubble">${content}</div>
    `;
    } else {
      row.innerHTML = `<div class="ai-chat-bubble">${escapeHtml(content)}</div>`;
    }

    aiChatLog.appendChild(row);
    aiChatLog.scrollTop = aiChatLog.scrollHeight;
    return row;
  }

  function showTypingIndicator() {
    if (!aiChatLog) return null;
    const empty = aiChatLog.querySelector(".ai-chat-empty");
    if (empty) empty.remove();

    const row = document.createElement("div");
    row.className = "ai-chat-msg assistant";
    row.id = "ai-typing-row";
    row.innerHTML = `
    <div class="ai-avatar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4M12 8h.01"/>
      </svg>
    </div>
    <div class="ai-chat-bubble">
      <div class="ai-typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
    aiChatLog.appendChild(row);
    aiChatLog.scrollTop = aiChatLog.scrollHeight;
    return row;
  }

  function removeTypingIndicator() {
    const row = document.getElementById("ai-typing-row");
    if (row) row.remove();
  }

  // Markdown-style formatter — **bold**, bullet lines, sections
  function formatAiResponse(text) {
    const lines = text.split("\n").filter(l => l.trim() !== "");
    let html = "";
    let inList = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Section header: lines ending with ":" and short
      if (/^[A-Z][\w\s]+:$/.test(trimmed) && trimmed.length < 40) {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<div class="ai-section-title">${escapeHtml(trimmed)}</div>`;
        continue;
      }

      // Bullet point
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        if (!inList) { html += "<ul>"; inList = true; }
        const content = trimmed.slice(2);
        html += `<li>${formatInline(content)}</li>`;
        continue;
      }

      // Normal paragraph
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${formatInline(trimmed)}</p>`;
    }

    if (inList) html += "</ul>";
    return html;
  }

  // Bold: **text**
  function formatInline(text) {
    return escapeHtml(text).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function askRouteChat() {
    if (!aiChatInput) return;
    const question = aiChatInput.value.trim();
    const route = state.availableRoutes[state.activeRouteIndex];
    if (!question || !route || !state.activeRouteData) return;

    const sendBtn = document.getElementById("ai-chat-send");
    aiChatInput.value = "";
    if (sendBtn) sendBtn.disabled = true;

    appendChatMessage("user", question);
    showTypingIndicator();

    try {
      const res = await fetch("/api/route/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          route,
          from: state.activeRouteData.from,
          to: state.activeRouteData.to
        })
      });
      const data = await res.json();
      removeTypingIndicator();
      const answer = data.answer || "I could not answer that route doubt.";
      appendChatMessage("assistant", formatAiResponse(answer));
    } catch (err) {
      removeTypingIndicator();
      appendChatMessage("assistant", formatAiResponse("Route chat is unavailable right now."));
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      aiChatInput.focus();
    }
  }

  async function fetchAndShowSchedule(route) {
    const scheduleBox = document.getElementById("schedule-box");
    if (!scheduleBox) return;

    if (route.mode !== "Metro" && route.mode !== "Rail") {
      scheduleBox.style.display = "none";
      return;
    }

    // Line name detect
    let lineName = "";
    if (route.mode === "Metro") {
      lineName = route.allRoutes?.[0]?.id || "";
    } else {
      lineName = route.name || route.allRoutes?.[0]?.id || "";
    }

    scheduleBox.style.display = "block";
    scheduleBox.innerHTML = `
    <div class="schedule-title">
      <span class="schedule-mode-badge ${route.mode.toLowerCase()}">${route.mode}</span>
      Next Train / Metro
    </div>
    <div class="schedule-loading">Schedule information is loading...</div>
  `;

    try {
      const res = await fetch(
        `/api/route/schedule?mode=${encodeURIComponent(route.mode)}&line=${encodeURIComponent(lineName)}&from=${encodeURIComponent(state.activeRouteData?.from || "")}&to=${encodeURIComponent(state.activeRouteData?.to || "")}`
      );
      if (!res.ok) {
        throw new Error(`Schedule API failed: ${res.status}`);
      }

      const data = await res.json();

      const peakHoursText = Array.isArray(data.peakHours)
        ? data.peakHours
          .map(([s, e]) => `${String(s).padStart(2, "0")}:00–${String(e).padStart(2, "0")}:00`)
          .join(", ")
        : "Not available";

      if (!data.trains?.length) {
        scheduleBox.innerHTML = `<div class="schedule-empty">Schedule information is not available for this route.</div>`;
        return;
      }

      scheduleBox.innerHTML = `
    <div class="schedule-title">
      <span class="schedule-mode-badge ${route.mode.toLowerCase()}">${route.mode}</span>
      <span>${data.line}</span>
      ${data.isPeakTime ? '<span class="peak-badge">Peak Hour</span>' : '<span class="regular-badge">Regular</span>'}
    </div>
  
    <div class="schedule-route-label">${data.from} → ${data.to}</div>
  
    <div class="schedule-info-grid">
      <div><strong>First Train</strong><span>${data.firstTrain}</span></div>
      <div><strong>Last Train</strong><span>${data.lastTrain}</span></div>
      <div><strong>Regular</strong><span>Every ${data.regularFrequency} min</span></div>
      <div><strong>Peak</strong><span>Every ${data.peakFrequency} min</span></div>
    </div>
  
    <div class="schedule-peak-hours">
           Peak Hours: ${peakHoursText}
    </div>
  
    <div class="schedule-list">
      ${data.trains.map((t, i) => `
        <div class="schedule-item ${i === 0 ? 'next' : ''}">
          <div>
            <strong>${t.departs}</strong>
            <span>${t.frequency}</span>
          </div>
          <div>${t.waitMin} min wait</div>
        </div>
      `).join("")}
    </div>
  `;
    } catch (err) {
      console.error("Schedule fetch error:", err);
      scheduleBox.innerHTML = `<div class="schedule-empty">Failed to load schedule information.।</div>`;
    }
  }

  // Switch display active route details
  function selectRoute(index) {
    state.activeRouteIndex = index;
    const selectedRoute = state.availableRoutes[index];
    const data = state.activeRouteData;

    // Reset simulator if running
    if (state.navigationInterval) {
      clearInterval(state.navigationInterval);
      state.isNavigating = false;
      startJourneyBtn.innerHTML = `<span>Start Journey</span><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
      startJourneyBtn.classList.remove("navigating");
      navigationHud.classList.remove("active");
    }

    // 1. Draw instructions list in sidebar console box
    // 1. Draw instructions list in sidebar console box
    consoleStepsList.innerHTML = "";

    const steps = Array.isArray(selectedRoute.description)
      ? selectedRoute.description
      : [selectedRoute.description];

    steps.forEach((step, idx) => {
      if (!step) return;

      // Check if this is a transfer divider step
      const isTransfer = /\bChange\b/i.test(String(step));
      const isBoard = /\bBoard\b|\bTake\b|\bBook\b|\bGo to\b|\bWalk\b/i.test(String(step)) && idx === 0;
      const isAlight = /\bAlight\b|\bContinue\b|\bDirect\b/i.test(String(step));
      const isRoute = String(step).includes("ðŸ›£ï¸");
      const isAlso = String(step).includes("ðŸ”„");

      const stepItem = document.createElement("div");
      stepItem.className = `console-step-item${isTransfer ? " transfer-step" : ""}${isBoard ? " board-step" : ""}${isAlight ? " alight-step" : ""}`;

      // Bold markdown parse (**text**)
      const parsedStep = String(step).replace(
        /\*\*(.+?)\*\*/g,
        '<strong>$1</strong>'
      );

      stepItem.innerHTML = `
    <div class="console-step-bullet ${isTransfer ? "transfer" : isAlight ? "alight" : isBoard ? "board" : ""}"></div>
    <div class="console-step-text">${parsedStep}</div>
  `;

      consoleStepsList.appendChild(stepItem);

      // Add visual divider after transfer step
      if (isTransfer) {
        const divider = document.createElement("div");
        divider.className = "console-transfer-divider";
        divider.innerHTML = `<span>Transfer Point</span>`;
        consoleStepsList.appendChild(divider);
      }
    });

    renderConsoleRouteList(selectedRoute);
    refreshAiBrief(selectedRoute);
    fetchAndShowSchedule(selectedRoute);

    // 2. Update Map Graphics
    clearRouteGraphics();

    const fromLabel = data.from.length > 18 ? data.from.slice(0, 16) + "..." : data.from;
    const toLabel = data.to.length > 18 ? data.to.slice(0, 16) + "..." : data.to;

    state.startMarker = L.marker(selectedRoute.path[0], {
      icon: state.createGooglePin(fromLabel, "start"),
      zIndexOffset: 600
    }).addTo(state.map).bindPopup(`<b>Start:</b> ${data.from}`);

    state.endMarker = L.marker(selectedRoute.path[selectedRoute.path.length - 1], {
      icon: state.createGooglePin(toLabel, "end"),
      zIndexOffset: 601
    }).addTo(state.map).bindPopup(`<b>Destination:</b> ${data.to}`);

    // Route polyline snapped to street network with dynamic traffic segment coloring
    drawRouteGeometry(selectedRoute.path);

    // Zoom fit bounds with clean padding
    state.map.fitBounds(state.routePolyline.getBounds(), {
      padding: state.is3dActive ? [90, 90] : [70, 70],
      animate: false
    });

    // 3. Update bottom drawer statistics
    // 3. Update bottom drawer statistics
    drawerFromInput.value = data.from;
    drawerToInput.value = data.to;

    drawerTime.innerHTML = `${selectedRoute.time}<span>min</span>`;
    drawerDistance.innerHTML = `${data.distance}<span>km</span>`;
    drawerFare.textContent = `₹${selectedRoute.price}`;

    // Fare breakdown
    const fareBreakdownEl = document.getElementById("fare-breakdown-box");
    if (fareBreakdownEl) {
      const bd = selectedRoute.fareBreakdown;
      if (bd && typeof bd === "string" && bd.length) {
        fareBreakdownEl.innerHTML = `
          <div class="fare-breakdown-title">Fare Breakdown</div>
          <div class="fare-breakdown-list">
            <div class="fare-breakdown-item">
              <span class="fare-leg">${bd}</span>
            </div>
          </div>
        `;
        fareBreakdownEl.style.display = "block";
      } else if (bd && bd.breakdown && bd.breakdown.length) {
        fareBreakdownEl.innerHTML = `
          <div class="fare-breakdown-title">Fare Breakdown</div>
          <div class="fare-breakdown-list">
            ${bd.breakdown.map(item => `
              <div class="fare-breakdown-item">
                <span class="fare-leg">${item.leg}</span>
                <span class="fare-amount">₹${item.fare}</span>
              </div>
            `).join("")}
            <div class="fare-breakdown-total">
              <span>Total</span>
              <span>₹${bd.total}</span>
            </div>
          </div>
        `;
        fareBreakdownEl.style.display = "block";
      } else {
        fareBreakdownEl.style.display = "none";
      }
    }

    // Icon subtitle tag string
    let routeSubtitle = `Metro Route • On-time • Updated just now`;
    if (selectedRoute.mode.toLowerCase() === 'bus') {
      routeSubtitle = `Bus Route (${selectedRoute.name.split(' (')[0]}) • On-time • Updated just now`;
    } else if (selectedRoute.mode.toLowerCase() === 'auto') {
      routeSubtitle = `Shared Auto Route • Medium Traffic • Updated just now`;
    } else if (selectedRoute.mode.toLowerCase() === 'rail') {
      routeSubtitle = `Suburban Rail Line • On-time • Updated just now`;
    } else if (selectedRoute.mode.toLowerCase() === 'cab') {
      routeSubtitle = `App Cab / Yellow Taxi • Live Route • Updated just now`;
    }
    drawerSubtext.innerHTML = routeSubtitle;

    // Show Drawer
    journeyDrawer.classList.add("visible");
  }

  function drawRouteGeometry(pathPoints) {
    if (state.routePolyline) {
      state.map.removeLayer(state.routePolyline);
    }

    state.routePolyline = L.featureGroup().addTo(state.map);
    const trafficFactor = document.getElementById("traffic-select").value;

    if (trafficFactor === "live") {
      const totalPoints = pathPoints.length;
      const greenEnd = Math.floor(totalPoints * 0.45);
      const orangeEnd = Math.floor(totalPoints * 0.70);
      const redEnd = Math.floor(totalPoints * 0.90);

      if (greenEnd > 0) {
        L.polyline(pathPoints.slice(0, greenEnd + 1), {
          color: '#10b981',
          weight: 6,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          shadowColor: '#10b981',
          shadowBlur: 8
        }).addTo(state.routePolyline);
      }

      if (orangeEnd > greenEnd) {
        L.polyline(pathPoints.slice(greenEnd, orangeEnd + 1), {
          color: '#f59e0b',
          weight: 6,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          shadowColor: '#f59e0b',
          shadowBlur: 8
        }).addTo(state.routePolyline);
      }

      if (redEnd > orangeEnd) {
        L.polyline(pathPoints.slice(orangeEnd, redEnd + 1), {
          color: '#ef4444',
          weight: 6,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          shadowColor: '#ef4444',
          shadowBlur: 10
        }).addTo(state.routePolyline);
      }

      if (totalPoints > redEnd) {
        L.polyline(pathPoints.slice(redEnd, totalPoints), {
          color: '#10b981',
          weight: 6,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          shadowColor: '#10b981',
          shadowBlur: 8
        }).addTo(state.routePolyline);
      }
    } else if (trafficFactor === "moderate") {
      const mid = Math.floor(pathPoints.length * 0.6);
      L.polyline(pathPoints.slice(0, mid + 1), {
        color: '#f59e0b',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        shadowColor: '#f59e0b',
        shadowBlur: 8
      }).addTo(state.routePolyline);

      L.polyline(pathPoints.slice(mid), {
        color: '#10b981',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        shadowColor: '#10b981',
        shadowBlur: 8
      }).addTo(state.routePolyline);
    } else if (trafficFactor === "heavy") {
      L.polyline(pathPoints, {
        color: '#ef4444',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        shadowColor: '#ef4444',
        shadowBlur: 12
      }).addTo(state.routePolyline);
    } else {
      L.polyline(pathPoints, {
        color: '#3b82f6',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        shadowColor: '#3b82f6',
        shadowBlur: 12
      }).addTo(state.routePolyline);
    }
  }

  function clearRouteGraphics() {
    if (state.routePolyline) state.map.removeLayer(state.routePolyline);
    if (state.startMarker) state.map.removeLayer(state.startMarker);
    if (state.endMarker) state.map.removeLayer(state.endMarker);
    if (state.simulatedVehicleMarker) state.map.removeLayer(state.simulatedVehicleMarker);
  }

  // --- 7. START JOURNEY â€” route shows only after this button is clicked ---
  startJourneyBtn.addEventListener("click", async () => {
    console.log("Start Journey clicked");

    const inputTo = drawerToInput.value.trim();
    if (!inputTo) {
      alert("Please enter your destination.");
      drawerToInput.focus();
      return;
    }

    let inputFrom = drawerFromInput.value.trim();
    let fromCoords = null;

    if (!inputFrom) {
      if (!state.currentUserLocation) {
        alert("Please enter a start location or allow GPS access.");
        drawerFromInput.focus();
        return;
      }
      inputFrom = "Current Location";
      fromCoords = state.currentUserLocation;
    }

    const loadedFrom = state.activeRouteData ? state.activeRouteData.from : "";
    const loadedTo = state.activeRouteData ? state.activeRouteData.to : "";

    if (inputFrom !== loadedFrom || inputTo !== loadedTo) {
      const success = await searchRoutes(
        `${inputFrom} to ${inputTo}`,
        {
          from: inputFrom,
          to: inputTo,
          fromCoords,
          fromNodeId: drawerFromInput.dataset.nodeId || undefined,
          toNodeId: drawerToInput.dataset.nodeId || undefined
        }
      );
      if (success) focusCurrentRoute();
      return;
    }

    focusCurrentRoute();
  });

  function focusCurrentRoute() {
    const activeRoute = state.availableRoutes[state.activeRouteIndex];
    if (!activeRoute) return;

    state.isNavigating = false;
    startJourneyBtn.innerHTML = `<span>Start Journey</span><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
    startJourneyBtn.classList.remove("navigating");

    // Keep HUD off in non-navigation mode
    navigationHud.classList.remove("active");
    hudInstruction.textContent = "";
    hudDistance.textContent = "";

    // Ensure selected route is visible and centered
    if (!state.routePolyline) {
      selectRoute(state.activeRouteIndex);
      return;
    }

    state.map.fitBounds(state.routePolyline.getBounds(), {
      padding: [80, 80],
      animate: false
    });
  }

  // --- 9. CLICK AND KEYPRESS BINDINGS FOR NEW DRAWER & HUB TAGS ---

  // Tag click listener in sidebar popular hubs list
  document.querySelectorAll(".hub-tag").forEach(tag => {
    tag.addEventListener("click", () => {
      const hubName = tag.getAttribute("data-hub");
      drawerToInput.value = hubName;
      searchInput.value = drawerFromInput.value.trim()
        ? `${drawerFromInput.value.trim()} to ${hubName}`
        : hubName;
    });
  });

  // Drawer inputs â€” route only via Start Journey button
  drawerFromInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      drawerToInput.focus();
    }
  });

  drawerToInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!e.repeat) startJourneyBtn.click();
    }
  });

  if (aiChatSend) {
    aiChatSend.addEventListener("click", askRouteChat);
  }

  if (aiChatInput) {
    aiChatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        askRouteChat();
      }
    });
  }

  // ✅ EI KHANE ADD KORO — alt route button
  const aiAltRouteBtn = document.getElementById("ai-alt-route-btn");
  if (aiAltRouteBtn) {
    aiAltRouteBtn.addEventListener("click", async () => {
      const route = state.availableRoutes?.[state.activeRouteIndex];
      if (!route || !state.activeRouteData) return;

      const from = state.activeRouteData.from;
      const to = state.activeRouteData.to;
      const question = `${from} থেকে ${to} যাওয়ার বিকল্প রুট কী কী আছে? মেট্রো, বাস, ট্রেন সব অপশন বলো।`;

      aiAltRouteBtn.disabled = true;
      appendChatMessage("user", "বিকল্প রুট দেখাও");
      showTypingIndicator();

      try {
        const res = await fetch("/api/route/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, route, from, to })
        });
        const data = await res.json();
        removeTypingIndicator();
        appendChatMessage("assistant", formatAiResponse(data.answer || "বিকল্প রুট খুঁজে পাওয়া যায়নি।"));
      } catch (err) {
        removeTypingIndicator();
        appendChatMessage("assistant", formatAiResponse("বিকল্প রুট এখন দেখানো সম্ভব হচ্ছে না।"));
      } finally {
        aiAltRouteBtn.disabled = false;
      }
    });
  }

  // --- INITIALIZATION ACTIONS ---
  function resetRouteUIOnLoad() {
    drawerFromInput.value = "";
    drawerToInput.value = "";
    searchInput.value = "";

    state.activeRouteData = null;
    state.availableRoutes = [];
    state.activeRouteIndex = 0;
    if (state.map) clearRouteGraphics();

    routeCardsContainer.innerHTML = "";
    if (consoleRouteList) {
      consoleRouteList.style.display = "none";
      consoleRouteList.innerHTML = "";
    }
    if (aiBriefBox) {
      aiBriefBox.style.display = "none";
      aiBriefBox.textContent = "";
    }
    resetAiChat();
    consoleStepsList.innerHTML = `
      <div class="console-step-item">
        <div class="console-step-bullet"></div>
        <div class="console-step-text">Enter <strong>From</strong> and <strong>To</strong>, then tap <strong>Start Journey</strong></div>
      </div>
    `;

    drawerTime.innerHTML = `--<span>min</span>`;
    drawerDistance.innerHTML = `--<span>km</span>`;
    drawerFare.textContent = "-";
    drawerSubtext.textContent = "No route loaded yet";
    journeyDrawer.classList.add("visible");
  }

  initMap();
  resetRouteUIOnLoad();
  updateCompass();
  refreshMapLayout();
  fetchRealWeather();
  initClock();
  initVoiceSearch();
  applyTheme(state.theme);

  // Poll weather every 5 minutes to maintain real-time accuracy
  setInterval(fetchRealWeather, 300000);

  // ================= AUTOCOMPLETE SYSTEM =================

  const autocompleteInstances = [];

  async function fetchSuggestions(query) {
    let url = `/api/suggest?q=${encodeURIComponent(query)}`;
    if (state.currentUserLocation) {
      url += `&lat=${state.currentUserLocation.lat}&lng=${state.currentUserLocation.lng}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error("Suggestion fetch failed");
    return res.json();
  }

  function hideAllSuggestions(exceptBox) {
    autocompleteInstances.forEach(({ box }) => {
      if (box !== exceptBox) {
        box.innerHTML = "";
        box.classList.remove("show");
      }
    });
  }

  function setupAutocomplete(inputEl, suggestionsBox, onSelect) {
    if (!inputEl || !suggestionsBox) return;

    let suggestionTimer = null;
    let activeIndex = -1;

    function clearSuggestions() {
      suggestionsBox.innerHTML = "";
      suggestionsBox.classList.remove("show");
      activeIndex = -1;
    }

    function renderSuggestions(list) {
      suggestionsBox.innerHTML = "";
      activeIndex = -1;

      if (!list || list.length === 0) {
        suggestionsBox.classList.remove("show");
        return;
      }

      list.forEach(place => {
        const item = document.createElement("div");
        item.className = "suggestion-item";
        item.innerHTML = `
          <div class="name">${place.name}</div>
          ${place.distance !== undefined
            ? `<small class="distance">${place.distance} km away</small>`
            : ""
          }
        `;

        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          inputEl.value = place.name;
          if (place.id) inputEl.dataset.nodeId = place.id;
          clearSuggestions();
          onSelect(place.name);
        });

        suggestionsBox.appendChild(item);
      });

      suggestionsBox.classList.add("show");
    }

    inputEl.addEventListener("input", () => {
      const query = inputEl.value.trim();
      clearTimeout(suggestionTimer);

      if (!query) {
        delete inputEl.dataset.nodeId;
        clearSuggestions();
        return;
      }

      delete inputEl.dataset.nodeId;
      hideAllSuggestions(suggestionsBox);

      suggestionTimer = setTimeout(async () => {
        try {
          const data = await fetchSuggestions(query);
          renderSuggestions(data);
        } catch (err) {
          console.error("Suggestion error:", err);
          clearSuggestions();
        }
      }, 300);
    });

    inputEl.addEventListener("keydown", (e) => {
      const items = suggestionsBox.querySelectorAll(".suggestion-item");
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        items.forEach(item => item.classList.remove("active"));
        items[activeIndex].classList.add("active");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        items.forEach(item => item.classList.remove("active"));
        items[activeIndex].classList.add("active");
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        items[activeIndex].dispatchEvent(new MouseEvent("mousedown"));
      } else if (e.key === "Escape") {
        clearSuggestions();
      }
    });

    autocompleteInstances.push({ input: inputEl, box: suggestionsBox, clear: clearSuggestions });
  }

  setupAutocomplete(
    drawerFromInput,
    document.getElementById("from-suggestions"),
    () => { }
  );

  setupAutocomplete(
    drawerToInput,
    document.getElementById("to-suggestions"),
    () => { }
  );

  document.addEventListener("click", (e) => {
    const insideAutocomplete = autocompleteInstances.some(
      ({ input, box }) => input === e.target || box.contains(e.target)
    );
    if (!insideAutocomplete) {
      autocompleteInstances.forEach(({ clear }) => clear());
    }
  });
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.currentUserLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
      },
      (err) => console.warn("GPS unavailable:", err.message)
    );
  }

  // ================= NEARBY STOPS =================
  const nearbyBtn = document.getElementById("nearby-btn");
  const nearbyList = document.getElementById("nearby-list");
  let nearbyMarkers = [];
  let nearbyActive = false;

  function clearNearbyMarkers() {
    nearbyMarkers.forEach(m => state.map.removeLayer(m));
    nearbyMarkers = [];
  }

  function renderNearbyList(stops) {
    nearbyList.innerHTML = "";
    if (!stops.length) {
      nearbyList.innerHTML = `<div class="nearby-empty">No stops found within 1.5km</div>`;
      return;
    }

    stops.forEach(stop => {
      const typeIcons = {
        metro: "ðŸš‡",
        rail: "ðŸš†",
        bus: "ðŸšŒ",
        auto: "ðŸ›º",
        ferry: "â›´"
      };

      const primaryType = stop.type.find(t => ["metro", "rail", "ferry"].includes(t)) || stop.type[0];
      const icon = typeIcons[primaryType] || "ðŸ“";

      const item = document.createElement("div");
      item.className = "nearby-item";
      item.innerHTML = `
        <div class="nearby-item-left">
          <span class="nearby-icon">${icon}</span>
          <div class="nearby-info">
            <div class="nearby-name">${stop.name}</div>
            <div class="nearby-desc">${stop.desc}</div>
          </div>
        </div>
        <div class="nearby-dist">${stop.distance} km</div>
      `;

      item.addEventListener("click", () => {
        drawerFromInput.value = stop.name;
        drawerFromInput.dataset.nodeId = stop.id;
        nearbyList.style.display = "none";
        nearbyActive = false;
        nearbyBtn.classList.remove("active");
        clearNearbyMarkers();
      });

      nearbyList.appendChild(item);
    });
  }

  function addNearbyMarkers(stops) {
    clearNearbyMarkers();
    stops.forEach(stop => {
      const typeColor = {
        metro: "#2563eb",
        rail: "#7c3aed",
        bus: "#0d9488",
        auto: "#d97706",
        ferry: "#0891b2"
      };
      const primaryType = stop.type.find(t => ["metro", "rail", "ferry"].includes(t)) || stop.type[0];
      const color = typeColor[primaryType] || "#6b7280";

      const marker = L.circleMarker([stop.lat, stop.lng], {
        radius: 8,
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      }).addTo(state.map);

      marker.bindPopup(`
        <div style="font-size:13px;">
          <strong>${stop.name}</strong><br>
          <span style="color:#6b7280;font-size:11px;">${stop.desc}</span><br>
          <span style="color:#3b82f6;font-size:11px;">ðŸ“ ${stop.distance} km away</span>
        </div>
      `);

      nearbyMarkers.push(marker);
    });
  }

  nearbyBtn.addEventListener("click", async () => {
    if (nearbyActive) {
      nearbyActive = false;
      nearbyBtn.classList.remove("active");
      nearbyList.style.display = "none";
      clearNearbyMarkers();
      return;
    }

    if (!state.currentUserLocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          state.currentUserLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
          await loadNearbyStops();
        },
        () => alert("GPS access denied. Please allow location access.")
      );
      return;
    }

    await loadNearbyStops();
  });

  async function loadNearbyStops() {
    nearbyBtn.textContent = "Loading...";
    try {
      const res = await fetch(
        `/api/nearby?lat=${state.currentUserLocation.lat}&lng=${state.currentUserLocation.lng}&radius=1.5`
      );
      const stops = await res.json();

      nearbyActive = true;
      nearbyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        Nearby Stops
      `;
      nearbyBtn.classList.add("active");
      nearbyList.style.display = "block";

      renderNearbyList(stops);
      addNearbyMarkers(stops);

      if (stops.length) {
        state.map.setView(
          [state.currentUserLocation.lat, state.currentUserLocation.lng],
          15,
          { animate: true }
        );
      }
    } catch (err) {
      console.error("Nearby stops error:", err);
      alert
    }
  }
});
