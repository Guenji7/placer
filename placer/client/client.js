import * as alt from "alt";
import * as game from "natives";
import "./objectList.js";

const player = alt.Player.local;
const existingObjects = new Map();

let showObject = false;
let alphaMode = false;
let newObjectToPlace = null;
let placeObjectDistance = 3;
let tmpObject = null;
let lastRotation = { x: 0, y: 0, z: 0 };
let heightOffset = 0;
let targetObject = null;
let raycastMode = false; // Neue Variable für Raycast-Modus

class Raycast {
    static line(distance, flags, ignoreEntity) {
        const camPos = game.getGameplayCamCoord();
        const camRot = game.getGameplayCamRot(0);
        const direction = this.rotationToDirection(camRot);
        
        const targetPos = {
            x: camPos.x + direction.x * distance,
            y: camPos.y + direction.y * distance,
            z: camPos.z + direction.z * distance
        };

        const ray = game.startExpensiveSynchronousShapeTestLosProbe(
            camPos.x, camPos.y, camPos.z,
            targetPos.x, targetPos.y, targetPos.z,
            flags, ignoreEntity, 0
        );

        return this.result(ray);
    }

    static rotationToDirection(rotation) {
        const z = rotation.z * (Math.PI / 180.0);
        const x = rotation.x * (Math.PI / 180.0);
        const num = Math.abs(Math.cos(x));

        return {
            x: -Math.sin(z) * num,
            y: Math.cos(z) * num,
            z: Math.sin(x)
        };
    }

    static result(ray) {
        const result = game.getShapeTestResult(ray, false, null, null, null);
        return {
            isHit: result[1],
            pos: result[2],
            hitEntity: result[4],
            entityType: game.getEntityType(result[4])
        };
    }
}

function drawCircle(position, radius, thickness, color) {
    const numSegments = 128;
    const step = (Math.PI * 2) / numSegments;
    const verticalOffset = -0.10;
    
    const radiusStep = 0.0;
    const thicknessMultiplier = 3.5;
    
    for (let t = 0; t < thickness * thicknessMultiplier; t++) {
        const currentRadius = radius + t * radiusStep;
        const currentHeight = position.z + verticalOffset + t * 0.001;
        
        for (let i = 0; i < numSegments; i++) {
            const angle1 = step * i;
            const angle2 = step * (i + 1);

            const x1 = position.x + Math.cos(angle1) * currentRadius;
            const y1 = position.y + Math.sin(angle1) * currentRadius;
            
            const x2 = position.x + Math.cos(angle2) * currentRadius;
            const y2 = position.y + Math.sin(angle2) * currentRadius;

            game.drawLine(
                x1, y1, currentHeight,
                x2, y2, currentHeight,
                color[0], color[1], color[2],
                Math.max(180, color[3] - t * 1)
            );
        }
    }
}

function showAlphaObject(object, initialAlpha = 150) {
    const hash = typeof object === 'number' ? object : game.getHashKey(object);
    alt.log('Creating object with hash:', hash, 'with alpha:', initialAlpha);
    
    requestModelPromise(hash).then((succ) => {
        if (succ) {
            newObjectToPlace = game.createObject(
                hash,
                player.pos.x,
                player.pos.y,
                player.pos.z,
                false,
                false,
                true
            );
            game.setEntityAlpha(newObjectToPlace, initialAlpha, false);
            game.setEntityCollision(newObjectToPlace, false, true);
            showObject = true;
            lastRotation = { x: 0, y: 0, z: 0 };
            heightOffset = 0;
        }
    });
}

function requestModelPromise(model) {
    return new Promise((resolve, reject) => {
        if (!game.hasModelLoaded(model)) {
            game.requestModel(model);
        }
        let inter = alt.setInterval(() => {
            if (game.hasModelLoaded(model)) {
                alt.clearInterval(inter);
                return resolve(true);
            }
        }, 10);
    });
}

