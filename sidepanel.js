// Global variables
let currentVideoTitle = '';
let currentTimestampSeconds = 0;
let currentTabId = null;
let currentVideoId = '';
let activeNotesView = 'current';
let manageModeEnabled = false;
const collapsedVideoGroups = new Set();
const selectedNoteKeys = new Set();
const selectedSessionKeys = new Set();
const FREE_EXPORT_IMPORT_VIDEO_LIMIT = 5;
let notesSearchQuery = '';
const EXTPAY_EXTENSION_ID = 'videonote-pro';
let isOpeningPaymentPage = false;

const extpay = typeof ExtPay === 'function' ? ExtPay(EXTPAY_EXTENSION_ID) : null;

function extractVideoIdFromUrl(urlString) {
  if (!urlString) return '';

  try {
    const url = new URL(urlString);
    return url.searchParams.get('v') || '';
  } catch (error) {
    return '';
  }
}

function getCleanVideoUrl(urlString) {
  if (!urlString) return '';

  try {
    const url = new URL(urlString);
    url.searchParams.delete('t');
    url.searchParams.delete('time_continue');
    url.searchParams.delete('start');
    return url.toString();
  } catch (error) {
    return '';
  }
}

function parseTimestampToSeconds(timestamp) {
  if (!timestamp || !timestamp.includes(':')) return 0;

  const parts = timestamp.split(':').map((value) => Number(value));
  if (parts.some((value) => Number.isNaN(value))) return 0;

  if (parts.length === 2) {
    return Math.max(0, parts[0] * 60 + parts[1]);
  }

  if (parts.length === 3) {
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  return 0;
}

function formatSecondsToTimestamp(totalSeconds) {
  const secondsValue = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(secondsValue / 3600);
  const minutes = Math.floor((secondsValue % 3600) / 60);
  const seconds = secondsValue % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getCurrentVideoStorageKey() {
  if (currentVideoId) {
    return `notes_video_${currentVideoId}`;
  }

  return `notes_${currentVideoTitle.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function isExtPayConfigured() {
  return !!EXTPAY_EXTENSION_ID && EXTPAY_EXTENSION_ID !== 'videonotes-pro';
}

function checkProStatus() {
  if (!extpay || !isExtPayConfigured()) {
    return Promise.resolve(false);
  }

  return extpay
    .getUser()
    .then((user) => !!(user && user.paid))
    .catch(() => false);
}

function openUpgradePage() {
  if (isOpeningPaymentPage) {
    return;
  }

  if (!isExtPayConfigured()) {
    alert('Set your real ExtensionPay ID in sidepanel.js and background.js before opening payments.');
    return;
  }

  if (extpay && typeof extpay.openPaymentPage === 'function') {
    isOpeningPaymentPage = true;
    Promise.resolve(extpay.openPaymentPage())
      .catch((error) => {
        console.error('Failed to open ExtensionPay payment page:', error);
        alert('Could not open payment page. Verify your ExtensionPay ID and dashboard setup.');
      })
      .finally(() => {
        isOpeningPaymentPage = false;
      });
    return;
  }

  alert('Upgrade flow is not configured yet. Add ExtPay.js and set your ExtensionPay ID in sidepanel.js and background.js.');
}

function getVideoStorageKeys(allStorageData) {
  return Object.keys(allStorageData).filter((key) => {
    return key.startsWith('notes_') && Array.isArray(allStorageData[key]) && allStorageData[key].length > 0;
  });
}

function shouldRetryWithInjection(errorMessage) {
  const message = String(errorMessage || '').toLowerCase();
  return message.includes('receiving end does not exist') || message.includes('could not establish connection');
}

function sendMessageWithAutoInjection(activeTab, message, callback) {
  if (!activeTab || activeTab.id === undefined) {
    callback(null, 'No active tab found.');
    return;
  }

  const attemptSend = (allowInjectRetry) => {
    chrome.tabs.sendMessage(activeTab.id, message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (!runtimeError) {
        callback(response, null);
        return;
      }

      const runtimeMessage = runtimeError.message || 'Unknown messaging error';
      if (!allowInjectRetry || !shouldRetryWithInjection(runtimeMessage)) {
        callback(null, runtimeMessage);
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['content.js']
      }, () => {
        const injectError = chrome.runtime.lastError;
        if (injectError) {
          callback(null, injectError.message || runtimeMessage);
          return;
        }

        attemptSend(false);
      });
    });
  };

  attemptSend(true);
}

function canSaveForCurrentVideo() {
  return Promise.resolve(true);
}

function getMostRecentNoteTimestamp(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return 0;
  }

  return notes.reduce((maxValue, note) => {
    const idValue = Number(note.id) || 0;
    return Math.max(maxValue, idValue);
  }, 0);
}

function normalizeForSearch(value) {
  return String(value || '').toLowerCase();
}

function filterNotesBySearch(notes) {
  if (!notesSearchQuery) {
    return notes;
  }

  const query = normalizeForSearch(notesSearchQuery);
  return notes.filter((note) => {
    const noteText = normalizeForSearch(note.noteText);
    const videoTitle = normalizeForSearch(note.videoTitle);
    return noteText.includes(query) || videoTitle.includes(query);
  });
}

function setSearchStatus(message) {
  const status = document.getElementById('notes-search-status');
  if (status) {
    status.textContent = message || '';
  }
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(downloadUrl);
}

function openAttributionSettings() {
  const attributionText = 'Notepad icons created by Flat Icons - Flaticon';
  const attributionUrl = 'https://www.flaticon.com/free-icons/notepad';

  const shouldOpenLink = confirm(`${attributionText}\n\nOpen attribution page?`);
  if (!shouldOpenLink) {
    return;
  }

  chrome.tabs.create({ url: attributionUrl }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to open attribution page:', chrome.runtime.lastError.message);
    }
  });
}

function exportNotes() {
  checkProStatus().then((isPro) => {
    chrome.storage.local.get(null, (allData) => {
      const data = allData || {};
      const allVideoKeys = getVideoStorageKeys(data).sort((a, b) => {
        return getMostRecentNoteTimestamp(data[b]) - getMostRecentNoteTimestamp(data[a]);
      });

      const videoKeys = isPro
        ? allVideoKeys
        : allVideoKeys.slice(0, FREE_EXPORT_IMPORT_VIDEO_LIMIT);

      if (videoKeys.length === 0) {
        alert('No notes available to export.');
        return;
      }

      if (!isPro && allVideoKeys.length > FREE_EXPORT_IMPORT_VIDEO_LIMIT) {
        alert(`Free plan exports the most recent ${FREE_EXPORT_IMPORT_VIDEO_LIMIT} video sessions. Upgrade to Pro for full export.`);
      }

      const markdownSections = [];

      const formatDateTime = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return 'Unknown date';
        }

        return date.toLocaleString();
      };

      const cleanVideoTitle = (title) => {
        if (!title) return '';
        return title.replace(/^\(\d+\)\s*/, '').trim();
      };

      const buildTimestampLink = (baseUrl, seconds) => {
        if (!baseUrl) return '';

        try {
          const url = new URL(baseUrl);
          url.searchParams.set('t', String(Math.max(0, Math.floor(Number(seconds) || 0))));
          return url.toString();
        } catch (error) {
          return '';
        }
      };

      const exportGroups = new Map();

      videoKeys.forEach((key) => {
        const notes = data[key] || [];
        if (notes.length === 0) return;

        const rawHeading = notes[0].videoTitle || key.replace(/^notes_/, '');
        const heading = cleanVideoTitle(rawHeading) || rawHeading;

        const firstNoteWithVideoId = notes.find((note) => note.videoId || extractVideoIdFromUrl(note.url));
        const groupVideoId = firstNoteWithVideoId ? (firstNoteWithVideoId.videoId || extractVideoIdFromUrl(firstNoteWithVideoId.url)) : '';
        const groupKey = groupVideoId
          ? `video:${groupVideoId}`
          : `title:${normalizeForSearch(heading)}`;

        if (!exportGroups.has(groupKey)) {
          exportGroups.set(groupKey, {
            heading,
            sectionUrl: '',
            notes: []
          });
        }

        const group = exportGroups.get(groupKey);
        const firstCleanUrl = getCleanVideoUrl(notes[0].url);
        if (!group.sectionUrl && firstCleanUrl) {
          group.sectionUrl = firstCleanUrl;
        }

        notes.forEach((note) => {
          const cleanUrl = getCleanVideoUrl(note.url);
          if (!group.sectionUrl && cleanUrl) {
            group.sectionUrl = cleanUrl;
          }

          group.notes.push(note);
        });
      });

      const orderedGroups = Array.from(exportGroups.values()).sort((a, b) => {
        const latestA = Math.max(...a.notes.map((note) => Number(note.id) || 0), 0);
        const latestB = Math.max(...b.notes.map((note) => Number(note.id) || 0), 0);
        return latestB - latestA;
      });

      orderedGroups.forEach((group) => {
        const noteTimes = group.notes
          .map((note) => Number(note.id))
          .filter((value) => Number.isFinite(value) && value > 0)
          .sort((a, b) => a - b);

        const firstNoteTime = noteTimes.length > 0 ? formatDateTime(noteTimes[0]) : 'Unknown date';
        const lastNoteTime = noteTimes.length > 0 ? formatDateTime(noteTimes[noteTimes.length - 1]) : 'Unknown date';

        markdownSections.push(`## ${group.heading}`);
        markdownSections.push(`_First note: ${firstNoteTime}_`);
        if (noteTimes.length > 0 && firstNoteTime !== lastNoteTime) {
          markdownSections.push(`_Last note: ${lastNoteTime}_`);
        }
        if (group.sectionUrl) {
          markdownSections.push(`🔗 ${group.sectionUrl}`);
        }
        markdownSections.push('');

        group.notes
          .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
          .forEach((note) => {
            const label = note.timestampFormatted || '00:00';
            const text = note.noteText || '';
            const noteUrl = getCleanVideoUrl(note.url) || group.sectionUrl;
            const timestampLink = buildTimestampLink(noteUrl, note.timestampSeconds);

            if (timestampLink) {
              markdownSections.push(`- [**${label}**](${timestampLink}) — ${text}`);
              return;
            }

            markdownSections.push(`- **${label}** — ${text}`);
          });

        markdownSections.push('');
      });

      const markdown = markdownSections.join('\n').trim();
      downloadTextFile('videonotes-export.md', markdown, 'text/markdown');
      alert('Notes exported successfully as videonotes-export.md');
    });
  }).catch((error) => {
    console.error('Export failed:', error);
    alert('Export failed. Please try again.');
  });
}

