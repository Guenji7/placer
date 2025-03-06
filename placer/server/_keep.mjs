// Der korrekte Import für alt:V Server
import alt from 'alt-server';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// Datenstrukturen für Objekte
const placedObjects = new Map();
let nextObjectId = 1;
let isDirty = false;

// Pfad zur JSON-Datei (angepasst an den korrekten Pfad)
const OBJECTS_FILE = './resources/placer/server/files/placed_objects.json';
const BACKUP_FILE = './resources/placer/server/files/placed_objects.backup.json';


// Verbesserte loadPlacedObjects Funktion
function loadPlacedObjects() {
    try {
        alt.log('[SERVER] Versuche Objekte zu laden...');
        
        if (existsSync(OBJECTS_FILE)) {
            const fileContent = readFileSync(OBJECTS_FILE, 'utf8');
            
            if (!fileContent || fileContent.trim() === '') {
                alt.log('[SERVER] Leere placed_objects.json gefunden');
                placedObjects.clear();
                return;
            }

            const data = JSON.parse(fileContent);
            
            if (!Array.isArray(data)) {
                alt.log('[SERVER] Ungültiges Format in placed_objects.json');
                return;
            }

            placedObjects.clear(); // Reset Map
            nextObjectId = 1; // Reset ID counter
            
            data.forEach(obj => {
                if (obj && obj.id && obj.model && obj.position && obj.rotation) {
                    // Konvertiere Model zu positiver Zahl
                    const model = Math.abs(parseInt(obj.model));
                    
                    // Stelle sicher, dass die Position als Nummern gespeichert sind
                    const position = {
                        x: parseFloat(obj.position.x),
                        y: parseFloat(obj.position.y),
                        z: parseFloat(obj.position.z)
                    };
                    
                    const rotation = {
                        x: parseFloat(obj.rotation.x),
                        y: parseFloat(obj.rotation.y),
                        z: parseFloat(obj.rotation.z)
                    };
                    
                    // Objekt mit korrigierten Werten speichern
                    placedObjects.set(obj.id, {
                        id: obj.id,
                        model: model,
                        position: position,
                        rotation: rotation
                    });
                    
                    if (obj.id >= nextObjectId) {
                        nextObjectId = obj.id + 1;
                    }
                    
                    alt.log(`[SERVER] Objekt ${obj.id} geladen: Model ${model} at ${JSON.stringify(position)}`);
                }
            });

            alt.log(`[SERVER] ${placedObjects.size} Objekte erfolgreich geladen`);
            
            // Debug: Zeige alle geladenen Objekte
            for (let [id, obj] of placedObjects) {
                alt.log(`[SERVER] Geladenes Objekt - ID: ${id}, Model: ${obj.model}, Position:`, JSON.stringify(obj.position));
            }
        }
    } catch (error) {
        alt.log(`[SERVER] Fehler beim Laden der Objekte: ${error}`);
        alt.log(error.stack);
    }
}

// Verbesserte Speicherfunktion
function savePlacedObjects() {
    try {
        if (!isDirty) return;

        const data = Array.from(placedObjects.values());
        const jsonData = JSON.stringify(data, null, 2);

        // Erst Backup schreiben
        writeFileSync(BACKUP_FILE, jsonData);
        
        // Dann Hauptdatei schreiben
        writeFileSync(OBJECTS_FILE, jsonData);
        
        isDirty = false;
        alt.log(`[SERVER] ${data.length} Objekte gespeichert`);
    } catch (error) {
        alt.logError(`[SERVER] Fehler beim Speichern der Objekte: ${error}`);
    }
}

// Automatisches Speichern alle 5 Minuten
const saveInterval = setInterval(() => {
    savePlacedObjects();
}, 300000);

// Client Events
alt.onClient("PlacingModule", (player, objectData) => {
    alt.log(`[SERVER] Empfange Platzierungsanfrage von ${player.name}`);
    alt.log(`[SERVER] Objektdaten:`, JSON.stringify(objectData));

    if (!objectData?.model || !objectData?.position || !objectData?.rotation) {
        alt.log(`[SERVER] Ungültige Objektdaten von ${player.name}`);
        return;
    }

    const id = nextObjectId++;
    const placedObject = {
        id,
        model: objectData.model,
        position: {
            x: objectData.position.x,
            y: objectData.position.y,
            z: objectData.position.z
        },
        rotation: {
            x: objectData.rotation.x,
            y: objectData.rotation.y,
            z: objectData.rotation.z
        }
    };
    
    placedObjects.set(id, placedObject);
    isDirty = true;
    
    // Sofort speichern
    savePlacedObjects();
    
    alt.log(`[SERVER] Objekt platziert und gespeichert mit ID: ${id}`);
    
    // Bestätigung an den Client senden
    alt.emitClient(player, "PlacingModule:ObjectPlaced", id);
    
    // Alle Clients über das neue Objekt informieren
    alt.emitAllClients("PlacingModule:AddObject", placedObject);
});

