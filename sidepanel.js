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
let sessionNotesSinceExport = 0;
const NOTE_PREVIEW_CHARACTER_LIMIT = 190;
let notesExpanded = false;
let currentVideoUrl = '';

const extpay = typeof ExtPay === 'function' ? ExtPay(EXTPAY_EXTENSION_ID) : null;

// ==================== SESSION MANAGEMENT ====================

function getSessionLabel(timestamp) {
  const noteDate = new Date(timestamp);
  const today = new Date();
  
  // Reset time to midnight for comparison
  today.setHours(0, 0, 0, 0);
  noteDate.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - noteDate.getTime();
  const diffDays = diffTime <= 0 ? 0 : Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'This Week';
  if (diffDays <= 30) return 'This Month';
  return 'Earlier';
}

function getExportFileName(sessionLabel) {
  const now = new Date();
  const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timePart = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

  if (!sessionLabel) {
    return `videonotes-export-${datePart}-${timePart}.md`;
  }

  const cleanSession = String(sessionLabel).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `videonotes-export-${cleanSession}-${datePart}-${timePart}.md`;
}

function groupNotesBySession(notes) {
  const sessions = new Map();
  
  notes.forEach((note) => {
    const sessionLabel = getSessionLabel(note.id);
    if (!sessions.has(sessionLabel)) {
      sessions.set(sessionLabel, []);
    }
    sessions.get(sessionLabel).push(note);
  });
  
  return sessions;
}

function getSessionOrder(sessionLabel) {
  const order = { 'Today': 0, 'Yesterday': 1, 'This Week': 2, 'This Month': 3, 'Earlier': 4 };
  return order[sessionLabel] || 5;
}

function formatExportSessionDate(sessionLabel) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  
  if (sessionLabel === 'Today') return `Today — ${dateStr}`;
  if (sessionLabel === 'Yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return `Yesterday — ${yesterday.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}`;
  }
  return sessionLabel;
}

function extractVideoIdFromUrl(urlString) {
  if (!urlString) return '';

  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    if (hostname === 'youtu.be') {
      const idFromPath = url.pathname.replace(/^\//, '').split('/')[0] || '';
      return idFromPath || '';
    }

    if (hostname.endsWith('youtube.com') || hostname.endsWith('youtube-nocookie.com')) {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v') || '';
      }

      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2 && (pathParts[0] === 'shorts' || pathParts[0] === 'embed' || pathParts[0] === 'live')) {
        return pathParts[1] || '';
      }
    }

    return '';
  } catch (error) {
    return '';
  }
}

function getCleanVideoUrl(urlString) {
  if (!urlString) return '';

  try {
    const videoId = extractVideoIdFromUrl(urlString);
    if (!videoId) {
      return '';
    }

    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
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

function isRestrictedRuntimeMessage(errorMessage) {
  const message = String(errorMessage || '').toLowerCase();
  return message.includes('cannot access a chrome:// url') || message.includes('cannot access this browser page');
}

function getTabUrl(activeTab) {
  if (!activeTab) return '';
  return activeTab.url || activeTab.pendingUrl || '';
}

function isRestrictedMessagingUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return false;
  }

  const normalized = urlString.toLowerCase();
  return (
    normalized.startsWith('chrome://') ||
    normalized.startsWith('chrome-extension://') ||
    normalized.startsWith('edge://') ||
    normalized.startsWith('about:') ||
    normalized.startsWith('devtools://') ||
    normalized.startsWith('view-source:')
  );
}

