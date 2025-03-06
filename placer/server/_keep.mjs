// Der korrekte Import für alt:V Server
import alt from 'alt-server';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// Datenstrukturen für Objekte
const placedObjects = new Map();
let nextObjectId = 1;
let isDirty = false;

// Pfad zur JSON-Datei (angepasst an den korrekten Pfad)
const OBJECTS_FILE = 'resources/placer/server/files/placed_objects.json';
const BACKUP_FILE = 'resources/placer/server/files/placed_objects.backup.json';

// Laden der gespeicherten Objekte beim Serverstart
function loadPlacedObjects() {
    try {
        if (existsSync(OBJECTS_FILE)) {
            const data = JSON.parse(readFileSync(OBJECTS_FILE, 'utf8'));
            data.forEach(obj => {
                placedObjects.set(obj.id, obj);
                if (obj.id >= nextObjectId) {
                    nextObjectId = obj.id + 1;
                }
            });
            alt.log(`[SERVER] ${placedObjects.size} Objekte geladen`);
        }
    } catch (error) {
        alt.log(`[SERVER] Fehler beim Laden der Objekte: ${error}`);
        // Versuche Backup zu laden wenn Hauptdatei fehlschlägt
        try {
            if (existsSync(BACKUP_FILE)) {
                const data = JSON.parse(readFileSync(BACKUP_FILE, 'utf8'));
                data.forEach(obj => {
                    placedObjects.set(obj.id, obj);
                    if (obj.id >= nextObjectId) {
                        nextObjectId = obj.id + 1;
                    }
                });
                alt.log(`[SERVER] ${placedObjects.size} Objekte aus Backup geladen`);
            }
        } catch (backupError) {
            alt.log(`[SERVER] Fehler beim Laden des Backups: ${backupError}`);
        }
    }
}

// Speichern der Objekte in JSON
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
        alt.log(`[SERVER] Fehler beim Speichern der Objekte: ${error}`);
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
alt.onClient("PlacingModule:DeleteObject", (player, position) => {
    // Finde das Objekt anhand der Position
    for (let [id, objectData] of placedObjects) {
        if (Math.abs(objectData.position.x - position.x) < 0.1 &&
            Math.abs(objectData.position.y - position.y) < 0.1 &&
            Math.abs(objectData.position.z - position.z) < 0.1) {
            
            // Objekt aus der Map entfernen
            placedObjects.delete(id);
            isDirty = true;
            
            // Alle Clients über das gelöschte Objekt informieren
            alt.emitAllClients("PlacingModule:RemoveObject", id);
            
            alt.log(`[SERVER] Objekt gelöscht von ${player.name}, ID: ${id}`);
            
            // Änderungen speichern
            savePlacedObjects();
            break;
        }
    }
});

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