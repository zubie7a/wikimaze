// Openspace Scene Controller
// Empty room with doors on each wall that lead to new rooms

class OpenspaceScene extends SceneController {
    constructor() {
        super('openspace');
    }

    // Generate empty room with boundary walls
    generateLayout(size) {
        const horizontalWalls = Array(size + 1).fill(null).map(() => Array(size).fill(false));
        const verticalWalls = Array(size).fill(null).map(() => Array(size + 1).fill(false));

        // Add boundary walls
        for (let x = 0; x < size; x++) {
            horizontalWalls[0][x] = true;      // North boundary
            horizontalWalls[size][x] = true;   // South boundary
        }
        for (let y = 0; y < size; y++) {
            verticalWalls[y][0] = true;        // West boundary
            verticalWalls[y][size] = true;     // East boundary
        }

        return { horizontalWalls, verticalWalls };
    }

    // Create doors on each wall and eyes
    createContent(group, textureStyle, size) {
        const halfSize = (size * CELL_SIZE) / 2;
        const doorWidth = CELL_SIZE * 0.6;
        const doorHeight = WALL_HEIGHT * 0.85;
        const doorY = doorHeight / 2 - 0.5;

        const doorMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.DoubleSide
        });

        // Store door positions globally for crossing detection
        window.openspaceDoors = {
            north: { z: -halfSize, minX: -doorWidth / 2, maxX: doorWidth / 2 },
            south: { z: halfSize, minX: -doorWidth / 2, maxX: doorWidth / 2 },
            west: { x: -halfSize, minZ: -doorWidth / 2, maxZ: doorWidth / 2 },
            east: { x: halfSize, minZ: -doorWidth / 2, maxZ: doorWidth / 2 }
        };

        // North door
        const northDoor = new THREE.Mesh(
            new THREE.PlaneGeometry(doorWidth, doorHeight),
            doorMaterial.clone()
        );
        northDoor.position.set(0, doorY, -halfSize + WALL_THICKNESS / 2 + 0.01);
        group.add(northDoor);

        // South door
        const southDoor = new THREE.Mesh(
            new THREE.PlaneGeometry(doorWidth, doorHeight),
            doorMaterial.clone()
        );
        southDoor.position.set(0, doorY, halfSize - WALL_THICKNESS / 2 - 0.01);
        southDoor.rotation.y = Math.PI;
        group.add(southDoor);

        // West door
        const westDoor = new THREE.Mesh(
            new THREE.PlaneGeometry(doorWidth, doorHeight),
            doorMaterial.clone()
        );
        westDoor.rotation.y = Math.PI / 2;
        westDoor.position.set(-halfSize + WALL_THICKNESS / 2 + 0.01, doorY, 0);
        group.add(westDoor);

        // East door
        const eastDoor = new THREE.Mesh(
            new THREE.PlaneGeometry(doorWidth, doorHeight),
            doorMaterial.clone()
        );
        eastDoor.rotation.y = -Math.PI / 2;
        eastDoor.position.set(halfSize - WALL_THICKNESS / 2 - 0.01, doorY, 0);
        group.add(eastDoor);

        // Add creepy eyes (backrooms only)
        if (textureStyle === 'backrooms') {
            this.createDoorEyes(group, halfSize, doorWidth);
        } else {
            creepyEyes = [];
        }
    }

    createDoorEyes(group, halfSize, doorWidth) {
        creepyEyes = [];

        const eyeRadius = 0.008;
        const eyeSpacing = 0.025;

        const eyeMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 1.0
        });

        const eyeGeometry = new THREE.SphereGeometry(eyeRadius, 8, 8);

        for (let pair = 0; pair < 2; pair++) {
            const doorChoice = Math.floor(Math.random() * 4);
            const randomOffsetRange = doorWidth * 0.35;
            const randomHeightMin = 0.6;
            const randomHeightMax = 1.9;
            const eyeHeight = randomHeightMin + Math.random() * (randomHeightMax - randomHeightMin);
            const randomOffset = (Math.random() - 0.5) * 2 * randomOffsetRange;

            let eyeX = 0, eyeZ = 0;

            switch (doorChoice) {
                case 0: // North
                    eyeZ = -halfSize + WALL_THICKNESS / 2 + 0.02;
                    eyeX = randomOffset;
                    break;
                case 1: // South
                    eyeZ = halfSize - WALL_THICKNESS / 2 - 0.02;
                    eyeX = randomOffset;
                    break;
                case 2: // West
                    eyeX = -halfSize + WALL_THICKNESS / 2 + 0.02;
                    eyeZ = randomOffset;
                    break;
                case 3: // East
                    eyeX = halfSize - WALL_THICKNESS / 2 - 0.02;
                    eyeZ = randomOffset;
                    break;
            }

            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone());
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone());

            if (doorChoice === 0 || doorChoice === 1) {
                leftEye.position.set(eyeX - eyeSpacing, eyeHeight, eyeZ);
                rightEye.position.set(eyeX + eyeSpacing, eyeHeight, eyeZ);
            } else {
                leftEye.position.set(eyeX, eyeHeight, eyeZ - eyeSpacing);
                rightEye.position.set(eyeX, eyeHeight, eyeZ + eyeSpacing);
            }

            group.add(leftEye);
            group.add(rightEye);

            const eyeGlow = new THREE.PointLight(0xFFFFFF, 0.05, 0.5, 2);
            eyeGlow.position.set(
                (leftEye.position.x + rightEye.position.x) / 2,
                eyeHeight,
                (leftEye.position.z + rightEye.position.z) / 2
            );
            group.add(eyeGlow);

            creepyEyes.push({
                leftEye: leftEye,
                rightEye: rightEye,
                glow: eyeGlow,
                nextBlinkTime: performance.now() + 2000 + Math.random() * 4000,
                isBlinking: false,
                blinkEndTime: 0
            });
        }
    }

    // Dark background, no fog
    getSceneSetup() {
        return {
            background: 0x000000,
            fog: null,
            ambientIntensity: 0.6
        };
    }

    // Start in center of room
    getStartPosition(size) {
        return { x: 0, z: 0, rotation: 0 };
    }

    // Handle door transitions
    handleWrapping(position, size) {
        const halfSize = (size * CELL_SIZE) / 2;

        let exitDirection = null;
        if (position.x < -halfSize) exitDirection = 'west';
        else if (position.x > halfSize) exitDirection = 'east';
        else if (position.z < -halfSize) exitDirection = 'north';
        else if (position.z > halfSize) exitDirection = 'south';

        if (exitDirection && typeof handleOpenspaceDoorCrossing === 'function') {
            handleOpenspaceDoorCrossing(exitDirection);
        }

        return position;
    }

    // Check if wall position is a door
    isDoorWall(type, x, y, size) {
        const center = Math.floor(size / 2);
        if (type === 'horizontal' && y === 0 && x === center) return true;
        if (type === 'horizontal' && y === size && x === center) return true;
        if (type === 'vertical' && x === 0 && y === center) return true;
        if (type === 'vertical' && x === size && y === center) return true;
        return false;
    }
}

// Register the openspace scene
registerScene('openspace', new OpenspaceScene());