function sendMessageWithAutoInjection(activeTab, message, callback) {
  if (!activeTab || activeTab.id === undefined) {
    callback(null, 'No active tab found.');
    return;
  }

  const tabUrl = getTabUrl(activeTab);
  if (isRestrictedMessagingUrl(tabUrl)) {
    callback(null, 'Cannot access this browser page. Open a regular website tab first.');
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
      if (isRestrictedRuntimeMessage(runtimeMessage)) {
        callback(null, 'Cannot access this browser page. Open a YouTube video tab first.');
        return;
      }

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

function sortNotesForDisplay(notes) {
  return [...(Array.isArray(notes) ? notes : [])].sort((a, b) => {
    const pinA = a && a.pinned ? 1 : 0;
    const pinB = b && b.pinned ? 1 : 0;
    if (pinA !== pinB) {
      return pinB - pinA;
    }

    const idA = Number(a && a.id) || 0;
    const idB = Number(b && b.id) || 0;
    return idB - idA;
  });
}

function resolveCurrentVideoUrl(responseUrl, activeTabUrl, videoId) {
  const cleanResponseUrl = getCleanVideoUrl(responseUrl);
  const responseVideoId = extractVideoIdFromUrl(cleanResponseUrl);

  if (cleanResponseUrl && (!videoId || (responseVideoId && responseVideoId === videoId))) {
    return cleanResponseUrl;
  }

  const cleanActiveTabUrl = getCleanVideoUrl(activeTabUrl);
  const activeTabVideoId = extractVideoIdFromUrl(cleanActiveTabUrl);

  if (cleanActiveTabUrl && !isRestrictedMessagingUrl(cleanActiveTabUrl) && (!videoId || (activeTabVideoId && activeTabVideoId === videoId))) {
    return cleanActiveTabUrl;
  }

  if (videoId) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }

  if (cleanResponseUrl) {
    return cleanResponseUrl;
  }

  if (cleanActiveTabUrl && !isRestrictedMessagingUrl(cleanActiveTabUrl)) {
    return cleanActiveTabUrl;
  }

  return '';
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

function updateUnsavedIndicator() {
  const badge = document.getElementById('unsaved-badge');
  if (!badge) return;
  if (sessionNotesSinceExport > 0) {
    badge.textContent = `💾 ${sessionNotesSinceExport} unsaved`;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function exportNotes(exportAll = false, silent = false) {
  checkProStatus().then((isPro) => {
    chrome.storage.local.get(null, (allData) => {
      const data = allData || {};
      const allVideoKeys = getVideoStorageKeys(data).sort((a, b) => {
        return getMostRecentNoteTimestamp(data[b]) - getMostRecentNoteTimestamp(data[a]);
      });

      if (allVideoKeys.length === 0) {
        if (!silent) alert('No notes available to export.');
        return;
      }

      // ── SESSION EXPORT (default, no shift-click) ──────────────────────────
      // Only exports notes saved today. No fallback to previous days.
      // Shift+click the Export button to get all sessions.
      if (!exportAll) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startOfTodayMs = startOfToday.getTime();

        // Collect every note across all videos
        const allNotesFlat = [];
        allVideoKeys.forEach((key) => {
          const notes = Array.isArray(data[key]) ? data[key] : [];
          notes.forEach((note) => allNotesFlat.push({ ...note, _storageKey: key }));
        });

        const sessionNotes = allNotesFlat.filter((note) => Number(note.id) >= startOfTodayMs);

        if (sessionNotes.length === 0) {
          if (!silent) {
            alert("No notes from today's session to export.\n\nShift+click Export to save your full archive including older sessions.");
          }
          return;
        }

        // Group session notes by video for the markdown
        const sessionGroups = new Map();
        sessionNotes.forEach((note) => {
          const cleanVideoTitle = (title) => title ? title.replace(/^\(\d+\)\s*/, '').trim() : '';
          const videoId = note.videoId || extractVideoIdFromUrl(note.url);
          const groupKey = videoId ? `video:${videoId}` : `title:${normalizeForSearch(note.videoTitle || '')}`;

          if (!sessionGroups.has(groupKey)) {
            sessionGroups.set(groupKey, {
              heading: cleanVideoTitle(note.videoTitle) || note.videoTitle || 'Imported Video',
              sectionUrl: getCleanVideoUrl(note.url) || '',
              notes: []
            });
          }
          const group = sessionGroups.get(groupKey);
          if (!group.sectionUrl) group.sectionUrl = getCleanVideoUrl(note.url) || '';
          group.notes.push(note);
        });

        const orderedSessionGroups = Array.from(sessionGroups.values()).sort((a, b) => {
          const latestA = Math.max(...a.notes.map((n) => Number(n.id) || 0), 0);
          const latestB = Math.max(...b.notes.map((n) => Number(n.id) || 0), 0);
          return latestB - latestA;
        });

        const now = new Date();
        const sessionLabel = 'Today';
        const markdownSections = [
          '# 📹 VideoNotes Pro Export',
          '',
          `_Exported: ${now.toLocaleString()}_`,
          '',
          '---',
          '',
          `### 📅 ${formatExportSessionDate(sessionLabel)}`,
          ''
        ];

        const buildTimestampLink = (baseUrl, seconds) => {
          if (!baseUrl) return '';
          try {
            const url = new URL(baseUrl);
            url.searchParams.set('t', String(Math.max(0, Math.floor(Number(seconds) || 0))));
            return url.toString();
          } catch { return ''; }
        };

        orderedSessionGroups.forEach((group) => {
          markdownSections.push(`#### 🎬 ${group.heading}`);
          markdownSections.push('');
          markdownSections.push(`**Notes:** ${group.notes.length}`);
          if (group.sectionUrl) {
            markdownSections.push(`**Video:** [Watch on YouTube](${group.sectionUrl})`);
          }
          markdownSections.push('');

          group.notes
            .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
            .forEach((note, idx) => {
              const label = note.timestampFormatted || '00:00';
              const text = note.noteText || '';
              const link = buildTimestampLink(getCleanVideoUrl(note.url) || group.sectionUrl, note.timestampSeconds);
              markdownSections.push(link
                ? `   ${idx + 1}. [⏱️ ${label}](${link}) — ${text}`
                : `   ${idx + 1}. ⏱️ **${label}** — ${text}`
              );
            });
          markdownSections.push('');
        });

        markdownSections.push('---', '', '_Generated by VideoNotes Pro_');

        const markdown = markdownSections.join('\n').trim();
        const fileName = getExportFileName(sessionLabel);
        downloadTextFile(fileName, markdown, 'text/markdown');

        if (!silent) {
          sessionNotesSinceExport = 0;
          updateUnsavedIndicator();
          alert(`Session exported as ${fileName}`);
        }
        return;
      }

      // ── FULL ARCHIVE EXPORT (shift-click) ────────────────────────────────
      const videoKeys = isPro
        ? allVideoKeys
        : allVideoKeys.slice(0, FREE_EXPORT_IMPORT_VIDEO_LIMIT);

      if (!isPro && allVideoKeys.length > FREE_EXPORT_IMPORT_VIDEO_LIMIT) {
        alert(`Free plan exports the most recent ${FREE_EXPORT_IMPORT_VIDEO_LIMIT} video sessions. Upgrade to Pro for full export.`);
      }

      const markdownSections = [];

      // Add header with export info
      const now = new Date();
      const exportDate = now.toLocaleString();
      markdownSections.push('# 📹 VideoNotes Pro Export');
      markdownSections.push('');
      markdownSections.push(`_Exported: ${exportDate}_`);
      if (!isPro && allVideoKeys.length > FREE_EXPORT_IMPORT_VIDEO_LIMIT) {
        markdownSections.push(`_Note: Free tier limited to ${FREE_EXPORT_IMPORT_VIDEO_LIMIT} most recent video sessions_`);
      }
      markdownSections.push('');
      markdownSections.push('---');
      markdownSections.push('');

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

      // Group videos by session (Today, Yesterday, This Week, etc.)
      const sessionGroups = new Map();
      orderedGroups.forEach((group) => {
        group.notes.forEach((note) => {
          const sessionLabel = getSessionLabel(note.id);
          if (!sessionGroups.has(sessionLabel)) {
            sessionGroups.set(sessionLabel, []);
          }
        });
      });

      // Organize videos into sessions
      const videosBySession = new Map();
      Array.from(sessionGroups.keys()).forEach((session) => {
        videosBySession.set(session, []);
      });

      orderedGroups.forEach((group) => {
        const notesBySession = new Map();
        
        group.notes.forEach((note) => {
          const sessionLabel = getSessionLabel(note.id);
          if (!notesBySession.has(sessionLabel)) {
            notesBySession.set(sessionLabel, []);
          }
          notesBySession.get(sessionLabel).push(note);
        });

        // Add group to each session it appears in
        for (const [sessionLabel, notes] of notesBySession.entries()) {
          const sessionNotes = notes;
          videosBySession.get(sessionLabel).push({
            ...group,
            notes: sessionNotes
          });
        }
      });

      // Sort sessions by order (Today → Yesterday → This Week, etc.)
      const sortedSessions = Array.from(videosBySession.entries())
        .sort((a, b) => getSessionOrder(a[0]) - getSessionOrder(b[0]));

      const nonEmptySessions = sortedSessions.filter((sessionEntry) => {
        const videosInSession = sessionEntry[1] || [];
        return videosInSession.length > 0;
      });

      // exportAll: true = all sessions, false = newest session only
      const sessionsToExport = exportAll ? nonEmptySessions : (nonEmptySessions.length > 0 ? [nonEmptySessions[0]] : []);

      // Add session groups to markdown
      sessionsToExport.forEach((sessionEntry, sessionIndex) => {
        const [sessionLabel, videosInSession] = sessionEntry;
        
        if (videosInSession.length === 0) return;

        // Session header
        markdownSections.push(`### 📅 ${formatExportSessionDate(sessionLabel)}`);
        markdownSections.push('');

        // Videos in this session
        videosInSession.forEach((group, videoIndex) => {
          const noteTimes = group.notes
            .map((note) => Number(note.id))
            .filter((value) => Number.isFinite(value) && value > 0)
            .sort((a, b) => a - b);

          const firstNoteTime = noteTimes.length > 0 ? formatDateTime(noteTimes[0]) : 'Unknown date';
          const lastNoteTime = noteTimes.length > 0 ? formatDateTime(noteTimes[noteTimes.length - 1]) : 'Unknown date';
          const noteCount = group.notes.length;

          markdownSections.push(`#### 🎬 ${group.heading}`);
          markdownSections.push('');
          markdownSections.push(`**Notes:** ${noteCount}`);
          if (group.sectionUrl) {
            markdownSections.push(`**Video:** [Watch on YouTube](${group.sectionUrl})`);
          }
          markdownSections.push('');

          group.notes
            .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
            .forEach((note, noteIndex) => {
              const label = note.timestampFormatted || '00:00';
              const text = note.noteText || '';
              const noteUrl = getCleanVideoUrl(note.url) || group.sectionUrl;
              const timestampLink = buildTimestampLink(noteUrl, note.timestampSeconds);

              if (timestampLink) {
                markdownSections.push(`   ${noteIndex + 1}. [⏱️ ${label}](${timestampLink}) — ${text}`);
                return;
              }

              markdownSections.push(`   ${noteIndex + 1}. ⏱️ **${label}** — ${text}`);
            });

          markdownSections.push('');
        });

        // Session divider
        if (sessionIndex < sessionsToExport.length - 1) {
          markdownSections.push('---');
          markdownSections.push('');
        }
      });

      // Add footer
      markdownSections.push('---');
      markdownSections.push('');
      markdownSections.push('_Generated by VideoNotes Pro_');

      const markdown = markdownSections.join('\n').trim();
      const exportSessionLabel = exportAll ? 'all-sessions' : (sessionsToExport.length > 0 ? sessionsToExport[0][0] : 'session');
      const fileName = getExportFileName(exportSessionLabel);
      downloadTextFile(fileName, markdown, 'text/markdown');

      // Reset the unsaved indicator after a successful deliberate export
      if (!silent) {
        sessionNotesSinceExport = 0;
        updateUnsavedIndicator();
        alert(`Notes exported as ${fileName}`);
      }
    });
  }).catch((error) => {
    console.error('Export failed:', error);
    if (!silent) alert('Export failed. Please try again.');
  });
}

function parseImportedMarkdown(markdownText) {
  const parsed = {};
  const stats = {
    totalLines: 0,
    parsedLines: 0,
    skippedLines: 0
  };

  if (!markdownText || typeof markdownText !== 'string') {
    return { parsed, stats };
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

    stats.totalLines += 1;

    // Skip header and metadata lines
    if (trimmedLine.startsWith('# ') || trimmedLine.startsWith('_Exported:') || trimmedLine.startsWith('_Note:') || trimmedLine === '---') {
      return;
    }

    // Match video section headers (## or ## 🎬)
    const headingMatch = trimmedLine.match(/^##\s*(?:🎬\s*)?(.+)$/);
    if (headingMatch) {
      currentSectionTitle = headingMatch[1].trim();
      currentSectionUrl = '';
      return;
    }

    // Skip metadata lines (First/Last/Notes count/Video link)
    if (trimmedLine.startsWith('**') && (trimmedLine.includes('Notes:') || trimmedLine.includes('First:') || trimmedLine.includes('Last:') || trimmedLine.includes('Video:'))) {
      // Extract URL if it's a video link
      if (trimmedLine.includes('Video:')) {
        const urlMatch = trimmedLine.match(/\[(.*?)\]\((https?:\/\/[^)]+)\)/);
        if (urlMatch) {
          currentSectionUrl = getCleanVideoUrl(urlMatch[2]) || '';
        }
      }
      return;
    }

    // Old format: 🔗 URL
    const sectionUrlMatch = trimmedLine.match(/^🔗\s+(https?:\/\/\S+)$/);
    if (sectionUrlMatch) {
      currentSectionUrl = getCleanVideoUrl(sectionUrlMatch[1]) || '';
      return;
    }

    // Skip old metadata
    if (trimmedLine.startsWith('_First note:') || trimmedLine.startsWith('_Last note:')) {
      return;
    }

    // NEW format: numbered list with emoji and link: 1. [⏱️ 01:23](url) — text
    const newNumberedMatch = trimmedLine.match(/^\d+\.\s+\[⏱️\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\((https?:\/\/[^)]+)\)\s+[—-]\s*(.*)$/);
    if (newNumberedMatch) {
      const timestampFormatted = newNumberedMatch[1];
      const rawUrl = newNumberedMatch[2];
      const noteText = newNumberedMatch[3] || '';
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
        url: cleanUrl || currentSectionUrl,
        pinned: false
      });
      generatedIdOffset += 1;
      stats.parsedLines += 1;
      return;
    }

    // OLD format: bullet with bold timestamp link: - [**01:23**](url) — text
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
        url: cleanUrl || currentSectionUrl,
        pinned: false
      });
      generatedIdOffset += 1;
      stats.parsedLines += 1;
      return;
    }

    // OLD format: legacy bullet without link: - **01:23** — text
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
        url: currentSectionUrl,
        pinned: false
      });
      generatedIdOffset += 1;
      stats.parsedLines += 1;
      return;
    }

    stats.skippedLines += 1;
  });

  const filtered = Object.keys(parsed).reduce((accumulator, key) => {
    if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
      accumulator[key] = parsed[key];
    }
    return accumulator;
  }, {});

  return { parsed: filtered, stats };
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
          url: note.url || '',
          pinned: !!note.pinned
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
  const files = fileInput.files ? Array.from(fileInput.files) : [];

  if (files.length === 0) {
    return;
  }

  // Read all selected files, then merge everything in one pass
  let filesRead = 0;
  const allParsed = {};
  const aggregateStats = {
    totalLines: 0,
    parsedLines: 0,
    skippedLines: 0
  };

  const onAllFilesRead = () => {
    if (Object.keys(allParsed).length === 0) {
      alert('No importable notes were found in the selected file(s).');
      fileInput.value = '';
      return;
    }

    checkProStatus().then((isPro) => {
      mergeImportedNotes(allParsed, isPro, (importedCount, videosUpdated, skippedVideos) => {
        if (importedCount === 0) {
          const skippedSuffix = aggregateStats.skippedLines > 0
            ? `\nSkipped lines: ${aggregateStats.skippedLines}.`
            : '';
          alert(`Import complete. No new notes were added (all were duplicates).${skippedSuffix}`);
        } else {
          const fileWord = files.length > 1 ? `${files.length} files` : '1 file';
          let message = `Import complete (${fileWord}): ${importedCount} notes added across ${videosUpdated} videos.`;
          message += `\nRecognized note lines: ${aggregateStats.parsedLines}.`;
          if (aggregateStats.skippedLines > 0) {
            message += `\nSkipped lines: ${aggregateStats.skippedLines}.`;
          }
          if (!isPro && skippedVideos > 0) {
            message += ` ${skippedVideos} session(s) skipped on free plan — upgrade to Pro for full import.`;
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

  files.forEach((file) => {
    const reader = new FileReader();

    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const parseResult = parseImportedMarkdown(content);
      const parsed = parseResult.parsed || {};
      const stats = parseResult.stats || {};

      aggregateStats.totalLines += Number(stats.totalLines) || 0;
      aggregateStats.parsedLines += Number(stats.parsedLines) || 0;
      aggregateStats.skippedLines += Number(stats.skippedLines) || 0;

      // Merge parsed notes from this file into allParsed
      Object.keys(parsed).forEach((key) => {
        if (!allParsed[key]) {
          allParsed[key] = [];
        }
        allParsed[key].push(...parsed[key]);
      });

      filesRead += 1;
      if (filesRead === files.length) {
        onAllFilesRead();
      }
    };

    reader.onerror = () => {
      filesRead += 1;
      console.error(`Could not read file: ${file.name}`);
      if (filesRead === files.length) {
        onAllFilesRead();
      }
    };

    reader.readAsText(file);
  });
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
        if (isRestrictedRuntimeMessage(errorMessage)) {
          console.info('Initialization skipped on restricted browser page.');
        } else {
          console.warn('Initialization failed:', errorMessage);
        }
        if (callback) callback(false);
        return;
      }

      if (response && !response.error) {
        const activeTabUrl = getTabUrl(activeTab);
        currentVideoTitle = response.title;
        currentTimestampSeconds = response.currentTime;
        currentVideoId = response.videoId || extractVideoIdFromUrl(response.url) || extractVideoIdFromUrl(activeTabUrl);
        currentVideoUrl = resolveCurrentVideoUrl(response.url, activeTabUrl, currentVideoId);
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
        const activeTabUrl = getTabUrl(activeTab);
        currentTimestampSeconds = response.currentTime;
        currentVideoTitle = response.title;
        currentVideoId = response.videoId || extractVideoIdFromUrl(response.url) || extractVideoIdFromUrl(activeTabUrl);
        currentVideoUrl = resolveCurrentVideoUrl(response.url, activeTabUrl, currentVideoId);
        currentTabId = activeTab.id;

        console.log('Captured timestamp:', currentTimestampSeconds, 'from:', currentVideoTitle);

        updateTimestampDisplay();
      } else {
        console.error('Error capturing timestamp:', response);
      }
    });
  });
}

