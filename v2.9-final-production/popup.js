const logEl = document.getElementById('log');

function appendLog(msg) {
    logEl.innerText += `\n${msg}`;
    logEl.scrollTop = logEl.scrollHeight;
}

// Hydrate logs from storage single source of truth on open
chrome.storage.local.get(['executionLogs'], (data) => {
    if (data.executionLogs && Array.isArray(data.executionLogs)) {
        logEl.innerText = data.executionLogs.join('\n');
        logEl.scrollTop = logEl.scrollHeight;
    }
});

chrome.runtime.onMessage.addListener((request) => {
    if (request.type === 'LOG') {
        appendLog(request.message);
    }
});

document.getElementById('btnRun').addEventListener('click', () => {
    logEl.innerText = '[+] Dispatching task to background worker...';
    chrome.runtime.sendMessage({ action: 'START_REGISTRATION' }, (response) => {
        if (chrome.runtime.lastError) {
            appendLog(`[-] Error: ${chrome.runtime.lastError.message}`);
        } else if (response && response.status) {
            appendLog(`[+] Background response: ${response.status}`);
        }
    });
});
