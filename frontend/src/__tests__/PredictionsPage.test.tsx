/**
 * Component tests for the Predictions page and ReliabilityBanner.
 *
 * Covers:
 *  - US-12: predictions page renders the correct UI state (no_data / processing)
 *            based on the value returned by getPredictionsStatus.
 *  - US-13: ReliabilityBanner classifies model reliability as "Alta fiabilidad"
 *            or "Fiabilidad baja" based on the percentage of SKUs with MAPE < 30.
 */

import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { getPredictionsStatus } from "@/lib/api"
import { ReliabilityBanner } from "@/app/predictions/page"
import type { SkuMetrics } from "@/lib/api"

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/api", () => ({
  getPredictionsStatus: jest.fn(),
  getPredictions: jest.fn().mockResolvedValue([]),
  getSales: jest.fn().mockResolvedValue([]),
  getModelMetrics: jest.fn().mockResolvedValue({ aggregate: null, per_sku: [] }),
}))

jest.mock("@/components/dashboard-layout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ReferenceLine: () => null,
  Area: () => null,
}))

const mockGetPredictionsStatus = getPredictionsStatus as jest.MockedFunction<
  typeof getPredictionsStatus
>

// ---------------------------------------------------------------------------
// US-12 — Predictions page pipeline state display
// ---------------------------------------------------------------------------

describe("PredictionsPage — pipeline state display (US-12)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("shows the no-data message when no predictions exist", async () => {
    mockGetPredictionsStatus.mockResolvedValue({
      status: "no_data",
      message: "No files uploaded yet.",
    })

    const PredictionsPage = (await import("@/app/predictions/page")).default
    render(<PredictionsPage />)

    await waitFor(() => {
      expect(
        screen.getByText("No hay predicciones disponibles.")
      ).toBeInTheDocument()
    })
  })

  it("shows the processing message while the pipeline is running", async () => {
    mockGetPredictionsStatus.mockResolvedValue({
      status: "processing",
      message: "Forecast is being generated.",
    })

    const PredictionsPage = (await import("@/app/predictions/page")).default
    render(<PredictionsPage />)

    await waitFor(() => {
      expect(
        screen.getByText(/El modelo está generando las predicciones/)
      ).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// US-13 — ReliabilityBanner model reliability classification
// ---------------------------------------------------------------------------

function makeSkuMetrics(mape: number): SkuMetrics {
  return {
    item_id: `SKU-${mape}`,
    mape,
    mae: 1,
    rmse: 1,
    coverage_ic: 0.8,
    bias: 0,
    training_samples: 100,
    validation_samples: 10,
    seasonality_mode: "multiplicative",
    last_updated: null,
  }
}

describe("ReliabilityBanner — model reliability classification (US-13)", () => {
  it("shows 'Alta fiabilidad' when 80%+ of SKUs have MAPE < 30", () => {
    // 5 out of 5 SKUs with MAPE < 30 → 100% → Alta fiabilidad
    const perSku = [10, 15, 20, 25, 28].map(makeSkuMetrics)

    render(<ReliabilityBanner perSku={perSku} />)

    expect(screen.getByText(/Alta fiabilidad/)).toBeInTheDocument()
  })

  it("shows 'Fiabilidad baja' when fewer than 60% of SKUs have MAPE < 30", () => {
    // 1 out of 5 SKUs with MAPE < 30 → 20% → Fiabilidad baja
    const perSku = [10, 40, 50, 60, 70].map(makeSkuMetrics)

    render(<ReliabilityBanner perSku={perSku} />)

    expect(screen.getByText(/Fiabilidad baja/)).toBeInTheDocument()
  })
})
