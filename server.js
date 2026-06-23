const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 10000;

// CORS pentru PenguinMod
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.use(express.json());

// ==========================================
// ENDPOINT - Tracking AWB
// ==========================================
app.get('/track/:awb', async (req, res) => {
    const awb = req.params.awb.toUpperCase().trim();
    
    try {
        const result = await trackAll(awb);
        res.json(result);
    } catch (error) {
        res.json({
            success: false,
            awb: awb,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ==========================================
// FUNCȚIA - Încearcă toți curierii
// ==========================================
async function trackAll(awb) {
    const couriers = [
        { name: 'Sameday', func: trackSameday },
        { name: 'Fan Courier', func: trackFan },
        { name: 'Cargus', func: trackCargus },
        { name: 'DPD', func: trackDpd }
    ];
    
    for (const courier of couriers) {
        try {
            const result = await courier.func(awb);
            if (result.events && result.events.length > 0) {
                return {
                    success: true,
                    awb: awb,
                    courier: courier.name,
                    status: result.status || 'Necunoscut',
                    events: result.events,
                    lastUpdate: new Date().toISOString()
                };
            }
        } catch (error) {
            console.log(`Eroare ${courier.name}: ${error.message}`);
        }
    }
    
    return {
        success: false,
        awb: awb,
        courier: 'Necunoscut',
        status: 'Negăsit',
        events: [],
        lastUpdate: new Date().toISOString()
    };
}

// ==========================================
// FUNCȚIA - Tracking Sameday (API oficial)
// ==========================================
async function trackSameday(awb) {
    const url = `https://www.sameday.ro/api/awb/${awb}/status`;
    const response = await axios.get(url, { timeout: 15000 });
    const data = response.data;
    
    const events = [];
    if (data.statuses) {
        for (const status of data.statuses) {
            events.push({
                date: status.date || '',
                status: status.status || '',
                location: status.location || '',
                description: status.description || ''
            });
        }
    }
    
    return {
        status: data.currentStatus || 'Necunoscut',
        events: events
    };
}

// ==========================================
// FUNCȚIA - Tracking Fan Courier (scraping)
// ==========================================
async function trackFan(awb) {
    const url = `https://www.fancourier.ro/awb-online/?awb=${awb}`;
    const response = await axios.get(url, { timeout: 15000 });
    const $ = cheerio.load(response.data);
    
    const events = [];
    $('table tbody tr').each((i, row) => {
        const cols = $(row).find('td');
        if (cols.length >= 3) {
            events.push({
                date: $(cols[0]).text().trim(),
                status: $(cols[1]).text().trim(),
                location: $(cols[2]).text().trim()
            });
        }
    });
    
    return {
        status: events.length > 0 ? events[events.length - 1].status : 'Necunoscut',
        events: events
    };
}

// ==========================================
// FUNCȚIA - Tracking Cargus (scraping)
// ==========================================
async function trackCargus(awb) {
    const url = `https://www.cargus.ro/ro/track-trace?awb=${awb}`;
    const response = await axios.get(url, { timeout: 15000 });
    const $ = cheerio.load(response.data);
    
    const events = [];
    $('.status-item, .tracking-item, .step').each((i, elem) => {
        const text = $(elem).text().trim();
        if (text && text.length > 3) {
            events.push({
                date: '',
                status: text,
                location: ''
            });
        }
    });
    
    return {
        status: events.length > 0 ? events[events.length - 1].status : 'Necunoscut',
        events: events
    };
}

// ==========================================
// FUNCȚIA - Tracking DPD (scraping)
// ==========================================
async function trackDpd(awb) {
    const url = `https://www.dpd.ro/parcel-tracking?parcelNumber=${awb}`;
    const response = await axios.get(url, { timeout: 15000 });
    const $ = cheerio.load(response.data);
    
    const events = [];
    $('.event, .tracking-event, .status-item').each((i, elem) => {
        const text = $(elem).text().trim();
        if (text && text.length > 3) {
            events.push({
                date: '',
                status: text,
                location: ''
            });
        }
    });
    
    return {
        status: events.length > 0 ? events[events.length - 1].status : 'Necunoscut',
        events: events
    };
}

// ==========================================
// ENDPOINT - Sănătate server
// ==========================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Tracking API',
        version: '1.0.0'
    });
});

// ==========================================
// ENDPOINT - Pagina principală
// ==========================================
app.get('/', (req, res) => {
    res.json({
        service: 'Tracking API România',
        version: '1.0.0',
        endpoints: {
            '/track/{awb}': 'Tracking AWB (GET)',
            '/health': 'Health check (GET)',
            '/': 'This page (GET)'
        },
        couriers: ['Sameday', 'Fan Courier', 'Cargus', 'DPD']
    });
});

// ==========================================
// PORNIRE SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Server tracking rulează pe port ${PORT}`);
    console.log(`📦 Endpoint: /track/{awb}`);
    console.log(`🔗 Health: /health`);
});
