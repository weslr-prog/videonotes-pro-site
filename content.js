// Content script injected into YouTube pages
// Reads video timestamp and handles video playback commands

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle GET_TIMESTAMP message
  if (request.type === 'GET_TIMESTAMP') {
    // Find the video element on the page
    const videoElement = document.querySelector('video');
    
    if (videoElement) {
      const currentUrl = window.location.href;
      let videoId = '';
      try {
        const parsedUrl = new URL(currentUrl);
        videoId = parsedUrl.searchParams.get('v') || '';
      } catch (error) {
        videoId = '';
      }

      // Video found — send back the current time and page title
      sendResponse({
        currentTime: videoElement.currentTime,
        title: document.title,
        url: currentUrl,
        videoId: videoId
      });
    } else {
      // Video not found
      sendResponse({
        error: 'Video element not found'
      });
    }
  }
  
  // Handle JUMP_TO_TIME message
  if (request.type === 'JUMP_TO_TIME') {
    // Find the video element on the page
    const videoElement = document.querySelector('video');
    
    if (videoElement) {
      // Set the video to the requested timestamp
      videoElement.currentTime = request.seconds;
      console.log('Jumped to:', request.seconds, 'seconds');
      sendResponse({
        success: true,
        newTime: videoElement.currentTime
      });
    } else {
      sendResponse({
        error: 'Video element not found'
      });
    }
  }
  
  return true; // Keep message channel open for async responses
});
