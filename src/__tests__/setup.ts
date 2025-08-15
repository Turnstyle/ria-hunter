// Jest setup file
import { jest } from '@jest/globals';

// Provide at least one no-op test so Jest doesn't fail this setup file as a suite with zero tests
describe('test harness setup', () => {
  it('initializes jest globals without errors', () => {
    expect(typeof jest.fn).toBe('function');
  });
});

// Mock console methods to avoid noise in tests
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

beforeEach(() => {
  console.error = jest.fn();
  console.log = jest.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
});