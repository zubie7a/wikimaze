// Cathedral Scene Controller
// A tall square room (10x10) with paintings arranged in a vertical grid on each wall (10 wide x 20 tall)

class CathedralScene extends SceneController {
    constructor() {
        super('cathedral');
        this.gridWidth = 5; // Number of painting columns per wall
        this.gridHeight = 15; // Number of painting rows per wall
        this.wallSegments = []; // Store all wall segment references
        this.segmentWidth = null; // Will be calculated based on room size
        this.segmentHeight = 3; // Height of each segment
        this.roomWidth = null; // Will be calculated based on size parameter
    }

    generateLayout(size) {
        // Return empty - cathedral uses custom geometry
        const horizontalWalls = Array(size + 1).fill(null).map(() => Array(size).fill(false));
        const verticalWalls = Array(size).fill(null).map(() => Array(size + 1).fill(false));
        return { horizontalWalls, verticalWalls };
    }

    createContent(group, textureStyle, size) {
        console.log('Cathedral createContent called', { textureStyle, size });
        this.sceneGroup = group;
        this.wallSegments = []; // Reset wall segments for regeneration

        // Set room dimensions
        this.roomWidth = size * CELL_SIZE;
        this.segmentWidth = this.roomWidth / this.gridWidth;
        const halfRoom = this.roomWidth / 2;

        // Create floor - large square
        const floorGeometry = new THREE.PlaneGeometry(this.roomWidth, this.roomWidth);
        const floorMaterial = this.getFloorMaterial(textureStyle);
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.5;
        group.add(floor);


        // Get wall material
        const wallMaterial = this.getWallMaterial(textureStyle);

        // Create four walls with stacked segments
        // North wall (positive Z)
        this.createWall(group, wallMaterial, -halfRoom, halfRoom, 'north');

        // South wall (negative Z)
        this.createWall(group, wallMaterial, -halfRoom, -halfRoom, 'south');

        // East wall (positive X)
        this.createWall(group, wallMaterial, halfRoom, -halfRoom, 'east');

        // West wall (negative X)
        this.createWall(group, wallMaterial, -halfRoom, -halfRoom, 'west');

        // Store global references
        window.cathedralWalls = this.wallSegments;
        window.cathedralGridWidth = this.gridWidth;
        window.cathedralGridHeight = this.gridHeight;
        window.cathedralRoomWidth = this.roomWidth;

        // Create doors at 2 random ground-level (row 0) wall segments
        // Pick from 2 different walls to ensure doors aren't on the same side
        const directions = ['north', 'south', 'east', 'west'];
        const doorWidth = CELL_SIZE * 0.6;
        const doorHeight = this.segmentHeight * 0.85;
        const doorY = doorHeight / 2 - 0.5;
        const doorMaterial = new THREE.MeshBasicMaterial({
            color: textureStyle === 'entirewall' ? 0xffffff : 0x000000,
            side: THREE.DoubleSide
        });

        // Pick 2 different wall directions
        const shuffledDirs = [...directions].sort(() => Math.random() - 0.5);
        const door1Dir = shuffledDirs[0];
        const door2Dir = shuffledDirs[1];

        // Pick random column within each direction
        const door1Col = Math.floor(Math.random() * this.gridWidth);
        const door2Col = Math.floor(Math.random() * this.gridWidth);

        const door1Segment = { direction: door1Dir, col: door1Col };
        const door2Segment = { direction: door2Dir, col: door2Col };

        // Calculate door positions based on wall direction
        const getDoorPosition = (segment) => {
            const { direction, col } = segment;
            let xPos, zPos, rotY;

            if (direction === 'north') {
                xPos = -halfRoom + (col * this.segmentWidth) + this.segmentWidth / 2;
                zPos = halfRoom;
                rotY = Math.PI; // Face inward (south)
            } else if (direction === 'south') {
                xPos = -halfRoom + (col * this.segmentWidth) + this.segmentWidth / 2;
                zPos = -halfRoom;
                rotY = 0; // Face inward (north)
            } else if (direction === 'east') {
                xPos = halfRoom;
                zPos = -halfRoom + (col * this.segmentWidth) + this.segmentWidth / 2;
                rotY = -Math.PI / 2; // Face inward (west)
            } else { // west
                xPos = -halfRoom;
                zPos = -halfRoom + (col * this.segmentWidth) + this.segmentWidth / 2;
                rotY = Math.PI / 2; // Face inward (east)
            }

            return { x: xPos, z: zPos, rotY: rotY };
        };

        const door1Pos = getDoorPosition(door1Segment);
        const door2Pos = getDoorPosition(door2Segment);

        // Create door 1
        const door1 = new THREE.Mesh(
            new THREE.PlaneGeometry(doorWidth, doorHeight),
            doorMaterial.clone()
        );
        // Position slightly inward from wall
        const doorOffset = 0.1;
        if (door1Segment.direction === 'north') {
            door1.position.set(door1Pos.x, doorY, door1Pos.z - doorOffset);
        } else if (door1Segment.direction === 'south') {
            door1.position.set(door1Pos.x, doorY, door1Pos.z + doorOffset);
        } else if (door1Segment.direction === 'east') {
            door1.position.set(door1Pos.x - doorOffset, doorY, door1Pos.z);
        } else {
            door1.position.set(door1Pos.x + doorOffset, doorY, door1Pos.z);
        }
        door1.rotation.y = door1Pos.rotY;
        group.add(door1);

        // Create door 2
        const door2 = new THREE.Mesh(
            new THREE.PlaneGeometry(doorWidth, doorHeight),
            doorMaterial.clone()
        );
        if (door2Segment.direction === 'north') {
            door2.position.set(door2Pos.x, doorY, door2Pos.z - doorOffset);
        } else if (door2Segment.direction === 'south') {
            door2.position.set(door2Pos.x, doorY, door2Pos.z + doorOffset);
        } else if (door2Segment.direction === 'east') {
            door2.position.set(door2Pos.x - doorOffset, doorY, door2Pos.z);
        } else {
            door2.position.set(door2Pos.x + doorOffset, doorY, door2Pos.z);
        }
        door2.rotation.y = door2Pos.rotY;
        group.add(door2);

        // Store door info globally for crossing detection
        window.cathedralDoors = {
            door1: {
                direction: door1Segment.direction,
                col: door1Segment.col,
                x: door1Pos.x,
                z: door1Pos.z
            },
            door2: {
                direction: door2Segment.direction,
                col: door2Segment.col,
                x: door2Pos.x,
                z: door2Pos.z
            },
            doorWidth: doorWidth,
            roomWidth: this.roomWidth,
            segmentWidth: this.segmentWidth
        };

        // Add white fog layers starting from the 5th floor (row 5)
        const fogStartRow = 1;
        const numFogLayers = 100; // Many more layers for gradual effect
        const fogLayerSpacing = 0.5; // Tighter spacing for smoother transition

        for (let i = 0; i < numFogLayers; i++) {
            // Calculate Y position starting from row 5
            const rowY = (fogStartRow * this.segmentHeight) + this.segmentHeight / 2 - 0.5;
            const fogY = rowY + (i * fogLayerSpacing);

            // Increase opacity gradually as we go up (from 0.02 at bottom to 0.25 at top)
            // Use a smoother curve for more gradual transition
            const t = i / numFogLayers; // 0 to 1
            const opacity = 0.02 + (t * t) * 0.23; // Quadratic curve for smoother fade

            // Create fog plane covering the entire room
            const fogGeometry = new THREE.PlaneGeometry(this.roomWidth, this.roomWidth);
            const fogMaterial = new THREE.MeshBasicMaterial({
                color: 0xFFFFFF, // White
                transparent: true,
                opacity: opacity,
                side: THREE.DoubleSide,
                depthWrite: false
            });

            const fogPlane = new THREE.Mesh(fogGeometry, fogMaterial);
            fogPlane.rotation.x = -Math.PI / 2; // Horizontal plane
            fogPlane.position.y = fogY;
            group.add(fogPlane);
        }

        // Painting loading is handled by regenerateScene calling reloadAllPaintings
        // Do not start loading here to avoid conflicts with the reload flow
    }