function parseImportedMarkdown(markdownText) {
  const parsed = {};

  if (!markdownText || typeof markdownText !== 'string') {
    return parsed;
  }

  const lines = markdownText.split(/\r?\n/);
  let currentSectionTitle = '';
  let currentSectionUrl = '';
  let generatedIdOffset = 0;

  const getStorageKeyForSection = () => {
    const videoId = extractVideoIdFromUrl(currentSectionUrl);
    if (videoId) {
      return `notes_video_${videoId}`;
    }

    const fallbackTitle = (currentSectionTitle || 'Imported Video').trim();
    return `notes_${fallbackTitle.replace(/[^a-zA-Z0-9]/g, '_')}`;
  };

  const appendNote = (note) => {
    const storageKey = getStorageKeyForSection();
    if (!parsed[storageKey]) {
      parsed[storageKey] = [];
    }
    parsed[storageKey].push(note);
  };

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return;
    }

    const headingMatch = trimmedLine.match(/^##\s+(.+)$/);
    if (headingMatch) {
      currentSectionTitle = headingMatch[1].trim();
      currentSectionUrl = '';
      return;
    }

    const sectionUrlMatch = trimmedLine.match(/^🔗\s+(https?:\/\/\S+)$/);
    if (sectionUrlMatch) {
      currentSectionUrl = getCleanVideoUrl(sectionUrlMatch[1]) || '';
      return;
    }

    if (trimmedLine.startsWith('_First note:') || trimmedLine.startsWith('_Last note:')) {
      return;
    }

    const linkedNoteMatch = trimmedLine.match(/^-\s+\[\*\*(\d{1,2}:\d{2}(?::\d{2})?)\*\*\]\((https?:\/\/[^)]+)\)\s+[—-]\s*(.*)$/);
    if (linkedNoteMatch) {
      const timestampFormatted = linkedNoteMatch[1];
      const rawUrl = linkedNoteMatch[2];
      const noteText = linkedNoteMatch[3] || '';
      const cleanUrl = getCleanVideoUrl(rawUrl);

      let seconds = parseTimestampToSeconds(timestampFormatted);
      try {
        const parsedUrl = new URL(rawUrl);
        const tParam = Number(parsedUrl.searchParams.get('t'));
        if (Number.isFinite(tParam) && tParam >= 0) {
          seconds = Math.floor(tParam);
        }
      } catch (error) {
      }

      if (!currentSectionUrl && cleanUrl) {
        currentSectionUrl = cleanUrl;
      }

      appendNote({
        id: Date.now() + generatedIdOffset,
        videoTitle: currentSectionTitle || 'Imported Video',
        videoId: extractVideoIdFromUrl(cleanUrl || currentSectionUrl),
        timestampSeconds: seconds,
        timestampFormatted: timestampFormatted || formatSecondsToTimestamp(seconds),
        noteText: noteText.trim(),
        url: cleanUrl || currentSectionUrl
      });
      generatedIdOffset += 1;
      return;
    }

    const legacyBoldMatch = trimmedLine.match(/^-\s+\*\*(\d{1,2}:\d{2}(?::\d{2})?)\*\*\s+[—-]\s*(.*)$/);
    const legacyPlainMatch = trimmedLine.match(/^-\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+[—-]\s*(.*)$/);
    const legacyMatch = legacyBoldMatch || legacyPlainMatch;

    if (legacyMatch) {
      const timestampFormatted = legacyMatch[1];
      const seconds = parseTimestampToSeconds(timestampFormatted);
      const noteText = legacyMatch[2] || '';

      appendNote({
        id: Date.now() + generatedIdOffset,
        videoTitle: currentSectionTitle || 'Imported Video',
        videoId: extractVideoIdFromUrl(currentSectionUrl),
        timestampSeconds: seconds,
        timestampFormatted: timestampFormatted || formatSecondsToTimestamp(seconds),
        noteText: noteText.trim(),
        url: currentSectionUrl
      });
      generatedIdOffset += 1;
    }
  });

  return Object.keys(parsed).reduce((accumulator, key) => {
    if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
      accumulator[key] = parsed[key];
    }
    return accumulator;
  }, {});
}

