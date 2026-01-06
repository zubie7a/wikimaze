// Alley Scene Controller
// Single endless corridor with wrapping and fog effects

class AlleyScene extends SceneController {
    constructor() {
        super('alley');
        this.alleyZ = 0;
        this.alleyWorldZ = 0;
    }

    // Generate single corridor layout
    generateLayout(size) {
        const horizontalWalls = Array(size + 1).fill(null).map(() => Array(size).fill(false));
        const verticalWalls = Array(size).fill(null).map(() => Array(size + 1).fill(false));

        // Create a single alley in the middle row
        this.alleyZ = Math.floor(size / 2);

        // Add walls on north side of alley
        for (let x = 0; x < size; x++) {
            horizontalWalls[this.alleyZ][x] = true;
        }

        // Add walls on south side of alley
        for (let x = 0; x < size; x++) {
            horizontalWalls[this.alleyZ + 1][x] = true;
        }

        // No east/west boundaries - allows wrapping

        return { horizontalWalls, verticalWalls };
    }

    // Create alley-specific content: fog planes and creepy eyes
    createContent(group, textureStyle, size) {
        this.alleyWorldZ = (this.alleyZ - size / 2) * CELL_SIZE + CELL_SIZE / 2;
        const halfAlleyLength = (size / 2) * CELL_SIZE;

        window.alleyFogPlanes = null;
        window.alleyWorldZ = this.alleyWorldZ;

        // Fog color: white for entirewall, black otherwise
        const fogColor = textureStyle === 'entirewall' ? 0xffffff : 0x000000;

        // Create gradient darkness at each end of the alley
        const numOuterLayers = 15;
        const outerZoneLength = CELL_SIZE * 3;

        for (let i = 0; i < numOuterLayers; i++) {
            const t = i / (numOuterLayers - 1);
            const distFromEnd = CELL_SIZE * 1.5 + t * outerZoneLength;
            const opacity = 0.03 + (1 - t) * 0.08;

            const fogMaterial = new THREE.MeshBasicMaterial({
                color: fogColor,
                transparent: true,
                opacity: opacity,
                side: THREE.DoubleSide,
                depthWrite: false
            });

            // West end
            const westDark = new THREE.Mesh(
                new THREE.PlaneGeometry(CELL_SIZE * 2, WALL_HEIGHT + 2),
                fogMaterial.clone()
            );
            westDark.rotation.y = Math.PI / 2;
            westDark.position.set(-halfAlleyLength + distFromEnd, WALL_HEIGHT / 2 - 0.5, this.alleyWorldZ);
            group.add(westDark);

            // East end
            const eastDark = new THREE.Mesh(
                new THREE.PlaneGeometry(CELL_SIZE * 2, WALL_HEIGHT + 2),
                fogMaterial.clone()
            );
            eastDark.rotation.y = Math.PI / 2;
            eastDark.position.set(halfAlleyLength - distFromEnd, WALL_HEIGHT / 2 - 0.5, this.alleyWorldZ);
            group.add(eastDark);
        }

        // Dense layers near ends
        const numDenseLayers = 30;
        const denseZoneLength = CELL_SIZE * 1.5;

        for (let i = 0; i < numDenseLayers; i++) {
            const t = i / (numDenseLayers - 1);
            const distFromEnd = t * denseZoneLength;
            const opacity = 0.08 + (1 - t) * 0.15;

            const fogMaterial = new THREE.MeshBasicMaterial({
                color: fogColor,
                transparent: true,
                opacity: opacity,
                side: THREE.DoubleSide,
                depthWrite: false
            });

            const westDense = new THREE.Mesh(
                new THREE.PlaneGeometry(CELL_SIZE * 2, WALL_HEIGHT + 2),
                fogMaterial.clone()
            );
            westDense.rotation.y = Math.PI / 2;
            westDense.position.set(-halfAlleyLength + distFromEnd, WALL_HEIGHT / 2 - 0.5, this.alleyWorldZ);
            group.add(westDense);

            const eastDense = new THREE.Mesh(
                new THREE.PlaneGeometry(CELL_SIZE * 2, WALL_HEIGHT + 2),
                fogMaterial.clone()
            );
            eastDense.rotation.y = Math.PI / 2;
            eastDense.position.set(halfAlleyLength - distFromEnd, WALL_HEIGHT / 2 - 0.5, this.alleyWorldZ);
            group.add(eastDense);
        }

        // Add creepy eyes (backrooms only)
        if (textureStyle === 'backrooms') {
            this.createCreepyEyes(group, halfAlleyLength);
        }
    }

