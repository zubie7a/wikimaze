// Pillars Scene Controller
// 15x15 room with pillar structures (wall segments surrounding cells) scattered in the middle

class PillarsScene extends SceneController {
    constructor() {
        super('pillars');
        this.pillarPositions = []; // Store pillar cell positions
    }

    // Generate room with boundary walls and pillar structures
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

        // Add pillars in a grid pattern in the middle area
        // Pillars are wall segments surrounding a single cell
        this.pillarPositions = [];
        const margin = 3; // Keep pillars away from edges
        const spacing = 3; // Space between pillars

        for (let y = margin; y < size - margin; y += spacing) {
            for (let x = margin; x < size - margin; x += spacing) {
                // Skip center to leave spawn area clear
                const center = Math.floor(size / 2);
                if (Math.abs(x - center) <= 1 && Math.abs(y - center) <= 1) continue;

                // Add walls around this cell to form a pillar
                // North wall of cell (horizontalWalls[y][x])
                horizontalWalls[y][x] = true;
                // South wall of cell (horizontalWalls[y+1][x])
                horizontalWalls[y + 1][x] = true;
                // West wall of cell (verticalWalls[y][x])
                verticalWalls[y][x] = true;
                // East wall of cell (verticalWalls[y][x+1])
                verticalWalls[y][x + 1] = true;

                this.pillarPositions.push({ x, y });
            }
        }

        return { horizontalWalls, verticalWalls };
    }

    // Create doors on each wall
    createContent(group, textureStyle, size) {
        const halfSize = (size * CELL_SIZE) / 2;
        const doorWidth = CELL_SIZE * 0.6;
        const doorHeight = WALL_HEIGHT * 0.85;
        const doorY = doorHeight / 2 - 0.5;

        const doorMaterial = new THREE.MeshBasicMaterial({
            color: textureStyle === 'entirewall' ? 0xffffff : 0x000000,
            side: THREE.DoubleSide
        });

        // Store door positions globally for crossing detection (reuse openspace doors)
        window.pillarsDoors = {
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
            this.createPillarEyes(group, size);
        } else {
            creepyEyes = [];
        }
    }

    createPillarEyes(group, size) {
        creepyEyes = [];

        const eyeRadius = 0.008;
        const eyeSpacing = 0.025;

        const eyeMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 1.0
        });

        const eyeGeometry = new THREE.SphereGeometry(eyeRadius, 8, 8);

        // Add eyes near some pillars
        for (let i = 0; i < Math.min(3, this.pillarPositions.length); i++) {
            const pillar = this.pillarPositions[Math.floor(Math.random() * this.pillarPositions.length)];
            const eyeHeight = 0.8 + Math.random() * 1.0;

            // Convert grid position to world position
            const worldX = (pillar.x - size / 2) * CELL_SIZE + CELL_SIZE / 2 + (Math.random() - 0.5) * CELL_SIZE * 0.3;
            const worldZ = (pillar.y - size / 2) * CELL_SIZE + CELL_SIZE / 2 + (Math.random() - 0.5) * CELL_SIZE * 0.3;

            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone());
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone());

            leftEye.position.set(worldX - eyeSpacing, eyeHeight, worldZ);
            rightEye.position.set(worldX + eyeSpacing, eyeHeight, worldZ);

            group.add(leftEye);
            group.add(rightEye);

            const eyeGlow = new THREE.PointLight(0xFFFFFF, 0.05, 0.5, 2);
            eyeGlow.position.set(worldX, eyeHeight, worldZ);
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

    // Handle door transitions (reuse openspace logic)
    handleWrapping(position, size) {
        const halfSize = (size * CELL_SIZE) / 2;

        let exitDirection = null;
        if (position.x < -halfSize) exitDirection = 'west';
        else if (position.x > halfSize) exitDirection = 'east';
        else if (position.z < -halfSize) exitDirection = 'north';
        else if (position.z > halfSize) exitDirection = 'south';

        if (exitDirection && typeof handlePillarsDoorCrossing === 'function') {
            handlePillarsDoorCrossing(exitDirection);
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

    // Override getEffectiveSize to always return 15
    getEffectiveSize() {
        return 15;
    }
}

// Register the pillars scene
registerScene('pillars', new PillarsScene());
