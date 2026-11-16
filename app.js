
"use strict";

// ======================================
// MAJYC RIDES - GPS TRACKER PRO
// ======================================

const $ = id => document.getElementById(id);

let watchId = null;
let timerId = null;
let map = null;
let riderMarker = null;
let rideLine = null;

let rideActive = false;
let ridePaused = false;

let rideStartTime = 0;
let pausedDuration = 0;
let totalDistance = 0;
let maximumSpeed = 0;
let currentSpeed = 0;

let lastPosition = null;
let lastSpeedTime = null;
let routePoints = [];

const HISTORY_KEY = "majycrides_history";
const ACTIVE_RIDE_KEY = "majycrides_active_ride";
const MAX_HISTORY = 50;
const MAX_ROUTE_POINTS = 1200;

function readJSON(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch (error) {
        console.warn("Could not read saved data:", error);
        return fallback;
    }
}

function saveJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error("Could not save ride data:", error);
        const status = $("map-status");
        if (status) {
            status.textContent =
                "Storage is full. Some ride data could not be saved.";
        }
        return false;
    }
}

let rideHistory = readJSON(HISTORY_KEY, []);
if (!Array.isArray(rideHistory)) rideHistory = [];

let restoredRide = readJSON(ACTIVE_RIDE_KEY, null);

// ======================================
// MAP INITIALIZATION
// ======================================

function initializeMap() {
    if (typeof L === "undefined") {
        $("map-status").textContent =
            "Map library unavailable. Check your internet.";
        return;
    }

    map = L.map("ride-map").setView([-1.2864, 36.8172], 7);

    L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        {
            attribution: "Tiles © Esri",
            maxZoom: 19
        }
    ).addTo(map);

    rideLine = L.polyline([], {
        color: "#00d4ff",
        weight: 5
    }).addTo(map);

    $("map-status").textContent =
        "Map ready. Start your ride to track your route.";
}

// ======================================
// FORMATTING
// ======================================

function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    return [h, m, s]
        .map(value => String(value).padStart(2, "0"))
        .join(":");
}

function getElapsedSeconds() {
    if (!rideStartTime && !ridePaused) return 0;

    let elapsed = pausedDuration;

    if (!ridePaused && rideStartTime) {
        elapsed += (Date.now() - rideStartTime) / 1000;
    }

    return Math.max(0, elapsed);
}

// ======================================
// DISTANCE CALCULATION
// ======================================

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const rad = degrees => degrees * Math.PI / 180;

    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(lat1)) *
        Math.cos(rad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );
}

// ======================================
// DASHBOARD
// ======================================

function updateDashboard() {
    $("speed").textContent = Math.round(currentSpeed);

    $("distance").textContent =
        (totalDistance / 1000).toFixed(2) + " km";

    $("max-speed").textContent =
        Math.round(maximumSpeed) + " km/h";

    const elapsed = getElapsedSeconds();

    $("duration").textContent =
        formatDuration(elapsed);

    const average = elapsed > 0
        ? (totalDistance / elapsed) * 3.6
        : 0;

    $("average-speed").textContent =
        average.toFixed(1) + " km/h";
}

// ======================================
// LIVE MAP UPDATE
// ======================================

function updateMap(lat, lon) {
    if (!map || !rideLine) return;

    const position = [lat, lon];

    if (!riderMarker) {
        riderMarker = L.marker(position)
            .addTo(map)
            .bindPopup("MAJYC RIDES - Your position");
    } else {
        riderMarker.setLatLng(position);
    }

    if (routePoints.length < MAX_ROUTE_POINTS) {
        routePoints.push(position);
    } else if (routePoints.length % 2 === 0) {
        routePoints = routePoints.filter(
            (point, index) => index % 2 === 0
        );
        routePoints.push(position);
    }

    rideLine.setLatLngs(routePoints);
    map.setView(position, 17);

    $("map-status").textContent =
        "Live GPS location active.";
}

// ======================================
// TIMER
// ======================================

function startTimer() {
    clearInterval(timerId);

    timerId = setInterval(() => {
        updateDashboard();
        saveActiveRide();
    }, 5000);
}

// ======================================
// GPS TRACKING
// ======================================

