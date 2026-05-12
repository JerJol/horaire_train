const { searchTrains } = require('./api/core');

module.exports = async function handler(req, res) {
    try {
        console.log('Token present:', !!process.env.NAVITIA_TOKEN, 'Length:', process.env.NAVITIA_TOKEN?.length);
        const { departure, arrival, datetime, offset, lastTime } = req.query;
        
        if (!departure || !arrival || !datetime) {
            return res.status(400).json({ error: 'Paramètres manquants' });
        }

        const result = await searchTrains(departure, arrival, datetime, offset, lastTime);
        res.json(result);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: error.message,
            tokenPresent: !!process.env.NAVITIA_TOKEN
        });
    }
};