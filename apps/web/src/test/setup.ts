import "@testing-library/jest-dom";

// React 19 uses the development build for `act` — required for testing-library compatibility
process.env.NODE_ENV = "test";
