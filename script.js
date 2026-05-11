class TrainScheduleApp {
    constructor() {
        this.currentTab = 'outbound';
        this.departureStation = '';
        this.arrivalStation = '';
        this.searchDateTime = '';
        this.defaultSettings = {
            departure: '',
            arrival: ''
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

        try {
            const outboundTrains = await this.fetchTrainSchedule(departure, arrival, datetime);
            const returnTrains = await this.fetchTrainSchedule(arrival, departure, datetime);

            this.renderTrainsList('outbound', outboundTrains);
            this.renderTrainsList('return', returnTrains);
        } catch (error) {
            this.showError('Erreur lors de la recherche des horaires: ' + error.message);
        }
    }

    async fetchTrainSchedule(departure, arrival, datetime) {
        const API_KEY = 'YOUR_SNCF_API_KEY';
        const url = `https://api.sncf.com/v1/schedules?departure_station=${departure}&arrival_station=${arrival}&datetime=${datetime}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            if (!response.ok) {
                throw new Error('Réponse API non valide');
            }

            const data = await response.json();
            return this.processTrainData(data);
        } catch (error) {
            console.error('Erreur API:', error);
            return this.generateMockData(departure, arrival);
        }
    }

    processTrainData(apiData) {
        const trains = [];
        const limit = 5;

        if (apiData.schedules && apiData.schedules.length > 0) {
            apiData.schedules.slice(0, limit).forEach(schedule => {
                trains.push({
                    time: schedule.departure_time,
                    destination: schedule.arrival_station,
                    duration: schedule.duration || 'Durée non disponible',
                    trainNumber: schedule.train_number || 'N/A'
                });
            });
        }

        return trains;
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

    renderTrainsList(type, trains = []) {
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

        container.innerHTML = trains.map(train => `
            <div class="train-item">
                <div class="train-info">
                    <div>
                        <div class="train-time">${train.time}</div>
                        <div class="train-route">${stations.departure} → ${train.destination}</div>
                    </div>
                    <div class="train-duration">${train.duration}</div>
                </div>
            </div>
        `).join('');
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

    renderTrainsList(type, trains = []) {
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

        container.innerHTML = trains.map(train => `
            <div class="train-item">
                <div class="train-info">
                    <div>
                        <div class="train-time">${train.time}</div>
                        <div class="train-route">${stations.departure} → ${train.destination}</div>
                    </div>
                    <div class="train-duration">${train.duration}</div>
                </div>
            </div>
        `).join('');
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

function searchTrains() {
    app.searchTrains();
}