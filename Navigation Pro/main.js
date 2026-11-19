
// ==UserScript==
// @name         GeoFS Navigation Pro
// @namespace    https://github.com/
// @version      0.5.0
// @description  Advanced navigation and flight plan manager for GeoFS
// @match        https://www.geo-fs.com/*
// @match        https://geo-fs.com/*
// @require      https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const WAYPOINTS_KEY = 'gnp-waypoints';
    const PLANS_KEY = 'gnp-flight-plans';
    const NM_RADIUS = 3440.065;
    const AUTO_ADVANCE_DISTANCE = 1;

    let waypoints = loadData(WAYPOINTS_KEY, []);
    let flightPlans = loadData(PLANS_KEY, {});
    let activeIndex = waypoints.length ? 0 : -1;
    let followAircraft = true;
    let map = null;
    let aircraftMarker = null;
    let routeLine = null;
    let waypointMarkers = [];
    let panel = null;
    let minimized = false;

    function loadData(key, fallback) {
        try {
            const data = JSON.parse(localStorage.getItem(key));
            return data ?? fallback;
        } catch {
            return fallback;
        }
    }

    function saveData(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.warn('Navigation Pro: storage unavailable.', error);
        }
    }

    function getFlightData() {
        const geo = window.geofs;
        if (!geo?.animation?.values || !geo?.aircraft?.instance) return null;

        const values = geo.animation.values;
        const position = geo.aircraft.instance.llaLocation;

        if (!position || position.length < 2) return null;

        return {
            lat: Number(position[0]),
            lon: Number(position[1]),
            heading: Number(values.heading360) || 0,
            altitude: Number(values.altitude) || 0,
            speed: Number(values.groundSpeed) || 0
        };
    }

    function distanceNM(lat1, lon1, lat2, lon2) {
        const toRad = value => value * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;

        return NM_RADIUS * 2 * Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );
    }

    function bearingTo(lat1, lon1, lat2, lon2) {
        const toRad = value => value * Math.PI / 180;
        const toDeg = value => value * 180 / Math.PI;

        const y = Math.sin(toRad(lon2 - lon1)) *
            Math.cos(toRad(lat2));

        const x =
            Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.cos(toRad(lon2 - lon1));

        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    function formatDistance(value) {
        return Number.isFinite(value) ? value.toFixed(1) + ' NM' : '--';
    }

    function formatETE(distance, speed) {
        if (!speed || speed <= 0 || !Number.isFinite(distance)) return '--';

        const minutes = Math.round(distance / speed * 60);
        const hours = Math.floor(minutes / 60);
        const remaining = minutes % 60;

        return hours ? `${hours}h ${remaining}m` : `${remaining}m`;
    }

    function createPanel() {
        if (document.getElementById('gnp-panel')) return;

        panel = document.createElement('div');
        panel.id = 'gnp-panel';

        panel.innerHTML = `
            <div id="gnp-header">
                <div class="gnp-title">✈ Navigation Pro <span>0.5.0</span></div>
                <div class="gnp-header-buttons">
                    <button id="gnp-minimize" title="Minimaliseren">−</button>
                    <button id="gnp-close" title="Sluiten">×</button>
                </div>
            </div>

            <div id="gnp-content">
                <div class="gnp-tabs">
                    <button class="gnp-tab active" data-tab="dashboard">Dashboard</button>
                    <button class="gnp-tab" data-tab="map">Kaart</button>
                    <button class="gnp-tab" data-tab="plan">Flight Plan</button>
                </div>

                <section id="gnp-dashboard" class="gnp-section">
                    <div class="gnp-grid">
                        <div class="gnp-card">
                            <label>Heading</label>
                            <strong id="gnp-heading">---</strong>
                            <small>°</small>
                        </div>
                        <div class="gnp-card">
                            <label>Altitude</label>
                            <strong id="gnp-altitude">---</strong>
                            <small>ft</small>
                        </div>
                        <div class="gnp-card">
                            <label>Ground Speed</label>
                            <strong id="gnp-speed">---</strong>
                            <small>kts</small>
                        </div>
                        <div class="gnp-card">
                            <label>Next Waypoint</label>
                            <strong id="gnp-next-name">---</strong>
                            <small id="gnp-next-distance">--</small>
                        </div>
                    </div>

                    <div class="gnp-info">
                        <div><span>Distance to waypoint</span><strong id="gnp-distance">--</strong></div>
                        <div><span>Bearing to waypoint</span><strong id="gnp-bearing">--</strong></div>
                        <div><span>Route distance</span><strong id="gnp-total">--</strong></div>
                        <div><span>Estimated route time</span><strong id="gnp-ete">--</strong></div>
                    </div>

                    <button class="gnp-main-button" data-goto="plan">Open Flight Plan</button>
                </section>

                <section id="gnp-map-section" class="gnp-section" hidden>
                    <div id="gnp-map"></div>
                    <div class="gnp-map-controls">
                        <button id="gnp-follow">FOLLOW: ON</button>
                        <span>Klik op de kaart om een waypoint toe te voegen.</span>
                    </div>
                </section>

                <section id="gnp-plan" class="gnp-section" hidden>
                    <div class="gnp-plan-heading">
                        <strong>Flight Plan</strong>
                        <button id="gnp-add-waypoint">+ Add waypoint</button>
                    </div>

                    <div id="gnp-waypoint-list"></div>

                    <div class="gnp-info">
                        <div><span>Waypoints</span><strong id="gnp-count">0</strong></div>
                        <div><span>Total distance</span><strong id="gnp-plan-distance">--</strong></div>
                        <div><span>Estimated time</span><strong id="gnp-plan-ete">--</strong></div>
                    </div>

                    <div class="gnp-plan-actions">
                        <button id="gnp-save-plan">Save plan</button>
                        <select id="gnp-saved-plans">
                            <option value="">Load saved plan...</option>
                        </select>
                        <button id="gnp-load-plan">Load</button>
                        <button id="gnp-clear-plan" class="gnp-danger">Clear</button>
                    </div>

                    <p class="gnp-hint">
                        Tip: klik op de kaart om waypoints toe te voegen.
                        Gebruik de pijltjes om de volgorde aan te passen.
                    </p>
                </section>
            </div>
        `;

        document.body.appendChild(panel);
        addStyles();
        makeDraggable();
        setupEvents();
        updateSavedPlans();
        renderWaypoints();
    }

    function addStyles() {
        const style = document.createElement('style');

        style.textContent = `
            #gnp-panel {
                position: fixed;
                top: 90px;
                right: 25px;
                width: 390px;
                height: 560px;
                min-width: 310px;
                min-height: 250px;
                resize: both;
                overflow: hidden;
                z-index: 999999;
                background: #111923;
                color: #e8edf4;
                border: 1px solid #34465a;
                border-radius: 10px;
                box-shadow: 0 8px 30px #0008;
                font-family: Arial, sans-serif;
                font-size: 13px;
                display: flex;
                flex-direction: column;
            }

            #gnp-header {
                height: 42px;
                min-height: 42px;
                background: #1b2938;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 12px;
                cursor: move;
                border-bottom: 1px solid #34465a;
            }

            .gnp-title {
                font-weight: bold;
                font-size: 14px;
            }

            .gnp-title span {
                color: #8497aa;
                font-size: 11px;
                margin-left: 5px;
            }

            .gnp-header-buttons {
                display: flex;
                gap: 5px;
            }

            #gnp-panel button,
            #gnp-panel select {
                background: #26384b;
                color: #edf3f8;
                border: 1px solid #40566d;
                border-radius: 5px;
                padding: 6px 9px;
                cursor: pointer;
                font-size: 12px;
            }

            #gnp-panel button:hover {
                background: #36516c;
            }

            #gnp-header button {
                padding: 2px 8px;
                font-size: 17px;
            }

            #gnp-content {
                padding: 10px;
                overflow: auto;
                flex: 1;
            }

            .gnp-tabs {
                display: flex;
                gap: 5px;
                margin-bottom: 12px;
            }

            .gnp-tab {
                flex: 1;
            }

            .gnp-tab.active {
                background: #1769aa !important;
                border-color: #398bd0 !important;
            }

            .gnp-section[hidden] {
                display: none !important;
            }

            .gnp-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 9px;
            }

            .gnp-card {
                background: #1b2938;
                border: 1px solid #304255;
                border-radius: 7px;
                padding: 12px;
            }

            .gnp-card label {
                display: block;
                color: #9aabba;
                margin-bottom: 8px;
            }

            .gnp-card strong {
                font-size: 21px;
            }

            .gnp-card small {
                color: #9aabba;
                margin-left: 3px;
            }

            .gnp-info {
                background: #1b2938;
                border-radius: 7px;
                padding: 10px;
                margin-top: 12px;
            }

            .gnp-info div {
                display: flex;
                justify-content: space-between;
                padding: 5px 0;
                border-bottom: 1px solid #304255;
                gap: 10px;
            }

            .gnp-info div:last-child {
                border-bottom: none;
            }

            .gnp-info span {
                color: #a6b5c4;
            }

            .gnp-info strong {
                text-align: right;
            }

            .gnp-main-button {
                width: 100%;
                margin-top: 12px;
                padding: 10px !important;
                background: #1769aa !important;
            }

            #gnp-map {
                width: 100%;
                height: 350px;
                min-height: 200px;
                border-radius: 7px;
                background: #26384b;
            }

            .gnp-map-controls {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 9px;
                color: #9aabba;
                font-size: 11px;
            }

            .gnp-plan-heading {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }

            .gnp-plan-heading strong {
                font-size: 15px;
            }

            .gnp-waypoint {
                display: flex;
                align-items: center;
                gap: 5px;
                background: #1b2938;
                border: 1px solid #304255;
                border-radius: 6px;
                padding: 7px;
                margin-bottom: 6px;
            }

            .gnp-waypoint.active {
                border-color: #3296df;
                background: #1b354b;
            }

            .gnp-waypoint-name {
                flex: 1;
                min-width: 0;
                cursor: pointer;
            }

            .gnp-waypoint-name strong {
                display: block;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .gnp-waypoint-name small {
                color: #9aabba;
                font-size: 10px;
            }

            .gnp-waypoint button {
                padding: 5px 7px !important;
            }

            .gnp-plan-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 12px;
            }

            .gnp-plan-actions select {
                flex: 1;
                min-width: 120px;
            }

            .gnp-danger {
                border-color: #944b4b !important;
                color: #ffaaaa !important;
            }

            .gnp-hint {
                color: #91a2b3;
                font-size: 11px;
                line-height: 1.5;
                margin-top: 12px;
            }

            .gnp-aircraft-icon {
                font-size: 25px;
                text-align: center;
                line-height: 28px;
                filter: drop-shadow(0 1px 2px #000);
            }
        `;

        document.head.appendChild(style);
    }

    function makeDraggable() {
        const header = document.getElementById('gnp-header');
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        header.addEventListener('mousedown', event => {
            if (event.target.closest('button')) return;

            dragging = true;
            const rect = panel.getBoundingClientRect();
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
        });

        document.addEventListener('mousemove', event => {
            if (!dragging) return;

            panel.style.left = `${event.clientX - offsetX}px`;
            panel.style.top = `${event.clientY - offsetY}px`;
            panel.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            dragging = false;
        });
    }

    function setupEvents() {
        document.getElementById('gnp-minimize').onclick = () => {
            minimized = !minimized;
            document.getElementById('gnp-content').style.display =
                minimized ? 'none' : 'block';
            panel.style.height = minimized ? '42px' : '560px';
            document.getElementById('gnp-minimize').textContent =
                minimized ? '+' : '−';
        };

        document.getElementById('gnp-close').onclick = () => {
            panel.remove();
        };

        document.querySelectorAll('.gnp-tab').forEach(button => {
            button.addEventListener('click', () => showTab(button.dataset.tab));
        });

        document.querySelectorAll('[data-goto]').forEach(button => {
            button.addEventListener('click', () => showTab(button.dataset.goto));
        });

        document.getElementById('gnp-follow').onclick = () => {
            followAircraft = !followAircraft;
            updateFollowButton();
        };

        document.getElementById('gnp-add-waypoint').onclick = addWaypointManually;
        document.getElementById('gnp-save-plan').onclick = saveFlightPlan;
        document.getElementById('gnp-load-plan').onclick = loadFlightPlan;
        document.getElementById('gnp-clear-plan').onclick = clearFlightPlan;

        document.getElementById('gnp-waypoint-list').addEventListener('click', event => {
            const button = event.target.closest('[data-action]');
            if (!button) return;

            const index = Number(button.dataset.index);
            const action = button.dataset.action;

            if (action === 'up' && index > 0) {
                [waypoints[index - 1], waypoints[index]] =
                    [waypoints[index], waypoints[index - 1]];

                if (activeIndex === index) activeIndex--;
                else if (activeIndex === index - 1) activeIndex++;

                saveWaypoints();
                renderWaypoints();
            }

            if (action === 'down' && index < waypoints.length - 1) {
                [waypoints[index + 1], waypoints[index]] =
                    [waypoints[index], waypoints[index + 1]];

                if (activeIndex === index) activeIndex++;
                else if (activeIndex === index + 1) activeIndex--;

                saveWaypoints();
                renderWaypoints();
            }

            if (action === 'delete') {
                waypoints.splice(index, 1);

                if (activeIndex === index) {
                    activeIndex = waypoints.length ? Math.min(index, waypoints.length - 1) : -1;
                } else if (activeIndex > index) {
                    activeIndex--;
                }

                saveWaypoints();
                renderWaypoints();
                refreshMap();
            }

            if (action === 'select') {
                activeIndex = index;
                renderWaypoints();
                refreshMap();
            }
        });
    }

    function showTab(tab) {
        document.querySelectorAll('.gnp-section').forEach(section => {
            section.hidden = true;
        });

        const section = document.getElementById(
            tab === 'map' ? 'gnp-map-section' :
            tab === 'plan' ? 'gnp-plan' : 'gnp-dashboard'
        );

        section.hidden = false;

        document.querySelectorAll('.gnp-tab').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tab);
        });

        if (tab === 'map') {
            initializeMap();
            setTimeout(() => {
                if (map) map.invalidateSize();
                refreshMap();
            }, 100);
        }
    }

    function initializeMap() {
        if (map || !window.L) return;

        const flight = getFlightData();
        const start = flight ? [flight.lat, flight.lon] : [50.8, 4.9];

        map = L.map('gnp-map').setView(start, 7);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        const aircraftIcon = L.divIcon({
            className: 'gnp-aircraft-icon',
            html: '✈',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        aircraftMarker = L.marker(start, {
            icon: aircraftIcon,
            interactive: false
        }).addTo(map);

        routeLine = L.polyline([], {
            color: '#36a2eb',
            weight: 3,
            dashArray: '7, 7'
        }).addTo(map);

        map.on('click', event => {
            const name = prompt('Naam van het waypoint:', `WP${waypoints.length + 1}`);
            if (!name || !name.trim()) return;

            addWaypoint(name.trim(), event.latlng.lat, event.latlng.lng);
        });

        refreshMap();
    }

    function addWaypointManually() {
        const name = prompt('Naam van het waypoint:');
        if (!name || !name.trim()) return;

        const lat = Number(prompt('Latitude:'));
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
            alert('Ongeldige latitude.');
            return;
        }

        const lon = Number(prompt('Longitude:'));
        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
            alert('Ongeldige longitude.');
            return;
        }

        addWaypoint(name.trim(), lat, lon);
    }

    function addWaypoint(name, lat, lon) {
        waypoints.push({
            name,
            lat: Number(lat),
            lon: Number(lon)
        });

        if (activeIndex === -1) activeIndex = 0;

        saveWaypoints();
        renderWaypoints();
        refreshMap();
    }

    function saveWaypoints() {
        saveData(WAYPOINTS_KEY, waypoints);
    }

    function renderWaypoints() {
        const list = document.getElementById('gnp-waypoint-list');
        if (!list) return;

        list.innerHTML = '';

        if (!waypoints.length) {
            list.innerHTML = '<p class="gnp-hint">Nog geen waypoints. Voeg er één toe via de kaart.</p>';
        }

        waypoints.forEach((waypoint, index) => {
            const item = document.createElement('div');
            item.className = 'gnp-waypoint' +
                (index === activeIndex ? ' active' : '');

            const name = document.createElement('div');
            name.className = 'gnp-waypoint-name';
            name.innerHTML = `
                <strong></strong>
                <small>${waypoint.lat.toFixed(4)}, ${waypoint.lon.toFixed(4)}</small>
            `;
            name.querySelector('strong').textContent =
                `${index + 1}. ${waypoint.name}`;
            name.dataset.action = 'select';
            name.dataset.index = index;

            item.appendChild(name);

            [
                ['up', '↑'],
                ['down', '↓'],
                ['delete', '×']
            ].forEach(([action, symbol]) => {
                const button = document.createElement('button');
                button.textContent = symbol;
                button.dataset.action = action;
                button.dataset.index = index;
                button.title = action;
                if (action === 'delete') button.className = 'gnp-danger';
                item.appendChild(button);
            });

            list.appendChild(item);
        });

        updatePlanStats();
    }

    function getRouteDistance(flight) {
        if (!waypoints.length) return 0;

        let total = 0;
        let previous = flight
            ? { lat: flight.lat, lon: flight.lon }
            : null;

        waypoints.forEach(waypoint => {
            if (previous) {
                total += distanceNM(
                    previous.lat, previous.lon,
                    waypoint.lat, waypoint.lon
                );
            }

            previous = waypoint;
        });

        return total;
    }

    function getRemainingDistance(flight) {
        if (!flight || activeIndex < 0 || activeIndex >= waypoints.length) return 0;

        let total = distanceNM(
            flight.lat, flight.lon,
            waypoints[activeIndex].lat,
            waypoints[activeIndex].lon
        );

        for (let i = activeIndex; i < waypoints.length - 1; i++) {
            total += distanceNM(
                waypoints[i].lat, waypoints[i].lon,
                waypoints[i + 1].lat, waypoints[i + 1].lon
            );
        }

        return total;
    }

    function updatePlanStats() {
        const flight = getFlightData();
        const total = getRouteDistance(flight);
        const remaining = getRemainingDistance(flight);

        document.getElementById('gnp-count').textContent = waypoints.length;
        document.getElementById('gnp-plan-distance').textContent =
            formatDistance(total);
        document.getElementById('gnp-plan-ete').textContent =
            formatETE(remaining, flight?.speed || 0);
    }

    function updateSavedPlans() {
        const select = document.getElementById('gnp-saved-plans');
        if (!select) return;

        select.innerHTML = '<option value="">Load saved plan...</option>';

        Object.keys(flightPlans).sort().forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
    }

    function saveFlightPlan() {
        if (!waypoints.length) {
            alert('Er zijn geen waypoints om op te slaan.');
            return;
        }

        const name = prompt('Naam voor dit flight plan:');
        if (!name || !name.trim()) return;

        flightPlans[name.trim()] = waypoints.map(point => ({ ...point }));
        saveData(PLANS_KEY, flightPlans);
        updateSavedPlans();
        alert('Flight plan opgeslagen.');
    }

    function loadFlightPlan() {
        const name = document.getElementById('gnp-saved-plans').value;
        if (!name || !flightPlans[name]) {
            alert('Selecteer eerst een opgeslagen flight plan.');
            return;
        }

        waypoints = flightPlans[name].map(point => ({ ...point }));
        activeIndex = waypoints.length ? 0 : -1;

        saveWaypoints();
        renderWaypoints();
        refreshMap();
    }

    function clearFlightPlan() {
        if (!confirm('Wil je alle waypoints uit dit flight plan verwijderen?')) return;

        waypoints = [];
        activeIndex = -1;

        saveWaypoints();
        renderWaypoints();
        refreshMap();
    }

    function updateFollowButton() {
        const button = document.getElementById('gnp-follow');
        if (button) button.textContent = `FOLLOW: ${followAircraft ? 'ON' : 'OFF'}`;
    }

    function refreshMap() {
        if (!map || !aircraftMarker || !routeLine) return;

        const flight = getFlightData();
        if (!flight) return;

        aircraftMarker.setLatLng([flight.lat, flight.lon]);

        const points = [[flight.lat, flight.lon]];

        waypoints.forEach(waypoint => {
            points.push([waypoint.lat, waypoint.lon]);
        });

        routeLine.setLatLngs(points);

        waypointMarkers.forEach(marker => map.removeLayer(marker));
        waypointMarkers = [];

        waypoints.forEach((waypoint, index) => {
            const marker = L.marker([waypoint.lat, waypoint.lon])
                .bindTooltip(`${index + 1}. ${waypoint.name}`)
                .addTo(map);

            marker.on('click', () => {
                activeIndex = index;
                renderWaypoints();
                refreshMap();
            });

            waypointMarkers.push(marker);
        });

        if (followAircraft) {
            map.panTo([flight.lat, flight.lon]);
        }
    }

    function updateNavigation() {
        if (!panel || !document.body.contains(panel)) return;

        const flight = getFlightData();
        if (!flight) return;

        document.getElementById('gnp-heading').textContent =
            flight.heading.toFixed(0);
        document.getElementById('gnp-altitude').textContent =
            Math.round(flight.altitude).toLocaleString('en-US');
        document.getElementById('gnp-speed').textContent =
            flight.speed.toFixed(0);

        if (activeIndex >= 0 && activeIndex < waypoints.length) {
            const target = waypoints[activeIndex];

            const distance = distanceNM(
                flight.lat, flight.lon,
                target.lat, target.lon
            );

            const bearing = bearingTo(
                flight.lat, flight.lon,
                target.lat, target.lon
            );

            document.getElementById('gnp-next-name').textContent = target.name;
            document.getElementById('gnp-next-distance').textContent =
                formatDistance(distance);
            document.getElementById('gnp-distance').textContent =
                formatDistance(distance);
            document.getElementById('gnp-bearing').textContent =
                `${bearing.toFixed(0)}°`;

            if (distance <= AUTO_ADVANCE_DISTANCE) {
                if (activeIndex < waypoints.length - 1) {
                    activeIndex++;
                    renderWaypoints();
                } else {
                    activeIndex = -1;
                    renderWaypoints();
                }
            }
        } else {
            document.getElementById('gnp-next-name').textContent = 'Complete';
            document.getElementById('gnp-next-distance').textContent = '--';
            document.getElementById('gnp-distance').textContent = '--';
            document.getElementById('gnp-bearing').textContent = '--';
        }

        const total = getRouteDistance(flight);
        const remaining = getRemainingDistance(flight);

        document.getElementById('gnp-total').textContent =
            formatDistance(total);
        document.getElementById('gnp-ete').textContent =
            formatETE(remaining, flight.speed);

        updatePlanStats();

        if (map) refreshMap();
    }

    function waitForGeoFS() {
        if (!window.geofs?.animation?.values ||
            !window.geofs?.aircraft?.instance) {
            setTimeout(waitForGeoFS, 1000);
            return;
        }

        createPanel();
        updateFollowButton();
        updateNavigation();

        setInterval(updateNavigation, 1000);
    }

    waitForGeoFS();
})();
