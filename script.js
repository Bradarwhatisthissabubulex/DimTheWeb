let currentTabId = null;
let retryCount = 0;
const MAX_RETRIES = 3;

async function getCurrentTab() {
	return new Promise((resolve) => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			resolve(tabs[0]);
		});
	});
}

async function saveBrightness(tabId, value) {
	return new Promise((resolve) => {
		chrome.storage.local.set({ [`brightness_${tabId}`]: value }, resolve);
	});
}

async function loadBrightness(tabId) {
	return new Promise((resolve) => {
		chrome.storage.local.get([`brightness_${tabId}`], (result) => {
			resolve(result[`brightness_${tabId}`] ?? 100);
		});
	});
}

async function ensureContentScript(tabId) {
	try {
		await chrome.tabs.sendMessage(tabId, { type: "PING" });
		return true;
	} catch (error) {
		console.log("Content script not ready, injecting...");

		try {
			await chrome.scripting.executeScript({
				target: { tabId: tabId },
				files: ["content.js"]
			});
			await new Promise((resolve) => setTimeout(resolve, 150));
			return true;
		} catch (injectError) {
			console.error("Failed to inject content script:", injectError);
			return false;
		}
	}
}

async function sendMessageWithRetry(tabId, message, retries = MAX_RETRIES) {
	for (let i = 0; i < retries; i++) {
		try {
			const response = await chrome.tabs.sendMessage(tabId, message);
			return response;
		} catch (error) {
			console.log(`Message attempt ${i + 1} failed:`, error.message);

			if (i === 0) {
				const injected = await ensureContentScript(tabId);
				if (!injected && i === retries - 1) {
					throw new Error("Content script injection failed");
				}
			}

			if (i < retries - 1) {
				await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
			}
		}
	}
	throw new Error(`Failed to send message after ${retries} attempts`);
}

async function getPageBrightness(tabId) {
	try {
		const response = await sendMessageWithRetry(tabId, { type: "GET_BRIGHTNESS" });
		return response.value;
	} catch (error) {
		console.error("Get brightness failed:", error);
		return null;
	}
}

async function applyBrightness(tabId, value) {
	try {
		await sendMessageWithRetry(tabId, {
			type: "SET_BRIGHTNESS",
			value: value
		});
		return true;
	} catch (error) {
		console.error("Apply brightness failed:", error);
		return false;
	}
}

async function initialize() {
	const tab = await getCurrentTab();
	if (!tab) {
		console.error("No active tab found");
		return;
	}

	currentTabId = tab.id;
	console.log("Initializing for tab:", currentTabId);

	let brightness = await getPageBrightness(currentTabId);

	if (brightness === null) {
		console.log("Could not get page brightness, loading from storage");
		brightness = await loadBrightness(currentTabId);
		const applied = await applyBrightness(currentTabId, brightness);
		console.log("Initial brightness applied:", applied);
	} else {
		console.log("Got page brightness:", brightness);
		await saveBrightness(currentTabId, brightness);
	}

	const slider = document.getElementById("brightnessSlider");
	const valueDisplay = document.getElementById("brightnessValue");

	if (slider && valueDisplay) {
		slider.value = brightness;
		valueDisplay.textContent = Math.round(brightness).toString();
		slider.style.setProperty("--value", `${brightness}%`);
	}
}

document.addEventListener("DOMContentLoaded", async () => {
	console.log("Popup DOM loaded");

	const slider = document.getElementById("brightnessSlider");
	const valueDisplay = document.getElementById("brightnessValue");
	const resetBtn = document.getElementById("resetBtn");

	if (!slider || !valueDisplay || !resetBtn) {
		console.error("Required DOM elements not found");
		return;
	}

	await initialize();

	slider.addEventListener("input", async (e) => {
		const value = parseInt(e.target.value);
		valueDisplay.textContent = value.toString();
		slider.style.setProperty("--value", `${value}%`);

		if (currentTabId) {
			await saveBrightness(currentTabId, value);
			const applied = await applyBrightness(currentTabId, value);
			console.log(`Brightness ${value}% applied:`, applied);
		}
	});

	resetBtn.addEventListener("click", async () => {
		slider.value = 100;
		valueDisplay.textContent = "100";
		slider.style.setProperty("--value", "100%");

		if (currentTabId) {
			await saveBrightness(currentTabId, 100);
			const applied = await applyBrightness(currentTabId, 100);
			console.log("Reset to 100%, applied:", applied);
		}
	});
});
