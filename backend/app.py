
from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import requests
from pathlib import Path
from datetime import datetime, timezone

app = Flask(__name__)
CORS(app)

DB_PATH = Path(__file__).parent / "disaster_risk.db"

VALID_HAZARDS = {
    "Flood", "Fire", "Earthquake",
    "Heavy Rainfall", "Cyclone", "Landslide", "Other"
}

VALID_SEVERITIES = {"LOW", "MODERATE", "HIGH", "CRITICAL"}
VALID_STATUSES = {"Pending", "Verified", "Resolved"}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                location TEXT NOT NULL,
                hazard TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                risk_score INTEGER NOT NULL,
                latitude REAL,
                longitude REAL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hazard TEXT NOT NULL,
                location TEXT NOT NULL,
                severity TEXT NOT NULL,
                description TEXT NOT NULL,
                latitude REAL,
                longitude REAL,
                status TEXT NOT NULL DEFAULT 'Pending',
                created_at TEXT NOT NULL
            )
        """)

        columns = [
            row["name"]
            for row in conn.execute("PRAGMA table_info(alerts)")
        ]

        if "latitude" not in columns:
            conn.execute("ALTER TABLE alerts ADD COLUMN latitude REAL")

        if "longitude" not in columns:
            conn.execute("ALTER TABLE alerts ADD COLUMN longitude REAL")


def add_sample_alerts():
    with get_db() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM alerts"
        ).fetchone()[0]

        if count == 0:
            conn.executemany("""
                INSERT INTO alerts
                (location, hazard, risk_level, risk_score, latitude, longitude)
                VALUES (?, ?, ?, ?, ?, ?)
            """, [
                ("Vijayawada River Basin", "Flood Risk", "CRITICAL", 92,
                 16.5062, 80.6480),
                ("Visakhapatnam Region", "Earthquake Activity", "MODERATE", 45,
                 17.6868, 83.2185),
                ("Guntur Region", "Heavy Rainfall Monitoring", "HIGH", 78,
                 16.3067, 80.4365),
            ])


@app.route("/")
def home():
    return jsonify({
        "message": "AI Geospatial Risk Mapping Backend is running!"
    })


@app.route("/api/health")
def health():
    return jsonify({
        "status": "success",
        "backend": "running"
    })


@app.route("/api/alerts", methods=["GET"])
def alerts():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM alerts ORDER BY id DESC"
        ).fetchall()

    return jsonify([dict(row) for row in rows])


@app.route("/api/incidents", methods=["GET", "POST"])
def incidents():
    if request.method == "GET":
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM incidents ORDER BY id DESC"
            ).fetchall()

        return jsonify([dict(row) for row in rows])

    data = request.get_json(silent=True) or {}

    hazard = str(data.get("hazard", "")).strip()
    location = str(data.get("location", "")).strip()
    severity = str(data.get("severity", "")).strip().upper()
    description = str(data.get("description", "")).strip()

    if not hazard or not location or not severity or not description:
        return jsonify({
            "error": "Hazard, location, severity and description are required."
        }), 400

    if hazard not in VALID_HAZARDS:
        return jsonify({"error": "Invalid hazard type."}), 400

    if severity not in VALID_SEVERITIES:
        return jsonify({"error": "Invalid severity level."}), 400

    if len(location) > 200 or len(description) > 3000:
        return jsonify({
            "error": "Location or description is too long."
        }), 400

    latitude = data.get("latitude")
    longitude = data.get("longitude")

    try:
        if latitude is not None:
            latitude = float(latitude)
            if not -90 <= latitude <= 90:
                raise ValueError()

        if longitude is not None:
            longitude = float(longitude)
            if not -180 <= longitude <= 180:
                raise ValueError()
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid coordinates."}), 400

    created_at = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        cursor = conn.execute("""
            INSERT INTO incidents
            (hazard, location, severity, description,
             latitude, longitude, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)
        """, (
            hazard, location, severity, description,
            latitude, longitude, created_at
        ))

        incident = conn.execute(
            "SELECT * FROM incidents WHERE id = ?",
            (cursor.lastrowid,)
        ).fetchone()

    return jsonify({
        "message": "Incident report submitted successfully.",
        "incident": dict(incident)
    }), 201


@app.route("/api/incidents/<int:incident_id>", methods=["PATCH"])
def update_incident(incident_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")

    if status not in VALID_STATUSES:
        return jsonify({
            "error": "Status must be Pending, Verified or Resolved."
        }), 400

    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM incidents WHERE id = ?",
            (incident_id,)
        ).fetchone()

        if existing is None:
            return jsonify({"error": "Incident not found."}), 404

        conn.execute(
            "UPDATE incidents SET status = ? WHERE id = ?",
            (status, incident_id)
        )

        updated = conn.execute(
            "SELECT * FROM incidents WHERE id = ?",
            (incident_id,)
        ).fetchone()

    return jsonify({
        "message": "Incident status updated.",
        "incident": dict(updated)
    })


@app.route("/api/live-warnings")
def live_warnings():
    try:
        response = requests.get(
            "https://mausam.imd.gov.in/api/warnings_district_api.php",
            timeout=15
        )
        response.raise_for_status()

        return jsonify({
            "source": "India Meteorological Department",
            "status": "success",
            "data": response.json()
        })

    except (requests.RequestException, ValueError):
        return jsonify({
            "source": "India Meteorological Department",
            "status": "error",
            "message": "Live official warnings are temporarily unavailable."
        }), 502


@app.route("/api/live-weather")
def live_weather():
    try:
        response = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": 16.5062,
                "longitude": 80.648,
                "current": (
                    "temperature_2m,relative_humidity_2m,"
                    "precipitation,rain,wind_speed_10m,weather_code"
                ),
                "timezone": "Asia/Kolkata"
            },
            timeout=15
        )

        response.raise_for_status()
        data = response.json()

        return jsonify({
            "status": "success",
            "source": "Open-Meteo",
            "location": "Vijayawada",
            "current_weather": data.get("current", {}),
            "units": data.get("current_units", {})
        })

    except requests.RequestException:
        return jsonify({
            "status": "error",
            "message": "Live weather is temporarily unavailable."
        }), 502


init_db()
add_sample_alerts()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
