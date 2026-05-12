require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.SNCF_API_KEY || '';
console.log('API Key chargée:', API_KEY ? 'OUI (' + API_KEY.substring(0,8) + '...)' : 'NON');
const BASE_URL = 'https://api.sncf.com/v1';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

async function callNavitia(endpoint) {
    const url = `https://${API_KEY}@api.sncf.com/v1${endpoint}`;
    console.log(`API Call: ${endpoint}`);
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`SNCF API Error: ${response.status} - ${text}`);
        throw new Error(`SNCF API error: ${response.status}`);
    }

    return response.json();
}

async function findStation(query) {
    const data = await callNavitia(`/coverage/sncf/places?q=${encodeURIComponent(query)}`);
    
    if (data.places && data.places.length > 0) {
        const stopArea = data.places.find(p => p.embedded_type === 'stop_area') || data.places[0];
        return {
            id: stopArea.id,
            name: stopArea.name,
            type: stopArea.embedded_type
        };
    }
    return null;
}

app.get('/api/trains', async (req, res) => {
    const { departure, arrival, datetime, offset } = req.query;
    const trainOffset = parseInt(offset) || 0;

    if (!departure || !arrival || !datetime) {
        return res.status(400).json({ error: 'Paramètres manquants' });
    }

    if (!API_KEY) {
        return res.status(500).json({ error: 'Clé API non configurée. Créez un fichier .env avec SNCF_API_KEY' });
    }

    try {
        console.log(`Recherche: ${departure} → ${arrival} à ${datetime}`);

        const depStation = await findStation(departure);
        const arrStation = await findStation(arrival);

        if (!depStation) {
            return res.status(404).json({ error: `Gare non trouvée: ${departure}` });
        }
        if (!arrStation) {
            return res.status(404).json({ error: `Gare non trouvée: ${arrival}` });
        }

        console.log(`Gares trouvées: ${depStation.name} (${depStation.id}) → ${arrStation.name} (${arrStation.id})`);

        const dt = new Date(datetime);
        const now = new Date();
        
        let searchTime = new Date(dt);
        if (searchTime < now) {
            searchTime.setHours(now.getHours(), now.getMinutes() + 5, 0, 0);
        }
        
        const datetimeStr = searchTime.toISOString().replace(/[-:]/g, '').slice(0, 15);
        
        const filterTime = searchTime > now ? searchTime : now;
        
        const allJourneys = [];
        
        let currentSearchTime = datetimeStr;
        
        if (trainOffset > 0 && req.query.lastTime) {
            currentSearchTime = req.query.lastTime;
        }
        
        let fetchedJourneys = [];
        
        const fetchCount = 20;
        
        let journeysData = await callNavitia(
            `/coverage/sncf/journeys?from=${depStation.id}&to=${arrStation.id}&datetime=${currentSearchTime}&datetime_represents=departure&max_duration=14400&count=${fetchCount}&depth=3`
        );
        
        if (journeysData.journeys?.length > 0) {
            fetchedJourneys = journeysData.journeys;
            
            while (fetchedJourneys.length < (trainOffset + 1) * 3 && journeysData.journeys?.length > 0) {
                const lastJourney = journeysData.journeys[journeysData.journeys.length - 1];
                const lastDepTime = lastJourney?.departure_date_time;
                
                if (!lastDepTime) break;
                
                const lastTime = new Date(lastDepTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
                lastTime.setMinutes(lastTime.getMinutes() + 5);
                
                const nextSearchTime = lastTime.toISOString().replace(/[-:]/g, '').slice(0, 15);
                
                journeysData = await callNavitia(
                    `/coverage/sncf/journeys?from=${depStation.id}&to=${arrStation.id}&datetime=${nextSearchTime}&datetime_represents=departure&max_duration=14400&count=${fetchCount}&depth=3`
                );
                
                if (journeysData.journeys?.length > 0) {
                    fetchedJourneys = [...fetchedJourneys, ...journeysData.journeys];
                } else {
                    break;
                }
            }
            
            allJourneys.push(...fetchedJourneys);
        }
        
        const trainsPerPage = 3;
        const startIdx = trainOffset * trainsPerPage;
        
        const trains = [];
        if (allJourneys.length > 0) {
            const firstJourney = allJourneys[0];
            const transportSection = firstJourney?.sections?.find(sec => sec.type === 'public_transport');
            const firstSectionTrainCode = transportSection?.display_informations?.headsign || transportSection?.display_informations?.code || '';
            
            const validJourneys = allJourneys.filter(j => {
                const depTime = j.departure_date_time || '';
                const depDate = new Date(depTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
                return depDate >= filterTime;
            });
            
            validJourneys.slice(startIdx, startIdx + trainsPerPage).forEach((journey, idx) => {
                const depTime = journey.departure_date_time || '';
                const arrTime = journey.arrival_date_time || '';
                
                const depHours = depTime.includes('T') ? depTime.split('T')[1].slice(0, 2) : '--';
                const depMinutes = depTime.includes('T') ? depTime.split('T')[1].slice(2, 4) : '--';
                const arrHours = arrTime.includes('T') ? arrTime.split('T')[1].slice(0, 2) : '--';
                const arrMinutes = arrTime.includes('T') ? arrTime.split('T')[1].slice(2, 4) : '--';

                const trainCode = journey.display_informations?.headsign || journey.display_informations?.code || 'Train';
                const lineCode = trainCode;
                
                const durationSec = journey.duration || 0;
                const durHours = Math.floor(durationSec / 3600);
                const durMinutes = Math.floor((durationSec % 3600) / 60);
                const durationStr = durHours > 0 ? `${durHours}h${durMinutes}min` : `${durMinutes}min`;

                const sections = journey.sections?.map(sec => {
                    const secDepTime = sec.departure_date_time || '';
                    const secArrTime = sec.arrival_date_time || '';
                    
                    const stops = sec.stop_date_times?.map(stop => {
                        const stopDepTime = stop.departure_date_time || '';
                        const stopArrTime = stop.arrival_date_time || '';
                        const depTime = stopDepTime.includes('T') ? stopDepTime.split('T')[1].slice(0, 5) : '';
                        const arrTime = stopArrTime.includes('T') ? stopArrTime.split('T')[1].slice(0, 5) : '';
                        
                        const stopPoint = stop.stop_point || {};
                        let stopName = stopPoint.name || stopPoint.label;
                        if (!stopName) {
                            stopName = stopPoint.id?.split(':')?.pop() || 'Gare';
                        }
                        
                        return {
                            name: stopName,
                            time: depTime || arrTime,
                            arrivalTime: arrTime
                        };
                    }) || [];
                    
                    const depStopName = sec.departure_stop_point?.name || sec.departure_stop_point?.label || sec.departure_stop_point?.id?.split(':')?.pop() || '';
                    const arrStopName = sec.arrival_stop_point?.name || sec.arrival_stop_point?.label || sec.arrival_stop_point?.id?.split(':')?.pop() || '';
                    
                    return {
                        type: sec.type,
                        mode: sec.display_informations?.commercial_mode || sec.mode || '',
                        line: sec.display_informations?.code || '',
                        departure: depStopName,
                        arrival: arrStopName,
                        departureTime: secDepTime.includes('T') ? secDepTime.split('T')[1].slice(0, 5) : '',
                        arrivalTime: secArrTime.includes('T') ? secArrTime.split('T')[1].slice(0, 5) : '',
                        stops: stops
                    };
                }) || [];

                trains.push({
                    id: idx,
                    time: `${depHours}:${depMinutes}`,
                    arrivalTime: `${arrHours}:${arrMinutes}`,
                    destination: arrStation.name,
                    departure: depStation.name,
                    duration: durationStr,
                    trainNumber: firstSectionTrainCode || trainCode,
                    line: firstSectionTrainCode || trainCode,
                    platform: '',
                    sections: sections
                });
            });
        }

        let allReturnJourneys = [];
        
        let returnFetchedJourneys = [];
        
        const returnJourneysData = await callNavitia(
            `/coverage/sncf/journeys?from=${arrStation.id}&to=${depStation.id}&datetime=${datetimeStr}&datetime_represents=departure&max_duration=14400&count=${fetchCount}&depth=3`
        );
        
        if (returnJourneysData.journeys?.length > 0) {
            returnFetchedJourneys = returnJourneysData.journeys;
            
            while (returnFetchedJourneys.length < (trainOffset + 1) * 3 && returnJourneysData.journeys?.length > 0) {
                const lastJourney = returnJourneysData.journeys[returnJourneysData.journeys.length - 1];
                const lastDepTime = lastJourney?.departure_date_time;
                
                if (!lastDepTime) break;
                
                const lastTime = new Date(lastDepTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
                lastTime.setMinutes(lastTime.getMinutes() + 5);
                
                const nextSearchTime = lastTime.toISOString().replace(/[-:]/g, '').slice(0, 15);
                
                returnJourneysData = await callNavitia(
                    `/coverage/sncf/journeys?from=${arrStation.id}&to=${depStation.id}&datetime=${nextSearchTime}&datetime_represents=departure&max_duration=14400&count=${fetchCount}&depth=3`
                );
                
                if (returnJourneysData.journeys?.length > 0) {
                    returnFetchedJourneys = [...returnFetchedJourneys, ...returnJourneysData.journeys];
                } else {
                    break;
                }
            }
            
            allReturnJourneys.push(...returnFetchedJourneys);
        }

        const returnTrains = [];
        if (allReturnJourneys.length > 0) {
            const returnTransportSection = allReturnJourneys[0]?.sections?.find(sec => sec.type === 'public_transport');
            const returnSectionTrainCode = returnTransportSection?.display_informations?.headsign || returnTransportSection?.display_informations?.code || '';
            
            const validReturnJourneys = allReturnJourneys.filter(j => {
                const depTime = j.departure_date_time || '';
                const depDate = new Date(depTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
                return depDate >= filterTime;
            });
            
            const returnTrainCode = validReturnJourneys[0]?.sections?.find(sec => sec.type === 'public_transport')?.display_informations?.headsign || '';
            
            validReturnJourneys.slice(startIdx, startIdx + trainsPerPage).forEach((journey, idx) => {
                const depTime = journey.departure_date_time || '';
                const arrTime = journey.arrival_date_time || '';
                
                const depHours = depTime.includes('T') ? depTime.split('T')[1].slice(0, 2) : '--';
                const depMinutes = depTime.includes('T') ? depTime.split('T')[1].slice(2, 4) : '--';
                const arrHours = arrTime.includes('T') ? arrTime.split('T')[1].slice(0, 2) : '--';
                const arrMinutes = arrTime.includes('T') ? arrTime.split('T')[1].slice(2, 4) : '--';

                const trainCode = journey.display_informations?.headsign || journey.display_informations?.code || 'Train';
                const lineCode = trainCode;
                
                const durationSec = journey.duration || 0;
                const durHours = Math.floor(durationSec / 3600);
                const durMinutes = Math.floor((durationSec % 3600) / 60);
                const durationStr = durHours > 0 ? `${durHours}h${durMinutes}min` : `${durMinutes}min`;

                const sections = journey.sections?.map(sec => {
                    const secDepTime = sec.departure_date_time || '';
                    const secArrTime = sec.arrival_date_time || '';
                    
                    const stops = sec.stop_date_times?.map(stop => {
                        const stopDepTime = stop.departure_date_time || '';
                        const stopArrTime = stop.arrival_date_time || '';
                        const depTime = stopDepTime.includes('T') ? stopDepTime.split('T')[1].slice(0, 5) : '';
                        const arrTime = stopArrTime.includes('T') ? stopArrTime.split('T')[1].slice(0, 5) : '';
                        
                        const stopPoint = stop.stop_point || {};
                        let stopName = stopPoint.name || stopPoint.label;
                        if (!stopName) {
                            stopName = stopPoint.id?.split(':')?.pop() || 'Gare';
                        }
                        
                        return {
                            name: stopName,
                            time: depTime || arrTime,
                            arrivalTime: arrTime
                        };
                    }) || [];
                    
                    const depStopName = sec.departure_stop_point?.name || sec.departure_stop_point?.label || sec.departure_stop_point?.id?.split(':')?.pop() || '';
                    const arrStopName = sec.arrival_stop_point?.name || sec.arrival_stop_point?.label || sec.arrival_stop_point?.id?.split(':')?.pop() || '';
                    
                    return {
                        type: sec.type,
                        mode: sec.display_informations?.commercial_mode || sec.mode || '',
                        line: sec.display_informations?.code || '',
                        departure: depStopName,
                        arrival: arrStopName,
                        departureTime: secDepTime.includes('T') ? secDepTime.split('T')[1].slice(0, 5) : '',
                        arrivalTime: secArrTime.includes('T') ? secArrTime.split('T')[1].slice(0, 5) : '',
                        stops: stops
                    };
                }) || [];

                returnTrains.push({
                    id: idx,
                    time: `${depHours}:${depMinutes}`,
                    arrivalTime: `${arrHours}:${arrMinutes}`,
                    destination: depStation.name,
                    departure: arrStation.name,
                    duration: durationStr,
                    trainNumber: returnTrainCode || trainCode,
                    line: returnTrainCode || trainCode,
                    platform: '',
                    sections: sections
                });
            });
        }

        const allTrains = trains;
        const allReturnTrains = returnTrains;
        
        const paginatedTrains = allTrains;
        const paginatedReturnTrains = allReturnTrains;
        
        res.json({ 
            trains: paginatedTrains, 
            returnTrains: paginatedReturnTrains, 
            departureStation: depStation, 
            arrivalStation: arrStation, 
            offset: trainOffset,
            totalTrains: allTrains.length,
            totalReturnTrains: allReturnTrains.length
        });
    } catch (error) {
        console.error('Erreur:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});