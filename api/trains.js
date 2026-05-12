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
    console.log('Token present:', !!NAVITIA_TOKEN, 'Length:', NAVITIA_TOKEN?.length);
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

    const depStationData = depStation.places.find(p => p.stop_area || p.physical_mode === 'Rail') || depStation.places[0];
    const arrStationData = arrStation.places.find(p => p.stop_area || p.physical_mode === 'Rail') || arrStation.places[0];
    
if (!depStationData.id || !arrStationData.id) {
        return res.status(404).json({ error: 'ID de gare invalide' });
    }

    let datetimeStr = searchTime.toISOString().replace(/[-:]/g, '').slice(0, 15);
    
    let currentSearchTime = datetimeStr;
    if (trainOffset > 0 && lastTime) {
        const [hours, minutes] = lastTime.split(':');
        const lastDate = new Date(datetime);
        lastDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        currentSearchTime = lastDate.toISOString().replace(/[-:]/g, '').slice(0, 15);
    }
    
    const journeysData = await callNavitia(
        `/coverage/sncf/journeys?from=${depStationData.id}&to=${arrStationData.id}&datetime=${currentSearchTime}&datetime_represents=departure&max_duration=14400&count=20&depth=3`
    );

    let returnJourneys = [];
    const returnJourneysData = await callNavitia(
        `/coverage/sncf/journeys?from=${arrStationData.id}&to=${depStationData.id}&datetime=${datetimeStr}&datetime_represents=departure&max_duration=14400&count=20&depth=3`
    );
    returnJourneys = returnJourneysData.journeys || [];

    if ((!journeysData.journeys || journeysData.journeys.length === 0) && returnJourneys.length === 0) {
        return res.json({
            trains: [],
            returnTrains: [],
            offset: trainOffset,
            totalTrains: 0,
            message: 'Aucun train trouvé pour cet horaire'
        });
    }

    const allJourneys = journeysData.journeys || [];
    const trainsPerPage = trainOffset === 0 ? 3 : 1;
    const startIdx = trainOffset === 0 ? 0 : 3 + (trainOffset - 1);
    
    const formatSectionTime = (timeVal) => {
        if (!timeVal) return '--:--';
        const val = String(timeVal);
        if (val.length >= 4) return val.slice(0,2) + ':' + val.slice(2,4);
        return val;
    };

    const trains = allJourneys.slice(startIdx, startIdx + trainsPerPage).map((journey, idx) => {
        const depTime = journey.departure_date_time || '';
        const arrTime = journey.arrival_date_time || '';
        const depHours = depTime.includes('T') ? depTime.split('T')[1].slice(0, 2) : '--';
        const depMinutes = depTime.includes('T') ? depTime.split('T')[1].slice(2, 4) : '--';
        const arrHours = arrTime.includes('T') ? arrTime.split('T')[1].slice(0, 2) : '--';
        const arrMinutes = arrTime.includes('T') ? arrTime.split('T')[1].slice(2, 4) : '--';

        const formatTime = (timeStr) => {
            if (!timeStr) return '--:--';
            const str = String(timeStr);
            if (str.length === 5) return str.slice(0,2) + ':' + str.slice(2,4);
            if (str.length === 4) return '0' + str.slice(0,1) + ':' + str.slice(1,3);
            return str;
        };
        
        const publicTransportSections = journey.sections?.filter(sec => sec.type === 'public_transport') || [];
        const trainCode = publicTransportSections.map(sec => 
            sec.display_informations?.headsign ||
            sec.display_informations?.trip_short_name ||
            sec.display_informations?.code ||
            sec.display_informations?.label ||
            ''
        ).filter(Boolean).join(' + ') || 'Train';
        
        const formattedSections = (journey.sections || []).map(sec => {
            const isPublicTransport = sec.type === 'public_transport';
            const trainNum = sec.display_informations?.headsign || sec.display_informations?.trip_short_name || '';
            
            if (isPublicTransport && sec.stop_date_times && sec.stop_date_times.length > 0) {
                return {
                    ...sec,
                    display_informations: { code: trainNum },
                    stops: sec.stop_date_times.map(stop => ({
                        name: stop.stop_point?.name || stop.stop_point?.label || '',
                        time: formatSectionTime(stop.departure_date_time),
                        arrivalTime: formatSectionTime(stop.arrival_date_time)
                    }))
                };
            }
            return sec;
        });
        
        return {
            id: idx,
            time: `${depHours}:${depMinutes}`,
            arrivalTime: `${arrHours}:${arrMinutes}`,
            destination: arrStationData.name,
            departure: depStationData.name,
            duration: `${Math.floor(journey.duration / 60)}min`,
            trainNumber: trainCode,
            sections: formattedSections
        };
    });

    const returnTrainsList = returnJourneys.slice(0, 3).map((journey, idx) => {
        const depTime = journey.departure_date_time || '';
        const arrTime = journey.arrival_date_time || '';
        const depHours = depTime.includes('T') ? depTime.split('T')[1].slice(0, 2) : '--';
        const depMinutes = depTime.includes('T') ? depTime.split('T')[1].slice(2, 4) : '--';
        const arrHours = arrTime.includes('T') ? arrTime.split('T')[1].slice(0, 2) : '--';
        const arrMinutes = arrTime.includes('T') ? arrTime.split('T')[1].slice(2, 4) : '--';
        
        const publicTransportSectionsReturn = journey.sections?.filter(sec => sec.type === 'public_transport') || [];
        const trainCodeReturn = publicTransportSectionsReturn.map(sec => 
            sec.display_informations?.headsign ||
            sec.display_informations?.trip_short_name ||
            sec.display_informations?.code ||
            ''
        ).filter(Boolean).join(' + ') || 'Train';
        
        const formattedSectionsReturn = (journey.sections || []).map(sec => {
            const isPublicTransport = sec.type === 'public_transport';
            const trainNum = sec.display_informations?.headsign || sec.display_informations?.trip_short_name || '';
            
            if (isPublicTransport && sec.stop_date_times && sec.stop_date_times.length > 0) {
                return {
                    ...sec,
                    display_informations: { code: trainNum },
                    stops: sec.stop_date_times.map(stop => ({
                        name: stop.stop_point?.name || stop.stop_point?.label || '',
                        time: formatSectionTime(stop.departure_date_time),
                        arrivalTime: formatSectionTime(stop.arrival_date_time)
                    }))
                };
            }
            return sec;
        });
        
        return {
            id: idx,
            time: `${depHours}:${depMinutes}`,
            arrivalTime: `${arrHours}:${arrMinutes}`,
            destination: depStationData.name,
            departure: arrStationData.name,
            duration: `${Math.floor(journey.duration / 60)}min`,
            trainNumber: trainCodeReturn,
            sections: formattedSectionsReturn
        };
    });

    res.json({
            trains,
            returnTrains: returnTrainsList,
            offset: trainOffset,
            totalTrains: allJourneys.length,
            totalReturnTrains: returnJourneys.length,
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