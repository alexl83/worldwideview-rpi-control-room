const OPENSKY_STATES_URL = "https://opensky-network.org/api/states/all";
const POLLING_INTERVAL_MS = 5 * 60 * 1000;

function toAircraft(state) {
    if (!Array.isArray(state) || state.length < 17) return null;

    const [icao24, callsign, originCountry, timePosition, lastContact, longitude,
        latitude, barometricAltitude, onGround, velocity, trueTrack, verticalRate,
        sensors, geometricAltitude, squawk, spi, positionSource] = state;

    if (typeof icao24 !== "string" || typeof latitude !== "number" || typeof longitude !== "number") {
        return null;
    }

    return {
        icao24,
        callsign: typeof callsign === "string" ? callsign.trim() || null : null,
        origin_country: typeof originCountry === "string" ? originCountry : null,
        time_position: typeof timePosition === "number" ? timePosition : null,
        last_contact: typeof lastContact === "number" ? lastContact : null,
        lon: longitude,
        lat: latitude,
        alt: typeof geometricAltitude === "number"
            ? geometricAltitude
            : typeof barometricAltitude === "number" ? barometricAltitude : 0,
        on_ground: Boolean(onGround),
        spd: typeof velocity === "number" ? velocity : 0,
        hdg: typeof trueTrack === "number" ? trueTrack : 0,
        vertical_rate: typeof verticalRate === "number" ? verticalRate : 0,
        sensors: Array.isArray(sensors) ? sensors : null,
        squawk: typeof squawk === "string" ? squawk : null,
        spi: Boolean(spi),
        position_source: typeof positionSource === "number" ? positionSource : null,
    };
}

async function fetchAviation() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
        const response = await fetch(OPENSKY_STATES_URL, {
            headers: { "User-Agent": "WorldWideView-ControlRoom/1.0" },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`OpenSky returned HTTP ${response.status}`);

        const payload = await response.json();
        if (!Array.isArray(payload?.states)) {
            throw new Error("OpenSky response does not contain a states array");
        }
        return payload.states.map(toAircraft).filter(Boolean);
    } finally {
        clearTimeout(timeout);
    }
}

export default {
    name: "aviation",
    interval: POLLING_INTERVAL_MS,
    fetch: fetchAviation,
};
