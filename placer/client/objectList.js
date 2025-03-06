import * as alt from "alt";

let objectListView = null;

alt.on("keyup", (key) => {
    if (key === 113) { // F2
        if (!objectListView) {
            objectListView = new alt.WebView("http://resource/client/objectList.html");
            
            // Event Handler für die Objektauswahl
            objectListView.on("objectSelected", (object) => {
                alt.emit("PlacingModule:setObject", object);
                closeObjectList();
            });

            // Focus auf WebView setzen
            objectListView.focus();
            
            // Steuerung deaktivieren und Cursor anzeigen
            alt.toggleGameControls(false);
            alt.showCursor(true);

            // Objekte vom Server anfordern
            alt.emitServer("PlacingModule:RequestObjects");
            
            // Debug-Events
            objectListView.on('keydown', (key) => {
                alt.log('Keydown in WebView:', key);
            });
            
            objectListView.on('input', (value) => {
                alt.log('Input in WebView:', value);
            });
        } else {
            closeObjectList();
        }
    }
});

// Server Event Handler
alt.onServer("PlacingModule:ReceiveObjects", (objects) => {
    if (objectListView) {
        objectListView.emit("updateObjectList", objects);
        alt.log('[CLIENT] Received objects:', objects.length);
    }
});

function closeObjectList() {
    if (objectListView) {
        objectListView.destroy();
        objectListView = null;
        alt.toggleGameControls(true);
        alt.showCursor(false);
    }
}