alt.everyTick(() => {
    // Kamera-Position und -Rotation holen
    const camPos = game.getGameplayCamCoord();
    const camRot = game.getGameplayCamRot(0);
    
    // Kamera-Richtungsvektor berechnen (nutzt die existierende Raycast-Klasse)
    const direction = Raycast.rotationToDirection(camRot);
    
    // Position vor der Kamera berechnen
    var posFront = {
        x: camPos.x + direction.x * placeObjectDistance,
        y: camPos.y + direction.y * placeObjectDistance,
        z: camPos.z + direction.z * placeObjectDistance
    };

    if (!showObject && raycastMode) {
        const raycastResult = Raycast.line(10, -1, player.scriptID);
        if (raycastResult.isHit && raycastResult.entityType === 3) {
            targetObject = raycastResult.hitEntity;
            if (targetObject && game.isEntityAnObject(targetObject)) {
                const targetPos = game.getEntityCoords(targetObject, false);
                drawCircle(targetPos, 0.5, 5, [255, 255, 0, 90]);
                
                if (game.isControlJustPressed(0, 73)) { // X Taste
                    const modelHash = game.getEntityModel(targetObject);
                    const pos = game.getEntityCoords(targetObject, false);
                    const currentAlpha = game.getEntityAlpha(targetObject);
                    
                    alt.emitServer("PlacingModule:DeleteObject", {
                        position: pos,
                        model: modelHash
                    });
                    
                    game.deleteObject(targetObject);
                    targetObject = null;
                    showAlphaObject(modelHash, currentAlpha);
                }
            }
        } else {
            targetObject = null;
        }
    }

    if (showObject && newObjectToPlace) {
        if (game.isControlPressed(0, 111)) {
            heightOffset += 0.05;
        }
        if (game.isControlPressed(0, 108)) {
            heightOffset -= 0.05;
        }

        if (alphaMode) {
            if (game.isControlPressed(2, 27)) {
                const currentAlpha = game.getEntityAlpha(newObjectToPlace);
                game.setEntityAlpha(newObjectToPlace, Math.min(currentAlpha + 5, 255), true);
            }
            if (game.isControlPressed(2, 173)) {
                const currentAlpha = game.getEntityAlpha(newObjectToPlace);
                game.setEntityAlpha(newObjectToPlace, Math.max(currentAlpha - 5, 20), true);
            }
        } else {
            if (game.isControlPressed(0, 19)) {
                if (game.isControlPressed(2, 27)) {
                    lastRotation.x = (lastRotation.x + 2) % 360;
                    game.setEntityRotation(
                        newObjectToPlace,
                        lastRotation.x,
                        lastRotation.y,
                        lastRotation.z,
                        2,
                        true
                    );
                }
                if (game.isControlPressed(2, 173)) {
                    lastRotation.x = (lastRotation.x - 2 + 360) % 360;
                    game.setEntityRotation(
                        newObjectToPlace,
                        lastRotation.x,
                        lastRotation.y,
                        lastRotation.z,
                        2,
                        true
                    );
                }
            } else {
                if (game.isControlPressed(2, 174)) {
                    lastRotation.z = (lastRotation.z + 2) % 360;
                    game.setEntityRotation(
                        newObjectToPlace,
                        lastRotation.x,
                        lastRotation.y,
                        lastRotation.z,
                        2,
                        true
                    );
                }
                if (game.isControlPressed(2, 175)) {
                    lastRotation.z = (lastRotation.z - 2 + 360) % 360;
                    game.setEntityRotation(
                        newObjectToPlace,
                        lastRotation.x,
                        lastRotation.y,
                        lastRotation.z,
                        2,
                        true
                    );
                }
                if (game.isControlPressed(2, 27)) {
                    lastRotation.y = (lastRotation.y + 2) % 360;
                    game.setEntityRotation(
                        newObjectToPlace,
                        lastRotation.x,
                        lastRotation.y,
                        lastRotation.z,
                        2,
                        true
                    );
                }
                if (game.isControlPressed(2, 173)) {
                    lastRotation.y = (lastRotation.y - 2 + 360) % 360;
                    game.setEntityRotation(
                        newObjectToPlace,
                        lastRotation.x,
                        lastRotation.y,
                        lastRotation.z,
                        2,
                        true
                    );
                }
            }
        }

        game.setEntityCoords(
            newObjectToPlace,
            posFront.x,
            posFront.y,
            posFront.z + heightOffset,
            false,
            false,
            false,
            true
        );
    }
});