function mergeImportedNotes(parsedNotes, isPro, callback) {
  const importKeys = Object.keys(parsedNotes || {});

  if (importKeys.length === 0) {
    callback(0, 0, 0);
    return;
  }

  chrome.storage.local.get(null, (allData) => {
    const data = allData || {};
    const updates = {};
    let importedCount = 0;
    let videosUpdated = 0;
    let skippedVideos = 0;
    let generatedIdOffset = 0;
    const existingVideoKeys = new Set(getVideoStorageKeys(data));
    let allowedNewVideoSlots = isPro ? Number.POSITIVE_INFINITY : Math.max(0, FREE_EXPORT_IMPORT_VIDEO_LIMIT - existingVideoKeys.size);

    importKeys.forEach((key) => {
      const isNewVideoKey = !existingVideoKeys.has(key) && !updates[key];
      if (isNewVideoKey && allowedNewVideoSlots <= 0) {
        skippedVideos += 1;
        return;
      }

      const importedForKey = Array.isArray(parsedNotes[key]) ? parsedNotes[key] : [];
      const existingForKey = Array.isArray(data[key]) ? [...data[key]] : [];
      const existingSignatures = new Set(
        existingForKey.map((note) => {
          const existingSeconds = Math.max(0, Math.floor(Number(note.timestampSeconds) || 0));
          const existingText = (note.noteText || '').trim();
          return `${existingSeconds}::${existingText}`;
        })
      );

      let addedForKey = 0;

      importedForKey.forEach((note) => {
        const seconds = Math.max(0, Math.floor(Number(note.timestampSeconds) || 0));
        const text = (note.noteText || '').trim();
        if (!text) {
          return;
        }

        const signature = `${seconds}::${text}`;
        if (existingSignatures.has(signature)) {
          return;
        }

        const importedNote = {
          id: Number(note.id) || Date.now() + generatedIdOffset,
          videoTitle: note.videoTitle || 'Imported Video',
          videoId: note.videoId || extractVideoIdFromUrl(note.url),
          timestampSeconds: seconds,
          timestampFormatted: note.timestampFormatted || formatSecondsToTimestamp(seconds),
          noteText: text,
          url: note.url || ''
        };

        existingForKey.push(importedNote);
        existingSignatures.add(signature);
        importedCount += 1;
        addedForKey += 1;
        generatedIdOffset += 1;
      });

      if (addedForKey > 0) {
        updates[key] = existingForKey;
        videosUpdated += 1;
        if (isNewVideoKey && !isPro) {
          allowedNewVideoSlots -= 1;
        }
      }
    });

    if (Object.keys(updates).length === 0) {
      callback(0, 0, skippedVideos);
      return;
    }

    chrome.storage.local.set(updates, () => {
      callback(importedCount, videosUpdated, skippedVideos);
    });
  });
}

