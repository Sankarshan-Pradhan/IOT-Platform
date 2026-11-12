# 📊 Frontend Web Dashboard & Edge Management UI

[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6.4-646CFF?style=flat&logo=vite)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v3.4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com)
[![Chart.js](https://img.shields.io/badge/Chart.js-4.4-FF6384?style=flat&logo=chartdotjs)](https://www.chartjs.org)

An enterprise-grade, responsive IoT edge management portal and real-time telemetry dashboard. Built to monitor ESP32 sensor nodes, manage multi-tenant workspaces, configure MQTT telemetry channels, and track real-time environmental metrics.

---

## 📑 Table of Contents

- [Key Features](#key-features)
  - [1. Full-Page Login & Registration Gate](#1-full-page-login--registration-gate)
  - [2. Navigation Hierarchy (Workspaces → Dashboard → Clients → Groups)](#2-navigation-hierarchy-workspaces--dashboard--clients--groups)
  - [3. Multi-Tenant Workspaces & Superuser Admin Directory](#3-multi-tenant-workspaces--superuser-admin-directory)
  - [4. Live Dashboard & 5-Second Real-Time Engine](#4-live-dashboard--5-second-real-time-engine)
  - [5. Clients & Edge Device Management](#5-clients--edge-device-management)
  - [6. Groups & Telemetry Channels](#6-groups--telemetry-channels)
  - [7. Full Deletion Lifecycle (Workspaces, Channels, Devices)](#7-full-deletion-lifecycle-workspaces-channels-devices)
  - [8. First-Time User Onboarding Experience](#8-first-time-user-onboarding-experience)
  - [9. Clean Enterprise Light Theme](#9-clean-enterprise-light-theme)
  - [10. Guardrails & Dynamic Threshold Alarms](#10-guardrails--dynamic-threshold-alarms)
  - [11. JWT Authentication & Role-Based Access Control](#11-jwt-authentication--role-based-access-control)
  - [12. Downlink Device Control & Actuation Panel](#12-downlink-device-control--actuation-panel)
  - [13. TimescaleDB Continuous Aggregates & Data Export](#13-timescaledb-continuous-aggregates--data-export)
  - [14. Outbound Alert Notification Channels](#14-outbound-alert-notification-channels)
  - [15. Zero-Latency Real-Time Streaming (SSE)](#15-zero-latency-real-time-streaming-sse)
  - [16. Production Multi-Stage Containerization (Nginx)](#16-production-multi-stage-containerization-nginx)
  - [17. Telemetry Storage Retention Meter & Pruning Trigger](#17-telemetry-storage-retention-meter--pruning-trigger)
- [Project Directory Layout](#project-directory-layout)
- [Getting Started](#getting-started)
- [Configuration & API Proxy](#configuration--api-proxy)

---

## 🌟 Key Features

### 1. Full-Page Login & Registration Gate
- **Unauthenticated Access Boundary**: Visiting `http://localhost:3000` presents a dedicated full-page authentication portal (`AuthScreen.jsx`).
- **Sign In Tab**: Supports authentication via either **User ID / Username** or **Email Address** alongside user password. Includes quick-fill buttons for demo credentials.
- **New User Registration Tab**: Allows first-time operators and developers to register by providing:
  - **Full Name** (e.g. `Jane Doe`)
  - **Mobile Number** (e.g. `+1-555-0199`)
  - **Email Address** (e.g. `jane@example.com`)
  - **User ID / Username** (unique identifier)
  - **Password** and **Confirm Password**
- **Automated Workspace Provisioning**: On registration, the backend automatically seeds an initial personal workspace (e.g., `"<Name>'s Workspace"`) and logs the user straight into their dashboard.

---

### 2. Navigation Hierarchy (Workspaces → Dashboard → Clients → Groups)
The left navigation sidebar presents a clean, logical management flow matching enterprise IoT standards:
1. **🏢 Workspaces & Multi-Tenancy (Top)**: Switch, create, and manage isolated organizational workspaces.
2. **📊 Live Dashboard**: Live telemetry cockpits, temperature/humidity gauges, and real-time Chart.js trends.
3. **📟 Clients & Edge Devices**: Sensor node inventory, real-time status badges, and device deletion controls.
4. **📡 Groups & Channels**: Topic routing streams and telemetry groups.

---

### 3. Multi-Tenant Workspaces & Superuser Admin Directory
- **Regular User Scoping (Creator / Operator Mode)**:
  - Regular users only see and manage workspaces they personally created.
  - Full operational controls: `+ Create New Workspace`, `+ Register New Device`, `+ Add Channel`, `Clear All Devices`, and delete actions on their own resources.
- **Admin Superuser View (Supervisory Monitoring Mode)**:
  - When the platform administrator (`admin`) logs in, their primary responsibility is **pure system-wide oversight and monitoring**.
  - **Zero Mutation Clutter**: Unnecessary creator/operator controls (`Create Workspace`, `Register Device`, `Add Channel`, `Clear All Devices`, delete buttons, and hardware onboarding tutorials) are cleanly removed from the admin UI.
  - **Supervisory Metrics Strip**: Real-time counter of Total Registered Users, Total Workspaces Monitored, and Active Workspace.
  - **Owner Attribution**: Workspace cards display creator badges (`Created by: <Name> • <Email>`).
  - **Owner Filter**: Dropdown allowing administrators to isolate workspaces by specific user accounts.
  - **Registered Users Directory**: Dedicated tab detailing all registered accounts, contact info, roles, and workspace counts.

---

### 4. Live Dashboard & 5-Second Real-Time Engine
- **Synchronized 5s Polling Engine**: Live countdown ticker (`5s` → `1s`) with pause/resume controls and manual refresh.
- **Dynamic Metric Cards**:
  - **Temperature Card**: Instant **°C / °F unit toggle**, window min/max bounds, and delta trend indicators.
  - **Humidity Card**: Relative humidity percentage (% RH) and window bounds.
  - **Signal Health Card**: ESP32 WiFi RSSI strength (dBm) with visual reception indicators and last seen timestamp.
- **Interactive Dual Y-Axis Historical Chart**: Powered by Chart.js with smooth curves, dual Y-axes for Temperature and Humidity, and window range selectors (10, 20, 50, 100 points).
- **Recent Telemetry Table**: Tabular view of incoming packets with precise timestamps and sensor values.

---

### 5. Clients & Edge Device Management
- Sensor node registry with `online` / `offline` indicators.
- Quick navigation from device cards directly to the Live Dashboard.
- Modal to register new hardware nodes (`AddDeviceModal.jsx`).

---

### 6. Groups & Telemetry Channels
- Logical telemetry streams and MQTT topic groups (e.g. `devices/+/telemetry`).
- Streamlined card view displaying Channel Name, Description, Channel ID, and MQTT topic routes without raw filter clutter.
- Add Channel modal with auto-generated channel slugs.

---

### 7. Full Deletion Lifecycle (Workspaces, Channels, Devices)
- **Device Deletion**: Individual trash-can delete buttons on sensor cards with browser confirmation and cache cleanup.
- **Workspace Deletion**: Single-click workspace deletion with cascading deletion of its devices and channels.
- **Channel Deletion**: Dedicated delete action per channel card.
- **Clear All Devices**: Single-click purge button across the active workspace.

---

### 8. First-Time User Onboarding Experience
- Clean, welcoming onboarding banner (`OnboardingGuide.jsx`) guiding new users on connecting hardware.
- Zero fake/mock readings: when no hardware is transmitting, dashboard displays clear empty state cards instead of artificial dummy data.

---

### 9. Clean Enterprise Light Theme
- Standardized on an ultra-clean, high-contrast light theme engineered for crisp readability in control room and dashboard environments without UI clutter.

---

### 10. Guardrails & Dynamic Threshold Alarms
- **Live Header Badge**: Displays current open alarms count with an animated pulsing indicator when active.
- **Guardrails Modal (`GuardrailsModal.jsx`)**:
  - **Triggered Alarms Tab**: Real-time view of `OPEN`, `ACKNOWLEDGED`, and `RESOLVED` alarms. Supports Acknowledge, Resolve, and Delete actions.
  - **Threshold Rules Tab**: Dynamic rule configuration enabling operators to add new threshold policies (field, operator `>`, `<`, `>=`, `<=`, threshold value, severity) without writing hardcoded `if` statements.

---

### 11. JWT Authentication, Security Hardening & RBAC
- **Secure Token Session Storage**: Authenticates against `/api/v1/auth/login` or `/api/v1/auth/register`, storing an HS256 JWT in `localStorage`.
- **Hardcoded Secret Elimination**: Insecure static admin fallback keys have been completely eliminated from the client bundle. All requests are authenticated strictly via signed user JWT sessions.
- **Automatic Header Injection**: `api.js` attaches `Authorization: Bearer <jwt_token>` to all protected endpoints (`/devices`, `/tenants`, `/channels`, `/rules`, `/alarms`, and telemetry queries).
- **Multi-Tenant Workspace Isolation**: Regular users exclusively view and control resources in workspaces they own; cross-tenant operations are blocked by the backend.
- **Live User Pill**: Top header displays caller's full name, `@username` badge, role pill (`ADMIN` vs `USER`), and a one-click Sign Out button.

---

### 12. Downlink Device Control & Actuation Panel
Integrated in [`DeviceControlPanel.jsx`](src/components/DeviceControlPanel.jsx):
- **AC/DC Relay Control**: Live toggle button switching hardware relays (`set_relay`).
- **Status LED Beacon**: Visual hardware beacon toggle (`toggle_led`).
- **Dynamic Sampling Rate**: Selectable sampling rate buttons (1s, 2s, 5s, 10s) updating ESP32 transmission interval (`set_interval`).
- **Remote Hardware Reboot**: Modal with confirmation prompt sending remote restart command (`reboot`).
- **Audit Table**: Live table displaying the recent 10 dispatched commands with real-time status pills (`PENDING` vs `ACKNOWLEDGED`) and hardware responses.

---

### 13. TimescaleDB Continuous Aggregates & Data Export
Integrated in [`TelemetryChart.jsx`](src/components/TelemetryChart.jsx):
- **Continuous Aggregate Rollups**: Selector pills for `Raw`, `1m`, `5m`, and `1h` buckets, allowing operators to downsample high-density telemetry instantly.
- **Direct Data Export**: Quick-download buttons for **CSV** and **JSON** streaming historical datasets with proper `Content-Disposition` download headers.

---

### 14. Outbound Alert Notification Channels
Integrated in [`GuardrailsModal.jsx`](src/components/GuardrailsModal.jsx):
- **Alert Channels Tab**: Configure outbound webhooks for **Discord**, **Slack**, and custom **HTTP POST Webhooks**.
- **Automated Dispatch**: Triggers external webhook notifications whenever a `CRITICAL` guardrail threshold alarm fires.
- **Test Ping**: Dedicated "Test Ping" button on each channel card verifying webhook reachability in real-time.

---

### 15. Zero-Latency Real-Time Streaming (SSE) & Device Status
- **Authenticated EventSource**: Establishes an SSE connection to `/api/v1/telemetry/stream?token=${encodeURIComponent(token)}`, ensuring live streams are authenticated and secure.
- **Zero-Latency Push**: Telemetry metric cards, historical charts, and alarm badges update with 0ms delay upon packet ingestion, eliminating polling latency.
- **Dynamic Device Online/Offline Badges**: The client listens to the `device_status` SSE event, automatically updating sensor badges between active green and offline gray when devices connect, disconnect (via MQTT LWT), or time out.
- **Automatic Fallback**: Gracefully falls back to standard 5s polling if SSE is temporarily disconnected or unsupported.

---

### 16. Production Multi-Stage Containerization (Nginx)
- **Dockerfile:** [`frontend/Dockerfile`](Dockerfile) builds production assets in Node 20 and serves them using lightweight `nginx:alpine`.
- **Nginx Reverse Proxy:** [`frontend/nginx.conf`](nginx.conf) proxies `/api/` calls to the Go backend and configures zero-buffering (`proxy_buffering off;`) for Server-Sent Events.

---

### 17. Telemetry Storage Retention Meter & Pruning Trigger
Integrated in [`Header.jsx`](src/components/Header.jsx):
- **Live Capacity Meter**: Displays current platform storage usage against the global 10,000-record retention cap (`Storage: X / 10,000 (Y%)`).
- **Dynamic Color Warnings**:
  - Green / Gray: Safe utilization (< 80%).
  - Amber: High utilization (>= 80%).
  - Red: Approaching retention cap (>= 95%).
- **Manual "Prune Now" Button**: Operators can click the prune action to immediately trigger `POST /api/v1/telemetry/prune`, purging older records without waiting for the 30-second background worker.

---

## 📁 Project Directory Layout

```
frontend/
├── src/
│   ├── components/
│   │   ├── AuthScreen.jsx         # Full-page Login & Registration gate portal (Initial Landing)
│   │   ├── AdminDashboard.jsx     # Dedicated Admin Page (Supervisory Monitoring & User Oversight)
│   │   ├── UserDashboard.jsx      # Dedicated User Page (Personal Workspaces & Device Operations)
│   │   ├── Sidebar.jsx            # Left navigation cards (Workspaces -> Dashboard -> Clients -> Groups)
│   │   ├── Header.jsx             # Health status badge, countdown timer, unit, guardrail alarm badge & user profile / sign out
│   │   ├── DeviceSelector.jsx     # Device switcher with delete actions & empty states
│   │   ├── MetricCard.jsx         # Temperature, Humidity, and RSSI health cards
│   │   ├── DeviceControlPanel.jsx # Two-way relay control, LED, reboot, token & OTA
│   │   ├── TelemetryChart.jsx     # Dual Y-axis historical line chart with downsampling & export
│   │   ├── RecentTable.jsx        # Live tabular packet viewer
│   │   ├── TenantsView.jsx        # Multi-tenant workspaces with admin directory & delete support
│   │   ├── ChannelsView.jsx       # Channels & MQTT topic routing with delete support
│   │   ├── DevicesView.jsx        # Clients registry with delete/clear buttons
│   │   ├── OnboardingGuide.jsx    # First-time user onboarding banner & empty states
│   │   ├── GuardrailsModal.jsx    # Guardrail rules management and live alarms resolution modal
│   │   ├── AddDeviceModal.jsx     # Quick device registration modal
│   │   ├── AddTenantModal.jsx     # Add workspace modal
│   │   └── AddChannelModal.jsx    # Add channel modal
│   ├── api.js                     # REST API client with JWT Bearer & API key auth headers
│   ├── App.jsx                    # Core router gating AuthScreen, AdminDashboard & UserDashboard
│   ├── index.css                  # Tailwind directives & theme styles
│   └── main.jsx                   # React root entry point
├── public/                        # Static assets & icons
├── vite.config.js                 # Vite bundler config with /api proxy
├── tailwind.config.js             # Tailwind CSS configuration
└── package.json                   # Dependencies & scripts
```

---

## ⚡ Getting Started

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start the Development Server
```bash
cd frontend
npm run dev
```
Open **`http://localhost:3000`** in your browser.

### 3. Build for Production
```bash
cd frontend
npm run build
npm run preview
```
The optimized bundle is written to `dist/`.

---

## ⚙️ Configuration & API Proxy

By default, the Vite dev server (`vite.config.js`) proxies API requests to the Go backend on `localhost:8080`:
```javascript
server: {
  port: 3000,
  proxy: {
    '/api': 'http://localhost:8080',
    '/health': 'http://localhost:8080',
  },
}
```

If your backend is hosted on a remote server or different port, create a `.env` file in `frontend/`:
```env
VITE_API_URL=http://192.168.1.100:8080
```
