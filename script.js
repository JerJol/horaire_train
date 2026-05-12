class TrainScheduleApp {
    constructor() {
        this.apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
        this.currentTab = 'outbound';
        this.departureStation = '';
        this.arrivalStation = '';
        this.searchDateTime = '';
        this.defaultSettings = {
            departure: '',
            arrival: '',
            minConnectionTime: 5
        };
        
        this.init();
    }

    init() {
        this.loadSettings();
        this.setDefaultDateTime();
        this.setupEventListeners();
        this.loadDefaultStations();
    }

    loadSettings() {
        const settings = localStorage.getItem('trainSettings');
        if (settings) {
            this.defaultSettings = JSON.parse(settings);
        }
    }

    saveSettingsToStorage() {
        localStorage.setItem('trainSettings', JSON.stringify(this.defaultSettings));
    }

    setDefaultDateTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        this.searchDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
        document.getElementById('datetime').value = this.searchDateTime;
    }

    loadDefaultStations() {
        if (this.defaultSettings.departure) {
            document.getElementById('departure').value = this.defaultSettings.departure;
        }
        if (this.defaultSettings.arrival) {
            document.getElementById('arrival').value = this.defaultSettings.arrival;
        }
    }

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            this.renderTrainsList('outbound');
            this.renderTrainsList('return');
        });
    }

    async searchTrains() {
        const departure = document.getElementById('departure').value.trim();
        const arrival = document.getElementById('arrival').value.trim();
        const datetime = document.getElementById('datetime').value;

        if (!departure || !arrival) {
            this.showError('Veuillez entrer les gares de départ et d\'arrivée');
            return;
        }

        if (!datetime) {
            this.showError('Veuillez sélectionner une date et heure');
            return;
        }

        this.departureStation = departure;
        this.arrivalStation = arrival;
        this.searchDateTime = datetime;
        this.currentOffset = 0;
        this.totalTrains = 0;
        this.totalReturnTrains = 0;
        this.cumulativeOutboundTrains = [];
        this.cumulativeReturnTrains = [];

        try {
            await this.loadTrains(departure, arrival, datetime, 0);
        } catch (error) {
            this.showError('Erreur lors de la recherche des horaires: ' + error.message);
        }
    }

    async loadTrains(departure, arrival, datetime, offset, lastTime = null) {
        try {
            let url = `${this.apiBase}/api/trains?departure=${encodeURIComponent(departure)}&arrival=${encodeURIComponent(arrival)}&datetime=${datetime}&offset=${offset}`;
            if (lastTime) {
                url += `&lastTime=${encodeURIComponent(lastTime)}`;
            }
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Erreur: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('API Response:', JSON.stringify(data, null, 2));
            
            const deduplicate = (trains) => {
                const seen = new Set();
                return (trains || []).filter(t => {
                    const key = `${t.time}-${t.arrivalTime}-${t.trainNumber}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            };
            
            if (offset === 0) {
                this.cumulativeOutboundTrains = deduplicate(data.trains || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                this.cumulativeReturnTrains = deduplicate(data.returnTrains || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            } else {
                this.cumulativeOutboundTrains = deduplicate([...(this.cumulativeOutboundTrains || []), ...(data.trains || [])]).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                this.cumulativeReturnTrains = deduplicate([...(this.cumulativeReturnTrains || []), ...(data.returnTrains || [])]).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            }
            
            this.lastOutboundTrains = this.cumulativeOutboundTrains;
            this.lastReturnTrains = this.cumulativeReturnTrains;
            this.currentOffset = data.offset || 0;
            this.totalTrains = data.totalTrains || 0;
            this.totalReturnTrains = data.totalReturnTrains || 0;
            
            if (data.lastDepartureTime) {
                this.lastDepartureTime = data.lastDepartureTime;
            }
            
            const hasMoreOutbound = this.lastOutboundTrains.length < this.totalTrains;
            const hasMoreReturn = this.lastReturnTrains.length < this.totalReturnTrains;
            
            this.renderTrainsList('outbound', this.lastOutboundTrains, hasMoreOutbound ? () => this.loadNextTrains(departure, arrival, datetime) : null);
            this.renderTrainsList('return', this.lastReturnTrains, hasMoreReturn ? () => this.loadNextTrains(departure, arrival, datetime) : null);
        } catch (error) {
            this.showError('Erreur lors du chargement: ' + error.message);
        }
    }

    async loadNextTrains(departure, arrival, datetime) {
        const nextOffset = this.currentOffset + 1;
        await this.loadTrains(departure, arrival, datetime, nextOffset, this.lastDepartureTime);
    }

    async loadNextTrainsFromUI() {
        if (this.departureStation && this.arrivalStation && this.searchDateTime) {
            await this.loadNextTrains(this.departureStation, this.arrivalStation, this.searchDateTime);
        }
    }

    async fetchTrainSchedule(departure, arrival, datetime) {
        try {
            const response = await fetch(`${this.apiBase}/api/trains?departure=${encodeURIComponent(departure)}&arrival=${encodeURIComponent(arrival)}&datetime=${datetime}`);
            
            if (!response.ok) {
                throw new Error(`Erreur: ${response.status}`);
            }
            
            const data = await response.json();
            return this.processTrainData(data);
        } catch (error) {
            console.error('Erreur API:', error.message);
            return this.generateMockData(departure, arrival);
        }
    }

    processTrainData(apiData) {
        if (apiData.trains) {
            return apiData.trains;
        }
        return [];
    }

    generateMockData(departure, arrival) {
        const mockTrains = [];
        const now = new Date(this.searchDateTime);
        
        for (let i = 0; i < 5; i++) {
            const departureTime = new Date(now.getTime() + i * 30 * 60 * 1000);
            const hours = String(departureTime.getHours()).padStart(2, '0');
            const minutes = String(departureTime.getMinutes()).padStart(2, '0');
            
            mockTrains.push({
                time: `${hours}:${minutes}`,
                destination: arrival,
                duration: `${Math.floor(Math.random() * 3) + 1}h${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
                trainNumber: `T${1000 + i}`
            });
        }

        return mockTrains;
    }

    showNotice() {
        const notice = document.createElement('div');
        notice.className = 'notice';
        notice.innerHTML = `
            <div class="notice-content">
                <strong>⚠️ Information</strong><br>
                L'application utilise actuellement des données de démonstration.<br>
                Pour obtenir des horaires réels, veuillez obtenir une clé API SNCF et la configurer dans le code.
            </div>
        `;
        
        const container = document.querySelector('.container');
        container.insertBefore(notice, container.firstChild);
        
        setTimeout(() => {
            notice.remove();
        }, 10000);
    }

    renderTrainsList(type, trains = [], offset = 0, onNext = null) {
        const container = document.getElementById(`${type}-trains`);
        const stations = this.getDisplayStations(type);
        
        if (!trains || trains.length === 0) {
            container.innerHTML = `
                <div class="loading">
                    ${type === 'outbound' ? 'Aucun train trouvé' : 'Aucun train retour trouvé'}
                </div>
            `;
            return;
        }

        container.innerHTML = `<div class="trains-results">` + trains.map((train, idx) => {
            const uniqueId = `${type}-${idx}`;
            return `
            <div class="train-item" onclick="app.showJourneyDetails('${type}', '${uniqueId}')">
                <div class="train-info">
                    <div>
                        <div class="train-time">${train.time || '--:--'}${train.arrivalTime && train.arrivalTime !== train.time && train.arrivalTime !== '--' ? ' → ' + train.arrivalTime : ''}</div>
                        <div class="train-route">${train.line ? '[' + train.line + '] ' : ''}${train.departure || stations.departure} → ${train.destination}</div>
                    </div>
                    <div class="train-duration">${train.duration || ''}</div>
                </div>
                <div id="details-${uniqueId}" class="train-details" style="display: none;"></div>
            </div>
        `}).join('') + `<button class="next-btn" onclick="app.loadNextTrainsFromUI()">Suivant →</button></div>`;
    }

    getDisplayStations(type) {
        if (type === 'return') {
            return {
                departure: this.arrivalStation,
                arrival: this.departureStation
            };
        }
        return {
            departure: this.departureStation,
            arrival: this.arrivalStation
        };
    }

    showTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;
    }

    showSettings() {
        document.getElementById('default-departure').value = this.defaultSettings.departure || '';
        document.getElementById('default-arrival').value = this.defaultSettings.arrival || '';
        document.getElementById('min-connection-time').value = this.defaultSettings.minConnectionTime || 5;
        document.getElementById('settings-modal').style.display = 'block';
    }

    closeSettings() {
        document.getElementById('settings-modal').style.display = 'none';
    }

    saveSettingsToStorage() {
        localStorage.setItem('trainSettings', JSON.stringify(this.defaultSettings));
    }

    saveSettings() {
        this.defaultSettings.departure = document.getElementById('default-departure').value.trim();
        this.defaultSettings.arrival = document.getElementById('default-arrival').value.trim();
        this.defaultSettings.minConnectionTime = parseInt(document.getElementById('min-connection-time').value) || 5;

        this.saveSettingsToStorage();
        this.loadDefaultStations();
        this.closeSettings();

        if (this.defaultSettings.departure && this.defaultSettings.arrival) {
            document.getElementById('departure').value = this.defaultSettings.departure;
            document.getElementById('arrival').value = this.defaultSettings.arrival;
        }
        
        // Ajout d'un feedback visuel
        const saveBtn = document.querySelector('.save-btn');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = '✓ Enregistré';
        saveBtn.style.background = '#27ae60';
        
        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.background = '#667eea';
        }, 2000);
    }

    showError(message) {
        const existingError = document.querySelector('.error');
        if (existingError) {
            existingError.remove();
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'error';
        errorDiv.textContent = message;
        
        const searchSection = document.querySelector('.search-section');
        searchSection.parentNode.insertBefore(errorDiv, searchSection.nextSibling);

        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }

    formatTime(timeStr) {
        if (!timeStr || timeStr.length < 4) return '--:--';
        const clean = timeStr.toString().replace(/\D/g, '');
        if (clean.length >= 4) {
            return clean.slice(0, 2) + ':' + clean.slice(2, 4);
        }
        return timeStr;
    }

    showJourneyDetails(type, trainId) {
        const detailsEl = document.getElementById(`details-${trainId}`);
        if (!detailsEl) return;
        
        const isVisible = detailsEl.style.display === 'block';
        
        const allDetails = document.querySelectorAll('.train-details');
        allDetails.forEach(el => el.style.display = 'none');
        
        if (isVisible) {
            return;
        }
        
        const trains = type === 'outbound' ? this.lastOutboundTrains : this.lastReturnTrains;
        const idx = parseInt(trainId.split('-').pop());
        const train = trains[idx];
        if (!train) return;
        if (!train.sections || train.sections.length === 0) {
            detailsEl.innerHTML = '<div class="detail-section">Aucun détail disponible</div>';
        } else {
let transportMode = train.sections.find(s => s.mode?.toLowerCase() !== 'walking')?.mode || 'Train';
        const trainNumbers = train.trainNumber ? train.trainNumber.split(' + ') : [];
        let trainNumHtml = trainNumbers.length > 1 
            ? trainNumbers.map(n => `train ${transportMode.toLowerCase()} n° ${n}`).join('<br>')
            : `train ${transportMode.toLowerCase()} n° ${train.trainNumber || 'N/A'}`;
        let html = `<div class="detail-train-number">${trainNumHtml}</div>`;
        train.sections.forEach((sec, idx) => {
            if (sec.stops && sec.stops.length > 0) {
                if (idx === 0 || (sec.type === 'public_transport')) {
                    const secTrainNum = sec.display_informations?.code || '';
                    const modeLabel = sec.type === 'public_transport' && secTrainNum 
                        ? `train fluo n° ${secTrainNum}` 
                        : (sec.mode || '');
                    html += `<div class="detail-section-title">${modeLabel}</div>`;
                }
                html += sec.stops.map(stop => `
                    <div class="detail-stop">
                        <span class="detail-stop-time">${this.formatTime(stop.time)}</span>
                        <span class="detail-stop-name">${stop.name}</span>
                    </div>
                `).join('');
            } else {
                    if (sec.departure && sec.departure !== sec.arrival) {
                        html += `
                            <div class="detail-section">
                                <span class="detail-mode">${sec.mode || sec.type}</span>
                                <span class="detail-time">${sec.departureTime || '--:--'}</span>
                                <span class="detail-station">${sec.departure}</span>
                                ${sec.arrival ? `→ <span class="detail-station">${sec.arrival}</span> <span class="detail-time">${sec.arrivalTime || '--:--'}</span>` : ''}
                            </div>
                        `;
                    }
                }
            });
            detailsEl.innerHTML = html;
        }
        detailsEl.style.display = 'block';
    }
}

const app = new TrainScheduleApp();

function showTab(tabName) {
    app.showTab(tabName);
}

function showSettings() {
    app.showSettings();
}

function closeSettings() {
    app.closeSettings();
}

function saveSettings() {
    app.saveSettings();
}

function setNow() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    document.getElementById('datetime').value = `${year}-${month}-${day}T${hours}:${minutes}`;
}

function searchTrains() {
    app.searchTrains();
}