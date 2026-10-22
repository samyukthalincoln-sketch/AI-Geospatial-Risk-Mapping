
import { useState, useEffect, useCallback } from "react";

import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Rectangle,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const API_URL = import.meta.env.DEV
  ? "http://127.0.0.1:5000"
  : "https://ai-geospatial-risk-api-v2.onrender.com";

const NAV_ITEMS = [
  "Overview",
  "Hazard Map",
  "Alerts",
  "Incident Reports",
  "Analytics",
  "Settings",
];

const EMPTY_FORM = {
  hazard: "Flood",
  location: "",
  severity: "HIGH",
  description: "",
  latitude: "",
  longitude: "",
};

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.alerts)) return data.alerts;
  if (Array.isArray(data?.incidents)) return data.incidents;
  if (Array.isArray(data?.warnings)) return data.warnings;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function getSeverity(item) {
  return String(
    item?.severity ??
      item?.risk_level ??
      item?.level ??
      item?.risk ??
      "MODERATE"
  ).toUpperCase();
}

function severityColor(severity) {
  const level = String(severity || "").toUpperCase();

  if (level === "CRITICAL") return "#ff4d5e";
  if (level === "HIGH") return "#ff8747";
  if (level === "MEDIUM" || level === "MODERATE") return "#f4c45e";
  if (level === "LOW") return "#42d6a0";

  return "#59baff";
}

function getPosition(item) {
  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lon ?? item.lng;

  if (
    lat == null ||
    lng == null ||
    lat === "" ||
    lng === ""
  ) {
    return null;
  }

  const latitude = Number(lat);
  const longitude = Number(lng);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return [latitude, longitude];
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || data.message || `HTTP ${response.status}`
    );
  }

  return data;
}

function StatusBadge({ status = "Pending" }) {
  const value = String(status);
  const className = value.toLowerCase().replace(/\s+/g, "-");

  return (
    <span className={`status-badge status-${className}`}>
      {value}
    </span>
  );
}


