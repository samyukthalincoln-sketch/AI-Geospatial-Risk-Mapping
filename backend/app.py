
from flask import Flask, jsonify
from flask_cors import CORS
import sqlite3
import requests
from pathlib import Path

app = Flask(__name__)
CORS(app)

DB_PATH = Path(__file__).parent / "disaster_risk.db"



def init_db():
    with sqlite3.connect(DB_PATH) as conn:
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

        columns = [
            row[1]
            for row in conn.execute("PRAGMA table_info(alerts)")
        ]

        if "latitude" not in columns:
            conn.execute("ALTER TABLE alerts ADD COLUMN latitude REAL")

        if "longitude" not in columns:
            conn.execute("ALTER TABLE alerts ADD COLUMN longitude REAL")



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


@app.route("/api/alerts")
def alerts():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM alerts ORDER BY id DESC"
        ).fetchall()

    return jsonify([dict(row) for row in rows])
    
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

    except requests.RequestException:
        return jsonify({
            "source": "India Meteorological Department",
            "status": "error",
            "message": "Live warnings are temporarily unavailable."
        }), 502


def add_sample_alerts():
    with sqlite3.connect(DB_PATH) as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM alerts"
        ).fetchone()[0]

        if count == 0:
            conn.executemany(
                """INSERT INTO alerts
                (location, hazard, risk_level, risk_score)
                VALUES (?, ?, ?, ?)""",
                [
                    ("Coastal Zone", "Heavy Rainfall", "HIGH", 78),
                    ("Seismic Zone", "Earthquake Activity", "MODERATE", 45),
                    ("River Basin", "Flood Risk", "CRITICAL", 92),
                ],
            )


add_sample_alerts()
init_db()

def add_coordinates():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            UPDATE alerts
            SET latitude = 16.5062, longitude = 80.648
            WHERE location = 'River Basin'
        """)

        conn.execute("""
            UPDATE alerts
            SET latitude = 17.6868, longitude = 83.2185
            WHERE location = 'Seismic Zone'
        """)

        conn.execute("""
            UPDATE alerts
            SET latitude = 16.3067, longitude = 80.4365
            WHERE location = 'Coastal Zone'
        """)


add_coordinates()

@app.route("/api/live-weather")
def live_weather():
    try:
        response = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": 16.5062,
                "longitude": 80.648,
                "current": "temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,weather_code",
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

if __name__ == "__main__":
    app.run(debug=True, port=5000)
