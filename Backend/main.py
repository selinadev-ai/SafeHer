import os
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import json, os
from datetime import datetime
from typing import List, Optional
import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.neighbors import BallTree

app = FastAPI(
    title="SafeHer Risk Prediction API",
    description="Women Safety Risk Prediction and Emergency Route Assessment Service",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "risk_model.pkl")

model = None
feature_names = []
ball_tree = None
search_radius = 0.0


def load_artifacts():
    global model, feature_names, ball_tree, search_radius
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model file not found at {MODEL_PATH}")
    data = joblib.load(MODEL_PATH)
    if not isinstance(data, dict):
        raise ValueError("Pickle file does not contain a dictionary of artifacts")
    model = data["model"]
    feature_names = data.get(
        "features",
        ["latitude", "longitude", "hour", "day_of_week", "is_night", "incident_density"],
    )
    train_coords = np.array(data["train_coords"])
    search_radius = float(data.get("radius", 7.848061528802385e-05))
    ball_tree = BallTree(train_coords, metric="haversine")
    print(f"Artifacts loaded successfully: {len(train_coords)} training coordinates, radius {search_radius}")
    print(f"Model expects features: {feature_names}")


try:
    load_artifacts()
except Exception as exc:
    print(f"Warning during initial artifact loading: {exc}")


class RiskRequest(BaseModel):
    lat: float = Field(..., description="Latitude in decimal degrees", example=28.5355)
    lng: float = Field(..., description="Longitude in decimal degrees", example=77.2410)
    timestamp: Optional[str] = Field(
        default=None,
        description="ISO 8601 timestamp string (defaults to current time)",
        example="2026-09-16T22:30:00",
    )


class RiskResponse(BaseModel):
    risk_level: str = Field(..., description="Predicted risk level: Low, Medium, or High")
    confidence: float = Field(..., description="Model prediction probability for predicted class")
    incident_density: int = Field(..., description="Number of historical incidents within radius")
    hour_of_day: int
    day_of_week: int
    is_night: int
    probabilities: dict


class PointItem(BaseModel):
    lat: float = Field(..., description="Latitude in decimal degrees")
    lng: float = Field(..., description="Longitude in decimal degrees")


class BatchRiskRequest(BaseModel):
    points: List[PointItem]
    timestamp: Optional[str] = None


class BatchRiskResponse(BaseModel):
    results: List[RiskResponse]
    summary: dict


def parse_timestamp(timestamp_str: Optional[str]) -> datetime:
    if not timestamp_str:
        return datetime.now()
    try:
        clean_str = timestamp_str.replace("Z", "+00:00")
        return datetime.fromisoformat(clean_str)
    except Exception:
        return datetime.now()


def build_feature_row(lat: float, lng: float, dt: datetime, density: int) -> dict:
    """
    Builds a feature dict containing BOTH naming conventions
    ("hour" and "hour_of_day") so it works regardless of which
    names the loaded model's feature_names list expects.
    """
    hour_of_day = int(dt.hour)
    day_of_week = int(dt.weekday())
    is_night = 1 if (hour_of_day >= 20 or hour_of_day < 6) else 0

    return {
        "latitude": float(lat),
        "longitude": float(lng),
        "hour": hour_of_day,
        "hour_of_day": hour_of_day,
        "day_of_week": day_of_week,
        "is_night": is_night,
        "incident_density": density,
    }


@app.get("/")
def index():
    return {
        "service": "SafeHer Risk Prediction API",
        "status": "operational",
        "model_classes": list(getattr(model, "classes_", [])) if model else [],
        "version": "1.0.0",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "ball_tree_ready": ball_tree is not None,
        "expected_features": feature_names,
    }


