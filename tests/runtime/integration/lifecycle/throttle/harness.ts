export const FAKE_TIMER_OPTS = {
  shouldAdvanceTime: false,
  toFake: ["setTimeout", "clearTimeout", "Date"] as ("setTimeout" | "clearTimeout" | "Date")[],
};