// Event-Handler für das Löschen von Objekten
alt.onClient("PlacingModule:DeleteObject", (player, data) => {
    alt.log(`[SERVER] Löschversuch von ${player.name}:`, JSON.stringify(data));
    
    // Finde das Objekt anhand der Position und Model
    for (let [id, objectData] of placedObjects) {
        // Position vergleichen mit größerer Toleranz
        const distanceMatch = 
            Math.abs(objectData.position.x - data.position.x) < 1.0 &&
            Math.abs(objectData.position.y - data.position.y) < 1.0 &&
            Math.abs(objectData.position.z - data.position.z) < 1.0;
            
        // Model vergleichen (als absolute Zahlen)
        const modelMatch = Math.abs(objectData.model) === Math.abs(data.model);
        
        alt.log(`[SERVER] Prüfe Objekt ${id}:`);
        alt.log(`Position Match: ${distanceMatch}, Model Match: ${modelMatch}`);
        alt.log(`Server Model: ${objectData.model}, Client Model: ${data.model}`);
        
        if (distanceMatch && modelMatch) {
            // Objekt aus der Map entfernen
            placedObjects.delete(id);
            isDirty = true;
            
            // Alle Clients über das gelöschte Objekt informieren
            alt.emitAllClients("PlacingModule:RemoveObject", id);
            
            alt.log(`[SERVER] Objekt gelöscht von ${player.name}, ID: ${id}`);
            
            // Änderungen speichern
            savePlacedObjects();
            return; // Beende die Funktion nach erfolgreichem Löschen
        }
    }
    
    // Wenn kein Objekt gefunden wurde
    alt.log(`[SERVER] Kein passendes Objekt gefunden für:`, data);
    alt.log(`[SERVER] Aktuelle Objekte:`, Array.from(placedObjects.entries()));
});

// Beim Platzieren eines Objekts (existierender Code)
alt.onClient("PlacingModule", (player, objectData) => {
    alt.log(`[SERVER] Empfange Platzierungsanfrage von ${player.name}`);
    alt.log(`[SERVER] Objektdaten:`, JSON.stringify(objectData));

    if (!objectData?.model || !objectData?.position || !objectData?.rotation) {
        alt.log(`[SERVER] Ungültige Objektdaten von ${player.name}`);
        return;
    }

    const id = nextObjectId++;
    const placedObject = {
        id,
        model: Math.abs(objectData.model), // Speichere Model-Hash als positive Zahl
        position: {
            x: objectData.position.x,
            y: objectData.position.y,
            z: objectData.position.z
        },
        rotation: {
            x: objectData.rotation.x,
            y: objectData.rotation.y,
            z: objectData.rotation.z
        }
    };
    
    placedObjects.set(id, placedObject);
    isDirty = true;
    
    // Sofort speichern
    savePlacedObjects();
    
    alt.log(`[SERVER] Objekt platziert und gespeichert mit ID: ${id}`);
    
    // Bestätigung an den Client senden
    alt.emitClient(player, "PlacingModule:ObjectPlaced", id);
    
    // Alle Clients über das neue Objekt informieren
    alt.emitAllClients("PlacingModule:AddObject", placedObject);
});

// Hilfsfunktion zum Berechnen der Distanz
function calculateDistance(pos1, pos2) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Objekte beim Serverstart laden
loadPlacedObjects();

// Objekte an neue Clients senden
alt.on("playerConnect", (player) => {
    const objects = Array.from(placedObjects.values());
    alt.emitClient(player, "PlacingModule:InitialObjects", objects);
});

// Laden der objects.json für die Objektliste
try {
    const objectsPath = 'resources/placer/server/files/objects.json';
    const objectsData = readFileSync(objectsPath, "utf8");
    const objectList = JSON.parse(objectsData);
    
    alt.onClient("PlacingModule:RequestObjects", (player) => {
        alt.log(`[SERVER] Sende ${objectList.length} Objekte an Spieler ${player.id}`);
        alt.emitClient(player, "PlacingModule:ReceiveObjects", objectList);
    });
} catch (error) {
    alt.log("[SERVER] Fehler beim Laden der Objektliste:", error);
}

// Cleanup beim Beenden
alt.on('resourceStop', () => {
    clearInterval(saveInterval);
    savePlacedObjects(); // Finales Speichern
});