function handleImportedFileSelection(event) {
  const fileInput = event.target;
  const file = fileInput.files && fileInput.files[0];

  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const content = typeof reader.result === 'string' ? reader.result : '';
    const parsed = parseImportedMarkdown(content);

    if (Object.keys(parsed).length === 0) {
      alert('No importable notes were found in that file.');
      fileInput.value = '';
      return;
    }

    checkProStatus().then((isPro) => {
      mergeImportedNotes(parsed, isPro, (importedCount, videosUpdated, skippedVideos) => {
        if (importedCount === 0) {
          alert('Import complete. No new notes were added (duplicates were skipped).');
        } else {
          let message = `Import complete: ${importedCount} notes added across ${videosUpdated} videos.`;
          if (!isPro && skippedVideos > 0) {
            message += ` ${skippedVideos} video session(s) were skipped on free plan. Upgrade to Pro for full import.`;
          }
          alert(message);
        }

        setNotesView('all');
        fileInput.value = '';
      });
    }).catch(() => {
      alert('Could not check plan status for import. Please try again.');
      fileInput.value = '';
    });
  };

  reader.onerror = () => {
    alert('Could not read the selected file. Please try again.');
    fileInput.value = '';
  };

  reader.readAsText(file);
}

function importNotes() {
  checkProStatus().then(() => {
    const fileInput = document.getElementById('import-file-input');
    if (!fileInput) {
      alert('Import input is not available. Please reload the extension.');
      return;
    }

    fileInput.click();
  }).catch((error) => {
    console.error('Import flow failed:', error);
    alert('Could not start import. Please try again.');
  });
}

function setNotesView(view) {
  activeNotesView = view === 'all' ? 'all' : 'current';

  const currentTabButton = document.getElementById('tab-current');
  const allTabButton = document.getElementById('tab-all');

  if (currentTabButton && allTabButton) {
    const isCurrent = activeNotesView === 'current';
    currentTabButton.classList.toggle('active', isCurrent);
    allTabButton.classList.toggle('active', !isCurrent);
    currentTabButton.setAttribute('aria-selected', String(isCurrent));
    allTabButton.setAttribute('aria-selected', String(!isCurrent));
  }

  updateNotesControls();

  if (activeNotesView === 'all') {
    loadAllNotes();
    return;
  }

  loadNotes();
}

function initializeFromActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0 || tabs[0].id === undefined) {
      if (callback) callback(false);
      return;
    }

    const activeTab = tabs[0];

    sendMessageWithAutoInjection(activeTab, { type: 'GET_TIMESTAMP' }, (response, errorMessage) => {
      if (errorMessage) {
        console.warn('Initialization failed:', errorMessage);
        if (callback) callback(false);
        return;
      }

      if (response && !response.error) {
        currentVideoTitle = response.title;
        currentTimestampSeconds = response.currentTime;
        currentVideoId = response.videoId || extractVideoIdFromUrl(response.url) || extractVideoIdFromUrl(activeTab.url);
        currentTabId = activeTab.id;

        console.log('Panel initialized for video:', currentVideoTitle);
        if (callback) callback(true);
        return;
      }

      if (callback) callback(false);
    });
  });
}

// ==================== PROMPT A: Capture Timestamp ====================

function captureTimestamp() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0 || tabs[0].id === undefined) return;
    
    const activeTab = tabs[0];
    
    sendMessageWithAutoInjection(activeTab, { type: 'GET_TIMESTAMP' }, (response, errorMessage) => {
      if (errorMessage) {
        console.error('Capture message error:', errorMessage);
        alert('Could not connect to this tab. If this is YouTube, try refreshing once.');
        return;
      }

      if (response && !response.error) {
        currentTimestampSeconds = response.currentTime;
        currentVideoTitle = response.title;
        currentVideoId = response.videoId || extractVideoIdFromUrl(response.url) || extractVideoIdFromUrl(activeTab.url);
        currentTabId = activeTab.id;

        console.log('Captured timestamp:', currentTimestampSeconds, 'from:', currentVideoTitle);

        const minutes = Math.floor(currentTimestampSeconds / 60);
        const seconds = Math.floor(currentTimestampSeconds % 60);
        const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        document.getElementById('current-timestamp').textContent = formatted;
      } else {
        console.error('Error capturing timestamp:', response);
      }
    });
  });
}

// ==================== PROMPT B: Save and Display Notes ====================

function saveNote(callback) {
  const noteText = document.getElementById('note-input').value.trim();
  
  if (!noteText) {
    alert('Please enter a note before saving.');
    return;
  }
  
  if (!currentVideoTitle) {
    alert('Please capture a timestamp first before saving a note.');
    return;
  }
  
  const minutes = Math.floor(currentTimestampSeconds / 60);
  const seconds = Math.floor(currentTimestampSeconds % 60);
  const timestampFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const storageKey = getCurrentVideoStorageKey();

  canSaveForCurrentVideo(storageKey).then((allowed) => {
    if (!allowed) {
      return;
    }
  
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabUrl = tabs.length > 0 ? tabs[0].url : '';
      
      const note = {
        id: Date.now(),
        videoTitle: currentVideoTitle,
        videoId: currentVideoId,
        timestampSeconds: currentTimestampSeconds,
        timestampFormatted: timestampFormatted,
        noteText: noteText,
        url: tabUrl
      };
      
      console.log('Saving note with key:', storageKey);
      console.log('Note object:', note);
      
      chrome.storage.local.get(storageKey, (data) => {
        const notes = data[storageKey] || [];
        notes.push(note);
        
        console.log('Total notes for this video:', notes.length);
        
        chrome.storage.local.set({ [storageKey]: notes }, () => {
          console.log('Note saved successfully');
          if (callback) callback();
        });
      });
    });
  });
}