alt.on("PlacingModule:setObject", (object) => {
    showAlphaObject(object);
});

alt.on("keyup", (key) => {
    if (key === 0x74) { // F5
        raycastMode = !raycastMode;
        alt.log(`Raycast Mode: ${raycastMode ? 'Enabled' : 'Disabled'}`);
    }

    if (key === 0x20) { // Leertaste
        if (showObject && newObjectToPlace) {
            game.deleteObject(newObjectToPlace);
            game.deleteObject(tmpObject);
            showObject = false;
            newObjectToPlace = null;
            lastRotation = { x: 0, y: 0, z: 0 };
            heightOffset = 0;
        }
    }

    if (key === 0x45) { // E zum Platzieren
        if (showObject && newObjectToPlace) {
            const currentPos = game.getEntityCoords(newObjectToPlace, false);
            const currentRot = game.getEntityRotation(newObjectToPlace, 2);
            const currentAlpha = game.getEntityAlpha(newObjectToPlace);
            const modelHash = game.getEntityModel(newObjectToPlace);

            // Sende Daten an Server
            alt.emitServer("PlacingModule", {
                model: modelHash,
                position: currentPos,
                rotation: currentRot,
                alpha: currentAlpha
            });

            // Lösche das temporäre Platzierungsobjekt
            game.deleteObject(newObjectToPlace);
            newObjectToPlace = null;
            showObject = false;
            lastRotation = { x: 0, y: 0, z: 0 };
            heightOffset = 0;
            alphaMode = false;
        }
    }

    if (key === 0x10) { // Shift für Alpha-Mode Toggle
        if (showObject) {
            alphaMode = !alphaMode;
            alt.log(`PlacingModule: Changed alphaMode to ${alphaMode}`);

        // Position des Objekts aktualisieren
        game.setEntityCoords(
            newObjectToPlace,
            posFront.x,
            posFront.y,
            posFront.z + heightOffset,
            false,
            false,
            false,
            true
        );
    }
}});

alt.onServer('PlacingModule:AddObject', (objectData) => {
    if (!objectData || !objectData.id) return;
    
    if (existingObjects.has(objectData.id)) {
        const existing = existingObjects.get(objectData.id);
        if (existing && game.doesEntityExist(existing)) {
            game.deleteObject(existing);
        }
        existingObjects.delete(objectData.id);
    }
    
    const obj = game.createObject(
        objectData.model,
        objectData.position.x,
        objectData.position.y,
        objectData.position.z,
        false,
        false,
        true
    );
    
    if (obj) {
        game.setEntityRotation(
            obj,
            objectData.rotation.x,
            objectData.rotation.y,
            objectData.rotation.z,
            2,
            true
        );
        game.freezeEntityPosition(obj, true);
        existingObjects.set(objectData.id, obj);
    }
});

alt.onServer('PlacingModule:RemoveObject', (objectId) => {
    if (existingObjects.has(objectId)) {
        const obj = existingObjects.get(objectId);
        if (obj && game.doesEntityExist(obj)) {
            game.deleteObject(obj);
        }
        existingObjects.delete(objectId);
    }
});

alt.onServer('PlacingModule:InitialObjects', (objects) => {
    for (let [id, obj] of existingObjects) {
        if (obj && game.doesEntityExist(obj)) {
            game.deleteObject(obj);
        }
    }
    existingObjects.clear();
    
    for (const objectData of objects) {
        if (!objectData || !objectData.id) continue;
        
        const obj = game.createObject(
            objectData.model,
            objectData.position.x,
            objectData.position.y,
            objectData.position.z,
            false,
            false,
            true
        );
        
        if (obj) {
            game.setEntityRotation(
                obj,
                objectData.rotation.x,
                objectData.rotation.y,
                objectData.rotation.z,
                2,
                true
            );
            game.freezeEntityPosition(obj, true);
            existingObjects.set(objectData.id, obj);
        }
    }
});