function HazardMap({ alerts, incidents, large = false }) {
  const locations = [
    ...alerts.map((item, index) => ({
      id: `alert-${item.id ?? index}`,
      name:
        item.location ||
        item.place ||
        item.title ||
        item.hazard ||
        "Alert",
      description:
        item.description ||
        item.hazard ||
        item.title ||
        "Alert record",
      severity: getSeverity(item),
      position: getPosition(item),
      type: "Alert",
      score: item.risk_score ?? item.score ?? null,
    })),

    ...incidents.map((item, index) => ({
      id: `incident-${item.id ?? index}`,
      name: item.location || "Unknown location",
      description:
        item.description || item.hazard || "Incident report",
      severity: getSeverity(item),
      position: getPosition(item),
      type: "Incident",
      score: null,
      status: item.status || "Pending",
    })),
  ].filter((item) => item.position !== null);

  return (
    <div className="map-wrapper">
      <div className="map-toolbar">
        <span>
          <i className="live-dot" />
          Geographic records
        </span>
        <span>{locations.length} mapped</span>
      </div>

      <MapContainer
        key={large ? "large-hazard-map" : "overview-hazard-map"}
        center={[16.3045, 80.4163]}
        zoom={12}
        scrollWheelZoom
        className={
          large ? "hazard-map hazard-map-large" : "hazard-map"
        }
      >
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />

        <TileLayer
          attribution="Labels &copy; Esri"
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        />

        {locations.map((item) => {
          const level = item.severity
            .toLowerCase()
            .replace(/\s+/g, "-");

          return (
            <CircleMarker
              key={item.id}
              center={item.position}
              radius={item.type === "Incident" ? 12 : 10}
              
pathOptions={{
  className: `hazard-pulse hazard-${level}`,
  color: severityColor(item.severity),
  fillColor: severityColor(item.severity),
  fillOpacity: 0.8,
  opacity: 1,
  weight: 2,
}}

              


            >
              <Popup>
                <strong>{item.name}</strong>
                <br />
                {item.description}
                <br />
                Type: {item.type}
                <br />
                Severity: {item.severity}

                {item.status && (
                  <>
                    <br />
                    Status: {item.status}
                  </>
                )}

                {item.score != null && (
                  <>
                    <br />
                    Risk score: {item.score}/100
                  </>
                )}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <p className="map-caption">
        {locations.length
          ? "Markers show records with valid coordinates."
          : "No records with coordinates are available. Reports can be saved without coordinates, but they will not appear on this map."}
      </p>
    </div>
  );
}


function App() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [alerts, setAlerts] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [warningMessage, setWarningMessage] = useState("");
  const [backendStatus, setBackendStatus] = useState("Checking...");
  const [weather, setWeather] = useState(null);
  const [weatherStatus, setWeatherStatus] = useState("Loading...");
  const [weatherUpdated, setWeatherUpdated] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [incidentPhoto, setIncidentPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshSeconds, setRefreshSeconds] = useState("30");

  const refreshData = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);

    try {
      await apiRequest(`${API_URL}/api/health`);
      setBackendStatus("Connected");

      const results = await Promise.allSettled([
        apiRequest(`${API_URL}/api/alerts`),
        apiRequest(`${API_URL}/api/incidents`),
        apiRequest(`${API_URL}/api/live-weather`),
        apiRequest(`${API_URL}/api/live-warnings`),
      ]);

      if (results[0].status === "fulfilled") {
        setAlerts(toArray(results[0].value));
      }

      if (results[1].status === "fulfilled") {
        setIncidents(toArray(results[1].value));
      }

      if (results[2].status === "fulfilled") {
        const data = results[2].value;

        if (data.status === "success") {
          const current =
            data.current_weather ??
            data.current ??
            data;

          setWeather(current);
          setWeatherStatus("Live");
          setWeatherUpdated(
            current.time || new Date().toLocaleString()
          );
        } else {
          setWeatherStatus("Unavailable");
        }
      } else {
        setWeatherStatus("Unavailable");
      }

      if (results[3].status === "fulfilled") {
        const data = results[3].value;
        const items = toArray(data.data ?? data.alerts ?? data);

        setWarnings(items);

        if (data.status === "error" || data.error) {
          setWarningMessage(
            data.message ||
              "Official warning service is unavailable."
          );
        } else if (items.length === 0) {
          setWarningMessage(
            "No official warning records were returned by the API."
          );
        } else {
          setWarningMessage("");
        }
      } else {
        setWarnings([]);
        setWarningMessage(
          "Official warning service is currently unavailable."
        );
      }

      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      setBackendStatus("Offline");
      setError(
        "Backend is unavailable. Start Flask locally or check the deployed API."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshData();

    if (!autoRefresh) return undefined;

    const timer = window.setInterval(
      () => refreshData(),
      Math.max(10, Number(refreshSeconds) || 30) * 1000
    );

    return () => window.clearInterval(timer);
  }, [refreshData, autoRefresh, refreshSeconds]);

  const updateField = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  
const submitIncident = async (event) => {
  event.preventDefault();
  setNotice("");
  setError("");

  if (!form.location.trim() || !form.description.trim()) {
    setError(
      "Please enter both the location and incident description."
    );
    return;
  }

  const hasLat = form.latitude.trim() !== "";
  const hasLng = form.longitude.trim() !== "";

  if (hasLat !== hasLng) {
    setError("Enter both coordinates or leave both blank.");
    return;
  }

  const payload = {
    hazard: form.hazard,
    location: form.location.trim(),
    severity: form.severity,
    description: form.description.trim(),
    latitude: "",
    longitude: "",
  };

  if (hasLat && hasLng) {
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setError("Please enter valid latitude and longitude.");
      return;
    }

    payload.latitude = String(latitude);
    payload.longitude = String(longitude);
  }

  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    formData.append(key, value);
  });

  if (incidentPhoto) {
    formData.append("photo", incidentPhoto);
  }

  setSubmitting(true);

  try {
    const data = await apiRequest(`${API_URL}/api/incidents`, {
      method: "POST",
      body: formData,
    });

    const id = data.incident?.id ?? data.id;

    setNotice(
      id != null
        ? `Incident report #${id} submitted successfully.`
        : "Incident report submitted successfully."
    );

    setForm(EMPTY_FORM);
    setIncidentPhoto(null);

    await refreshData();
    setActiveTab("Incident Reports");
  } catch (err) {
    setError(
      `${err.message}. Check the backend and incident API.`
    );
  } finally {
    setSubmitting(false);
  }
};


    

  const updateStatus = async (incident, status) => {
    setNotice("");
    setError("");

    try {
      await apiRequest(
        `${API_URL}/api/incidents/${incident.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );

      setNotice(
        `Incident #${incident.id} updated to ${status}.`
      );
      await refreshData();
    } catch (err) {
      setError(`Status update failed: ${err.message}`);
    }
  };

  const pendingCount = incidents.filter(
    (item) =>
      String(item.status || "Pending").toLowerCase() === "pending"
  ).length;

  const verifiedCount = incidents.filter(
    (item) => String(item.status || "").toLowerCase() === "verified"
  ).length;

  const resolvedCount = incidents.filter(
    (item) => String(item.status || "").toLowerCase() === "resolved"
  ).length;

  const criticalCount = incidents.filter(
    (item) =>
      getSeverity(item) === "CRITICAL" &&
      String(item.status || "Pending").toLowerCase() !== "resolved"
  ).length;

  const filteredIncidents = incidents.filter((item) => {
    const query = search.toLowerCase();

    const matchesSearch = [
      item.hazard,
      item.location,
      item.description,
      item.status,
      item.severity,
    ].some((value) =>
      String(value || "").toLowerCase().includes(query)
    );

    const status = String(item.status || "Pending").toLowerCase();

    return (
      matchesSearch &&
      (statusFilter === "All" ||
        status === statusFilter.toLowerCase())
    );
  });

  const currentWeather = weather || {};

  const temperature =
    currentWeather.temperature_2m ??
    currentWeather.temperature ??
    currentWeather.current_weather?.temperature;

  const precipitation =
    currentWeather.precipitation ??
    currentWeather.precipitation_mm;

  const windSpeed =
    currentWeather.wind_speed_10m ??
    currentWeather.windspeed;

  const humidity =
    currentWeather.relative_humidity_2m ??
    currentWeather.humidity;

  const renderIncidentForm = () => (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">FIELD OPERATIONS</p>
          <h2>Submit an incident report</h2>
          <p className="muted">
            Reports are saved for review. Submission does not dispatch
            emergency services.
          </p>
        </div>
        <span className="tag">FIELD REPORT</span>
      </div>

      <form className="incident-form" onSubmit={submitIncident}>
        <label>
          Hazard type *
          <select
            name="hazard"
            value={form.hazard}
            onChange={updateField}
            required
          >
            <option>Flood</option>
            <option>Fire</option>
            <option>Earthquake</option>
            <option>Heavy Rainfall</option>
            <option>Cyclone</option>
            <option>Landslide</option>
            <option>Heatwave</option>
            <option>Other</option>
          </select>
        </label>

        <label>
          Location / affected area *
          <input
            name="location"
            value={form.location}
            onChange={updateField}
            placeholder="e.g. Guntur, Andhra Pradesh"
            maxLength={200}
            required
          />
        </label>

        <label>
          Severity *
          <select
            name="severity"
            value={form.severity}
            onChange={updateField}
            required
          >
            <option value="LOW">Low</option>
            <option value="MODERATE">Moderate</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </label>

         <label>
          Incident description *
          <textarea
            name="description"
            value={form.description}
            onChange={updateField}
            placeholder="Describe what happened, when it started and any visible danger."
            maxLength={3000}
            rows={5}
            required
          />
        </label>

        <label>
          Incident photo (optional)
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) =>
              setIncidentPhoto(event.target.files?.[0] || null)
            }
          />
        </label>

        {incidentPhoto && (
          <p className="form-hint">
            Selected photo: {incidentPhoto.name}
          </p>
        )}

        <button
          type="button"
          className="primary-button"
          onClick={() => {
            if (!navigator.geolocation) {
              setError("GPS is not supported by this browser.");
              return;
            }

            navigator.geolocation.getCurrentPosition(
              (position) => {
                setForm((previous) => ({
                  ...previous,
                  latitude: String(position.coords.latitude),
                  longitude: String(position.coords.longitude),
                }));
                setError("");
                setNotice("GPS location captured successfully.");
              },
              () => {
                setError("Please allow location access and try again.");
              }
            );
          }}
        >
          📍 Use My Current Location
        </button>

        <p className="form-subheading">
          Map coordinates (optional)
        </p>

        <div className="coordinate-grid">
          <label>
            Latitude
            <input
              name="latitude"
              type="number"
              step="any"
              min="-90"
              max="90"
              value={form.latitude}
              onChange={updateField}
              placeholder="e.g. 16.3067"
            />
          </label>

          <label>
            Longitude
            <input
              name="longitude"
              type="number"
              step="any"
              min="-180"
              max="180"
              value={form.longitude}
              onChange={updateField}
              placeholder="e.g. 80.4365"
            />
          </label>
        </div>

        <p className="form-hint">
          Coordinates allow the report to appear on the map. Without
          coordinates, the report can still be saved but will not have a
          map marker.
        </p>

        <button
          className="primary-button"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Submitting..." : "Submit incident report →"}
        </button>
      </form>
    </section>
  );

   const renderIncidents = () => (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">INCIDENT MANAGEMENT</p>
          <h2>Incident registry</h2>
          <p className="muted">
            Reports returned by the connected backend database.
          </p>
        </div>

        <button
          className="secondary-button"
          type="button"
          disabled={refreshing}
          onClick={() => refreshData(true)}
        >
          {refreshing ? "Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      <div className="filters">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search reports..."
          aria-label="Search incident reports"
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter incident status"
        >
          <option>All</option>
          <option>Pending</option>
          <option>Verified</option>
          <option>Resolved</option>
        </select>
      </div>
const renderIncidents
      {filteredIncidents.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">⌖</span>
          <h3>No incident reports found</h3>
          <p>Submit a report or change the search filters.</p>
          <button
            className="primary-button"
            onClick={() => setActiveTab("Report Incident")}
          >
            + Report incident
          </button>
        </div>
      ) : (
        <div className="incident-list">
          {filteredIncidents.map((incident) => (
            <article className="incident-card" key={incident.id}>
              <div className="incident-topline">
                <strong>
                  INC-{String(incident.id).padStart(4, "0")}
                </strong>
                <StatusBadge status={incident.status || "Pending"} />
              </div>

              <h3>{incident.hazard || "Reported incident"}</h3>
              <p className="incident-location">
                ⌖ {incident.location || "Location unavailable"}
              </p>
              <p>
                {incident.description || "No description provided."}
              </p>
              
{incident.photo_path && (
  <img
    src={
      incident.photo_path.startsWith("http")
        ? incident.photo_path
        : `${API_URL}${incident.photo_path}`
    }
    alt="Incident report"
    className="incident-photo"
  />
)}


              <div className="incident-meta">
                <span
                  className="severity-label"
                  style={{
                    color: severityColor(getSeverity(incident)),
                  }}
                >
                  {getSeverity(incident)}
                </span>

                <small>
                  {incident.created_at
                    ? new Date(incident.created_at).toLocaleString()
                    : ""}
                </small>
              </div>

              {incident.latitude != null &&
                incident.longitude != null && (
                  <p className="muted small">
                    Coordinates: {incident.latitude},{" "}
                    {incident.longitude}
                  </p>
                )}

              <label className="status-label">
                Update status
                <select
                  value={incident.status || "Pending"}
                  onChange={(event) =>
                    updateStatus(incident, event.target.value)
                  }
                >
                  <option>Pending</option>
                  <option>Verified</option>
                  <option>Resolved</option>
                </select>
              </label>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  const renderOverview = () => (
    <>
      <section className="stats">
        <article className="stat-card">
          <span>ALERT RECORDS</span>
          <strong>{alerts.length}</strong>
          <small>Records from alerts API</small>
        </article>

        <article className="stat-card">
          <span>INCIDENT REPORTS</span>
          <strong>{incidents.length}</strong>
          <small>Submitted reports</small>
        </article>

        <article className="stat-card">
          <span>CRITICAL REPORTS</span>
          <strong>{criticalCount}</strong>
          <small>Unresolved critical reports</small>
        </article>

        <article className="stat-card">
          <span>RESOLVED</span>
          <strong>{resolvedCount}</strong>
          <small>Resolved incident reports</small>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">GEOSPATIAL MONITORING</p>
              <h2>Hazard map</h2>
              <p className="muted">
                Alert records and incident locations
              </p>
            </div>
            <button
              className="text-button"
              onClick={() => setActiveTab("Hazard Map")}
            >
              Expand map →
            </button>
          </div>

          <HazardMap alerts={alerts} incidents={incidents} />

          <div className="map-legend">
            <span>
              <i style={{ background: "#ff4d5e" }} /> Critical
            </span>
            <span>
              <i style={{ background: "#ff8747" }} /> High
            </span>
            <span>
              <i style={{ background: "#f4c45e" }} /> Moderate
            </span>
            <span>
              <i style={{ background: "#59baff" }} /> Other
            </span>
          </div>
        </article>

        <article className="panel weather-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ENVIRONMENT</p>
              <h2>Weather snapshot</h2>
              <p className="muted">Vijayawada · API response</p>
            </div>
            <span className="weather-symbol">☁</span>
          </div>

          <div className="temperature">
            {temperature != null ? `${temperature}°` : "--°"}
          </div>

          <p className="muted">
            {weather
              ? `Weather code: ${weather.weather_code ?? "Not provided"}`
              : "Weather data is currently unavailable."}
          </p>

          <div className="weather-details">
            <div>
              <span>Precipitation</span>
              <strong>
                {precipitation != null ? `${precipitation} mm` : "—"}
              </strong>
            </div>
            <div>
              <span>Wind speed</span>
              <strong>
                {windSpeed != null ? `${windSpeed} km/h` : "—"}
              </strong>
            </div>
            <div>
              <span>Humidity</span>
              <strong>{humidity != null ? `${humidity}%` : "—"}</strong>
            </div>
          </div>

          <div className="risk-note">
            <strong>Weather status: {weatherStatus}</strong>
            <p>{weatherUpdated || "Waiting for weather data..."}</p>
            <small>
              Weather observations are not official disaster warnings.
            </small>
          </div>

          <button
            className="secondary-button full-button"
            onClick={() => refreshData(true)}
          >
            ↻ Refresh data
          </button>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">FIELD OPERATIONS</p>
              <h2>Recent incidents</h2>
            </div>
            <button
              className="text-button"
              onClick={() => setActiveTab("Incident Reports")}
            >
              View all →
            </button>
          </div>

          {incidents.length === 0 ? (
            <p className="muted">
              No submitted incident reports yet.
            </p>
          ) : (
            incidents.slice(0, 4).map((incident) => (
              <div className="compact-row" key={incident.id}>
                <div>
                  <strong>{incident.hazard || "Incident"}</strong>
                  <p>{incident.location || "Unknown location"}</p>
                </div>
                <StatusBadge status={incident.status || "Pending"} />
              </div>
            ))
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">WARNING FEED</p>
              <h2>Official live warnings</h2>
            </div>
          </div>

          {warningMessage && (
            <p className="muted">{warningMessage}</p>
          )}

          {warnings.length > 0 ? (
            warnings.slice(0, 5).map((item, index) => (
              <article
                className="warning-card"
                key={item.id ?? index}
              >
                <strong>
                  {item.title || item.hazard || item.event || "Warning"}
                </strong>
                <p>{item.location || item.area || "Area not specified"}</p>
                <p className="muted">
                  {item.description || item.message || ""}
                </p>
                <small>
                  {item.source || "Source not provided by API"}
                </small>
              </article>
            ))
          ) : (
            <p className="muted">
              No warning records are available from the connected
              endpoint. Check official government advisories directly.
            </p>
          )}
        </article>
      </section>
    </>
  );

  const renderAlerts = () => (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">MONITORING FEED</p>
          <h2>Alert records</h2>
          <p className="muted">
            Database alert records are not automatically verified
            official warnings.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => refreshData(true)}
        >
          ↻ Refresh
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="empty-state">
          <h3>No alert records available</h3>
          <p>Check the backend connection and alert data source.</p>
        </div>
      ) : (
        <div className="alert-grid">
          {alerts.map((item, index) => (
            <article className="alert-card" key={item.id ?? index}>
              <div className="incident-topline">
                <span
                  className="severity-label"
                  style={{
                    color: severityColor(getSeverity(item)),
                  }}
                >
                  {getSeverity(item)}
                </span>
                <span className="tag">ALERT RECORD</span>
              </div>
              <h3>{item.hazard || item.title || "Hazard alert"}</h3>
              <p className="incident-location">
                ⌖ {item.location || item.place || "Location unavailable"}
              </p>
              <p className="muted">
                {item.description || "No additional details provided."}
              </p>
            </article>
          ))}
        </div>
      )}

      <div className="section-divider" />
      <h2>Official live warnings</h2>
      {warningMessage && <p className="muted">{warningMessage}</p>}

      {warnings.map((item, index) => (
        <article className="warning-card" key={item.id ?? index}>
          <strong>
            {item.title || item.hazard || item.event || "Warning"}
          </strong>
          <p>{item.location || item.area || "Area not specified"}</p>
          <p className="muted">
            {item.description || item.message || ""}
          </p>
          <small>
            {item.source || "Source not provided by API"}
          </small>
        </article>
      ))}
    </section>
  );

  const renderAnalytics = () => {
    const severityCounts = ["CRITICAL", "HIGH", "MODERATE", "LOW"].map(
      (severity) => ({
        severity,
        count: incidents.filter(
          (item) => getSeverity(item) === severity
        ).length,
      })
    );

    const maxCount = Math.max(
      1,
      ...severityCounts.map((item) => item.count)
    );

    return (
      <>
        <section className="stats">
          {[
            ["TOTAL REPORTS", incidents.length],
            ["PENDING", pendingCount],
            ["VERIFIED", verifiedCount],
            ["RESOLVED", resolvedCount],
          ].map(([label, value]) => (
            <article className="stat-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>Current database records</small>
            </article>
          ))}
        </section>

        <section className="panel">
          <p className="eyebrow">DATA INSIGHTS</p>
          <h2>Incident severity distribution</h2>
          <p className="muted">
            Calculated from submitted incident records, not forecast data.
          </p>

          {severityCounts.map((item) => (
            <div className="bar-row" key={item.severity}>
              <div className="bar-label">
                <span>{item.severity}</span>
                <strong>{item.count}</strong>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${(item.count / maxCount) * 100}%`,
                    background: severityColor(item.severity),
                  }}
                />
              </div>
            </div>
          ))}
        </section>
      </>
    );
  };

  const renderSettings = () => (
    <section className="panel">
      <p className="eyebrow">PREFERENCES</p>
      <h2>System settings</h2>
      <p className="muted">
        Control dashboard data refresh and inspect service status.
      </p>

      <label className="setting-row">
        <span>
          <strong>Automatic refresh</strong>
          <small>Periodically refresh connected data.</small>
        </span>
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(event) => setAutoRefresh(event.target.checked)}
        />
      </label>

      <label className="setting-row">
        <span>
          <strong>Refresh interval</strong>
          <small>Minimum 10 seconds.</small>
        </span>
        <select
          value={refreshSeconds}
          onChange={(event) => setRefreshSeconds(event.target.value)}
        >
          <option value="30">30 seconds</option>
          <option value="60">1 minute</option>
          <option value="120">2 minutes</option>
        </select>
      </label>

      <div className="setting-row">
        <span>
          <strong>Backend API</strong>
          <small>{API_URL}</small>
        </span>
        <StatusBadge status={backendStatus} />
      </div>

      <div className="setting-row">
        <span>
          <strong>Weather service</strong>
          <small>Weather endpoint response</small>
        </span>
        <StatusBadge status={weatherStatus} />
      </div>

      <button
        className="primary-button"
        onClick={() => refreshData(true)}
      >
        {refreshing ? "Checking..." : "Test connection and refresh"}
      </button>
    </section>
  );

  let pageContent;

  switch (activeTab) {
    case "Hazard Map":
      pageContent = (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">GEOSPATIAL MONITORING</p>
              <h2>Hazard map</h2>
            </div>
            <button
              className="secondary-button"
              onClick={() => refreshData(true)}
            >
              ↻ Refresh map data
            </button>
          </div>
          <HazardMap alerts={alerts} incidents={incidents} large />
        </section>
      );
      break;

    case "Alerts":
      pageContent = renderAlerts();
      break;

    case "Incident Reports":
      pageContent = (
        <div className="page-stack">
          {renderIncidentForm()}
          {renderIncidents()}
        </div>
      );
      break;

    case "Analytics":
      pageContent = renderAnalytics();
      break;

    case "Settings":
      pageContent = renderSettings();
      break;

    case "Report Incident":
      pageContent = renderIncidentForm();
      break;

    default:
      pageContent = renderOverview();
  }

  return (
    <div className="app-shell">
      <style>{`
        .app-shell {
          --bg: #080d18;
          --panel: #0e1726;
          --line: #223149;
          --muted: #8b9bb1;
          --text: #e8eef8;
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        .app-shell * { box-sizing: border-box; }
        .app-shell button, .app-shell input, .app-shell select, .app-shell textarea {
          font: inherit;
        }
        .sidebar {
          position: fixed; inset: 0 auto 0 0; z-index: 1000;
          width: 245px; padding: 25px 15px;
          background: #0b1220; border-right: 1px solid #1c293d;
          display: flex; flex-direction: column;
        }
        .brand { display: flex; align-items: center; gap: 11px; padding: 0 9px 28px; }
        .brand-icon {
          display: grid; place-items: center; width: 42px; height: 42px;
          border-radius: 13px; color: white; font-size: 23px; font-weight: 800;
          background: linear-gradient(140deg,#ff8a3d,#ff5c48);
        }
        .brand strong { display: block; font-size: 15px; }
        .brand small { display: block; margin-top: 4px; color: #8494ab; font-size: 10px; letter-spacing: .8px; }
        .nav-heading, .eyebrow {
          color: #7f90aa; font-size: 10px; font-weight: 800; letter-spacing: 1.4px;
        }
        .nav-heading { padding: 0 12px; margin: 4px 0 12px; }
        .nav-link {
          display: flex; align-items: center; gap: 12px; width: 100%;
          padding: 12px; margin-bottom: 5px; border-radius: 10px;
          border: 1px solid transparent; background: transparent;
          color: #9cabc0; text-align: left; cursor: pointer; font-size: 12px;
        }
        .nav-link span { width: 20px; text-align: center; font-size: 17px; }
        .nav-link:hover { background: #111d30; color: white; }
        .nav-link.active { color: #ff9a55; background: #241b1b; border-color: #503027; }
        .sidebar-status {
          margin-top: auto; padding: 15px 10px 0; border-top: 1px solid #1c293d;
          color: #a7b5c8; font-size: 11px; line-height: 2;
        }
        .sidebar-status small { display: block; color: #8494ab; }
        .live-dot {
          display: inline-block; width: 7px; height: 7px; margin-right: 7px;
          border-radius: 50%; background: #43d69a;
          animation: livePulse 2s ease-in-out infinite;
        }
        .main { min-width: 0; margin-left: 245px; }
        .topbar {
          display: flex; justify-content: space-between; align-items: center;
          gap: 12px; padding: 20px 30px; background: #0a111e;
          border-bottom: 1px solid #1b2739; color: #aab8cb; font-size: 12px;
        }
        .topbar-right { display: flex; align-items: center; gap: 10px; }
        .welcome {
          display: flex; justify-content: space-between; align-items: center;
          gap: 14px; padding: 25px 30px 15px;
        }
        .welcome h1 { margin: 7px 0; font-size: clamp(22px,3vw,30px); letter-spacing: -.7px; }
        .welcome p { margin-top: 5px; }
        .date-chip, .tag {
          display: inline-block; padding: 7px 9px; border: 1px solid #30425a;
          border-radius: 7px; color: #8ccfff; background: #112238;
          font-size: 9px; font-weight: 800; white-space: nowrap;
        }
        .page-content { max-width: 1650px; margin: auto; padding: 15px 30px 40px; }
        .page-title { margin-bottom: 18px; }
        .page-title h2 { margin: 0; font-size: 20px; }
        .page-title p { margin: 6px 0 0; }
        .muted { color: var(--muted); font-size: 12px; line-height: 1.7; }
        .small { font-size: 10px; }
        .stats { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 14px; margin-bottom: 17px; }
        .stat-card, .panel {
          min-width: 0; border: 1px solid #1d2a3e; border-radius: 14px;
          background: var(--panel);
        }
        .stat-card {
          position: relative;
          overflow: hidden;
          padding: 19px;
          transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
        }
        .stat-card::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, transparent, #55b8ff, transparent);
          opacity: .85;
        }
        .stat-card:hover {
          transform: translateY(-4px);
          border-color: #456787;
          box-shadow: 0 8px 24px #00000030;
        }
        .stat-card > span { display: block; color: #8b9bb1; font-size: 10px; letter-spacing: .7px; }
        .stat-card > strong { display: block; margin: 12px 0 7px; font-size: 29px; }
        .stat-card > small { color: #71839c; font-size: 10px; }
        .online { color: #4bd5a0; }
        .content-grid { display: grid; grid-template-columns: minmax(0,1.55fr) minmax(260px,1fr); gap: 16px; margin-bottom: 17px; }
        .panel { padding: 21px; }
        .panel-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
        .panel-heading h2 { margin: 5px 0; font-size: 17px; }
        .panel-heading p { margin-bottom: 0; }
        .panel-heading .eyebrow { margin: 0; }
        .primary-button, .secondary-button {
          border-radius: 9px; padding: 10px 14px; cursor: pointer;
          font-size: 11px; font-weight: 750;
        }
        .primary-button { border: 0; color: white; background: linear-gradient(120deg,#ff8743,#ff654f); }
        .primary-button:disabled { opacity: .55; cursor: wait; }
        .secondary-button { border: 1px solid #293b54; color: #d6e5f7; background: #152338; }
        .secondary-button:hover { background: #1b2c43; }
        .text-button { border: 0; color: #64bfff; background: transparent; cursor: pointer; font-size: 11px; }
        .map-wrapper { overflow: hidden; border: 1px solid #26364c; border-radius: 11px; background: #0a1320; }
        .map-toolbar { display: flex; justify-content: space-between; padding: 11px; color: #9eafc5; font-size: 10px; }
        .hazard-map { height: 340px; width: 100%; background: #dbe5ee; }
        .hazard-map-large { height: min(65vh,650px); min-height: 380px; }
        .map-caption { margin: 0; padding: 10px 12px; border-top: 1px solid #26364c; color: #8293aa; font-size: 10px; line-height: 1.6; }
        .map-legend { display: flex; flex-wrap: wrap; gap: 13px; margin-top: 14px; color: #9aabc0; font-size: 10px; }
        .map-legend span { display: flex; align-items: center; gap: 6px; }
        .map-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
        .weather-panel { display: flex; flex-direction: column; }
        .weather-symbol { color: #73c7ff; font-size: 25px; }
        .temperature { margin: 12px 0 4px; font-size: 48px; font-weight: 750; letter-spacing: -2px; }
        .weather-details { display: grid; gap: 0; margin-top: 15px; }
        .weather-details div { display: flex; justify-content: space-between; gap: 10px; padding: 12px 0; border-bottom: 1px solid #202e42; font-size: 11px; transition: border-color 200ms ease, background 200ms ease; }
        .weather-details div:hover { border-color: #456787; background: #132236; }
        .weather-details span { color: #8b9bb1; }
        .weather-details strong { color: #dce7f5; }
        .risk-note { margin-top: 16px; padding: 13px; border: 1px solid #293951; border-radius: 9px; background: #0a1321; }
        .risk-note strong { font-size: 11px; }
        .risk-note p { color: #9aabc0; font-size: 11px; overflow-wrap: anywhere; }
        .risk-note small { color: #8b9bb1; font-size: 10px; line-height: 1.6; }
        .full-button { width: 100%; margin-top: 15px; }
        .page-stack { display: grid; gap: 17px; }
        .incident-form { display: grid; gap: 15px; max-width: 800px; }
        .incident-form label { display: grid; gap: 7px; color: #c4d0e1; font-size: 11px; font-weight: 700; }
        .incident-form input, .incident-form select, .incident-form textarea,
        .filters input, .filters select, .status-label select, .setting-row select {
          width: 100%; min-width: 0; border: 1px solid #293951; border-radius: 8px;
          padding: 11px 12px; background: #091220; color: #e8eef8; outline: none; font-size: 12px;
        }
        .incident-form input:focus, .incident-form select:focus, .incident-form textarea:focus,
        .filters input:focus { border-color: #50aef0; }
        .incident-form textarea { resize: vertical; }
        .form-subheading { margin: 0; color: #c4d0e1; font-size: 11px; font-weight: 750; }
        .coordinate-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 13px; }
        .form-hint { color: #8b9bb1; font-size: 10px; line-height: 1.7; }
        .notice { padding: 12px 15px; margin: 0 30px 12px; border-radius: 9px; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
        .success-notice { color: #8ae5b9; border: 1px solid #245b49; background: #10281f; }
        .error-notice { color: #ffb1b7; border: 1px solid #63343a; background: #29151c; }
        .incident-list { display: grid; gap: 12px; }
        .incident-card, .alert-card, .warning-card {
          padding: 15px; border: 1px solid #24334a; border-radius: 11px; background: #0a1321;
          transition: border-color 200ms ease, background 200ms ease;
        }
        .incident-card:hover, .alert-card:hover, .warning-card:hover {
          border-color: #456787;
        }
        .incident-topline { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .incident-topline > strong { color: #91bfff; font-size: 11px; }
        .incident-card h3, .alert-card h3 { margin: 13px 0 7px; font-size: 14px; }
        .incident-card > p, .alert-card > p { font-size: 12px; line-height: 1.7; }
        .incident-location { color: #c2d0e2; font-size: 12px; }
        .incident-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 9px; margin: 12px 0; }
        .incident-meta small { color: #8293aa; font-size: 10px; }
        .severity-label { font-size: 10px; font-weight: 800; }
        .status-badge { display: inline-block; padding: 5px 8px; border-radius: 6px; background: #172438; color: #9bb0cb; font-size: 9px; font-weight: 800; text-transform: uppercase; }
        .status-pending { background: #392c18; color: #ffd075; }
        .status-verified { background: #123347; color: #77ceff; }
        .status-resolved, .status-connected, .status-live { background: #12382c; color: #70e1ad; }
        .status-offline, .status-unavailable { background: #421f29; color: #ff9cab; }
        .status-checking, .status-loading { background: #172438; color: #9bb0cb; }
        .status-label { display: grid; grid-template-columns: auto minmax(120px,180px); justify-content: end; align-items: center; gap: 12px; margin-top: 14px; color: #c4d0e1; font-size: 11px; }
        .filters { display: grid; grid-template-columns: minmax(0,1fr) 170px; gap: 10px; margin-bottom: 17px; }
        .empty-state { padding: 30px 15px; text-align: center; color: #94a5bc; }
        .empty-icon { color: #5abaff; font-size: 27px; }
        .empty-state h3 { color: #e2eaf5; font-size: 14px; }
        .compact-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #202e42; }
        .compact-row strong { font-size: 12px; }
        .compact-row p { margin: 5px 0 0; color: #8293aa; font-size: 11px; }
        .warning-card { margin-top: 10px; }
        .warning-card strong { font-size: 12px; }
        .warning-card p { font-size: 11px; line-height: 1.6; }
        .warning-card small { color: #6fc6ff; font-size: 10px; }
        .alert-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
        .alert-card .tag { font-size: 8px; }
        .section-divider { height: 1px; margin: 22px 0; background: #233149; }
        .bar-row { margin: 22px 0; }
        .bar-label { display: flex; justify-content: space-between; margin-bottom: 8px; color: #b9c7d9; font-size: 11px; }
        .bar-track { height: 9px; border-radius: 20px; background: #1b293d; overflow: hidden; }
        .bar-fill { height: 100%; border-radius: 20px; transition: width .3s ease; }
        .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 17px 0; border-bottom: 1px solid #202e42; }
        .setting-row span { display: grid; gap: 5px; }
        .setting-row strong { font-size: 12px; }
        .setting-row small { color: #8293aa; font-size: 10px; overflow-wrap: anywhere; }
        .setting-row input[type=checkbox] { width: 18px; height: 18px; accent-color: #ff8547; }
        .setting-row select { width: auto; max-width: 160px; }
        .footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding-top: 24px; color: #60728a; font-size: 9px; }

        
/* Hazard marker animation */
.hazard-pulse {
  transform-box: fill-box;
  transform-origin: center;
  animation: hazardPulse 1.5s ease-in-out infinite;
  transition: none;
}

        
        .hazard-critical { --marker-glow: #ff4d5e; }
        .hazard-high { --marker-glow: #ff8747; }
        .hazard-moderate, .hazard-medium { --marker-glow: #f4c45e; }
        .hazard-low { --marker-glow: #42d6a0; }

        @keyframes hazardPulse {
          0%, 100% {
            opacity: .75;
            filter: drop-shadow(0 0 2px var(--marker-glow, #59baff));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 10px var(--marker-glow, #59baff));
          }
        }

        @keyframes livePulse {
          0%, 100% { box-shadow: 0 0 2px #43d69a; }
          50% { box-shadow: 0 0 10px #43d69a; }
        }

        button:focus-visible, select:focus-visible,
        input:focus-visible, textarea:focus-visible {
          outline: 2px solid #55b8ff;
          outline-offset: 3px;
        }

        @media (prefers-reduced-motion: reduce) {
          .hazard-pulse, .live-dot { animation: none; }
          .stat-card, .incident-card, .alert-card,
          .warning-card, .weather-details div { transition: none; }
        }

        @media (max-width: 1100px) {
          .sidebar { width: 210px; }
          .main { margin-left: 210px; }
          .page-content { padding-right: 18px; padding-left: 18px; }
          .welcome { padding-right: 18px; padding-left: 18px; }
          .stats { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .content-grid { grid-template-columns: minmax(0,1fr); }
        }
        @media (max-width: 650px) {
          .sidebar { position: sticky; inset: 0 0 auto; width: 100%; height: auto; padding: 10px; border-right: 0; border-bottom: 1px solid #1c293d; }
          .brand { padding: 2px 6px 10px; }
          .brand-icon { width: 34px; height: 34px; }
          .nav-heading, .sidebar-status { display: none; }
          .nav-link { flex: 0 0 auto; width: auto; padding: 9px; margin: 0; gap: 6px; font-size: 10px; }
          .nav-link span { width: auto; font-size: 14px; }
          .sidebar { overflow: hidden; }
          .sidebar nav { display: flex; gap: 5px; overflow-x: auto; padding-bottom: 2px; }
          .main { margin-left: 0; }
          .topbar { padding: 15px; }
          .welcome { padding: 18px 14px 10px; align-items: flex-start; }
          .date-chip { display: none; }
          .page-content { padding: 12px 12px 28px; }
          .stats { gap: 9px; }
          .stat-card { padding: 13px; }
          .stat-card > strong { font-size: 24px; }
          .panel { padding: 15px; }
          .coordinate-grid, .alert-grid { grid-template-columns: minmax(0,1fr); }
          .filters { grid-template-columns: minmax(0,1fr); }
          .status-label { grid-template-columns: 1fr; }
          .hazard-map-large { min-height: 350px; }
          .notice { margin: 0 12px 10px; }
        }
      `}</style>

      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">G</span>
          <div>
            <strong>GeoGuard AI</strong>
            <small>DISASTER INTELLIGENCE</small>
          </div>
        </div>

        <p className="nav-heading">COMMAND MENU</p>

        <nav>
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              className={`nav-link ${
                activeTab === item ? "active" : ""
              }`}
              onClick={() => {
                setActiveTab(item);
                setNotice("");
                setError("");
              }}
            >
              <span>
                {item === "Overview"
                  ? "▦"
                  : item === "Hazard Map"
                    ? "⌖"
                    : item === "Alerts"
                      ? "♧"
                      : item === "Incident Reports"
                        ? "⚑"
                        : item === "Analytics"
                          ? "⌁"
                          : "⚙"}
              </span>
              {item}
            </button>
          ))}

          <button
            className={`nav-link ${
              activeTab === "Report Incident" ? "active" : ""
            }`}
            onClick={() => {
              setActiveTab("Report Incident");
              setNotice("");
              setError("");
            }}
          >
            <span>＋</span>
            Report Incident
          </button>
        </nav>

        <div className="sidebar-status">
          <span
            className="live-dot"
            style={{
              background:
                backendStatus === "Connected" ? "#43d69a" : "#ff7043",
            }}
          />
          {backendStatus === "Connected"
            ? "Backend connected"
            : backendStatus === "Offline"
              ? "Backend offline"
              : "Checking backend..."}
          <small>Weather: {weatherStatus}</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <span>GeoGuard / {activeTab}</span>
          <div className="topbar-right">
            <button
              className="secondary-button"
              onClick={() => refreshData(true)}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing..." : "↻ Refresh"}
            </button>
            <StatusBadge status={backendStatus} />
          </div>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow">
              NATURAL DISASTER RESPONSE PLATFORM
            </p>
            <h1>
              {activeTab === "Overview"
                ? "Risk Command Center"
                : activeTab}
            </h1>
            <p className="muted">
              Monitor hazards, review reports and track incident status.
            </p>
          </div>
          <span className="date-chip">
            {weatherStatus === "Live"
              ? "WEATHER CONNECTED"
              : "WEATHER STATUS: " + weatherStatus.toUpperCase()}
          </span>
        </section>

        {(notice || error) && (
          <div
            className={`notice ${
              error ? "error-notice" : "success-notice"
            }`}
            role="status"
          >
            {error || notice}
          </div>
        )}

        <div className="page-content">
          {loading && (
            <p className="muted">
              Connecting to backend services...
            </p>
          )}

          {pageContent}

          <footer className="footer">
            <span>GEOGUARD AI · DISASTER INTELLIGENCE</span>
            <span>
              {lastUpdated
                ? `Last updated: ${lastUpdated.toLocaleTimeString()}`
                : "Waiting for data"}
              {" · "}Prototype, not an official emergency service
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;

