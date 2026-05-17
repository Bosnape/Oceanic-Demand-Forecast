# Oceanic Demand Forecast — CLAUDE.md

Demand forecasting and inventory management platform for Colombian SMEs. Users upload historical sales/inventory data; the system trains per-SKU Prophet models and returns 90-day demand predictions.

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
│   │   ├── main.py            # FastAPI app — all endpoints
│   │   └── validation.py      # DataFrame validation and cleaning
│   ├── database/
│   │   ├── models.py          # SQLAlchemy models
│   │   ├── database.py        # Engine, session, table init
│   │   └── base.py            # Declarative base
│   ├── demand_forecast/
│   │   ├── prophet_demand_forecast.py   # Full ML pipeline
│   │   ├── prophet_window_evaluation.py # Offline window-size evaluation script
│   │   ├── compare_models.py            # ETS vs Prophet comparison utilities
│   │   ├── ets/                         # ETS baseline model implementation
│   │   ├── reference_sales.csv          # Reference dataset (35 SKUs)
│   │   └── ml_plots/                    # Evaluation charts and conclusions
│   ├── inventory/
│   │   ├── inventory_analysis.py
│   │   └── reference_inventory.csv
│   └── requirements.txt
└── frontend/src/
    ├── app/                   # Next.js App Router pages
    │   ├── dashboard/
    │   ├── predictions/
    │   ├── inventory/
    │   ├── data-ingestion/
    │   └── login/
    ├── components/            # Reusable React components
    │   ├── ui/                # shadcn/ui component library
    │   ├── charts/
    │   └── tables/
    ├── lib/
    │   ├── api.ts             # Typed Axios API client
    │   └── auth-context.tsx
    └── data/                  # Static reference data
```

---

## Running Locally

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/oceanic
```

```bash
python -m database.database   # initialize tables
uvicorn api.main:app --reload  # starts at http://localhost:8000
```

Interactive docs at `http://localhost:8000/docs`

### Frontend

```bash
cd frontend/src
npm install
npm run dev   # starts at http://localhost:3000
```

---

## Database Models (`backend/database/models.py`)

| Table | Key columns |
|---|---|
| `company` | `id`, `name` |
| `data_source` | `company_id`, `filename`, `status` (`uploaded→processing→ready/failed`), `upload_date` |
| `sales_transaction` | `company_id`, `item_id`, `store_id`, `cat_id`, `dept_id`, `date`, `units_sold`, `sell_price`, `holiday_promotion`, `event_name_1` |
| `prediction` | `company_id`, `item_id`, `forecast_date`, `predicted_demand`, `yhat_lower`, `yhat_upper` |
| `inventory_snapshot` | `company_id`, `item_id`, `store_id`, `date`, `inventory_on_hand`, `inventory_available`, `lead_time_days`, `unit_cost`, `reorder_quantity` |
| `inventory_analysis` | `company_id`, `item_id`, `analysis_date`, `avg_daily_forecast`, `safety_stock`, `reorder_point`, `days_of_stock`, `stockout_flag`, `stockout_date`, `slow_moving_flag`, `immobilized_capital`, `units_needed_next_month`, `stock_status` (`ok/low/critical`) |
| `model_metrics` | `company_id`, `item_id` (NULL = aggregate), `mae`, `rmse`, `mape`, `coverage_ic`, `bias`, `training_samples`, `validation_samples`, `seasonality_mode`, `created_at` |

The frontend API client types live in `frontend/src/lib/api.ts`.

---

## Sprint 3 — Pending User Stories

### US-15 — Sales View
*As a business owner, I want to explore historical sales data in a dedicated view so that I can analyze past performance by product, store, and time period.*

- The view displays a searchable and filterable table of sales transactions (by SKU, store, category, and date range).
- The view displays three KPI cards: total units sold, total revenue, and top-selling SKU for the selected period.
- A bar chart shows units sold per SKU for the selected period, ranked by volume.

Backend fully supports all filters via `GET /api/sales`. Frontend page (`/sales`) not yet implemented.

### US-17 — Demand Prediction Alerts
*As a business owner, I want to receive alerts when predicted demand deviates significantly from expected levels so that I can respond proactively.*

- The system identifies SKUs whose predicted demand deviates significantly from their recent historical behavior.
- Each alert displays the affected SKU, the deviation percentage, and whether it represents a demand surge or drop.
- Demand alerts are visible on the dashboard, visually differentiated from existing stockout alerts.

### US-18 — Future Inventory Projection
*As an inventory manager, I want to see how stock levels are projected to evolve over the next 30 days so that I can plan replenishment more accurately.*

- The system projects stock evolution per SKU over the next 30 days using demand forecasts and current inventory levels.
- The projection identifies periods where stock is expected to fall below the reorder point.
- Results are displayed as a line chart on the inventory page with a visual reference for the reorder threshold.

