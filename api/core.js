const NAVITIA_TOKEN = process.env.NAVITIA_TOKEN || process.env.SNCF_API_KEY || '';

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

const formatSectionTime = (timeVal) => {
    if (!timeVal) return '--:--';
    const val = String(timeVal);
    let timePart = val;
    if (val.includes('T')) timePart = val.split('T')[1] || val;
    if (timePart.length >= 4) return timePart.slice(0,2) + ':' + timePart.slice(2,4);
    return timePart;
};

const processJourney = (journey, depStationName, arrStationName) => {
    const depTime = journey.departure_date_time || '';
    const arrTime = journey.arrival_date_time || '';
    const depHours = depTime.includes('T') ? depTime.split('T')[1].slice(0, 2) : '--';
    const depMinutes = depTime.includes('T') ? depTime.split('T')[1].slice(2, 4) : '--';
    const arrHours = arrTime.includes('T') ? arrTime.split('T')[1].slice(0, 2) : '--';
    const arrMinutes = arrTime.includes('T') ? arrTime.split('T')[1].slice(2, 4) : '--';
    
    const publicTransportSections = journey.sections?.filter(sec => sec.type === 'public_transport') || [];
    const trainCode = publicTransportSections.map(sec => 
        sec.display_informations?.headsign || 
        sec.display_informations?.trip_short_name || 
        sec.display_informations?.code || ''
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
        time: `${depHours}:${depMinutes}`,
        arrivalTime: `${arrHours}:${arrMinutes}`,
        destination: arrStationName,
        departure: depStationName,
        duration: `${Math.floor(journey.duration / 60)}min`,
        trainNumber: trainCode,
        sections: formattedSections
    };
};

async function searchTrains(departure, arrival, datetime, offset = 0, lastTime = null) {
    if (!departure || !arrival || !datetime) {
        throw new Error('Paramètres manquants');
    }

    const trainOffset = parseInt(offset) || 0;
    const searchTime = new Date(datetime);
    
    const depStation = await callNavitia(`/coverage/sncf/places?q=${encodeURIComponent(departure)}`);
    const arrStation = await callNavitia(`/coverage/sncf/places?q=${encodeURIComponent(arrival)}`);
    
    if (!depStation.places?.[0] || !arrStation.places?.[0]) {
        throw new Error('Gares non trouvées');
    }

    const depStationData = depStation.places.find(p => p.stop_area || p.physical_mode === 'Rail') || depStation.places[0];
    const arrStationData = arrStation.places.find(p => p.stop_area || p.physical_mode === 'Rail') || arrStation.places[0];

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
        return { trains: [], returnTrains: [], totalTrains: 0, totalReturnTrains: 0 };
    }

    const allJourneys = journeysData.journeys || [];
    const trainsPerPage = trainOffset === 0 ? 3 : 1;
    const startIdx = trainOffset === 0 ? 0 : 3 + (trainOffset - 1);

    const trains = allJourneys.slice(startIdx, startIdx + trainsPerPage).map((journey, idx) => ({
        id: idx,
        ...processJourney(journey, depStationData.name, arrStationData.name)
    }));

    const returnTrainsList = returnJourneys.slice(0, 3).map((journey, idx) => ({
        id: idx,
        ...processJourney(journey, arrStationData.name, depStationData.name)
    }));

    return {
        trains,
        returnTrains: returnTrainsList,
        offset: trainOffset,
        totalTrains: allJourneys.length,
        totalReturnTrains: returnJourneys.length,
        lastDepartureTime: trains.length > 0 ? trains[trains.length - 1].time : null
    };
}

module.exports = { searchTrains };