module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node', // Use node for crypto libraries, we'll mock localStorage
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1', // Handle path aliases
    '^@arkswap/protocol$': '<rootDir>/../../packages/protocol/src/index.ts', // Force resolve to source for tests
  },
  setupFiles: ['<rootDir>/jest.setup.js'], // For localStorage mock and polyfills
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/', // Exclude Playwright e2e tests
  ],
  passWithNoTests: true, // Pass when no tests are found (e2e tests are in /e2e/)
};
