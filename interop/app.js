/* app.js
   - Utilise fetch() pour IP geolocation, JCDecaux (VélOstan'lib), OpenAQ, OpenWeatherMap.
   - Vérifie la structure JSON retournée avant de l'utiliser.
   - Met à jour la carte Leaflet et popups.
*/

/* CONFIGURATION */
const CONFIG = {
  JCDECAUX_KEY: "YOUR_JCDECAUX_KEY",            
  OPENWEATHER_KEY: "YOUR_OPENWEATHERMAP_KEY",   
  REFRESH_INTERVAL_MS: 60_000 
};

/* ENDPOINTS (liens exacts à afficher dans la page) */
const ENDPOINTS = {
  IPAPI: "https://ipapi.co/json/",                                                  // géolocalisation IP en JSON (no key pour usage simple). :contentReference[oaicite:1]{index=1}
  JCDECAUX_STATIONS: (apiKey) => `https://api.jcdecaux.com/vls/v1/stations?contract=Nancy&apiKey=${apiKey}`, // JCDecaux vls endpoint. :contentReference[oaicite:2]{index=2}
  DATA_GOUV_VELOSTAN: "https://transport.data.gouv.fr/datasets/stations-velostanlib", // dataset page (info). :contentReference[oaicite:3]{index=3}
  OPENAQ_LATEST_BY_COORD: (lat, lon) => `https://api.openaq.org/v2/latest?coordinates=${lat},${lon}&radius=5000`, // OpenAQ latest measurements. :contentReference[oaicite:4]{index=4}
  OPENWEATHER_ONECALL: (lat, lon, key) => `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,alerts&units=metric&appid=${key}` // OpenWeather One Call. :contentReference[oaicite:5]{index=5}
};

/* DOM refs */
const statusEl = document.getElementById('status');
const geoEl = document.getElementById('geo-info');
const weatherEl = document.getElementById('weather-info');
const airEl = document.getElementById('air-info');
const stationsEl = document.getElementById('stations-info');

document.getElementById('link-ipapi').href = ENDPOINTS.IPAPI;
document.getElementById('link-jcdecaux').href = ENDPOINTS.JCDECAUX_STATIONS(CONFIG.JCDECAUX_KEY);
document.getElementById('link-openaq').href = "https://docs.openaq.org/";
document.getElementById('link-openweather').href = "https://openweathermap.org/api";

/* init map */
let map = L.map('map');
let markersLayer = L.layerGroup().addTo(map);
let userMarker = null;

async function safeFetchJson(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn("fetch error", url, err);
    return { __error: true, message: err.message };
  }
}

function isoOrNow(timestampSec) {
  if (!timestampSec) return new Date().toISOString();
  return new Date(timestampSec * 1000).toISOString();
}

/* decide whether bike is recommended (simple heuristic) */
function decideBike(meteo, air, nearbyStationCount) {
  // meteo: object from OpenWeatherMap current
  // air: {aqi, mainPollutant}
  // nearbyStationCount: number
  let reasons = [];
  let score = 0;

  // weather checks
  if (meteo) {
    const temp = meteo.temp;
    const rain = (meteo.weather || []).some(w => /rain|drizzle/i.test(w.main));
    const windMs = meteo.wind_speed ?? 0;
    if (rain) { reasons.push("Il pleut → déconseillé"); score -= 5; }
    if (windMs > 10) { reasons.push("Vent fort → prudence"); score -= 3; }
    if (temp < 0) { reasons.push("Températures très basses → prudence"); score -= 2; }
    if (temp >= 5 && temp <= 30 && !rain && windMs <= 6) { score += 2; }
  }

  // air quality check (OpenAQ returns concentrations; we'll use PM2.5 threshold)
  if (air && typeof air.pm25 === 'number') {
    const pm25 = air.pm25;
    if (pm25 > 35) { reasons.push(`PM2.5 ${pm25}µg/m³ — mauvaise qualité d'air`); score -= 5; }
    else if (pm25 > 15) { reasons.push(`PM2.5 ${pm25}µg/m³ — modérée`); score -= 1; }
    else { score += 1; }
  }

  // availability
  if (nearbyStationCount === 0) { reasons.push("Pas de stations proches ⟶ impossible"); score -= 10; }
  else if (nearbyStationCount < 2) { reasons.push("Peu de stations proches"); score -= 1; }
  else { score += 1; }

  const recommended = score > 0;
  return { recommended, score, reasons };
}

/* helper for AQ summary from OpenAQ 'latest' result */
function extractAQ(latestData) {
  // latestData.results[*].measurements -> array of {parameter, value, lastUpdated}
  if (!latestData || !latestData.results) return null;
  const agg = {};
  for (const r of latestData.results) {
    if (!r.measurements) continue;
    for (const m of r.measurements) {
      agg[m.parameter] = agg[m.parameter] ?? m.value;
    }
  }
  return {
    pm25: agg['pm25'],
    pm10: agg['pm10'],
    no2: agg['no2'],
    lastUpdated: latestData.results[0] && latestData.results[0].measurements[0] && latestData.results[0].measurements[0].lastUpdated
  };
}