    createWall(group, material, baseX, baseZ, direction) {
        // Create segments for this wall (10 wide x 20 tall)
        for (let row = 0; row < this.gridHeight; row++) {
            for (let col = 0; col < this.gridWidth; col++) {
                const segmentGeometry = new THREE.PlaneGeometry(this.segmentWidth, this.segmentHeight);
                const segmentMaterial = material.clone();
                const wall = new THREE.Mesh(segmentGeometry, segmentMaterial);

                // Position calculation
                const yPos = (row * this.segmentHeight) + this.segmentHeight / 2 - 0.5;
                let xPos, zPos, rotY;

                if (direction === 'north') {
                    xPos = baseX + (col * this.segmentWidth) + this.segmentWidth / 2;
                    zPos = baseZ;
                    rotY = Math.PI; // Face inward (south)
                } else if (direction === 'south') {
                    xPos = baseX + (col * this.segmentWidth) + this.segmentWidth / 2;
                    zPos = baseZ;
                    rotY = 0; // Face inward (north)
                } else if (direction === 'east') {
                    xPos = baseX;
                    zPos = baseZ + (col * this.segmentWidth) + this.segmentWidth / 2;
                    rotY = -Math.PI / 2; // Face inward (west)
                } else { // west
                    xPos = baseX;
                    zPos = baseZ + (col * this.segmentWidth) + this.segmentWidth / 2;
                    rotY = Math.PI / 2; // Face inward (east)
                }

                wall.position.set(xPos, yPos, zPos);
                wall.rotation.y = rotY;

                wall.userData = {
                    wallIndex: `${direction}-${col}-${row}`,
                    direction,
                    gridCol: col,
                    gridRow: row
                };

                this.wallSegments.push(wall);
                group.add(wall);
            }
        }
    }

