// Cathedral Scene Controller
// A tall square room (10x10) with paintings arranged in a vertical grid on each wall (10 wide x 20 tall)

class CathedralScene extends SceneController {
    constructor() {
        super('cathedral');
        this.gridWidth = 10; // Number of painting columns per wall
        this.gridHeight = 20; // Number of painting rows per wall
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

        // Load paintings on cathedral walls
        this.loadCathedralPaintings(group, textureStyle);
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
        const textureLoader = new THREE.TextureLoader();

        // Initialize painting groups tracking
        if (!window.cathedralPaintingGroups) {
            window.cathedralPaintingGroups = [];
        }

        // Sort walls by height (bottom to top) for bottom-up loading
        const sortedWalls = [...this.wallSegments].sort((a, b) => a.position.y - b.position.y);

        for (let i = 0; i < sortedWalls.length; i++) {
            const wall = sortedWalls[i];

            // Get a Wikipedia image
            const imageData = await getWikipediaImage();
            if (!imageData || !imageData.imageUrl) {
                if (typeof loadedImagesCount !== 'undefined') loadedImagesCount++;
                continue;
            }

            // Create painting frame
            const frameWidth = this.segmentWidth * 0.85;
            const frameHeight = this.segmentHeight * 0.85;
            const frameDepth = 0.05;

            // Frame
            const frameGeometry = new THREE.BoxGeometry(frameWidth + 0.08, frameHeight + 0.08, frameDepth);
            const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x4A3728 });
            const frame = new THREE.Mesh(frameGeometry, frameMaterial);

            // Canvas
            const canvasGeometry = new THREE.PlaneGeometry(frameWidth, frameHeight);
            const canvasMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
            const canvas = new THREE.Mesh(canvasGeometry, canvasMaterial);
            canvas.position.z = frameDepth / 2 + 0.001;

            // Load texture
            textureLoader.load(imageData.imageUrl, (texture) => {
                canvas.material.map = texture;
                canvas.material.needsUpdate = true;
            });

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
            plate.position.y = -frameHeight / 2 - 0.05;
            plate.position.z = frameDepth / 2 + 0.001;

            // Group all painting elements
            const paintingGroup = new THREE.Group();
            paintingGroup.add(frame);
            paintingGroup.add(canvas);
            paintingGroup.add(plate);

            // Position on wall (slightly in front, facing inward toward center)
            paintingGroup.position.copy(wall.position);

            // Adjust position based on wall direction to keep paintings inside room
            if (wall.userData.direction === 'north') {
                paintingGroup.position.z -= 0.1; // Move inward (toward center/south)
            } else if (wall.userData.direction === 'south') {
                paintingGroup.position.z += 0.1; // Move inward (toward center/north)
            } else if (wall.userData.direction === 'east') {
                paintingGroup.position.x -= 0.1; // Move inward (toward center/west)
            } else if (wall.userData.direction === 'west') {
                paintingGroup.position.x += 0.1; // Move inward (toward center/east)
            }

            paintingGroup.rotation.y = wall.rotation.y;

            group.add(paintingGroup);

            // Track painting group for reload functionality
            window.cathedralPaintingGroups[i] = paintingGroup;

            // Update progress tracking
            if (typeof loadedImagesCount !== 'undefined') loadedImagesCount++;
        }
    }

    getFloorMaterial(textureStyle) {
        const textureLoader = new THREE.TextureLoader();

        if (textureStyle === 'backrooms') {
            const floorTexture = textureLoader.load('https://i.imgur.com/tSS8RvD.jpeg');
            floorTexture.wrapS = THREE.RepeatWrapping;
            floorTexture.wrapT = THREE.RepeatWrapping;
            floorTexture.repeat.set(10, 10);
            return new THREE.MeshLambertMaterial({ map: floorTexture });
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

    // No minimap for cathedral
    showMinimap() {
        return false;
    }
}

// Register the cathedral scene
registerScene('cathedral', new CathedralScene());
