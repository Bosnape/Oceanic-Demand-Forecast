export interface SkuRecord {
  sku: string
  avgDaily: number
  price: number
  stock: number
  reorderPoint: number
  status: "critical" | "warning" | "ok"
}

export interface MonthlyRecord {
  month: string
  units: number
  predicted: number
}

export const skuInventory: SkuRecord[] = [
  { sku: "FOODS_2_019", avgDaily: 14.7, price: 3.42, stock: 220, reorderPoint: 103, status: "ok" },
  { sku: "FOODS_2_197", avgDaily: 22.2, price: 3.42, stock: 333, reorderPoint: 155, status: "ok" },
  { sku: "FOODS_2_276", avgDaily: 8.3, price: 3.42, stock: 124, reorderPoint: 58, status: "ok" },
  { sku: "FOODS_2_347", avgDaily: 11.4, price: 2.24, stock: 172, reorderPoint: 80, status: "ok" },
  { sku: "FOODS_2_360", avgDaily: 11.9, price: 0.94, stock: 179, reorderPoint: 84, status: "ok" },
  { sku: "FOODS_3_064", avgDaily: 28.3, price: 1.18, stock: 425, reorderPoint: 198, status: "ok" },
  { sku: "FOODS_3_080", avgDaily: 19.3, price: 1.68, stock: 289, reorderPoint: 135, status: "ok" },
  { sku: "FOODS_3_090", avgDaily: 59.6, price: 1.60, stock: 894, reorderPoint: 417, status: "ok" },
  { sku: "FOODS_3_099", avgDaily: 14.8, price: 2.56, stock: 222, reorderPoint: 104, status: "ok" },
  { sku: "FOODS_3_120", avgDaily: 44.2, price: 4.98, stock: 663, reorderPoint: 309, status: "ok" },
  { sku: "FOODS_3_202", avgDaily: 16.5, price: 4.68, stock: 247, reorderPoint: 115, status: "ok" },
  { sku: "FOODS_3_252", avgDaily: 39.5, price: 1.58, stock: 592, reorderPoint: 276, status: "ok" },
  { sku: "FOODS_3_281", avgDaily: 11.0, price: 1.25, stock: 166, reorderPoint: 77, status: "ok" },
  { sku: "FOODS_3_282", avgDaily: 22.4, price: 2.56, stock: 336, reorderPoint: 157, status: "ok" },
  { sku: "FOODS_3_295", avgDaily: 22.0, price: 0.80, stock: 330, reorderPoint: 154, status: "ok" },
  { sku: "FOODS_3_318", avgDaily: 12.3, price: 1.48, stock: 185, reorderPoint: 86, status: "ok" },
  { sku: "FOODS_3_319", avgDaily: 0.0, price: 1.00, stock: 0, reorderPoint: 0, status: "critical" },
  { sku: "FOODS_3_491", avgDaily: 11.7, price: 1.60, stock: 176, reorderPoint: 82, status: "ok" },
  { sku: "FOODS_3_501", avgDaily: 22.5, price: 0.80, stock: 338, reorderPoint: 158, status: "ok" },
  { sku: "FOODS_3_541", avgDaily: 0.0, price: 1.00, stock: 0, reorderPoint: 0, status: "critical" },
  { sku: "FOODS_3_555", avgDaily: 20.7, price: 1.68, stock: 311, reorderPoint: 145, status: "ok" },
  { sku: "FOODS_3_586", avgDaily: 41.6, price: 1.68, stock: 624, reorderPoint: 291, status: "ok" },
  { sku: "FOODS_3_587", avgDaily: 23.0, price: 2.48, stock: 344, reorderPoint: 161, status: "ok" },
  { sku: "FOODS_3_607", avgDaily: 17.5, price: 2.48, stock: 262, reorderPoint: 122, status: "ok" },
  { sku: "FOODS_3_635", avgDaily: 0.0, price: 1.00, stock: 0, reorderPoint: 0, status: "critical" },
  { sku: "FOODS_3_681", avgDaily: 21.4, price: 1.00, stock: 321, reorderPoint: 150, status: "ok" },
  { sku: "FOODS_3_694", avgDaily: 11.2, price: 1.68, stock: 168, reorderPoint: 78, status: "warning" },
  { sku: "FOODS_3_714", avgDaily: 19.5, price: 1.58, stock: 293, reorderPoint: 137, status: "ok" },
  { sku: "FOODS_3_723", avgDaily: 12.4, price: 1.60, stock: 186, reorderPoint: 87, status: "ok" },
  { sku: "FOODS_3_741", avgDaily: 16.8, price: 1.35, stock: 252, reorderPoint: 118, status: "ok" },
  { sku: "FOODS_3_744", avgDaily: 8.7, price: 2.28, stock: 131, reorderPoint: 61, status: "ok" },
  { sku: "FOODS_3_755", avgDaily: 10.7, price: 0.94, stock: 160, reorderPoint: 75, status: "warning" },
  { sku: "FOODS_3_785", avgDaily: 21.6, price: 3.00, stock: 324, reorderPoint: 151, status: "ok" },
  { sku: "FOODS_3_808", avgDaily: 0.0, price: 1.00, stock: 0, reorderPoint: 0, status: "critical" },
  { sku: "HOBBIES_1_348", avgDaily: 10.0, price: 0.48, stock: 150, reorderPoint: 70, status: "ok" },
]

export const monthlySales: MonthlyRecord[] = [
  { month: "May 15", units: 19508, predicted: 19200 },
  { month: "Jun 15", units: 20425, predicted: 19900 },
  { month: "Jul 15", units: 21185, predicted: 20800 },
  { month: "Ago 15", units: 21388, predicted: 21100 },
  { month: "Sep 15", units: 19887, predicted: 20300 },
  { month: "Oct 15", units: 20031, predicted: 19700 },
  { month: "Nov 15", units: 15990, predicted: 16400 },
  { month: "Dic 15", units: 13545, predicted: 14000 },
  { month: "Ene 16", units: 16558, predicted: 16200 },
  { month: "Feb 16", units: 16948, predicted: 16700 },
  { month: "Mar 16", units: 17359, predicted: 17100 },
  { month: "Abr 16", units: 17397, predicted: 17200 },
  { month: "May 16", units: 14097, predicted: 17800 },
]

export const topSkusByVolume = skuInventory
  .filter((s) => s.avgDaily > 0)
  .sort((a, b) => b.avgDaily - a.avgDaily)
  .slice(0, 5)