/* render stations on map: expects JCDecaux / GBFS like array of stations */
function renderStations(stations, userLatLng) {
  markersLayer.clearLayers();
  if (!Array.isArray(stations)) return 0;
  let count = 0;
  const nearbyLimitMeters = 1000; // consider "nearby"

  for (const s of stations) {
    // JCDecaux fields: position: {lat, lng}, available_bikes / available_bike_stands (or available_bikes, available_bike stands)
    const lat = s.position?.lat ?? s.latitude ?? s.lat;
    const lng = s.position?.lng ?? s.longitude ?? s.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const bikes = s.available_bikes ?? s.available_bike_stands === undefined ? (s.available_bikes ?? s.available_bikes) : s.available_bikes;
    const stands = s.available_bike_stands ?? s.available_bike_stands ?? s.free_bases ?? s.available_bike_stands;
    const updated = s.last_update || s.lastUpdate || s.last_reported || null;

    const marker = L.marker([lat, lng]);
    const popupHtml = `<strong>${s.name || s.station_name || "Station"}</strong><br/>
      Vélos dispo: ${bikes ?? "—"}<br/>
      Places libres: ${stands ?? "—"}<br/>
      Mise à jour: ${updated ? new Date(updated).toLocaleString() : "non précisée"}`;
    marker.bindPopup(popupHtml);
    markersLayer.addLayer(marker);
    count++;
  }

  // recenter map only once: ensure user marker exists and fit
  if (userLatLng) {
    const group = L.featureGroup([markersLayer, L.marker(userLatLng)]);
    // avoid zooming out too far: just keep current zoom if already set
  }

  return count;
}

/* main worker: get geo, then weather, aq, stations */
async function runAll() {
  statusEl.textContent = "Récupération de la géolocalisation IP…";

  const ipGeo = await safeFetchJson(ENDPOINTS.IPAPI);
  if (ipGeo && !ipGeo.__error) {
    const lat = parseFloat(ipGeo.latitude ?? ipGeo.lat ?? ipGeo.latitude);
    const lon = parseFloat(ipGeo.longitude ?? ipGeo.lon ?? ipGeo.longitude);
    const city = ipGeo.city ?? ipGeo.city;
    geoEl.textContent = `Géoloc IP : ${city ?? ipGeo.region_name ?? "?"} (${lat?.toFixed(5) ?? "?"}, ${lon?.toFixed(5) ?? "?"})`;

    if (!isNaN(lat) && !isNaN(lon)) {
      // init map center
      map.setView([lat, lon], 14);
      if (userMarker) userMarker.setLatLng([lat, lon]);
      else userMarker = L.marker([lat, lon], {title: "Vous (géoloc IP)"}).addTo(map).bindPopup("Vous (géoloc IP)").openPopup();

      // show a tile layer (OpenStreetMap)
      if (!map._layersTiles) {
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
      }

      statusEl.textContent = "Chargement météo & qualité de l'air…";

      // weather
      let weather = null;
      if (CONFIG.OPENWEATHER_KEY && CONFIG.OPENWEATHER_KEY !== "YOUR_OPENWEATHERMAP_KEY") {
        const w = await safeFetchJson(ENDPOINTS.OPENWEATHER_ONECALL(lat, lon, CONFIG.OPENWEATHER_KEY));
        if (!w.__error && w.current) {
          weather = w.current;
          weatherEl.textContent = `Temp ${weather.temp}°C — ${weather.weather?.[0]?.description ?? "—"} — vent ${weather.wind_speed ?? "—"} m/s — dernière mise à jour: ${isoOrNow(weather.dt)}`;
        } else {
          weatherEl.textContent = "Impossible de récupérer la météo (vérifier OPENWEATHER_KEY).";
        }
      } else {
        weatherEl.textContent = "Clé OpenWeatherMap manquante (voir README).";
      }

      // openaq for air quality
      const aqData = await safeFetchJson(ENDPOINTS.OPENAQ_LATEST_BY_COORD(lat, lon));
      let aq = null;
      if (!aqData.__error) {
        aq = extractAQ(aqData);
        if (aq && typeof aq.pm25 === 'number') {
          airEl.textContent = `PM2.5: ${aq.pm25} µg/m³ — dernière mise à jour: ${new Date(aq.lastUpdated).toLocaleString()}`;
        } else {
          airEl.textContent = "Aucune mesure PM2.5 disponible via OpenAQ à proximité.";
        }
      } else {
        airEl.textContent = "Erreur récupération OpenAQ.";
      }

      // fetch VélOstan'lib stations (JCDecaux) — fallback to an error message if key missing
      statusEl.textContent = "Chargement stations VélOstan'lib…";
      let stations = [];
      if (CONFIG.JCDECAUX_KEY && CONFIG.JCDECAUX_KEY !== "YOUR_JCDECAUX_KEY") {
        const js = await safeFetchJson(ENDPOINTS.JCDECAUX_STATIONS(CONFIG.JCDECAUX_KEY));
        if (!js.__error && Array.isArray(js)) {
          stations = js;
        } else {
          // fallback: try to inform the user
          statusEl.textContent = "Impossible de récupérer JCDecaux (vérifier clé) ; essayer dataset data.gouv si disponible.";
        }
      } else {
        statusEl.textContent = "Clé JCDecaux manquante — utiliser dataset data.gouv ou fournir JCDECAUX_KEY.";
      }

      // render stations
      const cnt = renderStations(stations, [lat, lon]);
      stationsEl.textContent = `Stations chargées: ${cnt}`;

      // decide
      const nearbyStationCountEstimate = cnt; // pour demo on utilise cnt directement
      const advice = decideBike(weather, aq, nearbyStationCountEstimate);
      const recText = advice.recommended ? "Recommandé ✅" : "Non recommandé ❌";
      statusEl.textContent = `${recText} — raison(s): ${advice.reasons.join(" • ") || "Aucune remarque"}`;

    } else {
      statusEl.textContent = "Erreur : latitude/longitude introuvables dans la réponse IP.";
    }
  } else {
    statusEl.textContent = "Impossible de récupérer la géolocalisation IP.";
    geoEl.textContent = "Géoloc : échec.";
  }
}

/* run immediately and schedule refresh */
runAll();
setInterval(runAll, CONFIG.REFRESH_INTERVAL_MS);