function startGPS() {
    if (!navigator.geolocation) {
        $("gps-status").textContent =
            "GPS not supported by this browser.";
        return;
    }

    $("gps-status").textContent =
        "Waiting for GPS signal...";

    watchId = navigator.geolocation.watchPosition(
        position => {
            const coords = position.coords;
            const now = Date.now();

            if (coords.accuracy > 50) {
                $("gps-status").textContent =
                    "GPS signal weak. Improving accuracy...";
                return;
            }

            const lat = coords.latitude;
            const lon = coords.longitude;

            if (lastPosition) {
                const distance = calculateDistance(
                    lastPosition.lat,
                    lastPosition.lon,
                    lat,
                    lon
                );

                if (distance < 500 && distance > 1) {
                    totalDistance += distance;
                }
            }

            let speed = 0;

            if (coords.speed !== null && coords.speed >= 0) {
                speed = coords.speed * 3.6;
            } else if (lastPosition && lastSpeedTime) {
                const elapsed =
                    (now - lastSpeedTime) / 1000;

                if (elapsed > 0) {
                    const distance = calculateDistance(
                        lastPosition.lat,
                        lastPosition.lon,
                        lat,
                        lon
                    );

                    speed = (distance / elapsed) * 3.6;
                }
            }

            currentSpeed = Math.min(speed, 300);
            maximumSpeed = Math.max(maximumSpeed, currentSpeed);

            lastPosition = { lat, lon };
            lastSpeedTime = now;

            updateMap(lat, lon);

            $("gps-status").textContent =
                "GPS connected • Accuracy " +
                Math.round(coords.accuracy) + "m";

            updateDashboard();
            saveActiveRide();
        },

        error => {
            const messages = {
                1: "GPS permission denied.",
                2: "GPS position unavailable.",
                3: "GPS request timed out."
            };

            $("gps-status").textContent =
                messages[error.code] || "GPS error.";
        },

        {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 15000
        }
    );
}

function stopGPS() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    currentSpeed = 0;
    lastPosition = null;
    lastSpeedTime = null;

    $("gps-status").textContent = "GPS stopped";
}

// ======================================
// AUTOMATIC ACTIVE RIDE BACKUP
// ======================================

function saveActiveRide() {
    if (!rideActive) return;

    saveJSON(ACTIVE_RIDE_KEY, {
        savedAt: Date.now(),
        elapsed: getElapsedSeconds(),
        distance: totalDistance,
        maximumSpeed: maximumSpeed,
        route: routePoints,
        active: true
    });
}

// ======================================
// RESTORE PREVIOUS RIDE
// ======================================

function restoreActiveRide() {
    if (!restoredRide || !restoredRide.active) return;

    rideActive = true;
    ridePaused = true;
    rideStartTime = 0;

    pausedDuration = Number(restoredRide.elapsed) || 0;
    totalDistance = Number(restoredRide.distance) || 0;
    maximumSpeed = Number(restoredRide.maximumSpeed) || 0;

    routePoints = Array.isArray(restoredRide.route)
        ? restoredRide.route.slice(-MAX_ROUTE_POINTS)
        : [];

    currentSpeed = 0;
    lastPosition = null;
    lastSpeedTime = null;

    $("start-btn").disabled = false;
    $("start-btn").textContent = "RESUME RIDE";
    $("pause-btn").disabled = true;
    $("stop-btn").disabled = false;

    $("gps-status").textContent =
        "Previous ride recovered • Paused";

    $("map-status").textContent =
        "Your unfinished ride was recovered. Press RESUME RIDE to continue.";

    updateDashboard();
}

// ======================================
// START RIDE
// ======================================

function startRide() {
    if (rideActive && !ridePaused) return;

    if (!rideActive) {
        rideActive = true;
        ridePaused = false;

        rideStartTime = Date.now();
        pausedDuration = 0;
        totalDistance = 0;
        maximumSpeed = 0;

        lastPosition = null;
        lastSpeedTime = null;
        routePoints = [];

        if (rideLine) rideLine.setLatLngs([]);

        if (riderMarker && map) {
            map.removeLayer(riderMarker);
            riderMarker = null;
        }
    } else {
        rideStartTime = Date.now();
        ridePaused = false;
    }

    saveActiveRide();

    $("start-btn").disabled = true;
    $("start-btn").textContent = "START RIDE";
    $("pause-btn").disabled = false;
    $("stop-btn").disabled = false;

    startGPS();
    startTimer();
}

// ======================================
// PAUSE RIDE
// ======================================

