import { completeLoading } from "./state.js";
import { initializeUI } from "./ui.js";

const loadingTimeout = window.setTimeout(completeLoading, 1600);

initializeUI({
  onSkipLoading() {
    window.clearTimeout(loadingTimeout);
    completeLoading();
  },
});
