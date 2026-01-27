/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/e2e/'],
};
