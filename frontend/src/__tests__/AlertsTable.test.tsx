/**
 * Component tests for AlertsTable.
 *
 * Covers US-11 — Stockout Alerts & Risk Identification:
 *   - empty state message when no alerts exist
 *   - critical alert row renders correctly with badge and item ID
 *
 * API calls are mocked so tests are self-contained.
 */

import { render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom"
import { AlertsTable } from "@/components/alerts-table"
import { getInventoryAlerts } from "@/lib/api"
import type { StockoutAlert } from "@/lib/api"

jest.mock("@/lib/api", () => ({
  getInventoryAlerts: jest.fn(),
}))

const mockedGetInventoryAlerts = getInventoryAlerts as jest.MockedFunction<
  typeof getInventoryAlerts
>

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

function makeCriticalAlert(overrides: Partial<StockoutAlert> = {}): StockoutAlert {
  return {
    item_id: "CRIT-001",
    store_id: "S1",
    current_stock: 5,
    lead_time_days: 10,
    avg_daily_demand: 10.0,
    demand_during_lead_time: 100.0,
    days_of_stock: 0.5,
    stockout_date: "2024-02-01",
    stock_status: "critical",
    units_to_order: 120,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks()
})

describe("AlertsTable — stockout alerts (US-11)", () => {
  it("shows empty state message when API returns no alerts", async () => {
    mockedGetInventoryAlerts.mockResolvedValueOnce({
      alerts: [],
      alert_mode: "no_data",
      message: "",
    })

    render(<AlertsTable />)

    await waitFor(() => {
      expect(
        screen.getByText(/sin alertas activas/i)
      ).toBeInTheDocument()
    })
  })

  it("renders critical alert row with 'Crítico' badge and item_id", async () => {
    mockedGetInventoryAlerts.mockResolvedValueOnce({
      alerts: [makeCriticalAlert()],
      alert_mode: "forecast",
      message: "Alertas basadas en demanda proyectada.",
    })

    render(<AlertsTable />)

    await waitFor(() => {
      expect(screen.getByText("Crítico")).toBeInTheDocument()
      expect(screen.getByText("CRIT-001")).toBeInTheDocument()
    })
  })
})
