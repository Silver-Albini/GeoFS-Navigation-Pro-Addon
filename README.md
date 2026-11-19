# GeoFS Navigation Pro

**A powerful navigation and flight planning addon for GeoFS.**

GeoFS Navigation Pro is a Tampermonkey userscript designed to make flying in [GeoFS](https://www.geo-fs.com/) easier and more enjoyable. It adds a navigation panel with useful flight information, an interactive map and a built-in flight plan manager.

Whether you're planning a short flight or a longer journey, Navigation Pro gives you the tools to keep track of your aircraft and stay on course.

## Features

### Flight Dashboard

Keep track of the most important information during your flight:

- Current heading.
- Current altitude.
- Ground speed.
- Distance to your next waypoint.
- Bearing to your next waypoint.
- Total route distance.
- Estimated time en route (ETE).

### Interactive Map

Get a clear overview of your flight with the built-in interactive map.

- Live aircraft position.
- OpenStreetMap integration.
- Markers for all your waypoints.
- Full flight route visualization.
- Follow mode to keep your aircraft centred on the map.
- Click anywhere on the map to add a new waypoint.

### Flight Plan Manager

Plan and manage your flights without having to leave GeoFS.

- Create flight plans with multiple waypoints.
- Add waypoints manually using coordinates.
- Easily change the order of your waypoints.
- Select or remove individual waypoints.
- Automatically switch to the next waypoint when you're within 1 NM.
- Calculate total route distance and estimated flight time.
- Save your flight plans and load them whenever you need them.

### Customizable Interface

The navigation panel is designed to fit your preferences.

- Move the window anywhere on your screen.
- Resize the panel to your liking.
- Minimize or close it whenever you want.
- Switch between three different tabs:
  - Dashboard
  - Map
  - Flight Plan

## Installation

Getting started is simple:

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the Tampermonkey dashboard.
3. Create a new userscript.
4. Open `GeoFS-Navigation-Pro.user.js` and copy its contents.
5. Paste the code into the Tampermonkey editor.
6. Save the script.
7. Open [GeoFS](https://www.geo-fs.com/) or refresh the page if it's already open.

Once GeoFS has finished loading, the Navigation Pro panel should appear on your screen.

## Usage

**Dashboard:** Check your current flight information, including altitude, speed, heading and waypoint data.

**Map:** Follow your aircraft in real time, view your route and add new waypoints by clicking directly on the map.

**Flight Plan:** Create and organize your routes, change waypoint order, and save or load your flight plans.

Your waypoints and saved flight plans are stored locally in your browser, so they're available the next time you use the addon.

## Dependencies

GeoFS Navigation Pro uses the following tools and services:

- [GeoFS](https://www.geo-fs.com/)
- [Tampermonkey](https://www.tampermonkey.net/)
- [Leaflet.js 1.9.4](https://leafletjs.com/)
- [OpenStreetMap](https://www.openstreetmap.org/)

## Current Version

**Version:** 0.5.0

GeoFS Navigation Pro is still under development. New features, improvements and bug fixes may be introduced in future updates.

## Disclaimer

GeoFS Navigation Pro is an independent community-made addon. It is not officially affiliated with, sponsored by or endorsed by GeoFS.

All navigation calculations are estimates and should only be used as supplementary flight information.

## License

Released under the MIT License.

---

<div align="center">
  <sub>GeoFS Navigation Pro &bull; Created and maintained by <a href="https://github.com/Silver-Albini">Silver-Albini</a></sub><br>
  <sub>Not affiliated with GeoFS. Licensed under the MIT License.</sub>
</div>