function loadNotes() {
  if (activeNotesView === 'all') {
    loadAllNotes();
    return;
  }

  if (!currentVideoTitle) {
    initializeFromActiveTab((initialized) => {
      if (!initialized) {
        renderNotes([]);
        return;
      }
      loadNotesForVideo();
    });
  } else {
    loadNotesForVideo();
  }
}

function loadNotesForVideo() {
  if (!currentVideoTitle) {
    console.log('No video title set yet, skipping load');
    return;
  }
  
  const storageKey = getCurrentVideoStorageKey();
  console.log('Loading notes with key:', storageKey);

  chrome.storage.local.get(null, (allData) => {
    const data = allData || {};
    const primaryNotes = data[storageKey] || [];
    const primaryNotesWithKey = primaryNotes.map((note) => ({ ...note, _storageKey: storageKey }));
    const filteredPrimaryNotes = filterNotesBySearch(primaryNotesWithKey);
    setSearchStatus(notesSearchQuery ? `Current video matches: ${filteredPrimaryNotes.length}` : '');

    if (primaryNotes.length > 0 || !currentVideoId) {
      console.log('Loaded notes:', primaryNotes.length, 'notes found');
      renderNotes(filteredPrimaryNotes, { showVideoTitle: false });
      return;
    }

    const legacyNotes = [];
    Object.keys(data).forEach((key) => {
      if (!key.startsWith('notes_') || key === storageKey || !Array.isArray(data[key])) {
        return;
      }

      data[key].forEach((note) => {
        const noteVideoId = note.videoId || extractVideoIdFromUrl(note.url);
        if (noteVideoId && noteVideoId === currentVideoId) {
          legacyNotes.push(note);
        }
      });
    });

    if (legacyNotes.length > 0) {
      legacyNotes.sort((a, b) => (a.id || 0) - (b.id || 0));
      chrome.storage.local.set({ [storageKey]: legacyNotes }, () => {
        console.log('Loaded notes:', legacyNotes.length, 'legacy notes migrated');
        const legacyNotesWithKey = legacyNotes.map((note) => ({ ...note, _storageKey: storageKey }));
        const filteredLegacyNotes = filterNotesBySearch(legacyNotesWithKey);
        setSearchStatus(notesSearchQuery ? `Current video matches: ${filteredLegacyNotes.length}` : '');
        renderNotes(filteredLegacyNotes, { showVideoTitle: false });
      });
      return;
    }

    console.log('Loaded notes:', 0, 'notes found');
    setSearchStatus(notesSearchQuery ? 'Current video matches: 0' : '');
    renderNotes([], { showVideoTitle: false });
  });
}

function loadAllNotes() {
  checkProStatus().then((isPro) => {
    chrome.storage.local.get(null, (allData) => {
    const data = allData || {};
    const sortedVideoKeys = getVideoStorageKeys(data).sort((a, b) => {
      return getMostRecentNoteTimestamp(data[b]) - getMostRecentNoteTimestamp(data[a]);
    });
    const allowedVideoKeys = isPro ? sortedVideoKeys : sortedVideoKeys.slice(0, FREE_EXPORT_IMPORT_VIDEO_LIMIT);
    const allNotes = [];

    allowedVideoKeys.forEach((key) => {
      const list = Array.isArray(data[key]) ? data[key] : [];
      list.forEach((note) => {
        allNotes.push({ ...note, _storageKey: key });
      });
    });

    const filteredNotes = filterNotesBySearch(allNotes);
    if (!isPro && sortedVideoKeys.length > FREE_EXPORT_IMPORT_VIDEO_LIMIT) {
      const matchPart = notesSearchQuery ? `Matches: ${filteredNotes.length}. ` : '';
      setSearchStatus(`${matchPart}Free search covers your most recent ${FREE_EXPORT_IMPORT_VIDEO_LIMIT} sessions. Upgrade to search all.`);
    } else if (notesSearchQuery) {
      setSearchStatus(`All notes matches: ${filteredNotes.length}`);
    } else {
      setSearchStatus('');
    }

    filteredNotes.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    renderNotes(filteredNotes, { showVideoTitle: true });
    });
  }).catch(() => {
    setSearchStatus('Could not load search scope right now.');
    renderNotes([], { showVideoTitle: true });
  });
}

function openNoteUrlAtTimestamp(urlString, seconds) {
  const cleanUrl = getCleanVideoUrl(urlString);
  if (!cleanUrl) {
    return false;
  }

  try {
    const url = new URL(cleanUrl);
    url.searchParams.set('t', String(Math.max(0, Math.floor(Number(seconds) || 0))));
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id !== undefined) {
        chrome.tabs.update(tabs[0].id, { url: url.toString() });
        return;
      }

      chrome.tabs.create({ url: url.toString() });
    });
    return true;
  } catch (error) {
    return false;
  }
}

