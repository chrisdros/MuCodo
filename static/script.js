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
let displayUpdateInterval; // Unified interval for display updates
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
            "changeTimes": [], // Change: No changeTimes
            "names": ["Projekt A", "Projekt B"]
        };
        renderConfigLists();
    }
}

function renderConfigLists() {
    const predefinedTimesList = document.getElementById('predefined-times-list');
    const namesList = document.getElementById('names-list');

    // Render Predefined Times
    if (predefinedTimesList) {
        predefinedTimesList.innerHTML = '';
        // Sort predefined times numerically before rendering
        const sortedTimes = (config.predefinedTimes || []).slice().sort((a, b) => {
            return parseTimeStringToTenths(a) - parseTimeStringToTenths(b);
        });

        sortedTimes.forEach(timeString => {
            const listItem = document.createElement('li');
            const button = document.createElement('button');
            button.textContent = timeString;
            const timeInTenths = parseTimeStringToTenths(timeString);
            button.addEventListener('click', () => {
                totalTime = timeInTenths;
                remainingTime = timeInTenths;
                updateLocalStorageTimes();
                updateAdminInputs();
                updateDisplay(); // Trigger display update after setting time
            });
            listItem.appendChild(button);
            predefinedTimesList.appendChild(listItem);
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
    updateDisplay(); // Update display to show new selected name
}


// --- Display Update Logic (for both Admin and Countdown Display pages) ---
function updateDisplay() {
    // IMPORTANT: Re-load latest values from localStorage before updating display
    // This ensures that all tabs/windows get the most current state from localStorage.
    loadTimesFromLocalStorage();
    selectedConfigName = localStorage.getItem('selected_config_name') || 'Neutral'; // Ensure name is also current

    const countdownDisplayDiv = document.getElementById('countdown-display');
    const progressBarDisplay = document.getElementById('progress-bar-display');
    const currentRemainingTimeSpan = document.getElementById('current-remaining-time');
    const currentNameDisplay = document.getElementById('current-name-display'); // Element for name on countdown page

    if (countdownDisplayDiv) {
        countdownDisplayDiv.textContent = formatTimeWithoutTenths(remainingTime);
    }
    if (progressBarDisplay && totalTime > 0) {
        const progress = ((totalTime - remainingTime) / totalTime) * 100;
        progressBarDisplay.style.width = `${progress}%`;
    } else if (progressBarDisplay) {
        progressBarDisplay.style.width = '0%';
    }

    // Always update remaining time on admin page if the element exists
    if (currentRemainingTimeSpan) {
        currentRemainingTimeSpan.textContent = formatTime(remainingTime);
    }

    // Update the selected name on the countdown display page
    if (currentNameDisplay) {
        currentNameDisplay.textContent = selectedConfigName;
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
        minutesInput.value = String(Math.floor(totalTime / 600)).padStart(2, '0');
        secondsInput.value = String(Math.floor((totalTime % 600) / 10)).padStart(2, '0');
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
            updateDisplay(); // Trigger display update after setting new total time
        }
    }
}

function setupArrowButtons() {
    // Select all buttons within the new arrow groups
    document.querySelectorAll('.arrow-buttons-group-top button, .arrow-buttons-group-bottom button').forEach(button => {
        button.addEventListener('click', function() {
            const action = this.dataset.action;
            let currentMinutes = parseInt(document.getElementById('minutes-input').value);
            let currentSeconds = parseInt(document.getElementById('seconds-input').value);

            // Temporarily enable inputs for change
            const minutesInput = document.getElementById('minutes-input');
            const secondsInput = document.getElementById('seconds-input');
            minutesInput.readOnly = false;
            secondsInput.readOnly = false;


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

            // Handle overflow/underflow for seconds
            if (currentSeconds >= 60) {
                currentMinutes += Math.floor(currentSeconds / 60);
                currentSeconds %= 60;
            } else if (currentSeconds < 0) {
                const totalCurrentSeconds = currentMinutes * 60 + currentSeconds;
                if (totalCurrentSeconds < 0) {
                    currentMinutes = 0;
                    currentSeconds = 0;
                } else {
                    currentMinutes = Math.floor(totalCurrentSeconds / 60);
                    currentSeconds = totalCurrentSeconds % 60;
                }
            }

            document.getElementById('minutes-input').value = String(currentMinutes).padStart(2, '0');
            document.getElementById('seconds-input').value = String(currentSeconds).padStart(2, '0');
            handleInputChanges(); // This will also save to local storage and update display

            // Re-enable readonly after a short delay (for visual feedback)
            setTimeout(() => {
                minutesInput.readOnly = true;
                secondsInput.readOnly = true;
            }, 100);
        });
    });
}

function setupTotalTimeEditableOnClick() {
    const minutesInput = document.getElementById('minutes-input');
    const secondsInput = document.getElementById('seconds-input');

    const toggleReadOnly = (inputElement, enable) => {
        inputElement.readOnly = !enable;
        if (enable) {
            inputElement.focus();
            inputElement.select(); // Select content for easy editing
        }
    };

    minutesInput.addEventListener('click', () => toggleReadOnly(minutesInput, true));
    secondsInput.addEventListener('click', () => toggleReadOnly(secondsInput, true));

    // When focus leaves, disable readonly and update changes
    minutesInput.addEventListener('blur', () => {
        toggleReadOnly(minutesInput, false);
        handleInputChanges();
    });
    secondsInput.addEventListener('blur', () => {
        toggleReadOnly(secondsInput, false);
        handleInputChanges();
    });

    // Handle Enter key to confirm changes
    minutesInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            minutesInput.blur();
        }
    });
    secondsInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            secondsInput.blur();
        }
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

