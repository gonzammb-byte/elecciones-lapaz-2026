import requests
import json
import os
from datetime import datetime, timezone

BASE = "https://computo.oep.org.bo"
API = f"{BASE}/api/v1"
DEPT_ID = 2  # La Paz
OUT = "resultados"

os.makedirs(OUT, exist_ok=True)

def guardar(nombre, data):
    path = f"{OUT}/{nombre}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {path}")

def fetch(params):
    r = requests.get(f"{API}/results", params=params, timeout=30)
    r.raise_for_status()
    return r.json()

print("=== Cargando geografía de La Paz ===")
geo = requests.get(f"{BASE}/geografiaNacional.json", timeout=30).json()
la_paz = next(d for d in geo[0]['d'] if d['i'] == DEPT_ID)
provincias = la_paz['p']
print(f"  {len(provincias)} provincias encontradas")

# Mapa provincia_id → nombre y municipios
prov_map = {p['i']: {"nombre": p['n'], "municipios": p['m']} for p in provincias}

timestamp = datetime.now(timezone.utc).isoformat()

# ── Gobernador (nivel departamento) ──────────────────────────────────
print("\n=== Gobernador ===")
data = fetch({"candidacy_type_id": 4, "department_id": DEPT_ID})
guardar("gobernador", {"actualizado": timestamp, "scope": "department", "data": data})

# ── Asambleísta Población (nivel departamento) ───────────────────────
print("\n=== Asambleísta Población ===")
data = fetch({"candidacy_type_id": 8, "department_id": DEPT_ID})
guardar("asambleista_poblacion", {"actualizado": timestamp, "scope": "department", "data": data})

# ── Asambleísta Territorio (nivel provincia) ─────────────────────────
print("\n=== Asambleísta Territorio ===")
territorio = {"actualizado": timestamp, "scope": "province", "provincias": {}}
for prov in provincias:
    try:
        data = fetch({"candidacy_type_id": 7, "department_id": DEPT_ID, "province_id": prov['i']})
        territorio["provincias"][prov['n']] = {"provincia_id": prov['i'], "data": data}
        print(f"  ✓ {prov['n']}")
    except Exception as e:
        print(f"  ✗ {prov['n']}: {e}")
guardar("asambleista_territorio", territorio)

# ── Alcalde + Concejal (nivel municipio) ─────────────────────────────
print("\n=== Alcalde y Concejal ===")
alcaldes  = {"actualizado": timestamp, "scope": "municipality", "municipios": {}}
concejales = {"actualizado": timestamp, "scope": "municipality", "municipios": {}}

for prov in provincias:
    for mun in prov['m']:
        key = f"{prov['n']} / {mun['n']}"
        params_base = {
            "department_id": DEPT_ID,
            "province_id": prov['i'],
            "municipality_id": mun['i']
        }
        meta = {"provincia": prov['n'], "provincia_id": prov['i'],
                "municipio_id": mun['i']}
        try:
            d = fetch({**params_base, "candidacy_type_id": 13})
            alcaldes["municipios"][key] = {**meta, "data": d}
        except Exception as e:
            print(f"  ✗ Alcalde {key}: {e}")

        try:
            d = fetch({**params_base, "candidacy_type_id": 14})
            concejales["municipios"][key] = {**meta, "data": d}
        except Exception as e:
            print(f"  ✗ Concejal {key}: {e}")

    print(f"  ✓ {prov['n']} ({len(prov['m'])} municipios)")

guardar("alcalde", alcaldes)
guardar("concejal", concejales)

# ── Metadata general ─────────────────────────────────────────────────
titulo = requests.get(f"{BASE}/api/v1/config/titulo", timeout=30).json()
meta = {
    "actualizado": timestamp,
    "titulo": titulo,
    "departamento": "La Paz",
    "department_id": DEPT_ID,
    "provincias": [{"id": p['i'], "nombre": p['n'],
                    "municipios": [{"id": m['i'], "nombre": m['n']} for m in p['m']]}
                   for p in provincias]
}
guardar("meta", meta)

print("\n🎉 ¡Listo! Archivos generados en resultados/")
