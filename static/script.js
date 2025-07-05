// Service Worker Registration for Offline Capability
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            }, err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Global Variables
let countdownInterval;
let displayUpdateInterval;
let remainingTime = 0; // in tenths of a second
let totalTime = 0; // in tenths of a second
let isRunning = false;
let selectedConfigName = localStorage.getItem('selected_config_name') || 'Neutral';
let config = {};

const DECIMAL_PLACES = 1;

// --- Utility Functions ---

function formatTime(totalTenths) {
    const minutes = Math.floor(totalTenths / 600);
    const seconds = Math.floor((totalTenths % 600) / 10);
    const tenths = totalTenths % 10;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function formatTimeWithoutTenths(totalTenths) {
    const minutes = Math.floor(totalTenths / 600);
    const seconds = Math.floor((totalTenths % 600) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Parses a time string (MM:SS or -MM:SS) into total tenths of a second.
 * Supports negative times for change values.
 * @param {string} timeString - The time string (e.g., "1:30", "-0:30").
 * @returns {number} Total time in tenths of a second.
 */
function parseTimeStringToTenths(timeString) {
    let sign = 1;
    if (timeString.startsWith('-')) {
        sign = -1;
        timeString = timeString.substring(1); // Remove the minus sign
    }

    const parts = timeString.split(':');
    if (parts.length === 2) {
        const minutes = parseInt(parts[0]);
        const seconds = parseInt(parts[1]);
        if (!isNaN(minutes) && !isNaN(seconds)) {
            return sign * ((minutes * 60) + seconds) * 10; // Convert to tenths
        }
    }
    console.warn(`Invalid time string format: ${timeString}. Returning 0.`);
    return 0;
}


function parseTimeToTenths(minutes, seconds) {
    return (parseInt(minutes || 0) * 600) + (parseInt(seconds || 0) * 10);
}

function updateLocalStorageTimes() {
    localStorage.setItem('remaining_time', remainingTime);
    localStorage.setItem('total_time', totalTime);
}

function saveElapsedTime() {
    if (selectedConfigName && selectedConfigName !== 'Neutral' && totalTime > 0) {
        const elapsed = totalTime - remainingTime;
        localStorage.setItem(`elapsed_${selectedConfigName}`, elapsed);

        let totalAccumulated = parseFloat(localStorage.getItem(`total_${selectedConfigName}`) || '0');
        if (isRunning) {
            totalAccumulated += 0.1;
        }
        localStorage.setItem(`total_${selectedConfigName}`, totalAccumulated.toFixed(DECIMAL_PLACES));
    }
}

function loadTimesFromLocalStorage() {
    remainingTime = parseInt(localStorage.getItem('remaining_time') || '0');
    totalTime = parseInt(localStorage.getItem('total_time') || '0');
    if (remainingTime > totalTime) {
        remainingTime = totalTime;
    }
}

async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) {
            if (response.status === 404) {
                console.warn('config.json not found on server, using default config.');
                throw new Error('config.json not found');
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        config = await response.json();
        console.log('Config loaded from API:', config);
        renderConfigLists();
    } catch (error) {
        console.error('Failed to load config from API:', error);
        // Fallback or default config if loading fails
        config = {
            "predefinedTimes": ["0:30","1:00","2:30"],
            "changeTimes": ["0:30","-0:30"],
            "names": ["Projekt A", "Projekt B"]
        };
        renderConfigLists();
    }
}

function renderConfigLists() {
    const predefinedTimesList = document.getElementById('predefined-times-list');
    const changeTimesList = document.getElementById('change-times-list');
    const namesList = document.getElementById('names-list');

    // Render Predefined Times
    if (predefinedTimesList) {
        predefinedTimesList.innerHTML = '';
        (config.predefinedTimes || []).forEach(timeString => { // timeString is like "0:30"
            const listItem = document.createElement('li');
            const button = document.createElement('button');
            button.textContent = timeString; // Display the string as is
            const timeInTenths = parseTimeStringToTenths(timeString);
            button.addEventListener('click', () => {
                totalTime = timeInTenths;
                remainingTime = timeInTenths;
                updateLocalStorageTimes();
                updateAdminInputs();
                updateDisplay();
            });
            listItem.appendChild(button);
            predefinedTimesList.appendChild(listItem);
        });
    }

    // Render Change Times
    if (changeTimesList) {
        changeTimesList.innerHTML = '';
        (config.changeTimes || []).forEach(changeString => { // changeString is like "0:30" or "-0:30"
            const listItem = document.createElement('li');
            const button = document.createElement('button');
            button.textContent = changeString; // Display the string as is
            const changeInTenths = parseTimeStringToTenths(changeString);
            button.addEventListener('click', () => applyChangeTime(changeInTenths));
            listItem.appendChild(button);
            changeTimesList.appendChild(listItem);
        });
    }

    // Render Names / Projects
    if (namesList) {
        namesList.innerHTML = '';
        const allNames = [...(config.names || []), "Neutral"];
        allNames.forEach(name => {
            const listItem = document.createElement('li');
            const button = document.createElement('button');
            button.textContent = name;
            button.dataset.name = name;
            button.addEventListener('click', () => selectName(name));
            listItem.appendChild(button);
            namesList.appendChild(listItem);

            if (name === selectedConfigName) {
                button.classList.add('selected');
            }
        });
    }
}

function selectName(name) {
    if (selectedConfigName && selectedConfigName !== 'Neutral' && selectedConfigName !== name) {
        const oldElapsedTime = parseInt(localStorage.getItem(`elapsed_${selectedConfigName}`) || '0');
        if (oldElapsedTime > 0) {
            let totalAccumulatedForOldName = parseFloat(localStorage.getItem(`total_${selectedConfigName}`) || '0');
            totalAccumulatedForOldName += oldElapsedTime;
            localStorage.setItem(`total_${selectedConfigName}`, totalAccumulatedForOldName.toFixed(DECIMAL_PLACES));
        }
        localStorage.removeItem(`elapsed_${selectedConfigName}`);
    }

    selectedConfigName = name;
    localStorage.setItem('selected_config_name', selectedConfigName);

    document.querySelectorAll('#names-list button').forEach(btn => {
        btn.classList.remove('selected');
    });
    const selectedButton = document.querySelector(`#names-list button[data-name="${name}"]`);
    if (selectedButton) {
        selectedButton.classList.add('selected');
    }
}


function applyChangeTime(changeTenths) {
    if (!selectedConfigName || selectedConfigName === 'Neutral') {
        alert('Bitte wählen Sie zuerst einen Namen / Projekt aus, um Zeiten zu ändern.');
        return;
    }

    remainingTime += changeTenths;
    if (remainingTime < 0) remainingTime = 0;

    totalTime += changeTenths;
    if (totalTime < 0) totalTime = 0;

    if (remainingTime > totalTime) remainingTime = totalTime;

    updateLocalStorageTimes();
    if (document.body.classList.contains('admin-active')) {
        updateAdminInputs();
    }
    updateDisplay();
}

// --- Display Update Logic (for both Admin and Countdown Display pages) ---
function updateDisplay() {
    const countdownDisplayDiv = document.getElementById('countdown-display');
    const progressBarDisplay = document.getElementById('progress-bar-display');

    if (countdownDisplayDiv) {
        countdownDisplayDiv.textContent = formatTimeWithoutTenths(remainingTime);
    }
    if (progressBarDisplay && totalTime > 0) {
        const progress = ((totalTime - remainingTime) / totalTime) * 100;
        progressBarDisplay.style.width = `${progress}%`;
    } else if (progressBarDisplay) {
        progressBarDisplay.style.width = '0%';
    }

    const currentRemainingTimeSpan = document.getElementById('current-remaining-time');
    if (currentRemainingTimeSpan) {
        currentRemainingTimeSpan.textContent = formatTime(remainingTime);
    }
}

// --- Countdown Running Logic (only on Admin page) ---

function startCountdown() {
    if (isRunning || remainingTime <= 0) return;

    if (!selectedConfigName || selectedConfigName === 'Neutral') {
        alert('Bitte wählen Sie zuerst einen Namen / Projekt aus, bevor Sie den Countdown starten.');
        return;
    }

    isRunning = true;
    updatePlayPauseButton();
    countdownInterval = setInterval(() => {
        if (remainingTime > 0) {
            remainingTime--;
            saveElapsedTime();
            updateLocalStorageTimes();
        } else {
            stopCountdown();
        }
    }, 100);
}

function stopCountdown() {
    clearInterval(countdownInterval);
    isRunning = false;
    updatePlayPauseButton();
}

// --- Admin Page Specific Logic ---

function updateAdminInputs() {
    const minutesInput = document.getElementById('minutes-input');
    const secondsInput = document.getElementById('seconds-input');
    if (minutesInput && secondsInput) {
        minutesInput.value = Math.floor(totalTime / 600);
        secondsInput.value = Math.floor((totalTime % 600) / 10);
    }
}

function handleInputChanges() {
    const minutesInput = document.getElementById('minutes-input');
    const secondsInput = document.getElementById('seconds-input');

    if (minutesInput && secondsInput) {
        const newTotal = parseTimeToTenths(minutesInput.value, secondsInput.value);
        if (newTotal !== totalTime) {
            totalTime = newTotal;
            remainingTime = newTotal;
            updateLocalStorageTimes();
            updateDisplay();
        }
    }
}

function setupArrowButtons() {
    document.querySelectorAll('.arrow-buttons button').forEach(button => {
        button.addEventListener('click', function() {
            const action = this.dataset.action;
            let currentMinutes = parseInt(document.getElementById('minutes-input').value);
            let currentSeconds = parseInt(document.getElementById('seconds-input').value);

            switch(action) {
                case 'add-minutes-10': currentMinutes += 10; break;
                case 'add-minutes-1': currentMinutes += 1; break;
                case 'sub-minutes-10': currentMinutes = Math.max(0, currentMinutes - 10); break;
                case 'sub-minutes-1': currentMinutes = Math.max(0, currentMinutes - 1); break;
                case 'add-seconds-10': currentSeconds += 10; break;
                case 'add-seconds-1': currentSeconds += 1; break;
                case 'sub-seconds-10': currentSeconds = Math.max(0, currentSeconds - 10); break;
                case 'sub-seconds-1': currentSeconds = Math.max(0, currentSeconds - 1); break;
            }

            if (currentSeconds >= 60) {
                currentMinutes += Math.floor(currentSeconds / 60);
                currentSeconds %= 60;
            } else if (currentSeconds < 0) {
                const minutesToSubtract = Math.ceil(Math.abs(currentSeconds) / 60);
                currentMinutes = Math.max(0, currentMinutes - minutesToSubtract);
                currentSeconds = 60 - (Math.abs(currentSeconds) % 60);
                if (currentSeconds === 60) currentSeconds = 0;
            }

            document.getElementById('minutes-input').value = currentMinutes;
            document.getElementById('seconds-input').value = currentSeconds;
            handleInputChanges();
        });
    });
}

function updatePlayPauseButton() {
    const playPauseButton = document.getElementById('play-pause-button');
    if (playPauseButton) {
        if (isRunning) {
            playPauseButton.classList.add('paused');
        } else {
            playPauseButton.classList.remove('paused');
        }
    }
}

function setupPlayPauseButton() {
    const playPauseButton = document.getElementById('play-pause-button');
    if (playPauseButton) {
        playPauseButton.addEventListener('click', () => {
            if (isRunning) {
                stopCountdown();
            } else {
                startCountdown();
            }
        });
    }
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    loadTimesFromLocalStorage();

    if (document.body.classList.contains('countdown-display-active')) {
        updateDisplay();
        displayUpdateInterval = setInterval(updateDisplay, 100);
    } else {
        clearInterval(displayUpdateInterval);
    }

    if (document.body.classList.contains('admin-active')) {
        loadConfig();
        updateAdminInputs();
        updateDisplay();
        setupArrowButtons();
        setupPlayPauseButton();
        updatePlayPauseButton();

        document.getElementById('minutes-input')?.addEventListener('input', handleInputChanges);
        document.getElementById('seconds-input')?.addEventListener('input', handleInputChanges);

        const downloadConfigBtn = document.getElementById('download-config-btn');
        const uploadConfigBtn = document.getElementById('upload-config-btn');
        const uploadConfigInput = document.getElementById('upload-config-input');
        const uploadStatusMessage = document.getElementById('upload-status-message');

        if (downloadConfigBtn) {
            downloadConfigBtn.addEventListener('click', () => {
                window.location.href = '/api/config';
            });
        }

        if (uploadConfigBtn && uploadConfigInput) {
            uploadConfigBtn.addEventListener('click', () => {
                uploadConfigInput.click();
            });

            uploadConfigInput.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (!file) {
                    return;
                }

                uploadStatusMessage.textContent = 'Lade hoch...';
                uploadStatusMessage.style.color = 'orange';

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch('/api/config/upload', {
                        method: 'POST',
                        body: formData
                    });

                    const result = await response.json();

                    if (response.ok) {
                        uploadStatusMessage.textContent = result.message;
                        uploadStatusMessage.style.color = 'green';
                        await loadConfig();
                        alert('Konfiguration erfolgreich hochgeladen! Seite wird aktualisiert.');
                        window.location.reload();
                    } else {
                        uploadStatusMessage.textContent = `Fehler: ${result.detail || 'Unbekannter Fehler'}`;
                        uploadStatusMessage.style.color = 'red';
                    }
                } catch (error) {
                    console.error('Upload error:', error);
                    uploadStatusMessage.textContent = `Fehler beim Hochladen: ${error.message}`;
                    uploadStatusMessage.style.color = 'red';
                } finally {
                    uploadConfigInput.value = '';
                }
            });
        }
    }
});

window.addEventListener('beforeunload', () => {
    localStorage.setItem('isRunning', isRunning);
});