@app.post("/predict-risk", response_model=RiskResponse)
def predict_risk(req: RiskRequest):
    if model is None or ball_tree is None:
        raise HTTPException(status_code=503, detail="Risk model not loaded")

    dt = parse_timestamp(req.timestamp)
    query_rad = np.radians([[req.lat, req.lng]])
    density = int(ball_tree.query_radius(query_rad, r=search_radius, count_only=True)[0])

    row = build_feature_row(req.lat, req.lng, dt, density)
    df_input = pd.DataFrame([row])[feature_names]

    pred = str(model.predict(df_input)[0])
    probs = model.predict_proba(df_input)[0]
    classes = list(model.classes_)
    prob_dict = {cls_name: round(float(prob), 4) for cls_name, prob in zip(classes, probs)}
    confidence = round(float(probs.max()), 4)

    return RiskResponse(
        risk_level=pred,
        confidence=confidence,
        incident_density=density,
        hour_of_day=row["hour_of_day"],
        day_of_week=row["day_of_week"],
        is_night=row["is_night"],
        probabilities=prob_dict,
    )


@app.post("/predict-risk/batch", response_model=BatchRiskResponse)
def predict_risk_batch(req: BatchRiskRequest):
    if model is None or ball_tree is None:
        raise HTTPException(status_code=503, detail="Risk model not loaded")
    if not req.points:
        return BatchRiskResponse(results=[], summary={"total": 0})

    dt = parse_timestamp(req.timestamp)
    coords_deg = np.array([[p.lat, p.lng] for p in req.points])
    coords_rad = np.radians(coords_deg)
    densities = ball_tree.query_radius(coords_rad, r=search_radius, count_only=True)

    rows = []
    for i, p in enumerate(req.points):
        rows.append(build_feature_row(p.lat, p.lng, dt, int(densities[i])))

    df_input = pd.DataFrame(rows)[feature_names]
    predictions = model.predict(df_input)
    probabilities = model.predict_proba(df_input)
    classes = list(model.classes_)

    results = []
    level_counts = {"Low": 0, "Medium": 0, "High": 0}
    total_risk_score = 0.0
    risk_weight = {"Low": 1.0, "Medium": 2.0, "High": 3.0}

    for i in range(len(req.points)):
        pred = str(predictions[i])
        probs = probabilities[i]
        prob_dict = {cls_name: round(float(prob), 4) for cls_name, prob in zip(classes, probs)}
        conf = round(float(probs.max()), 4)
        level_counts[pred] = level_counts.get(pred, 0) + 1
        total_risk_score += risk_weight.get(pred, 1.0)

        results.append(
            RiskResponse(
                risk_level=pred,
                confidence=conf,
                incident_density=int(densities[i]),
                hour_of_day=rows[i]["hour_of_day"],
                day_of_week=rows[i]["day_of_week"],
                is_night=rows[i]["is_night"],
                probabilities=prob_dict,
            )
        )

    avg_risk = round(total_risk_score / len(req.points), 3) if req.points else 0.0
    return BatchRiskResponse(
        results=results,
        summary={
            "total_points": len(req.points),
            "counts": level_counts,
            "average_risk_score": avg_risk,
            "overall_assessment": "High" if avg_risk > 2.2 else ("Medium" if avg_risk > 1.4 else "Low"),
        },
    )

# ===== SOS =====
SOS_LOG = "sos_log.json"


class SOSRequest(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    contacts: List[str] = []
    message: str = ""


@app.post("/sos")
def log_sos(req: SOSRequest):
    entry = {
        "timestamp": datetime.now().isoformat(),
        "lat": req.lat,
        "lng": req.lng,
        "contacts_notified": len(req.contacts),
        "message": req.message,
    }
    logs = []
    if os.path.exists(SOS_LOG):
        try:
            with open(SOS_LOG, "r") as f:
                logs = json.load(f)
        except Exception:
            logs = []
    logs.append(entry)
    with open(SOS_LOG, "w") as f:
        json.dump(logs, f, indent=2)
    return {"status": "logged", "entry": entry}


@app.get("/sos/history")
def sos_history():
    if not os.path.exists(SOS_LOG):
        return {"alerts": []}
    with open(SOS_LOG, "r") as f:
        return {"alerts": json.load(f)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)