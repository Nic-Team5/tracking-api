const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 10000;

// Middleware CORS - permite accesul din PenguinMod
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.use(express.json());

// =============================================
// ENDPOINT PRINCIPAL - Tracking AWB (metoda POST)
// =============================================
app.post('/track', async (req, res) => {
    const { awb, courier } = req.body;

    if (!awb) {
        return res.status(400).json({
            success: false,
            error: 'AWB este obligatoriu.'
        });
    }

    try {
        const result = await trackAll(awb.toUpperCase().trim(), courier);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            awb: awb,
            error: error.message
        });
    }
});

// =============================================
// FUNCȚIA PRINCIPALĂ DE TRACKING
// =============================================
async function trackAll(awb, specifiedCourier = null) {
    // Lista curierilor suportați
    const couriers = [
        { name: 'Sameday', slug: 'sameday', func: trackSameday },
        { name: 'Fan Courier', slug: 'fan', func: trackFan },
        { name: 'Cargus', slug: 'cargus', func: trackCargus },
        { name: 'DPD', slug: 'dpd', func: trackDpd }
    ];

    // Dacă s-a specificat un curier, încearcă doar pe acela
    if (specifiedCourier) {
        const found = couriers.find(c => 
            c.slug === specifiedCourier.toLowerCase() || 
            c.name.toLowerCase() === specifiedCourier.toLowerCase()
        );
        if (found) {
            try {
                const result = await found.func(awb);
                if (result.events && result.events.length > 0) {
                    return {
                        success: true,
                        awb: awb,
                        courier: found.name,
                        status: result.status || 'Necunoscut',
                        events: result.events,
                        lastUpdate: new Date().toISOString()
                    };
                } else {
                    return {
                        success: false,
                        awb: awb,
                        courier: found.name,
                        error: `AWB-ul "${awb}" nu a fost găsit la ${found.name}.`,
                        events: []
                    };
                }
            } catch (error) {
                return {
                    success: false,
                    awb: awb,
                    courier: found.name,
                    error: error.message,
                    events: []
                };
            }
        }
        return {
            success: false,
            awb: awb,
            error: `Curierul "${specifiedCourier}" nu este suportat.`,
            supported: couriers.map(c => c.slug)
        };
    }

    // Dacă nu s-a specificat curier, încearcă toți
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
        error: 'AWB negăsit la niciun curier.',
        hint: 'Încearcă cu un curier specific: {"awb":"RO123","courier":"sameday"}',
        supported: couriers.map(c => c.slug),
        events: []
    };
}

// =============================================
// FUNCȚII DE TRACKING PENTRU FIECARE CURIER
// =============================================

// 1. Sameday (API public)
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

// 2. Fan Courier (scraping)
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

// 3. Cargus (scraping)
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

// 4. DPD (scraping)
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

// =============================================
// ENDPOINT DE SĂNĂTATE
// =============================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Tracking API',
        version: '1.0.0',
        supported: ['sameday', 'fan', 'cargus', 'dpd']
    });
});

// =============================================
// PORNIRE SERVER
// =============================================
app.listen(PORT, () => {
    console.log(`🚀 Server tracking rulează pe port ${PORT}`);
});
