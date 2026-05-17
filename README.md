# Oceanic Demand Forecast

Demand forecasting and inventory management platform for Colombian SMEs. Users upload historical sales and inventory data; the system trains per-SKU Prophet models and returns 90-day demand predictions with actionable inventory alerts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Recharts |
| Backend | FastAPI, Python 3.10+, SQLAlchemy, PostgreSQL |
| ML Pipeline | Prophet, scikit-learn, pandas, numpy |
| Auth | Session-based (sessionStorage), demo mode |

---

## Project Structure

```
Oceanic-Demand-Forecast/
├── backend/
│   ├── api/
│   │   ├── main.py               # FastAPI app — all endpoints
│   │   └── validation.py         # DataFrame validation and cleaning
│   ├── database/
│   │   ├── models.py             # SQLAlchemy models
│   │   ├── database.py           # Engine, session, table init
│   │   └── base.py               # Declarative base
│   ├── demand_forecast/
│   │   ├── prophet_demand_forecast.py   # Full ML pipeline
│   │   ├── reference_sales.csv          # Reference dataset (35 SKUs)
│   │   └── ml_plots/                    # Generated evaluation plots
│   ├── inventory/
│   │   ├── inventory_analysis.py
│   │   └── reference_inventory.csv
│   └── requirements.txt
└── frontend/src/
    ├── app/
    │   ├── dashboard/            # KPI cards, charts, and alerts
    │   ├── ventas-historicas/    # Historical sales explorer
    │   ├── predictions/          # Forecast table and model metrics
    │   ├── inventory/            # Stock levels, alerts, and projection
    │   ├── data-ingestion/       # File upload
    │   ├── logs/                 # Audit logs
    │   └── login/
    ├── components/
    │   ├── ui/                   # shadcn/ui component library
    │   ├── charts/
    │   └── tables/
    └── lib/
        ├── api.ts                # Typed Axios API client
        └── auth-context.tsx
```

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL

---

## Running Locally

### 1. Clone the repository

```bash
git clone <repo-url>
cd Oceanic-Demand-Forecast
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Mac/Linux
# venv\Scripts\activate       # Windows
pip install -r requirements.txt
```

Create `backend/.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/oceanic
```

```bash
python -m database.database   # initialize tables
uvicorn api.main:app --reload  # http://localhost:8000
```

Interactive docs at `http://localhost:8000/docs`

### 3. Frontend

```bash
cd frontend/src
npm install
npm run dev  # http://localhost:3000
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/upload-sales` | Upload sales CSV/XLSX — triggers Prophet pipeline in background |
| `POST` | `/upload-inventory` | Upload inventory snapshot CSV/XLSX |
| `GET` | `/api/predictions` | Forecast results, filterable by `item_id`, `date_from`, `date_to` |
| `GET` | `/api/predictions/status` | Pipeline status (`uploaded → processing → ready/failed`) |
| `GET` | `/api/predictions/metrics` | Model accuracy metrics (MAE, RMSE, MAPE, coverage, bias) per SKU |
| `GET` | `/api/sales` | Historical sales, filterable by SKU, store, category, date range |
| `GET` | `/api/sales/range` | Min/max date available in sales data |
| `GET` | `/api/inventory` | Stock levels per SKU with reorder point, safety stock, and slow-moving flags |
| `GET` | `/api/inventory/alerts` | Stockout risk alerts ordered by urgency |
| `GET` | `/api/demand-alerts` | Demand deviation alerts (forecast vs. recent historical, ≥25% threshold) |
| `GET` | `/api/logs/uploads` | Data upload history |
| `GET` | `/api/logs/model-executions` | ML model execution history |

---

## File Formats

### Sales file

| Column | Required | Type |
|---|---|---|
| `date` | Yes | Date |
| `item_id` | Yes | String |
| `units_sold` | Yes | Integer |
| `sell_price` | Yes | Float |
| `store_id` | No | String |
| `cat_id` | No | String |
| `dept_id` | No | String |
| `holiday_promotion` | No | Integer |
| `event_name_1` | No | String |

### Inventory file

| Column | Required | Type |
|---|---|---|
| `date` | Yes | Date |
| `item_id` | Yes | String |
| `store_id` | Yes | String |
| `inventory_on_hand` | Yes | Integer |
| `lead_time_days` | Yes | Integer |
| `unit_cost` | Yes | Float |
| `inventory_available` | No | Integer |
| `reorder_quantity` | No | Integer |
