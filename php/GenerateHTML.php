<?php

$url = "http://ip-api.com/json/";

// Récupération de la réponse de l'API
$response = file_get_contents($url);

if ($response === FALSE) {
    die("Erreur lors de la requête API.");
}

$data = json_decode($response, true);

$lat = $data['lat'] ;
$long = $data['lon'] ;

$meteo = "https://www.infoclimat.fr/public-api/gfs/xml?_ll=$lat,$long&_auth=ARsDFFIsBCZRfFtsD3lSe1Q8ADUPeVRzBHgFZgtuAH1UMQNgUTNcPlU5VClSfVZkUn8AYVxmVW0Eb1I2WylSLgFgA25SNwRuUT1bPw83UnlUeAB9DzFUcwR4BWMLYwBhVCkDb1EzXCBVOFQoUmNWZlJnAH9cfFVsBGRSPVs1UjEBZwNkUjIEYVE6WyYPIFJjVGUAZg9mVD4EbwVhCzMAMFQzA2JRMlw5VThUKFJiVmtSZQBpXGtVbwRlUjVbKVIuARsDFFIsBCZRfFtsD3lSe1QyAD4PZA%3D%3D&_c=19f3aa7d766b6ba91191c8be71dd1ab2" ;

$response = file_get_contents($meteo);

if ($response === FALSE) {
    die("Erreur lors de la requête API.");
}

$xsl = new DOMDocument;
$xsl->load('Meteo.xsl');

$xml = new DOMDocument;
$xml->loadXML($response);

// Configurer le processeur XSLT
$proc = new XSLTProcessor;
$proc->importStylesheet($xsl);

// Transformer XML en HTML
$html = $proc->transformToXML($xml);

file_put_contents('meteo.html', $html);
echo "HTML de la meteo généré !";
echo " : <a href='meteo.html'>Cliquez ici pour le voir</a><br>" ;

$meteo = "https://carto.g-ny.eu/data/cifs/cifs_waze_v2.json" ;

$response = file_get_contents($meteo);

$data = json_decode($response, true);

$points = [
    ["lat" => 48.6772, "lon" => 6.1746, "nom" => "Point A"],
    ["lat" => 48.6800, "lon" => 6.1800, "nom" => "Point B"],
];

// Construire le HTML dans une variable
$html = <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Incident circulation Nancy</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
    <style>#map { height: 600px; width: 100%; }</style>
</head>
<body>

<h2>Carte Leaflet générée avec PHP</h2>
<div id="map"></div>

<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<script>
var map = L.map('map').setView([{$points[0]['lat']}, {$points[0]['lon']}], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
HTML;

// Ajouter dynamiquement les marqueurs
foreach ($data['incidents'] as $inc) {

    $chaine = $inc['location']['polyline'];



// Séparer la chaîne par l'espace
    $coords = explode(" ", $chaine);


// Récupérer latitude et longitude
    $lat = floatval($coords[0]);
    $lon = floatval($coords[1]);
    $nom = addslashes($inc['description']);
    $html .= "L.marker([$lat, $lon]).addTo(map).bindPopup(\"$nom\");\n";
}

// Fin du HTML
$html .= <<<HTML
</script>
</body>
</html>
HTML;

echo "HTML de la Carte généré !";
file_put_contents('CirculationNancy.html', $html);
echo " : <a href='CirculationNancy.html'>Cliquez ici pour le voir</a><br>" ;





