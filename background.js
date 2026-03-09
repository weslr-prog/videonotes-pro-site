// Background service worker for VideoNotes Pro
// Opens the side panel when the extension icon is clicked

importScripts('ExtPay.js');

const EXTPAY_EXTENSION_ID = 'videonote-pro';
const extpay = ExtPay(EXTPAY_EXTENSION_ID);
extpay.startBackground();

// Set the side panel to open when the action button is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listen for extension icon click and open side panel for that tab
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});