### US-19 — Report Export
*As a data analyst, I want to export dashboard results in CSV format so that I can share findings and support planning meetings outside the platform.*

- The user can download forecast data in CSV format from the predictions page.
- The user can download inventory data in CSV format from the inventory page.
- Downloaded files contain accurate data matching what is currently displayed on screen.

### US-20 — Audit Logs
*As a data analyst, I want to review logs of data loads and model execution history so that I can monitor system activity and diagnose issues.*

- The system records each data upload with: filename, date, status, and number of records processed.
- The system records each ML model execution with: execution date and resulting accuracy metrics.
- Records are accessible through a dedicated view in the interface.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/upload-sales` | Upload sales CSV/XLSX — triggers Prophet pipeline in background |
| `POST` | `/upload-inventory` | Upload inventory snapshot CSV/XLSX |
| `GET` | `/api/predictions` | Forecast results, filterable by `item_id`, `date_from`, `date_to` |
| `GET` | `/api/predictions/status` | Pipeline status (`uploaded → processing → ready/failed`) + `last_run_at` timestamp |
| `GET` | `/api/predictions/metrics` | Prophet model accuracy metrics (MAE, RMSE, MAPE, coverage, bias) per SKU and aggregate |
| `GET` | `/api/sales` | Historical sales, filterable by SKU, store, category, date range |
| `GET` | `/api/sales/range` | Min/max date in sales data |
| `GET` | `/api/inventory` | Stock levels per SKU with full analysis fields (reorder point, safety stock, slow-moving flag) |
| `GET` | `/api/inventory/alerts` | Stockout risk alerts per SKU, ordered by urgency; uses Prophet forecast or historical fallback |

---

## Coding Standards

### Python (backend & ML)

PEP 8, enforced by **Flake8** and formatted by **Black** (88-char line limit).

| Element | Convention | Example |
|---|---|---|
| Functions & variables | `snake_case` | `validate_sales_dataframe` |
| Classes | `PascalCase` | `ValidationResult` |
| Constants | `UPPER_SNAKE_CASE` | `DATABASE_URL` |
| Files & modules | `snake_case` | `prophet_demand_forecast.py` |

```bash
nbqa black .                        # auto-format
nbqa flake8 . --ignore=E402,E203   # lint check
```

All new Python functions must include a docstring.

### TypeScript / React (frontend)

| Element | Convention | Example |
|---|---|---|
| Components & files | `PascalCase` | `ForecastChart.tsx` |
| Route directories | `kebab-case` | `data-ingestion/` |
| Functions, hooks, variables | `camelCase` | `getSalesRange` |
| TypeScript interfaces | `PascalCase` | `KpiCardProps` |

All exported TypeScript components must include a JSDoc comment.

### Database

Tables and columns follow `snake_case` (e.g. `sales_transaction`, `lead_time_days`).

### General

- Never leave commented-out code in `main`. Use branches or stashes.
- Do not suppress linter warnings without a documented reason.

---

## Git Workflow

**GitHub Flow** — `main` is always production-ready. All work in short-lived branches merged via PR.

### Branch naming

| Prefix | Use case | Example |
|---|---|---|
| `feature/` | New functionality | `feature/stockout-alerts` |
| `fix/` | Bug fixes | `fix/unsupported-format-error` |
| `chore/` | Config, docs, tooling | `chore/update-requirements` |

### Commit messages

```
<type>: <short description in imperative mood>

[optional body]
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `style`

Rules:
- Imperative mood: *add*, *fix*, *update* — not *added*, *fixed*, *updated*
- Subject line under 72 characters
- Multi-layer changes: one commit per layer with consistent type and description
- No generic messages (`fix stuff`, `wip`, `update`) in `main`

### Pull Requests

- Title follows commit message format: `feat: add date range filter to forecast chart`
- Description must include **What** (summary per layer) and **Related issue** (`Closes US-12`)
- At least one team member must review and approve before merging
- Author does not merge their own PR unless deadline is imminent (leave a note)
- Do not open a PR with broken CI

---

## Technical Debt

### Static Code Analysis (deferred from Sprint 2)

Flake8 reports 364 issues across the backend. The three functional ones to fix first:
- `api/main.py:580` — `F401` `sqlalchemy.orm.aliased` imported but unused
- `api/main.py:100` — `F841` local variable `e` assigned but never used
- `tests/test_inventory_analysis.py:18` — `F401` `SLOW_MOVING_DOH_THRESHOLD` imported but unused

The remaining 361 issues are style (line length, spacing, blank lines) — run `black .` inside `backend/` to auto-fix the bulk of them, then re-run `flake8` to catch anything Black doesn't handle.
