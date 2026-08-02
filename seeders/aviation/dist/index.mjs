import fs from "node:fs";
import path from "node:path";

const OPENSKY_STATES_URL = "https://opensky-network.org/api/states/all";
const OPENSKY_TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const POLLING_INTERVAL_MS = 5 * 60 * 1000;
const ANONYMOUS_NETWORK_INTERVAL_MS = 20 * 60 * 1000;
const AUTHENTICATED_NETWORK_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_MS = 60 * 60 * 1000;
const CACHE_PATH = process.env.OPENSKY_CACHE_PATH || "/app/data/aviation-last-good.json";

let accessToken = null;
let accessTokenExpiresAt = 0;
let nextNetworkAttemptAt = 0;
let lastGood = readCache();

export function toAircraft(state) {
    if (!Array.isArray(state) || state.length < 17) return null;

    const [icao24, callsign, originCountry, timePosition, lastContact, longitude,
        latitude, barometricAltitude, onGround, velocity, trueTrack, verticalRate,
        sensors, geometricAltitude, squawk, spi, positionSource, category] = state;

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
        category: typeof category === "number" ? category : null,
    };
}

function readCache() {
    try {
        const value = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
        const fetchedAt = typeof value?.fetchedAt === "string" ? Date.parse(value.fetchedAt) : value?.fetchedAt;
        return Array.isArray(value?.items) && Number.isFinite(fetchedAt) ? { fetchedAt, items: value.items } : null;
    } catch {
        return null;
    }
}

function writeCache(snapshot) {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    const temporary = `${CACHE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(snapshot));
    fs.renameSync(temporary, CACHE_PATH);
}

function cachedItems(now, reason) {
    if (!lastGood) return null;
    const ageSeconds = Math.max(0, Math.floor((now - lastGood.fetchedAt) / 1000));
    return lastGood.items.map((item) => ({
        ...item,
        feed_source: "opensky",
        feed_fetched_at: new Date(lastGood.fetchedAt).toISOString(),
        feed_stale: true,
        feed_age_seconds: ageSeconds,
        feed_status: reason,
    }));
}

async function getAccessToken(now) {
    const clientId = process.env.OPENSKY_CLIENT_ID;
    const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    if (accessToken && now < accessTokenExpiresAt - 60_000) return accessToken;

    const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
    });
    const response = await fetch(OPENSKY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`OpenSky OAuth returned HTTP ${response.status}`);
    const payload = await response.json();
    if (typeof payload?.access_token !== "string") throw new Error("OpenSky OAuth response has no access token");
    accessToken = payload.access_token;
    accessTokenExpiresAt = now + (Number(payload.expires_in) || 1800) * 1000;
    return accessToken;
}

function retryDelay(response) {
    const seconds = Number(response.headers.get("x-rate-limit-retry-after-seconds") || response.headers.get("retry-after"));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_MS;
}

async function requestStates(token) {
    const headers = { "User-Agent": "WorldWideView-ControlRoom/1.0" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(OPENSKY_STATES_URL, { headers, signal: AbortSignal.timeout(30_000) });
}

async function fetchAviation() {
    const now = Date.now();
    if (now < nextNetworkAttemptAt) {
        const cached = cachedItems(now, "rate_limited_or_poll_throttled");
        if (cached) return cached;
        throw new Error(`OpenSky request deferred until ${new Date(nextNetworkAttemptAt).toISOString()}`);
    }

    try {
        let token = await getAccessToken(now);
        let response = await requestStates(token);
        if (response.status === 401 && token) {
            accessToken = null;
            accessTokenExpiresAt = 0;
            token = await getAccessToken(now);
            response = await requestStates(token);
        }
        if (response.status === 429) {
            nextNetworkAttemptAt = now + retryDelay(response);
            const cached = cachedItems(now, "rate_limited");
            if (cached) return cached;
            throw new Error(`OpenSky returned HTTP 429; retry after ${new Date(nextNetworkAttemptAt).toISOString()}`);
        }
        if (!response.ok) throw new Error(`OpenSky returned HTTP ${response.status}`);

        const payload = await response.json();
        if (!Array.isArray(payload?.states)) throw new Error("OpenSky response does not contain a states array");
        const items = payload.states.map(toAircraft).filter(Boolean);
        lastGood = { fetchedAt: now, items };
        writeCache(lastGood);
        nextNetworkAttemptAt = now + (token ? AUTHENTICATED_NETWORK_INTERVAL_MS : ANONYMOUS_NETWORK_INTERVAL_MS);
        return items.map((item) => ({
            ...item,
            feed_source: "opensky",
            feed_fetched_at: new Date(now).toISOString(),
            feed_stale: false,
            feed_age_seconds: 0,
            feed_status: "live",
        }));
    } catch (error) {
        const cached = cachedItems(now, "upstream_error");
        if (cached) return cached;
        throw error;
    }
}

export default {
    name: "aviation",
    interval: POLLING_INTERVAL_MS,
    fetch: fetchAviation,
};