    async loadCathedralPaintings(group, textureStyle) {
        console.log('loadCathedralPaintings called, wallSegments:', this.wallSegments.length);

        // Capture current generation to detect if we've been invalidated
        const myGeneration = typeof mazeGeneration !== 'undefined' ? mazeGeneration : 0;

        const textureLoader = new THREE.TextureLoader();

        // Initialize painting groups tracking
        if (!window.cathedralPaintingGroups) {
            window.cathedralPaintingGroups = [];
        }
        // Initialize Map to track paintings by wall index (for preventing duplicates)
        if (!window.cathedralPaintingMap) {
            window.cathedralPaintingMap = new Map();
        }

        // Group walls by row (floor level)
        const wallsByRow = {};
        for (const wall of this.wallSegments) {
            const row = wall.userData.gridRow;
            if (!wallsByRow[row]) {
                wallsByRow[row] = [];
            }
            wallsByRow[row].push(wall);
        }

        // Load floor by floor (row by row), starting from bottom
        const sortedRows = Object.keys(wallsByRow).map(Number).sort((a, b) => a - b);
        console.log('Loading', sortedRows.length, 'floors');

        for (const row of sortedRows) {
            // Check for cancellation or generation change
            if ((typeof cancelLoading !== 'undefined' && cancelLoading) ||
                (typeof mazeGeneration !== 'undefined' && mazeGeneration !== myGeneration)) {
                console.log('Cathedral loading cancelled (generation change or cancel flag)');
                return;
            }

            const wallsInRow = wallsByRow[row];
            console.log('Loading floor', row, 'with', wallsInRow.length, 'walls');

            // Load paintings in batches using generic utility
            await processInBatches(
                wallsInRow,
                (wall) => this.createPaintingForWall(wall, group, textureLoader, textureStyle, myGeneration),
                5 // Batch size: 5 images at a time for better responsiveness
            );
        }

        console.log('Cathedral painting load complete');
    }