function updateTimestampDisplay() {
  const minutes = Math.floor(currentTimestampSeconds / 60);
  const seconds = Math.floor(currentTimestampSeconds % 60);
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  document.getElementById('current-timestamp').textContent = formatted;
}

function adjustTimestamp(delta) {
  currentTimestampSeconds = Math.max(0, currentTimestampSeconds + delta);
  updateTimestampDisplay();
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
      const activeTabUrl = tabs.length > 0 ? getTabUrl(tabs[0]) : '';
      const noteUrl = resolveCurrentVideoUrl(currentVideoUrl, activeTabUrl, currentVideoId);
      
      const note = {
        id: Date.now(),
        videoTitle: currentVideoTitle,
        videoId: currentVideoId,
        timestampSeconds: currentTimestampSeconds,
        timestampFormatted: timestampFormatted,
        noteText: noteText,
        url: noteUrl,
        pinned: false
      };
      
      console.log('Saving note with key:', storageKey);
      console.log('Note object:', note);
      
      chrome.storage.local.get(storageKey, (data) => {
        const notes = data[storageKey] || [];
        notes.push(note);
        
        console.log('Total notes for this video:', notes.length);
        
        chrome.storage.local.set({ [storageKey]: notes }, () => {
          console.log('Note saved successfully');
          sessionNotesSinceExport += 1;
          updateUnsavedIndicator();
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
    const normalizedPrimaryNotes = primaryNotes.map((note) => {
      const normalizedUrl = getCleanVideoUrl(note.url) || resolveCurrentVideoUrl(currentVideoUrl, '', note.videoId || currentVideoId);
      return {
        ...note,
        pinned: !!note.pinned,
        url: normalizedUrl,
        _storageKey: storageKey
      };
    });
    const filteredPrimaryNotes = filterNotesBySearch(normalizedPrimaryNotes);
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
        allNotes.push({
          ...note,
          pinned: !!note.pinned,
          url: getCleanVideoUrl(note.url) || resolveCurrentVideoUrl('', '', note.videoId),
          _storageKey: key
        });
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
    const targetUrl = url.toString();

    if (currentTabId !== null) {
      chrome.tabs.get(currentTabId, (trackedTab) => {
        if (!chrome.runtime.lastError && trackedTab && trackedTab.id !== undefined) {
          chrome.tabs.update(trackedTab.id, { url: targetUrl });
          return;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length > 0 && tabs[0].id !== undefined) {
            chrome.tabs.update(tabs[0].id, { url: targetUrl });
            return;
          }

          chrome.tabs.create({ url: targetUrl, active: true });
        });
      });
      return true;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id !== undefined) {
        chrome.tabs.update(tabs[0].id, { url: targetUrl });
        return;
      }

      chrome.tabs.create({ url: targetUrl, active: true });
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

function toggleNotePinned(note) {
  const storageKey = getStorageKeyForNote(note);

  chrome.storage.local.get(storageKey, (data) => {
    const existing = Array.isArray(data[storageKey]) ? data[storageKey] : [];
    const targetId = Number(note.id) || 0;
    const targetSeconds = Math.max(0, Math.floor(Number(note.timestampSeconds) || 0));
    const targetText = (note.noteText || '').trim();

    let updatedAny = false;
    const updated = existing.map((entry) => {
      const entryId = Number(entry.id) || 0;
      const entrySeconds = Math.max(0, Math.floor(Number(entry.timestampSeconds) || 0));
      const entryText = (entry.noteText || '').trim();

      const matchesById = targetId > 0 && entryId > 0 && targetId === entryId;
      const matchesByContent = targetId <= 0 && entrySeconds === targetSeconds && entryText === targetText;
      if (!(matchesById || matchesByContent)) {
        return entry;
      }

      updatedAny = true;
      return {
        ...entry,
        pinned: !entry.pinned
      };
    });

    if (!updatedAny) {
      return;
    }

    chrome.storage.local.set({ [storageKey]: updated }, () => {
      refreshActiveNotesView();
    });
  });
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

function updateNotesExpandedUi() {
  document.body.classList.toggle('notes-expanded', notesExpanded);

  const expandButton = document.getElementById('notes-expand-btn');
  if (!expandButton) {
    return;
  }

  expandButton.textContent = notesExpanded ? '⤡' : '⤢';
  expandButton.setAttribute('aria-pressed', String(notesExpanded));
  expandButton.setAttribute('aria-label', notesExpanded ? 'Collapse notes view' : 'Expand notes view');
  expandButton.title = notesExpanded ? 'Collapse notes view' : 'Expand notes view';
}

function toggleNotesExpanded() {
  notesExpanded = !notesExpanded;
  updateNotesExpandedUi();
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

function copyTextToClipboard(text, triggerButton) {
  const value = String(text || '').trim();
  if (!value) {
    alert('Nothing to copy yet.');
    return;
  }

  const showCopiedState = () => {
    if (!triggerButton) {
      return;
    }

    const originalLabel = triggerButton.textContent;
    triggerButton.textContent = 'Copied';
    triggerButton.disabled = true;
    window.setTimeout(() => {
      triggerButton.textContent = originalLabel;
      triggerButton.disabled = false;
    }, 900);
  };

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(value)
      .then(() => {
        showCopiedState();
      })
      .catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showCopiedState();
      });
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  showCopiedState();
}

function createNoteCard(note, isExternalNote) {
  const noteCard = document.createElement('div');
  noteCard.className = `note-card${isExternalNote ? ' note-external' : ''}${note.pinned ? ' note-pinned' : ''}`;

  if (activeNotesView === 'all' && note.videoTitle) {
    const videoLabel = document.createElement('div');
    videoLabel.className = 'note-video-label';
    videoLabel.textContent = note.videoTitle;
    noteCard.appendChild(videoLabel);
  }

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

  const onJumpToTimestamp = () => {
    if (isExternalNote && note.url) {
      const opened = openNoteUrlAtTimestamp(note.url, note.timestampSeconds);
      if (opened) {
        return;
      }
    }

    jumpToTimestamp(note.timestampSeconds, note.url);
  };

  timestamp.addEventListener('click', onJumpToTimestamp);

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

  const noteTextValue = String(note.noteText || '').trim();
  const canRenderMarkdown = !!(window.MarkdownReader && typeof window.MarkdownReader.render === 'function');
  if (canRenderMarkdown) {
    const rendered = window.MarkdownReader.render(noteTextValue);
    if (rendered) {
      text.classList.add('note-text-markdown');
      text.innerHTML = rendered;
    } else {
      text.textContent = noteTextValue;
    }
  } else {
    text.textContent = noteTextValue;
  }

  const canCollapseText = noteTextValue.length > NOTE_PREVIEW_CHARACTER_LIMIT;
  if (canCollapseText) {
    text.classList.add('note-text-truncated');
  }

  noteCard.appendChild(noteRow);
  noteCard.appendChild(text);

  const quickActions = document.createElement('div');
  quickActions.className = 'note-quick-actions';

  const jumpButton = document.createElement('button');
  jumpButton.className = 'note-action-btn';
  jumpButton.type = 'button';
  jumpButton.textContent = isExternalNote ? 'Open' : 'Jump';
  jumpButton.addEventListener('click', onJumpToTimestamp);

  const copyButton = document.createElement('button');
  copyButton.className = 'note-action-btn';
  copyButton.type = 'button';
  copyButton.textContent = 'Copy';
  copyButton.addEventListener('click', () => {
    copyTextToClipboard(note.noteText, copyButton);
  });

  quickActions.appendChild(jumpButton);
  quickActions.appendChild(copyButton);

  const pinButton = document.createElement('button');
  pinButton.className = `note-action-btn note-pin-btn${note.pinned ? ' is-active' : ''}`;
  pinButton.type = 'button';
  pinButton.textContent = note.pinned ? 'Unpin' : 'Pin';
  pinButton.addEventListener('click', () => {
    toggleNotePinned(note);
  });
  quickActions.appendChild(pinButton);

  if (canCollapseText) {
    const togglePreviewButton = document.createElement('button');
    togglePreviewButton.className = 'note-action-btn';
    togglePreviewButton.type = 'button';
    togglePreviewButton.textContent = 'More';
    togglePreviewButton.addEventListener('click', () => {
      const expanded = text.classList.toggle('note-text-expanded');
      text.classList.toggle('note-text-truncated', !expanded);
      togglePreviewButton.textContent = expanded ? 'Less' : 'More';
    });
    quickActions.appendChild(togglePreviewButton);
  }

  noteCard.appendChild(quickActions);

  return noteCard;
}

function renderAllNotesGrouped(notesList, notes) {
  // First group by video
  const videoGroups = {};

  notes.forEach((note) => {
    const storageKey = getStorageKeyForNote(note);
    if (!videoGroups[storageKey]) {
      videoGroups[storageKey] = {
        storageKey,
        videoTitle: note.videoTitle || 'Imported Video',
        notes: []
      };
    }

    videoGroups[storageKey].notes.push(note);
  });

  const orderedVideoGroups = Object.values(videoGroups).sort((a, b) => {
    const maxA = Math.max(...a.notes.map((note) => Number(note.id) || 0));
    const maxB = Math.max(...b.notes.map((note) => Number(note.id) || 0));
    return maxB - maxA;
  });

  // Now group videos by session
  const sessionGroups = new Map();
  orderedVideoGroups.forEach((group) => {
    group.notes.forEach((note) => {
      const sessionLabel = getSessionLabel(note.id);
      if (!sessionGroups.has(sessionLabel)) {
        sessionGroups.set(sessionLabel, []);
      }
    });
  });

  // Organize videos into sessions
  const videosBySession = new Map();
  Array.from(sessionGroups.keys()).forEach((session) => {
    videosBySession.set(session, []);
  });

  orderedVideoGroups.forEach((group) => {
    const notesBySession = new Map();
    
    group.notes.forEach((note) => {
      const sessionLabel = getSessionLabel(note.id);
      if (!notesBySession.has(sessionLabel)) {
        notesBySession.set(sessionLabel, []);
      }
      notesBySession.get(sessionLabel).push(note);
    });

    // Add group to each session it appears in
    for (const [sessionLabel, sessionNotes] of notesBySession.entries()) {
      videosBySession.get(sessionLabel).push({
        ...group,
        notes: sessionNotes
      });
    }
  });

  // Sort sessions
  const sortedSessions = Array.from(videosBySession.entries())
    .sort((a, b) => getSessionOrder(a[0]) - getSessionOrder(b[0]));

  // Render sessions and their videos
  sortedSessions.forEach((sessionEntry) => {
    const [sessionLabel, videosInSession] = sessionEntry;
    
    if (videosInSession.length === 0) return;

    // Session header
    const sessionHeader = document.createElement('div');
    sessionHeader.className = 'session-header';
    sessionHeader.innerHTML = `<h3 class="session-title">📅 ${formatExportSessionDate(sessionLabel)}</h3>`;
    notesList.appendChild(sessionHeader);

    // Videos in this session
    videosInSession.forEach((group) => {
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
        .sort((a, b) => {
          const pinA = a && a.pinned ? 1 : 0;
          const pinB = b && b.pinned ? 1 : 0;
          if (pinA !== pinB) {
            return pinB - pinA;
          }

          return (Number(b.id) || 0) - (Number(a.id) || 0);
        })
        .forEach((note) => {
          const noteVideoId = note.videoId || extractVideoIdFromUrl(note.url);
          const isExternalNote = !!(noteVideoId && currentVideoId && noteVideoId !== currentVideoId);
          groupContainer.appendChild(createNoteCard(note, isExternalNote));
        });

      notesList.appendChild(groupContainer);
    });
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
    notesList.scrollTop = 0;
    return;
  }
  
  notesList.innerHTML = '';

  if (showVideoTitle) {
    renderAllNotesGrouped(notesList, notes);
    notesList.scrollTop = 0;
    return;
  }

  sortNotesForDisplay(notes).forEach((note) => {
    const noteVideoId = note.videoId || extractVideoIdFromUrl(note.url);
    const isExternalNote = !!(noteVideoId && currentVideoId && noteVideoId !== currentVideoId);
    notesList.appendChild(createNoteCard(note, isExternalNote));
  });

  notesList.scrollTop = 0;
}

function jumpToTimestamp(seconds, preferredUrl) {
  console.log('Jumping to timestamp:', seconds);

  const fallbackNavigateToTimestamp = (tabId, tabUrl, fallbackUrl) => {
    const destinationUrl = fallbackUrl || tabUrl || '';
    if (!destinationUrl) {
      console.error('No tab URL available for jump fallback');
      return;
    }

    try {
      const url = new URL(destinationUrl);
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

  const handleJumpOnTab = (targetTab) => {
    if (!targetTab || targetTab.id === undefined) {
      console.error('No active tab found for jump');
      return;
    }

    const tabUrl = getTabUrl(targetTab);
    const preferredVideoId = extractVideoIdFromUrl(preferredUrl);
    const activeTabVideoId = extractVideoIdFromUrl(tabUrl);

    if (preferredUrl && preferredVideoId && activeTabVideoId && preferredVideoId !== activeTabVideoId) {
      fallbackNavigateToTimestamp(targetTab.id, tabUrl, preferredUrl);
      return;
    }

    if (isRestrictedMessagingUrl(tabUrl) && preferredUrl) {
      fallbackNavigateToTimestamp(targetTab.id, tabUrl, preferredUrl);
      return;
    }

    sendMessageWithAutoInjection(targetTab, { type: 'JUMP_TO_TIME', seconds: seconds }, (response, errorMessage) => {
      if (errorMessage) {
        console.error('Jump message error:', errorMessage);
        fallbackNavigateToTimestamp(targetTab.id, tabUrl, preferredUrl);
        return;
      }

      if (!response) {
        console.error('No response received for jump request');
        fallbackNavigateToTimestamp(targetTab.id, tabUrl, preferredUrl);
        return;
      }

      if (response.error) {
        console.error('Failed to jump to timestamp:', response.error);
        fallbackNavigateToTimestamp(targetTab.id, tabUrl, preferredUrl);
      }
    });
  };

  if (currentTabId !== null) {
    chrome.tabs.get(currentTabId, (trackedTab) => {
      if (!chrome.runtime.lastError && trackedTab && trackedTab.id !== undefined) {
        handleJumpOnTab(trackedTab);
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs.length > 0 ? tabs[0] : null;
        if (activeTab && activeTab.id !== undefined) {
          currentTabId = activeTab.id;
        }
        handleJumpOnTab(activeTab);
      });
    });
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs.length > 0 ? tabs[0] : null;
    if (activeTab && activeTab.id !== undefined) {
      currentTabId = activeTab.id;
    }
    handleJumpOnTab(activeTab);
  });
}

// ==================== PROMPT C: Wire Up Buttons ====================

document.addEventListener('DOMContentLoaded', () => {
  updateNotesExpandedUi();

  const importFileInput = document.getElementById('import-file-input');
  if (importFileInput) {
    importFileInput.addEventListener('change', handleImportedFileSelection);
  }

  const notesExpandButton = document.getElementById('notes-expand-btn');
  if (notesExpandButton) {
    notesExpandButton.addEventListener('click', () => {
      toggleNotesExpanded();
    });
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

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && notesExpanded) {
      notesExpanded = false;
      updateNotesExpandedUi();
    }
  });

  setNotesView('current');
  updateNotesControls();

  document.getElementById('settings-btn').addEventListener('click', () => {
    openAttributionSettings();
  });

  const unsavedBadge = document.getElementById('unsaved-badge');
  if (unsavedBadge) {
    unsavedBadge.addEventListener('click', () => {
      exportNotes(false);
    });
  }
  
  document.getElementById('capture-btn').addEventListener('click', () => {
    captureTimestamp();
  });
  
  document.getElementById('timestamp-minus-btn').addEventListener('click', () => {
    adjustTimestamp(-1);
  });
  
  document.getElementById('timestamp-plus-btn').addEventListener('click', () => {
    adjustTimestamp(1);
  });
  
  document.getElementById('save-btn').addEventListener('click', () => {
    saveNote(() => {
      document.getElementById('note-input').value = '';
      loadNotes();
    });
  });
  
  document.getElementById('export-btn').addEventListener('click', (e) => {
    if (e.shiftKey) {
      exportNotes(true);  // Shift+click = export all sessions
    } else {
      exportNotes(false); // Normal click = current session only
    }
  });

  window.addEventListener('pagehide', () => {
    if (sessionNotesSinceExport > 0) {
      exportNotes(false, true); // Silent auto-backup on close
    }
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    importNotes();
  });
  
  document.getElementById('upgrade-link').addEventListener('click', (e) => {
    e.preventDefault();
    openUpgradePage();
  });
});
