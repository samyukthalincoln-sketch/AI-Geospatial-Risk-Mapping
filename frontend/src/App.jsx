import { useState, useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const sampleAlerts = [
  { title: "Heavy rainfall monitoring", place: "Coastal zone", level: "HIGH" },
  { title: "Earthquake activity watch", place: "Seismic zone", level: "MODERATE" },
  { title: "Flood risk assessment", place: "River basin", level: "CRITICAL" },
];
const API_URL = "http://127.0.0.1:5000";

function App() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [alerts, setAlerts] = useState(sampleAlerts);
const [backendStatus, setBackendStatus] = useState("Checking...");
const [weather, setWeather] = useState(null);
const [weatherStatus, setWeatherStatus] = useState("Loading...");
const [weatherUpdated, setWeatherUpdated] = useState("");


useEffect(() => {
  const fetchAlerts = () => {
    fetch(`${API_URL}/api/health`)
      .then((response) => {
        if (!response.ok) throw new Error("Backend unavailable");
        return response.json();
      })
      .then(() => setBackendStatus("Connected"))
      .catch(() => setBackendStatus("Offline"));

    fetch(`${API_URL}/api/alerts`)
      .then((response) => {
        if (!response.ok) throw new Error("Could not fetch alerts");
        return response.json();
      })
      .then((data) => {
        if (data.length > 0) {
          setAlerts(
            data.map((alert) => ({
              title: alert.hazard,
              place: alert.location,
              level: alert.risk_level.toUpperCase(),
            }))
          );
        }
      })
      .catch((error) => console.error("Alerts error:", error));
  };

  const fetchLiveWeather = () => {
    fetch(`${API_URL}/api/live-weather`)
      .then((response) => {
        if (!response.ok) throw new Error("Weather unavailable");
        return response.json();
      })
      .then((data) => {
        if (data.status !== "success") {
          throw new Error("Weather unavailable");
        }
        setWeather(data.current_weather);
        setWeatherStatus("Live");
        setWeatherUpdated(data.current_weather.time);
      })
      .catch(() => setWeatherStatus("Unavailable"));
  };

  fetchAlerts();
  fetchLiveWeather();

  const alertsTimer = setInterval(fetchAlerts, 60000);
  const weatherTimer = setInterval(fetchLiveWeather, 300000);

  return () => {
    clearInterval(alertsTimer);
    clearInterval(weatherTimer);
  };
}, []);


  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">G</span>
          <div>
            <strong>GeoGuard AI</strong>
            <small>DISASTER INTELLIGENCE</small>
          </div>
        </div>

        <p className="nav-heading">MAIN MENU</p>

        {["Overview", "Hazard Map", "Alerts", "Analytics", "Settings"].map((item) => (
          <button
            key={item}
            className={activeTab === item ? "nav-link active" : "nav-link"}
            onClick={() => setActiveTab(item)}
          >
            <span>{item === "Overview" ? "▦" : item === "Hazard Map" ? "⌖" : item === "Alerts" ? "♧" : item === "Analytics" ? "⌁" : "⚙"}</span>
            {item}
          </button>
        ))}

        <div className="sidebar-status">
          <span className="status-dot"></span>
          {backendStatus === "Connected"
  ? "Backend connected"
  : backendStatus === "Offline"
  ? "Backend offline"
  : "Checking backend..."}
          <small>Demo data mode</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <span>Workspace / {activeTab}</span>
          <span className="demo-badge">● LIVE WEATHER · SAMPLE ALERTS</span>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow">NATURAL DISASTER MONITORING PLATFORM</p>
            <h1>{activeTab === "Overview" ? "Risk Command Center" : activeTab}</h1>
            <p className="muted">Monitor environmental hazards and explore risk indicators.</p>
          </div>
          <span className="date-chip">● Monitoring interface</span>
        </section>

        <section className="stats">
          <article className="stat-card">
            <span>ACTIVE ALERTS</span>
            <strong>{alerts.length.toString().padStart(2, "0")}</strong>
            <small>Sample alerts</small>
          </article>
          <article className="stat-card">
            <span>MONITORING ZONES</span>
<strong>{new Set(alerts.map((alert) => alert.place)).size}</strong>
<small>Locations in alert database</small>
          </article>
          
<article className="stat-card">
  <span>RISK INDEX</span>
  <strong>--<span className="small-unit">/100</span></strong>
  <small>Risk model not configured</small>
</article>

          <article className="stat-card">
            <span>SYSTEM STATUS</span>
            <strong className="online">Online</strong>
            <small>Frontend is running</small>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <h2>Geospatial Hazard Map</h2>
                <p>Illustrative map preview — not live data</p>
              </div>
              <span className="tag">MAP VIEW</span>
            </div>

            
<HazardMap />
<div className="map-legend">
  <span><i className="red-dot"></i>Critical (demo)</span>
  <span><i className="orange-dot"></i>High (demo)</span>
  <span><i className="blue-dot"></i>Moderate (demo)</span>
</div>

          </article>

          
<article className="panel weather-panel">
  <div className="panel-heading">
    <div>
      <h2>Live Weather</h2>
      <p>Vijayawada · Open-Meteo</p>
    </div>
    <span className="weather-symbol">☁</span>
  </div>

  <div className="temperature">
    <strong>
      {weather ? `${weather.temperature_2m}°` : "--°"}
    </strong>
    <span>
      {weather
        ? weather.weather_code === 0
          ? "Clear"
          : weather.weather_code === 3
          ? "Overcast"
          : "Current conditions"
        : weatherStatus}
      <br />
      <small>{weatherStatus}</small>
    </span>
  </div>

  <div className="weather-details">
    <div>
      <span>Rainfall</span>
      <strong>
        {weather ? `${weather.precipitation} mm` : "--"}
      </strong>
    </div>

    <div>
      <span>Wind speed</span>
      <strong>
        {weather ? `${weather.wind_speed_10m} km/h` : "--"}
      </strong>
    </div>

    <div>
      <span>Humidity</span>
      <strong>
        {weather ? `${weather.relative_humidity_2m}%` : "--"}
      </strong>
    </div>
  </div>

  <div className="risk-note">
    <strong>Last weather update</strong>
    <p>{weatherUpdated || "Waiting for weather data..."}</p>
    <small>
      Weather observations are not official disaster warnings.
    </small>
  </div>
</article>

        </section>

        <section className="panel alerts-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent Disaster Alerts</h2>
              <p>Sample alerts · Not verified official warnings</p>
            </div>
            <span className="tag">3 EVENTS</span>
          </div>

          {alerts.map((alert) => (
            <div className="alert-row" key={alert.title}>
              <span className={alert.level === "CRITICAL" ? "alert-icon critical" : alert.level === "HIGH" ? "alert-icon high" : "alert-icon moderate"}>!</span>
              <div className="alert-info">
                <strong>{alert.title}</strong>
                <small>{alert.place}</small>
              </div>
              <span className={alert.level === "CRITICAL" ? "level critical-text" : alert.level === "HIGH" ? "level high-text" : "level moderate-text"}>{alert.level}</span>
            </div>
          ))}
        </section>

        <footer>
          <span>AI GEOSPATIAL RISK MAPPING</span>
          <span>Demo interface · Not an official warning system</span>
        </footer>
      </main>
    </div>
  );
}

 
function HazardMap() {
  
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/api/alerts`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Could not load map alerts");
        }
        return response.json();
      })
      .then((data) => {
        setLocations(
          data
            .filter(
              (item) =>
                item.latitude != null &&
                item.longitude != null
            )
            .map((item) => ({
              name: item.location,
              position: [
                item.latitude,
                item.longitude,
              ],
              risk: item.risk_level.toUpperCase(),
              score: item.risk_score,
              color:
                item.risk_level.toUpperCase() === "CRITICAL"
                  ? "#ef4444"
                  : item.risk_level.toUpperCase() === "HIGH"
                  ? "#f97316"
                  : "#3b82f6",
            }))
        );
      })
      .catch((error) =>
        console.error("Map alerts error:", error)
      );
  }, []);

  return (
    <MapContainer
      center={[16.5, 80.6]}
      zoom={7}
      style={{
        height: "400px",
        width: "100%",
        borderRadius: "12px",
      }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {locations.map((location) => (
        <CircleMarker
          key={location.name}
          center={location.position}
          radius={10}
          pathOptions={{
            color: location.color,
            fillColor: location.color,
            fillOpacity: 0.8,
          }}
        >
          
<Popup>
  <strong>{location.name}</strong>
  <br />
  Risk Level: {location.risk}
  <br />
  Risk Score: {location.score}/100
</Popup>

        </CircleMarker>
      ))}
    </MapContainer>
  );
}

export default App;