    async createPaintingForWall(wall, group, textureLoader, textureStyle, myGeneration) {
        // Check for cancellation or generation change before doing any work
        if ((typeof cancelLoading !== 'undefined' && cancelLoading) ||
            (typeof mazeGeneration !== 'undefined' && myGeneration !== undefined && mazeGeneration !== myGeneration)) {
            return;
        }

        // Skip painting on door wall segments (row 0 walls with doors)
        if (window.cathedralDoors && wall.userData.gridRow === 0) {
            const doors = window.cathedralDoors;
            const wallDir = wall.userData.direction;
            const wallCol = wall.userData.gridCol;

            // Check if this segment is a door
            if ((doors.door1.direction === wallDir && doors.door1.col === wallCol) ||
                (doors.door2.direction === wallDir && doors.door2.col === wallCol)) {
                if (typeof loadedImagesCount !== 'undefined') loadedImagesCount++;
                return;
            }
        }

        // Check for and remove any existing painting on this wall
        const wallIndex = wall.userData.wallIndex;
        if (window.cathedralPaintingMap && window.cathedralPaintingMap.has(wallIndex)) {
            const existing = window.cathedralPaintingMap.get(wallIndex);
            if (existing && existing.parent) {
                existing.parent.remove(existing);
                // Dispose of existing painting's resources
                existing.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat.map) mat.map.dispose();
                                mat.dispose();
                            });
                        } else {
                            if (child.material.map) child.material.map.dispose();
                            child.material.dispose();
                        }
                    }
                });
            }
            window.cathedralPaintingMap.delete(wallIndex);
        }

        // Get a Wikipedia image
        const imageData = await getWikipediaImage();

        // Check again for cancellation after async call
        if ((typeof cancelLoading !== 'undefined' && cancelLoading) ||
            (typeof mazeGeneration !== 'undefined' && myGeneration !== undefined && mazeGeneration !== myGeneration)) {
            return;
        }

        if (!imageData || !imageData.imageUrl) {
            if (typeof loadedImagesCount !== 'undefined') loadedImagesCount++;
            return;
        }

        // ENTIRE WALL STYLE: Image covers entire wall segment, no frame, no aspect ratio preservation
        if (textureStyle === 'entirewall') {
            const pictureGeometry = new THREE.PlaneGeometry(this.segmentWidth, this.segmentHeight);

            // Load texture
            const texture = await new Promise((resolve) => {
                textureLoader.load(imageData.imageUrl, (tex) => resolve(tex));
            });

            // Check for cancellation after async call
            if ((typeof cancelLoading !== 'undefined' && cancelLoading) ||
                (typeof mazeGeneration !== 'undefined' && myGeneration !== undefined && mazeGeneration !== myGeneration)) {
                return;
            }

            const pictureMaterial = new THREE.MeshLambertMaterial({
                map: texture,
                side: THREE.DoubleSide
            });
            const picture = new THREE.Mesh(pictureGeometry, pictureMaterial);

            // Position on wall (slightly in front, facing inward toward center)
            picture.position.copy(wall.position);

            // Adjust position based on wall direction to keep paintings inside room
            if (wall.userData.direction === 'north') {
                picture.position.z -= 0.01;
            } else if (wall.userData.direction === 'south') {
                picture.position.z += 0.01;
            } else if (wall.userData.direction === 'east') {
                picture.position.x -= 0.01;
            } else if (wall.userData.direction === 'west') {
                picture.position.x += 0.01;
            }

            picture.rotation.y = wall.rotation.y;

            group.add(picture);

            // Create title plate for entirewall style (positioned INSIDE the painting, near bottom)
            const plateWidth = 1.0; // Fixed width to avoid stretching
            const plateHeight = 0.08;
            const plateGeometry = new THREE.PlaneGeometry(plateWidth, plateHeight);

            const titleCanvas = document.createElement('canvas');
            titleCanvas.width = 256;
            titleCanvas.height = 20;
            const ctx = titleCanvas.getContext('2d');
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, 256, 20);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let title = imageData.title || 'Untitled';
            if (title.length > 20) title = title.substring(0, 17) + '...';
            ctx.fillText(title, 128, 10);

            const plateTexture = new THREE.CanvasTexture(titleCanvas);
            const plateMaterial = new THREE.MeshBasicMaterial({
                map: plateTexture,
                transparent: true
            });
            const plate = new THREE.Mesh(plateGeometry, plateMaterial);

            // Position plate at bottom of painting, slightly in front of painting
            plate.position.copy(picture.position);

            // Position plate INSIDE the painting, near the bottom edge (not below it)
            // picture.position.y is center of segment, bottom edge is y - segmentHeight/2
            // Place plate slightly above the bottom edge (inside the picture)
            const paintingBottom = picture.position.y - this.segmentHeight / 2;
            plate.position.y = paintingBottom + 0.15; // 0.15 units above bottom edge (inside picture)

            // Offset plate same direction as picture but further (in front of painting, toward room center)
            // Picture offsets are: north z-=0.01, south z+=0.01, east x-=0.01, west x+=0.01
            // These offsets move the picture TOWARD the room interior (away from wall surface)
            // So we continue in same direction but further for the plate
            if (wall.userData.direction === 'north') {
                plate.position.z -= 0.05; // Same direction as picture (-), further from wall
            } else if (wall.userData.direction === 'south') {
                plate.position.z += 0.05; // Same direction as picture (+), further from wall
            } else if (wall.userData.direction === 'east') {
                plate.position.x -= 0.05; // Same direction as picture (-), further from wall
            } else if (wall.userData.direction === 'west') {
                plate.position.x += 0.05; // Same direction as picture (+), further from wall
            }
            plate.rotation.y = wall.rotation.y;
            group.add(plate);

            // Track painting by wall index
            if (window.cathedralPaintingMap) {
                window.cathedralPaintingMap.set(wallIndex, picture);
            }
            window.cathedralPaintingGroups.push(picture);

            // Update progress tracking
            if (typeof loadedImagesCount !== 'undefined') loadedImagesCount++;
            return;
        }

        // W95 and BACKROOMS STYLE: Framed picture with aspect ratio preserved
        // Load texture and get dimensions for aspect ratio
        let texture;
        await new Promise((resolve) => {
            textureLoader.load(imageData.imageUrl, (loadedTexture) => {
                texture = loadedTexture;
                resolve();
            });
        });

        // Get image dimensions and calculate aspect ratio
        const dimensions = {
            width: texture.image.width,
            height: texture.image.height
        };
        const aspectRatio = dimensions.width / dimensions.height;

        // Calculate frame size with aspect ratio preservation (like maze.js)
        // Frame should be 30-60% of wall size
        const sizeMultiplier = 0.3 + Math.random() * 0.3; // Random between 0.3 and 0.6
        const maxFrameWidth = this.segmentWidth * sizeMultiplier;
        const maxFrameHeight = this.segmentHeight * sizeMultiplier;

        // Calculate actual frame dimensions maintaining aspect ratio
        let frameWidth, frameHeight;
        if (aspectRatio > 1) {
            // Landscape: width is limiting factor
            frameWidth = maxFrameWidth;
            frameHeight = maxFrameWidth / aspectRatio;
            if (frameHeight > maxFrameHeight) {
                frameHeight = maxFrameHeight;
                frameWidth = maxFrameHeight * aspectRatio;
            }
        } else {
            // Portrait: height is limiting factor
            frameHeight = maxFrameHeight;
            frameWidth = maxFrameHeight * aspectRatio;
            if (frameWidth > maxFrameWidth) {
                frameWidth = maxFrameWidth;
                frameHeight = maxFrameWidth / aspectRatio;
            }
        }

        const frameDepth = 0.05;
        const frameThickness = 0.04; // Border thickness around picture

        // Frame - match maze.js color (0x8B4513 brown)
        const frameGeometry = new THREE.BoxGeometry(frameWidth + frameThickness * 2, frameHeight + frameThickness * 2, frameDepth);
        const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const frame = new THREE.Mesh(frameGeometry, frameMaterial);

        // Canvas - now with correct aspect ratio
        const canvasGeometry = new THREE.PlaneGeometry(frameWidth, frameHeight);
        const canvasMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, map: texture });
        const canvas = new THREE.Mesh(canvasGeometry, canvasMaterial);
        canvas.position.z = frameDepth / 2 + 0.001;

        // Create title plate
        const plateWidth = frameWidth * 0.8;
        const plateHeight = 0.08;
        const plateGeometry = new THREE.PlaneGeometry(plateWidth, plateHeight);

        const titleCanvas = document.createElement('canvas');
        titleCanvas.width = 256;
        titleCanvas.height = 20;
        const ctx = titleCanvas.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, 256, 20);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let title = imageData.title || 'Untitled';
        if (title.length > 20) title = title.substring(0, 17) + '...';
        ctx.fillText(title, 128, 10);

        const plateTexture = new THREE.CanvasTexture(titleCanvas);
        const plateMaterial = new THREE.MeshBasicMaterial({
            map: plateTexture,
            transparent: true
        });
        const plate = new THREE.Mesh(plateGeometry, plateMaterial);
        // Position plate below the frame (matching maze.js style)
        plate.position.y = -frameHeight / 2 - frameThickness - plateHeight / 2 - 0.02;
        plate.position.z = 0.001; // Flush with frame

        // Group all painting elements
        const paintingGroup = new THREE.Group();
        paintingGroup.add(frame);
        paintingGroup.add(canvas);
        paintingGroup.add(plate);

        // Position on wall (flush against wall, like maze.js)
        paintingGroup.position.copy(wall.position);

        // Offset just enough for frame depth (flush with wall)
        if (wall.userData.direction === 'north') {
            paintingGroup.position.z -= frameDepth / 2 + 0.01;
        } else if (wall.userData.direction === 'south') {
            paintingGroup.position.z += frameDepth / 2 + 0.01;
        } else if (wall.userData.direction === 'east') {
            paintingGroup.position.x -= frameDepth / 2 + 0.01;
        } else if (wall.userData.direction === 'west') {
            paintingGroup.position.x += frameDepth / 2 + 0.01;
        }

        paintingGroup.rotation.y = wall.rotation.y;

        group.add(paintingGroup);

        // Track painting group by wall index (for preventing duplicates)
        if (window.cathedralPaintingMap) {
            window.cathedralPaintingMap.set(wallIndex, paintingGroup);
        }

        // Also track in array for reload functionality (backward compatibility)
        const paintingIndex = window.cathedralPaintingGroups.length;
        window.cathedralPaintingGroups[paintingIndex] = paintingGroup;

        // Update progress tracking
        if (typeof loadedImagesCount !== 'undefined') loadedImagesCount++;
    }

    getFloorMaterial(textureStyle) {
        const textureLoader = new THREE.TextureLoader();

        if (textureStyle === 'backrooms') {
            const floorTexture = textureLoader.load('https://i.imgur.com/tSS8RvD.jpeg');
            floorTexture.wrapS = THREE.RepeatWrapping;
            floorTexture.wrapT = THREE.RepeatWrapping;
            floorTexture.repeat.set(10, 10);
            return new THREE.MeshStandardMaterial({ map: floorTexture });
        } else if (textureStyle === 'entirewall') {
            return new THREE.MeshLambertMaterial({ color: 0xE8E8E8 });
        }
        // W95 style
        return new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    }

    getWallMaterial(textureStyle) {
        const textureLoader = new THREE.TextureLoader();

        if (textureStyle === 'backrooms') {
            const wallTexture = textureLoader.load('https://i.imgur.com/FzvYZWy.png');
            wallTexture.wrapS = THREE.RepeatWrapping;
            wallTexture.wrapT = THREE.RepeatWrapping;
            wallTexture.repeat.set(2, 1);
            return new THREE.MeshLambertMaterial({ map: wallTexture });
        } else if (textureStyle === 'entirewall') {
            return new THREE.MeshLambertMaterial({ color: 0x000000 });
        }
        // W95 style
        const brickTexture = textureLoader.load('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSUg8n8t7AKXzKt5-Sr9O96avECwEZnGShJWQ&s');
        brickTexture.wrapS = THREE.RepeatWrapping;
        brickTexture.wrapT = THREE.RepeatWrapping;
        brickTexture.repeat.set(2, 2);
        return new THREE.MeshLambertMaterial({ map: brickTexture });
    }

    // Cathedral lighting
    getSceneSetup() {
        return {
            background: 0xffffff,
            fog: null,
            ambientIntensity: 0.7
        };
    }

    // Spawn at center, ground level
    getStartPosition(size) {
        return { x: 0, z: 0, rotation: 0 };
    }

    // Enable minimap for cathedral
    showMinimap() {
        return true;
    }
}

// Register the cathedral scene
registerScene('cathedral', new CathedralScene());
