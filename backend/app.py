
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import psycopg
from psycopg.rows import dict_row
import requests
from pathlib import Path
from datetime import datetime, timezone
import uuid
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

DB_PATH = Path(__file__).parent / "disaster_risk.db"
UPLOAD_FOLDER = Path(__file__).parent / "uploads"
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp"
}

app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

VALID_HAZARDS = {
    "Flood", "Fire", "Earthquake",
    "Heavy Rainfall", "Cyclone", "Landslide", "Other"
}

VALID_SEVERITIES = {"LOW", "MODERATE", "HIGH", "CRITICAL"}
VALID_STATUSES = {"Pending", "Verified", "Resolved"}


import os
import psycopg
from psycopg.rows import dict_row

def get_db():
    return psycopg.connect(
        os.environ["DATABASE_URL"],
        row_factory=dict_row
    )



def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id BIGSERIAL PRIMARY KEY,
                location TEXT NOT NULL,
                hazard TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                risk_score INTEGER NOT NULL,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id BIGSERIAL PRIMARY KEY,
                hazard TEXT NOT NULL,
                location TEXT NOT NULL,
                severity TEXT NOT NULL,
                description TEXT NOT NULL,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                status TEXT NOT NULL DEFAULT 'Pending',
                created_at TEXT NOT NULL,
                photo_path TEXT
            )
        """)

        conn.execute("""
            ALTER TABLE alerts
            ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION
        """)

        conn.execute("""
            ALTER TABLE alerts
            ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION
        """)

        conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS photo_path TEXT
        """)




def add_sample_alerts():
    with get_db() as conn:
        count = conn.execute(
            "SELECT COUNT(*) AS count FROM alerts"
        ).fetchone()["count"]

        if count == 0:
            with conn.cursor() as cur:
                cur.executemany("""
                    INSERT INTO alerts
                    (location, hazard, risk_level, risk_score, latitude, longitude)
                    VALUES (%s, %s, %s, %s, %s, %s)
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

    # Accept both normal JSON and photo-upload forms.
    if request.content_type and "multipart/form-data" in request.content_type:
        data = request.form
    else:
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

    latitude = data.get("latitude") or None
    longitude = data.get("longitude") or None

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

    photo = request.files.get("photo")
    photo_path = None

    if photo and photo.filename:
        extension = Path(photo.filename).suffix.lower()

        if extension not in ALLOWED_IMAGE_EXTENSIONS:
            return jsonify({
                "error": "Please upload a JPG, PNG or WEBP image."
            }), 400

        if not photo.mimetype or not photo.mimetype.startswith("image/"):
            return jsonify({"error": "The uploaded file must be an image."}), 400

        safe_name = secure_filename(photo.filename)

        if not safe_name:
            return jsonify({"error": "Invalid photo filename."}), 400

        result = cloudinary.uploader.upload(
            photo,
            folder="geoguard_incidents",
            resource_type="image"
        )
        photo_path = result["secure_url"]

    created_at = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        incident = conn.execute("""
            INSERT INTO incidents
            (hazard, location, severity, description,
             latitude, longitude, status, created_at, photo_path)
            VALUES (%s, %s, %s, %s, %s, %s, 'Pending', %s, %s)
            RETURNING *
        """, (
            hazard, location, severity, description,
            latitude, longitude, created_at, photo_path
        )).fetchone()

    return jsonify({
        "message": "Incident report submitted successfully.",
        "incident": dict(incident)
    }), 201

@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(str(UPLOAD_FOLDER), filename)
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
            "SELECT id FROM incidents WHERE id = %s",
            (incident_id,)
        ).fetchone()

        if existing is None:
            return jsonify({"error": "Incident not found."}), 404

        conn.execute(
            "UPDATE incidents SET status = %s WHERE id = %s",
            (status, incident_id)
        )

        updated = conn.execute(
            "SELECT * FROM incidents WHERE id = %s",
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
