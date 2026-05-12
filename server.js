require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { searchTrains } = require('./api/core');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('API Key:', process.env.NAVITIA_TOKEN ? 'OUI' : 'NON');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/api/trains', async (req, res) => {
    try {
        const { departure, arrival, datetime, offset, lastTime } = req.query;
        const result = await searchTrains(departure, arrival, datetime, offset, lastTime);
        res.json(result);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});