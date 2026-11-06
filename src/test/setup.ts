import '@testing-library/jest-dom/vitest'

// jsdom does not implement window.scrollTo and prints "Not implemented" on every call: a silent stub keeps the test
// output clean (the pages only ask for a scroll to the top on navigation).
window.scrollTo = (() => {}) as typeof window.scrollTo
