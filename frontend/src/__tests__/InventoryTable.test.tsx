/**
 * Component tests for InventoryTable.
 *
 * Covers:
 *   US-08 — slow-moving badge renders when slow_moving_flag is true
 *   US-10 — reorder badge renders when stock is below reorder_point
 *   US-10 — search filter works correctly
 */

import { fireEvent, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom"
import { InventoryTable } from "@/components/tables/InventoryTable"
import type { InventoryItem } from "@/lib/api"

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    item_id: "SKU-001",
    store_id: "S1",
    current_stock: 100,
    available_stock: 100,
    lead_time_days: 7,
    unit_cost: 10.0,
    next_month_forecast: 300,
    stock_status: "ok",
    last_updated: "2024-01-01",
    reorder_point: null,
    slow_moving_flag: null,
    immobilized_capital: null,
    days_of_stock: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// US-08 — Slow-Moving Inventory Detection
// ---------------------------------------------------------------------------

describe("InventoryTable — slow-moving detection (US-08)", () => {
  it("renders 'Mov. Lento' badge for item with slow_moving_flag=true", () => {
    const item = makeItem({
      slow_moving_flag: true,
      stock_status: "slow_moving",
      days_of_stock: 120,
    })

    render(<InventoryTable items={[item]} />)

    expect(screen.getByText("Mov. Lento")).toBeInTheDocument()
  })

  it("does not render 'Mov. Lento' badge for item with normal rotation", () => {
    const item = makeItem({ slow_moving_flag: false, stock_status: "ok" })

    render(<InventoryTable items={[item]} />)

    expect(screen.queryByText("Mov. Lento")).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// US-10 — Reorder Point Calculation
// ---------------------------------------------------------------------------

describe("InventoryTable — reorder point (US-10)", () => {
  it("renders 'Reordenar' badge when current_stock is below reorder_point", () => {
    const item = makeItem({ current_stock: 10, reorder_point: 50 })

    render(<InventoryTable items={[item]} />)

    expect(screen.getByText("Reordenar")).toBeInTheDocument()
  })

  it("filters items by item_id when search input changes", () => {
    const items = [
      makeItem({ item_id: "FOODS_001" }),
      makeItem({ item_id: "HOBBIES_002" }),
    ]

    render(<InventoryTable items={items} />)

    fireEvent.change(screen.getByPlaceholderText("Buscar SKU..."), {
      target: { value: "FOODS" },
    })

    expect(screen.getByText("FOODS_001")).toBeInTheDocument()
    expect(screen.queryByText("HOBBIES_002")).not.toBeInTheDocument()
  })

  it("shows 'No se encontraron SKUs' when search matches nothing", () => {
    const item = makeItem({ item_id: "SKU-001" })

    render(<InventoryTable items={[item]} />)

    fireEvent.change(screen.getByPlaceholderText("Buscar SKU..."), {
      target: { value: "NONEXISTENT" },
    })

    expect(screen.getByText("No se encontraron SKUs")).toBeInTheDocument()
  })
})
