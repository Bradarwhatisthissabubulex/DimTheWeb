let overlay = null;
const OVERLAY_ID = "light-off-overlay";

function removeExistingOverlay() {
	const existingOverlay = document.getElementById(OVERLAY_ID);
	if (existingOverlay) {
		existingOverlay.remove();
		console.log("Removed existing overlay");
	}
	overlay = null;
}

function setBrightness(value) {
	const percent = value / 100;

	if (document.documentElement && document.documentElement?.style)
		document.documentElement.style.filter = `brightness(${percent}) !important;`;
	if (document.body && document.body?.style) document.body.style.filter = `brightness(${percent}) !important;`;

	if (value === 100) {
		if (overlay) overlay.style.display = "none";
		return;
	}

	if (!overlay) {
		overlay = document.createElement("div");
		overlay.id = OVERLAY_ID;
		overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${value < 100 ? "black" : "white"};
      opacity: ${value < 100 ? (100 - value) / 100 : (value - 100) / 100};
      pointer-events: none;
      z-index: 2147483647;
    `;
		document.body.appendChild(overlay);
	} else {
		overlay.style.display = "block";
		overlay.style.background = value < 100 ? "black" : "white";
		overlay.style.opacity = value < 100 ? (100 - value) / 100 : (value - 100) / 100;
	}
}

function getCurrentBrightness() {
	const htmlFilter = getComputedStyle(document.documentElement).filter;
	const bodyFilter = getComputedStyle(document.body).filter;
	const match = (htmlFilter || bodyFilter || "").match(/brightness\(([0-9.]+)\)/);

	if (match) return parseFloat(match[1]) * 100;

	if (overlay && overlay.style.display !== "none") {
		const opacity = parseFloat(overlay.style.opacity);
		if (overlay.style.background === "black") return 100 - opacity * 100;
		if (overlay.style.background === "white") return 100 + opacity * 100;
	}
	removeExistingOverlay();
	return 100;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.type === "SET_BRIGHTNESS") {
		setBrightness(request.value);
		sendResponse({ success: true });
	} else if (request.type === "GET_BRIGHTNESS") {
		sendResponse({ value: getCurrentBrightness() });
	}
	return true;
});

setBrightness(100);
