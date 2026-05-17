const nextJest = require("next/jest")

const createJestConfig = nextJest({ dir: "./" })

/** @type {import('jest').Config} */
const customConfig = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
}

module.exports = createJestConfig(customConfig)
