const NAVITIA_TOKEN = process.env.NAVITIA_TOKEN || '';

async function callNavitia(endpoint) {
    const response = await fetch(`https://api.navitia.io/v1${endpoint}`, {
        headers: {
            'Authorization': NAVITIA_TOKEN,
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Navitia API error: ${response.status} - ${err}`);
    }
    return response.json();
}

module.exports = async function handler(req, res) {
    try {
    const { departure, arrival, datetime, offset, lastTime } = req.query;
    
    if (!departure || !arrival || !datetime) {
        return res.status(400).json({ error: 'Paramètres manquants' });
    }

    const trainOffset = parseInt(offset) || 0;
    const now = new Date();
    const searchTime = new Date(datetime);
    
    const depStation = await callNavitia(`/coverage/sncf/places?q=${encodeURIComponent(departure)}`);
    const arrStation = await callNavitia(`/coverage/sncf/places?q=${encodeURIComponent(arrival)}`);
    
    if (!depStation.places?.[0] || !arrStation.places?.[0]) {
        return res.status(404).json({ error: 'Gares non trouvées' });
    }

    const depStationData = depStation.places[0];
    const arrStationData = arrStation.places[0];
    const datetimeStr = searchTime.toISOString().replace(/[-:]/g, '').slice(0, 15);
    
    let currentSearchTime = trainOffset > 0 && lastTime ? lastTime : datetimeStr;
    
    const journeysData = await callNavitia(
        `/coverage/sncf/journeys?from=${depStationData.id}&to=${arrStationData.id}&datetime=${currentSearchTime}&datetime_represents=departure&max_duration=14400&count=20&depth=3`
    );

    const allJourneys = journeysData.journeys || [];
    const trainsPerPage = trainOffset === 0 ? 3 : 1;
    const startIdx = trainOffset === 0 ? 0 : 3 + (trainOffset - 1);

    const trains = allJourneys.slice(startIdx, startIdx + trainsPerPage).map((journey, idx) => {
        const depTime = journey.departure_date_time || '';
        const arrTime = journey.arrival_date_time || '';
        const depHours = depTime.includes('T') ? depTime.split('T')[1].slice(0, 2) : '--';
        const depMinutes = depTime.includes('T') ? depTime.split('T')[1].slice(2, 4) : '--';
        const arrHours = arrTime.includes('T') ? arrTime.split('T')[1].slice(0, 2) : '--';
        const arrMinutes = arrTime.includes('T') ? arrTime.split('T')[1].slice(2, 4) : '--';

        return {
            id: idx,
            time: `${depHours}:${depMinutes}`,
            arrivalTime: `${arrHours}:${arrMinutes}`,
            destination: arrStationData.name,
            departure: depStationData.name,
            duration: `${Math.floor(journey.duration / 60)}min`,
            trainNumber: journey.sections?.[0]?.display_informations?.code || 'Train',
            sections: journey.sections || []
        };
    });

    res.json({
            trains,
            returnTrains: [],
            offset: trainOffset,
            totalTrains: allJourneys.length,
            lastDepartureTime: trains.length > 0 ? trains[trains.length - 1].time : null
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: error.message,
            tokenPresent: !!NAVITIA_TOKEN,
            stack: error.stack
        });
    }
};