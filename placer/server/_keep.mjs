// Füge diese Debug-Logs hinzu, um den Ablauf besser nachvollziehen zu können
alt.onClient("PlacingModule", (player, objectData) => {
    alt.log(`[SERVER] Received placement request from ${player.name}`);
    alt.log(`[SERVER] Object data:`, JSON.stringify(objectData, null, 2));

    if (!objectData || !objectData.model || !objectData.position || !objectData.rotation) {
        alt.logError(`[SERVER] Received invalid object data from ${player.name}`);
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
    
    // Force immediate save for testing
    savePlacedObjects();
    
    alt.log(`[SERVER] Object placed and saved with ID: ${id}`);
    
    // Send confirmation to the client
    alt.emitClient(player, "PlacingModule:ObjectPlaced", id);
    
    // Notify all clients about the new object
    alt.emitAllClients("PlacingModule:AddObject", placedObject);
});

// Verbesserte savePlacedObjects Funktion mit mehr Logging
function savePlacedObjects() {
    try {
        alt.log(`[SERVER] Attempting to save objects. isDirty: ${isDirty}, Object count: ${placedObjects.size}`);
        
        if (!isDirty) {
            alt.log('[SERVER] No changes to save');
            return;
        }

        const data = Array.from(placedObjects.values());
        
        // Überprüfe den Pfad
        alt.log(`[SERVER] Saving to path: ${OBJECTS_FILE}`);
        
        // Erstelle Verzeichnis falls es nicht existiert
        const dir = path.dirname(OBJECTS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            alt.log(`[SERVER] Created directory: ${dir}`);
        }
        
        // Schreibe zuerst in temporäre Datei
        const tempFile = `${OBJECTS_FILE}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
        
        // Wenn temporäre Datei erfolgreich geschrieben wurde, verschiebe sie
        fs.renameSync(tempFile, OBJECTS_FILE);
        
        isDirty = false;
        alt.log(`[SERVER] Successfully saved ${data.length} objects to ${OBJECTS_FILE}`);
    } catch (error) {
        alt.logError(`[SERVER] Error saving objects: ${error.stack || error}`);
    }
}