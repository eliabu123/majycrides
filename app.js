
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

let rideHistory = JSON.parse(
    localStorage.getItem("majycrides_history") || "[]"
);

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
    if (!rideStartTime) return 0;

    let elapsed = pausedDuration;

    if (!ridePaused) {
        elapsed += (Date.now() - rideStartTime) / 1000;
    }

    return elapsed;
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
    map.setView([lat, lon], 17);
    if (!map) return;

    const position = [lat, lon];

    if (!riderMarker) {
        riderMarker = L.marker(position)
            .addTo(map)
            .bindPopup("MAJYC RIDES - Your position");
    } else {
        riderMarker.setLatLng(position);
    }

    routePoints.push(position);

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
    }, 1000);
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

                if (
                    distance < 500 &&
                    distance > 1
                ) {
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

    pausedDuration += Date.now() - rideStartTime;
    ridePaused = true;

    stopGPS();
    clearInterval(timerId);

    $("start-btn").disabled = false;
    $("start-btn").textContent = "RESUME RIDE";
    $("pause-btn").disabled = true;

    updateDashboard();
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

        localStorage.setItem(
            "majycrides_history",
            JSON.stringify(rideHistory)
        );
    }

    rideActive = false;
    ridePaused = false;

    rideStartTime = 0;
    pausedDuration = 0;
    totalDistance = 0;
    maximumSpeed = 0;

    routePoints = [];

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
    ]);

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

renderHistory();
updateDashboard();
initializeMap();
// REGISTER SERVICE WORKER
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js")
            .then(() => {
                console.log("MAJYC RIDES offline support activated.");
            })
            .catch(error => {
                console.error("Service worker registration failed:", error);
            });
    });
}