function setupAdjustTimeButtons() {
    const adjustMinusButton = document.getElementById('adjust-time-minus-5s');
    const adjustPlusButton = document.getElementById('adjust-time-plus-5s');

    if (adjustMinusButton) {
        adjustMinusButton.addEventListener('click', () => {
            if (!selectedConfigName || selectedConfigName === 'Neutral') {
                alert('Bitte wählen Sie zuerst einen Namen / Projekt aus, um Zeiten anzupassen.');
                return;
            }
            remainingTime = Math.max(0, remainingTime - 50); // -5 seconds in tenths
            updateLocalStorageTimes();
            updateDisplay();
        });
    }

    if (adjustPlusButton) {
        adjustPlusButton.addEventListener('click', () => {
            if (!selectedConfigName || selectedConfigName === 'Neutral') {
                alert('Bitte wählen Sie zuerst einen Namen / Projekt aus, um Zeiten anzupassen.');
                return;
            }
            remainingTime = Math.max(0, remainingTime + 50); // +5 seconds in tenths
            // Ensure remainingTime does not exceed totalTime if totalTime is smaller
            if (remainingTime > totalTime) remainingTime = totalTime;

            updateLocalStorageTimes();
            updateDisplay();
        });
    }
}


// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    // Initial load and display update for all pages
    updateDisplay(); // Calls loadTimesFromLocalStorage() internally now

    // Set up display update interval for all relevant pages
    // This interval will continuously update the displayed time and progress bar
    displayUpdateInterval = setInterval(updateDisplay, 100);


    if (document.body.classList.contains('admin-active')) {
        loadConfig();
        updateAdminInputs();
        setupArrowButtons();
        setupTotalTimeEditableOnClick();
        setupPlayPauseButton();
        setupAdjustTimeButtons();
        updatePlayPauseButton();

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
    // Only save isRunning state if on the admin page, as it's the controlling page
    if (document.body.classList.contains('admin-active')) {
        localStorage.setItem('isRunning', isRunning);
    }
    clearInterval(displayUpdateInterval); // Clear interval when leaving page
});