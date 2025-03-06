import * as alt from "alt-server";
import fs from "fs";
import path from "path";

// Datenstrukturen für Objekte
const placedObjects = new Map();
let nextObjectId = 1;

// Pfad zur JSON-Datei
const OBJECTS_FILE = path.resolve("resources/placer/server/files/placed_objects.json");

// Laden der gespeicherten Objekte beim Serverstart
function loadPlacedObjects() {
    try {
        if (fs.existsSync(OBJECTS_FILE)) {
            const data = JSON.parse(fs.readFileSync(OBJECTS_FILE, 'utf8'));
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
    }
}

// Speichern der Objekte in JSON
function savePlacedObjects() {
    try {
        const data = Array.from(placedObjects.values());
        fs.writeFileSync(OBJECTS_FILE, JSON.stringify(data, null, 2));
        alt.log(`[SERVER] ${data.length} Objekte gespeichert`);
    } catch (error) {
        alt.log(`[SERVER] Fehler beim Speichern der Objekte: ${error}`);
    }
}

// Client Events
alt.onClient("PlacingModule", (player, objectData) => {
    const id = nextObjectId++;
    const placedObject = {
        id,
        model: objectData.model,
        position: objectData.position,
        rotation: objectData.rotation
    };
    
    placedObjects.set(id, placedObject);
    savePlacedObjects();
    
    // Bestätigung an den Client senden
    alt.emitClient(player, "PlacingModule:ObjectPlaced", id);
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
    const objectsPath = path.resolve("resources/placer/server/files/objects.json");
    const objectsData = fs.readFileSync(objectsPath, "utf8");
    const objectList = JSON.parse(objectsData);
    
    alt.onClient("PlacingModule:RequestObjects", (player) => {
        alt.log(`[SERVER] Sende ${objectList.length} Objekte an Spieler ${player.id}`);
        alt.emitClient(player, "PlacingModule:ReceiveObjects", objectList);
    });
} catch (error) {
    alt.log("[SERVER] Fehler beim Laden der Objekte:", error);
}