function getStorageKeyForNote(note) {
  if (note && note._storageKey) {
    return note._storageKey;
  }

  if (note && note.videoId) {
    return `notes_video_${note.videoId}`;
  }

  const fallbackTitle = (note && note.videoTitle) ? note.videoTitle : 'Imported Video';
  return `notes_${fallbackTitle.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function refreshActiveNotesView() {
  if (activeNotesView === 'all') {
    loadAllNotes();
    return;
  }

  loadNotes();
}

function getNoteSelectionKey(note) {
  const storageKey = getStorageKeyForNote(note);
  const idValue = Number(note.id) || 0;
  const secondsValue = Math.max(0, Math.floor(Number(note.timestampSeconds) || 0));
  const noteText = (note.noteText || '').trim();
  return `${storageKey}::${idValue}::${secondsValue}::${noteText}`;
}

function clearManageSelections() {
  selectedNoteKeys.clear();
  selectedSessionKeys.clear();
}

function updateNotesControls() {
  const notesControls = document.querySelector('.notes-controls');
  const manageButton = document.getElementById('manage-notes-btn');
  const manageToolbar = document.getElementById('manage-toolbar');

  if (notesControls) {
    notesControls.classList.toggle('current-only', activeNotesView !== 'all');
  }

  if (manageButton) {
    manageButton.textContent = manageModeEnabled ? 'Done Managing' : 'Manage Notes';
  }

  if (manageToolbar) {
    manageToolbar.classList.toggle('hidden', !manageModeEnabled);
  }
}

function toggleManageMode() {
  if (manageModeEnabled) {
    manageModeEnabled = false;
    clearManageSelections();
    updateNotesControls();
    refreshActiveNotesView();
    return;
  }

  checkProStatus().then((isPro) => {
    if (!isPro) {
      alert('Manage Notes is a Pro feature. Free plan can still capture notes and limited import/export.');
      openUpgradePage();
      return;
    }

    manageModeEnabled = true;
    updateNotesControls();
    refreshActiveNotesView();
  }).catch(() => {
    alert('Could not check plan status. Please try again.');
  });
}

function setAllGroupCollapse(shouldCollapse) {
  chrome.storage.local.get(null, (allData) => {
    const data = allData || {};
    const keys = Object.keys(data).filter((key) => key.startsWith('notes_') && Array.isArray(data[key]) && data[key].length > 0);

    if (shouldCollapse) {
      keys.forEach((key) => collapsedVideoGroups.add(key));
    } else {
      collapsedVideoGroups.clear();
    }

    refreshActiveNotesView();
  });
}

function deleteSelectedNotes() {
  if (selectedNoteKeys.size === 0) {
    alert('Select at least one note first.');
    return;
  }

  const selectedByStorage = {};
  selectedNoteKeys.forEach((key) => {
    const [storageKey, idValue, secondsValue, ...textParts] = key.split('::');
    if (!selectedByStorage[storageKey]) {
      selectedByStorage[storageKey] = [];
    }

    selectedByStorage[storageKey].push({
      id: Number(idValue) || 0,
      timestampSeconds: Number(secondsValue) || 0,
      noteText: textParts.join('::')
    });
  });

  chrome.storage.local.get(null, (allData) => {
    const data = allData || {};
    const updates = {};
    const removals = [];

    Object.keys(selectedByStorage).forEach((storageKey) => {
      const existing = Array.isArray(data[storageKey]) ? data[storageKey] : [];
      const selected = selectedByStorage[storageKey];

      const filtered = existing.filter((entry) => {
        const entryId = Number(entry.id) || 0;
        const entrySeconds = Math.max(0, Math.floor(Number(entry.timestampSeconds) || 0));
        const entryText = (entry.noteText || '').trim();

        return !selected.some((target) => {
          if (target.id > 0 && entryId > 0) {
            return target.id === entryId;
          }

          return target.timestampSeconds === entrySeconds && target.noteText === entryText;
        });
      });

      if (filtered.length === 0) {
        removals.push(storageKey);
      } else {
        updates[storageKey] = filtered;
      }
    });

    const finish = () => {
      clearManageSelections();
      refreshActiveNotesView();
    };

    const applyUpdates = () => {
      if (Object.keys(updates).length === 0) {
        finish();
        return;
      }

      chrome.storage.local.set(updates, finish);
    };

    if (removals.length > 0) {
      chrome.storage.local.remove(removals, applyUpdates);
      return;
    }

    applyUpdates();
  });
}

function deleteSelectedSessions() {
  if (selectedSessionKeys.size === 0) {
    alert('Select at least one session first.');
    return;
  }

  const keysToDelete = Array.from(selectedSessionKeys);
  chrome.storage.local.remove(keysToDelete, () => {
    keysToDelete.forEach((key) => {
      collapsedVideoGroups.delete(key);
    });
    clearManageSelections();
    refreshActiveNotesView();
  });
}

function editNoteText(note) {
  const storageKey = getStorageKeyForNote(note);
  const existingText = note.noteText || '';
  const updatedText = prompt('Edit note text:', existingText);

  if (updatedText === null) {
    return;
  }

  const trimmed = updatedText.trim();
  if (!trimmed) {
    alert('Note text cannot be empty.');
    return;
  }

  chrome.storage.local.get(storageKey, (data) => {
    const existing = Array.isArray(data[storageKey]) ? data[storageKey] : [];
    const targetId = Number(note.id) || 0;
    const targetSeconds = Math.max(0, Math.floor(Number(note.timestampSeconds) || 0));
    const targetText = (note.noteText || '').trim();

    const updated = existing.map((entry) => {
      const entryId = Number(entry.id) || 0;
      const entrySeconds = Math.max(0, Math.floor(Number(entry.timestampSeconds) || 0));
      const entryText = (entry.noteText || '').trim();

      const matchesById = targetId > 0 && entryId > 0 && targetId === entryId;
      const matchesByContent = targetId <= 0 && entrySeconds === targetSeconds && entryText === targetText;

      if (matchesById || matchesByContent) {
        return { ...entry, noteText: trimmed };
      }

      return entry;
    });

    chrome.storage.local.set({ [storageKey]: updated }, () => {
      refreshActiveNotesView();
    });
  });
}

function deleteVideoNotes(storageKey, videoTitle) {
  const label = videoTitle || 'this video';
  const shouldDelete = confirm(`Delete all notes for ${label}?`);
  if (!shouldDelete) {
    return;
  }

  chrome.storage.local.remove(storageKey, () => {
    refreshActiveNotesView();
  });
}

function createNoteCard(note, isExternalNote) {
  const noteCard = document.createElement('div');
  noteCard.className = `note-card${isExternalNote ? ' note-external' : ''}`;

  const noteRow = document.createElement('div');
  noteRow.className = 'note-row';

  const noteRowLeft = document.createElement('div');
  noteRowLeft.className = 'note-row-left';

  if (manageModeEnabled) {
    const selectCheckbox = document.createElement('input');
    selectCheckbox.type = 'checkbox';
    selectCheckbox.className = 'note-select-checkbox';
    const noteKey = getNoteSelectionKey(note);
    selectCheckbox.checked = selectedNoteKeys.has(noteKey);
    selectCheckbox.addEventListener('change', () => {
      if (selectCheckbox.checked) {
        selectedNoteKeys.add(noteKey);
      } else {
        selectedNoteKeys.delete(noteKey);
      }
    });
    noteRowLeft.appendChild(selectCheckbox);
  }

  const timestamp = document.createElement('div');
  timestamp.className = 'note-timestamp';
  timestamp.textContent = isExternalNote ? `${note.timestampFormatted} ↗` : note.timestampFormatted;
  timestamp.setAttribute('data-seconds', note.timestampSeconds);
  timestamp.style.cursor = 'pointer';

  timestamp.addEventListener('click', () => {
    if (isExternalNote && note.url) {
      const opened = openNoteUrlAtTimestamp(note.url, note.timestampSeconds);
      if (opened) {
        return;
      }
    }

    jumpToTimestamp(note.timestampSeconds);
  });

  noteRowLeft.appendChild(timestamp);
  noteRow.appendChild(noteRowLeft);

  if (manageModeEnabled) {
    const actions = document.createElement('div');

    const editButton = document.createElement('button');
    editButton.className = 'note-edit-btn';
    editButton.type = 'button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => {
      editNoteText(note);
    });

    actions.appendChild(editButton);
    noteRow.appendChild(actions);
  }

  const text = document.createElement('div');
  text.className = 'note-text';
  text.textContent = note.noteText;

  noteCard.appendChild(noteRow);
  noteCard.appendChild(text);

  return noteCard;
}

function renderAllNotesGrouped(notesList, notes) {
  const groups = {};

  notes.forEach((note) => {
    const storageKey = getStorageKeyForNote(note);
    if (!groups[storageKey]) {
      groups[storageKey] = {
        storageKey,
        videoTitle: note.videoTitle || 'Imported Video',
        notes: []
      };
    }

    groups[storageKey].notes.push(note);
  });

  const orderedGroups = Object.values(groups).sort((a, b) => {
    const maxA = Math.max(...a.notes.map((note) => Number(note.id) || 0));
    const maxB = Math.max(...b.notes.map((note) => Number(note.id) || 0));
    return maxB - maxA;
  });

  orderedGroups.forEach((group) => {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'video-group';

    const headerRow = document.createElement('div');
    const isCollapsed = collapsedVideoGroups.has(group.storageKey);
    headerRow.className = `video-group-header${isCollapsed ? ' is-collapsed' : ''}`;

    const headerLeft = document.createElement('div');
    headerLeft.className = 'video-group-header-left';

    if (manageModeEnabled) {
      const sessionCheckbox = document.createElement('input');
      sessionCheckbox.type = 'checkbox';
      sessionCheckbox.className = 'session-select-checkbox';
      sessionCheckbox.checked = selectedSessionKeys.has(group.storageKey);
      sessionCheckbox.addEventListener('change', () => {
        if (sessionCheckbox.checked) {
          selectedSessionKeys.add(group.storageKey);
        } else {
          selectedSessionKeys.delete(group.storageKey);
        }
      });
      headerLeft.appendChild(sessionCheckbox);
    }

    const toggleButton = document.createElement('button');
    toggleButton.className = 'video-group-toggle';
    toggleButton.type = 'button';
    toggleButton.textContent = isCollapsed ? '+' : '−';
    toggleButton.addEventListener('click', () => {
      if (collapsedVideoGroups.has(group.storageKey)) {
        collapsedVideoGroups.delete(group.storageKey);
      } else {
        collapsedVideoGroups.add(group.storageKey);
      }
      refreshActiveNotesView();
    });
    headerLeft.appendChild(toggleButton);

    const headerTitle = document.createElement('div');
    headerTitle.className = 'video-group-title';
    headerTitle.textContent = `${group.videoTitle} (${group.notes.length})`;
    headerLeft.appendChild(headerTitle);

    headerRow.appendChild(headerLeft);
    groupContainer.appendChild(headerRow);

    if (isCollapsed) {
      notesList.appendChild(groupContainer);
      return;
    }

    group.notes
      .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
      .forEach((note) => {
        const noteVideoId = note.videoId || extractVideoIdFromUrl(note.url);
        const isExternalNote = !!(noteVideoId && currentVideoId && noteVideoId !== currentVideoId);
        groupContainer.appendChild(createNoteCard(note, isExternalNote));
      });

    notesList.appendChild(groupContainer);
  });
}

function renderNotes(notes, options = {}) {
  const showVideoTitle = !!options.showVideoTitle;
  const notesList = document.getElementById('notes-list');
  
  if (notes.length === 0) {
    const hasSearch = !!notesSearchQuery;
    const emptyMessage = showVideoTitle
      ? (hasSearch
        ? 'No matching notes found. Try a different search term.'
        : 'No notes found yet. Import notes or save your first note to see them here.')
      : (hasSearch
        ? 'No matches in this video. Try a different search term.'
        : 'No notes yet. Capture a timestamp to get started!');
    notesList.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }
  
  notesList.innerHTML = '';

  if (showVideoTitle) {
    renderAllNotesGrouped(notesList, notes);
    return;
  }

  notes.forEach((note) => {
    const noteVideoId = note.videoId || extractVideoIdFromUrl(note.url);
    const isExternalNote = !!(noteVideoId && currentVideoId && noteVideoId !== currentVideoId);
    notesList.appendChild(createNoteCard(note, isExternalNote));
  });
}

function jumpToTimestamp(seconds) {
  console.log('Jumping to timestamp:', seconds);

  const fallbackNavigateToTimestamp = (tabId, tabUrl) => {
    if (!tabUrl) {
      console.error('No tab URL available for jump fallback');
      return;
    }

    try {
      const url = new URL(tabUrl);
      const targetSeconds = Math.max(0, Math.floor(seconds));
      url.searchParams.set('t', String(targetSeconds));

      chrome.tabs.update(tabId, { url: url.toString() }, () => {
        if (chrome.runtime.lastError) {
          console.error('Jump fallback navigation error:', chrome.runtime.lastError.message);
        }
      });
    } catch (error) {
      console.error('Invalid URL for jump fallback:', error);
    }
  };

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0 || tabs[0].id === undefined) {
      console.error('No active tab found for jump');
      return;
    }

    const activeTab = tabs[0];
    currentTabId = activeTab.id;

    sendMessageWithAutoInjection(activeTab, { type: 'JUMP_TO_TIME', seconds: seconds }, (response, errorMessage) => {
      if (errorMessage) {
        console.error('Jump message error:', errorMessage);
        fallbackNavigateToTimestamp(activeTab.id, activeTab.url);
        return;
      }

      if (!response) {
        console.error('No response received for jump request');
        fallbackNavigateToTimestamp(activeTab.id, activeTab.url);
        return;
      }

      if (response.error) {
        console.error('Failed to jump to timestamp:', response.error);
        fallbackNavigateToTimestamp(activeTab.id, activeTab.url);
      }
    });
  });
}

// ==================== PROMPT C: Wire Up Buttons ====================

document.addEventListener('DOMContentLoaded', () => {
  const importFileInput = document.getElementById('import-file-input');
  if (importFileInput) {
    importFileInput.addEventListener('change', handleImportedFileSelection);
  }

  const notesSearchInput = document.getElementById('notes-search-input');
  const notesSearchClear = document.getElementById('notes-search-clear');

  if (notesSearchInput) {
    notesSearchInput.addEventListener('input', () => {
      notesSearchQuery = notesSearchInput.value.trim();
      refreshActiveNotesView();
    });
  }

  if (notesSearchClear) {
    notesSearchClear.addEventListener('click', () => {
      notesSearchQuery = '';
      if (notesSearchInput) {
        notesSearchInput.value = '';
      }
      refreshActiveNotesView();
    });
  }

  const currentTabButton = document.getElementById('tab-current');
  const allTabButton = document.getElementById('tab-all');

  if (currentTabButton) {
    currentTabButton.addEventListener('click', () => {
      setNotesView('current');
    });
  }

  if (allTabButton) {
    allTabButton.addEventListener('click', () => {
      setNotesView('all');
    });
  }

  const manageNotesButton = document.getElementById('manage-notes-btn');
  if (manageNotesButton) {
    manageNotesButton.addEventListener('click', () => {
      toggleManageMode();
    });
  }

  const collapseAllButton = document.getElementById('collapse-all-btn');
  if (collapseAllButton) {
    collapseAllButton.addEventListener('click', () => {
      setAllGroupCollapse(true);
    });
  }

  const expandAllButton = document.getElementById('expand-all-btn');
  if (expandAllButton) {
    expandAllButton.addEventListener('click', () => {
      setAllGroupCollapse(false);
    });
  }

  const deleteSelectedNotesButton = document.getElementById('delete-selected-notes-btn');
  if (deleteSelectedNotesButton) {
    deleteSelectedNotesButton.addEventListener('click', () => {
      deleteSelectedNotes();
    });
  }

  const deleteSelectedSessionsButton = document.getElementById('delete-selected-sessions-btn');
  if (deleteSelectedSessionsButton) {
    deleteSelectedSessionsButton.addEventListener('click', () => {
      deleteSelectedSessions();
    });
  }

  const clearSelectionButton = document.getElementById('clear-selection-btn');
  if (clearSelectionButton) {
    clearSelectionButton.addEventListener('click', () => {
      clearManageSelections();
      refreshActiveNotesView();
    });
  }

  setNotesView('current');
  updateNotesControls();

  document.getElementById('settings-btn').addEventListener('click', () => {
    openAttributionSettings();
  });
  
  document.getElementById('capture-btn').addEventListener('click', () => {
    captureTimestamp();
  });
  
  document.getElementById('save-btn').addEventListener('click', () => {
    saveNote(() => {
      document.getElementById('note-input').value = '';
      loadNotes();
    });
  });
  
  document.getElementById('export-btn').addEventListener('click', () => {
    exportNotes();
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    importNotes();
  });
  
  document.getElementById('upgrade-link').addEventListener('click', (e) => {
    e.preventDefault();
    openUpgradePage();
  });
});
