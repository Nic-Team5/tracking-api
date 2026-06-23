from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx
from bs4 import BeautifulSoup
from datetime import datetime
from typing import Dict, Any

app = FastAPI()

# CORS pentru PenguinMod
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# ENDPOINT - Tracking AWB
# ==========================================
@app.get("/track/{awb}")
async def track_awb(awb: str):
    try:
        result = await track_all(awb)
        return result
    except Exception as e:
        return {
            "success": False,
            "awb": awb,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

# ==========================================
# FUNCȚIA - Încearcă toți curierii
# ==========================================
async def track_all(awb: str) -> Dict[str, Any]:
    awb = awb.strip().upper()
    
    couriers = [
        ("Sameday", track_sameday),
        ("Fan Courier", track_fan),
        ("Cargus", track_cargus),
        ("DPD", track_dpd)
    ]
    
    for name, func in couriers:
        try:
            result = await func(awb)
            if result.get("events") and len(result["events"]) > 0:
                return {
                    "success": True,
                    "awb": awb,
                    "courier": name,
                    "status": result.get("status", "Necunoscut"),
                    "events": result["events"],
                    "lastUpdate": datetime.now().isoformat()
                }
        except Exception as e:
            print(f"Eroare {name}: {e}")
            continue
    
    return {
        "success": False,
        "awb": awb,
        "courier": "Necunoscut",
        "status": "Negăsit",
        "events": [],
        "lastUpdate": datetime.now().isoformat()
    }

# ==========================================
# FUNCȚIA - Tracking Sameday
# ==========================================
async def track_sameday(awb: str) -> Dict[str, Any]:
    url = f"https://www.sameday.ro/api/awb/{awb}/status"
    
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url)
        data = response.json()
        
        events = []
        for status in data.get("statuses", []):
            events.append({
                "date": status.get("date", ""),
                "status": status.get("status", ""),
                "location": status.get("location", ""),
                "description": status.get("description", "")
            })
        
        return {
            "status": data.get("currentStatus", "Necunoscut"),
            "events": events
        }

# ==========================================
# FUNCȚIA - Tracking Fan Courier
# ==========================================
async def track_fan(awb: str) -> Dict[str, Any]:
    url = f"https://www.fancourier.ro/awb-online/?awb={awb}"
    
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        events = []
        rows = soup.select("table tbody tr")
        for row in rows:
            cols = row.find_all("td")
            if len(cols) >= 3:
                events.append({
                    "date": cols[0].text.strip(),
                    "status": cols[1].text.strip(),
                    "location": cols[2].text.strip()
                })
        
        return {
            "status": events[-1]["status"] if events else "Necunoscut",
            "events": events
        }

# ==========================================
# FUNCȚIA - Tracking Cargus
# ==========================================
async def track_cargus(awb: str) -> Dict[str, Any]:
    url = f"https://www.cargus.ro/ro/track-trace?awb={awb}"
    
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        events = []
        status_elements = soup.select(".status-item, .tracking-item")
        for elem in status_elements:
            text = elem.text.strip()
            if text and len(text) > 3:
                events.append({
                    "date": "",
                    "status": text,
                    "location": ""
                })
        
        return {
            "status": events[-1]["status"] if events else "Necunoscut",
            "events": events
        }

# ==========================================
# FUNCȚIA - Tracking DPD
# ==========================================
async def track_dpd(awb: str) -> Dict[str, Any]:
    url = f"https://www.dpd.ro/parcel-tracking?parcelNumber={awb}"
    
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        events = []
        status_elements = soup.select(".event, .tracking-event")
        for elem in status_elements:
            text = elem.text.strip()
            if text and len(text) > 3:
                events.append({
                    "date": "",
                    "status": text,
                    "location": ""
                })
        
        return {
            "status": events[-1]["status"] if events else "Necunoscut",
            "events": events
        }

# ==========================================
# ENDPOINT - Sănătate server
# ==========================================
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "service": "Tracking API"
    }

# ==========================================
# ENDPOINT - Pagina principală
# ==========================================
@app.get("/")
async def root():
    return {
        "service": "Tracking API România",
        "version": "1.0.0",
        "endpoints": {
            "/track/{awb}": "Tracking AWB (GET)",
            "/health": "Health check (GET)",
            "/": "This page (GET)"
        },
        "couriers": ["Sameday", "Fan Courier", "Cargus", "DPD"]
  }