function pauseRide() {
    if (!rideActive || ridePaused) return;

    pausedDuration += (Date.now() - rideStartTime) / 1000;
    rideStartTime = 0;
    ridePaused = true;

    stopGPS();
    clearInterval(timerId);

    $("start-btn").disabled = false;
    $("start-btn").textContent = "RESUME RIDE";
    $("pause-btn").disabled = true;

    updateDashboard();
    saveActiveRide();
}

// ======================================
// STOP RIDE
// ======================================

function stopRide() {
    if (!rideActive) return;

    const elapsed = getElapsedSeconds();

    stopGPS();
    clearInterval(timerId);

    if (elapsed > 0) {
        const ride = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            distance: (totalDistance / 1000).toFixed(2),
            duration: formatDuration(elapsed),
            maxSpeed: Math.round(maximumSpeed),
            averageSpeed: elapsed > 0
                ? ((totalDistance / elapsed) * 3.6).toFixed(1)
                : "0.0",
            route: routePoints
        };

        rideHistory.unshift(ride);
        rideHistory = rideHistory.slice(0, MAX_HISTORY);

        saveJSON(HISTORY_KEY, rideHistory);
    }

    rideActive = false;
    ridePaused = false;

    rideStartTime = 0;
    pausedDuration = 0;
    totalDistance = 0;
    maximumSpeed = 0;

    routePoints = [];

    try {
        localStorage.removeItem(ACTIVE_RIDE_KEY);
    } catch (error) {
        console.warn("Could not clear active ride:", error);
    }

    $("start-btn").disabled = false;
    $("start-btn").textContent = "START RIDE";
    $("pause-btn").disabled = true;
    $("stop-btn").disabled = true;

    updateDashboard();
    renderHistory();
}

// ======================================
// RIDE HISTORY
// ======================================

function renderHistory() {
    const container = $("ride-history");

    if (!rideHistory.length) {
        container.innerHTML =
            "<p>No rides recorded yet.</p>";
        return;
    }

    container.innerHTML = rideHistory.map(ride => `
        <div class="stat-card" style="margin-bottom:12px;text-align:left;">
            <strong>${escapeHTML(ride.date)}</strong>
            <p>Distance: ${Number(ride.distance).toFixed(2)} km</p>
            <p>Maximum speed: ${Number(ride.maxSpeed)} km/h</p>
            <p>Average speed: ${Number(ride.averageSpeed)} km/h</p>
            <p>Duration: ${escapeHTML(ride.duration)}</p>
            <button type="button" onclick="showSavedRoute(${Number(ride.id)})">
                VIEW ROUTE
            </button>
        </div>
    `).join("");
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// ======================================
// VIEW SAVED ROUTE
// ======================================

function showSavedRoute(id) {
    const ride = rideHistory.find(item => item.id === id);

    if (!ride || !map || !ride.route || !ride.route.length) {
        $("map-status").textContent =
            "No saved GPS route for this ride.";
        return;
    }

    const points = ride.route.map(point => [
        Number(point[0]),
        Number(point[1])
    ]).filter(point =>
        Number.isFinite(point[0]) && Number.isFinite(point[1])
    );

    if (!points.length) {
        $("map-status").textContent =
            "No valid GPS points in this route.";
        return;
    }

    if (rideLine) rideLine.setLatLngs(points);

    map.fitBounds(points, { padding: [30, 30] });

    if (riderMarker) map.removeLayer(riderMarker);

    riderMarker = L.marker(points[points.length - 1])
        .addTo(map)
        .bindPopup("Saved ride destination");

    $("map-status").textContent =
        "Viewing saved ride route.";
}

// ======================================
// BUTTON EVENTS
// ======================================

$("start-btn").addEventListener("click", startRide);
$("pause-btn").addEventListener("click", pauseRide);
$("stop-btn").addEventListener("click", stopRide);

// ======================================
// INITIALIZE
// ======================================

$("pause-btn").disabled = true;
$("stop-btn").disabled = true;

restoreActiveRide();
renderHistory();
updateDashboard();
initializeMap();

if (rideActive && routePoints.length && rideLine && map) {
    rideLine.setLatLngs(routePoints);
    map.fitBounds(routePoints, { padding: [30, 30] });
}

// Save when the page is refreshed or hidden.
window.addEventListener("pagehide", saveActiveRide);

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        saveActiveRide();
    }
});

// REGISTER SERVICE WORKER
