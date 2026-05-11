module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'services/presensiService.js',
    'controllers/presensiController.js',
    '!**/node_modules/**'
  ]
};