    createCreepyEyes(group, halfAlleyLength) {
        const eyeRadius = 0.012;
        const eyeSpacing = 0.035;

        const eyeMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 1.0
        });

        const eyeGeometry = new THREE.SphereGeometry(eyeRadius, 8, 8);

        for (let pair = 0; pair < 4; pair++) {
            const isEast = pair >= 2;
            const randomHeightMin = 0.8;
            const randomHeightMax = 1.7;
            const eyeHeight = randomHeightMin + Math.random() * (randomHeightMax - randomHeightMin);
            const randomZOffset = (Math.random() - 0.5) * CELL_SIZE * 0.5;
            const baseDist = CELL_SIZE * 2 + Math.random() * CELL_SIZE;

            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone());
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial.clone());

            const eyeZ = this.alleyWorldZ + randomZOffset;
            leftEye.position.set(0, eyeHeight, eyeZ - eyeSpacing);
            rightEye.position.set(0, eyeHeight, eyeZ + eyeSpacing);

            group.add(leftEye);
            group.add(rightEye);

            const eyeGlow = new THREE.PointLight(0xFFFFFF, 0.08, 1, 2);
            eyeGlow.position.set(0, eyeHeight, eyeZ);
            group.add(eyeGlow);

            creepyEyes.push({
                leftEye: leftEye,
                rightEye: rightEye,
                glow: eyeGlow,
                nextBlinkTime: performance.now() + 2000 + Math.random() * 4000,
                isBlinking: false,
                blinkEndTime: 0,
                isAlleyEyes: true,
                isEast: isEast,
                baseDist: baseDist,
                eyeHeight: eyeHeight,
                zOffset: randomZOffset,
                blinkCount: 0
            });
        }
    }

    // Dark background with fog
    getSceneSetup() {
        return {
            background: 0x000000,
            fog: { color: 0x000000, near: CELL_SIZE * 0.5, far: CELL_SIZE * 4 },
            ambientIntensity: 0.6
        };
    }

    // Start in middle of alley, facing east
    getStartPosition(size) {
        const alleyZ = Math.floor(size / 2);
        return {
            x: 0,
            z: (alleyZ - size / 2) * CELL_SIZE + CELL_SIZE / 2,
            rotation: Math.PI / 2 // Face east
        };
    }

    // Movement speed inherited from base class (baseSpeed / 4)
    handleWrapping(position, size) {
        const minX = (-size / 2) * CELL_SIZE;
        const maxX = (size / 2) * CELL_SIZE;
        const alleyWidth = maxX - minX;

        if (position.x < minX) {
            position.x += alleyWidth;
            if (typeof handleAlleyCrossing === 'function') {
                handleAlleyCrossing();
            }
        } else if (position.x > maxX) {
            position.x -= alleyWidth;
            if (typeof handleAlleyCrossing === 'function') {
                handleAlleyCrossing();
            }
        }

        return position;
    }

    // Filter wall counting for alley (only alley walls count)
    shouldCountWall(wallType, x, y, size) {
        const alleyZ = Math.floor(size / 2);
        if (wallType === 'horizontal' && (y === alleyZ || y === alleyZ + 1)) {
            return true;
        }
        return false;
    }

    // Alley walls have paintings on one side only
    hasPaintingsOnBothSides(wallType, x, y, size) {
        return false;
    }
}

// Register the alley scene
registerScene('alley', new AlleyScene());
