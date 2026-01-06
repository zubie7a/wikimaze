// Gallery Scene Controller
// A massive circular room (50-sided polygon) with paintings on each wall

class GalleryScene extends SceneController {
    constructor() {
        super('gallery');
        this.numSides = 20; // 20-sided polygon
        this.radius = 20; // Distance from center to walls
        this.wallHeight = 3; // Same as WALL_HEIGHT in maze.js
        this.galleryWalls = []; // Store wall meshes for painting loading
    }

    // No grid-based walls - we create custom 3D geometry
    generateLayout(size) {
        // Return empty walls - gallery uses custom geometry
        const horizontalWalls = Array(size + 1).fill(null).map(() => Array(size).fill(false));
        const verticalWalls = Array(size).fill(null).map(() => Array(size + 1).fill(false));
        return { horizontalWalls, verticalWalls };
    }

    // Create the polygon room with walls
    createContent(group, textureStyle, size) {
        console.log('Gallery createContent called', { textureStyle, size, numSides: this.numSides });
        this.galleryWalls = [];

        const angleStep = (Math.PI * 2) / this.numSides;
        const wallWidth = 2 * this.radius * Math.tan(angleStep / 2); // Width of each wall segment

        // Create floor - large circle
        const floorGeometry = new THREE.CircleGeometry(this.radius + 2, 64);
        const floorMaterial = this.getFloorMaterial(textureStyle);
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.5;
        group.add(floor);

        // Create ceiling
        const ceilingGeometry = new THREE.CircleGeometry(this.radius + 2, 64);
        const ceilingMaterial = this.getCeilingMaterial(textureStyle);
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = this.wallHeight - 0.5;
        group.add(ceiling);

        // Create walls arranged in a polygon
        const wallMaterial = this.getWallMaterial(textureStyle);

        for (let i = 0; i < this.numSides; i++) {
            const angle = i * angleStep + angleStep / 2; // Center of each segment

            // Wall position on the polygon edge
            const wallX = Math.cos(angle) * this.radius;
            const wallZ = Math.sin(angle) * this.radius;

            // Create wall
            const wallGeometry = new THREE.PlaneGeometry(wallWidth, this.wallHeight);
            const wall = new THREE.Mesh(wallGeometry, wallMaterial.clone());

            // Position wall
            wall.position.set(wallX, this.wallHeight / 2 - 0.5, wallZ);

            // Use lookAt to face the center, then rotate 180 degrees since planes face +Z
            wall.lookAt(0, this.wallHeight / 2 - 0.5, 0);

            // Store wall data for painting loading
            wall.userData = {
                wallIndex: i,
                isGalleryWall: true,
                angle: angle
            };

            this.galleryWalls.push(wall);
            group.add(wall);
        }

        // Store reference for painting loading
        window.galleryWalls = this.galleryWalls;
        window.galleryRadius = this.radius;
        window.galleryNumSides = this.numSides;

        // Load paintings on gallery walls
        // Initialize progress tracking (global variables from maze.js)
        try {
            isLoadingImages = true;
            loadedImagesCount = 0;
            totalImagesToLoad = this.numSides;
        } catch (e) {
            console.log('Global loading counters not available yet');
        }

        this.sceneGroup = group;
        this.loadGalleryPaintings(group, textureStyle);
    }

    async loadGalleryPaintings(group, textureStyle) {
        const textureLoader = new THREE.TextureLoader();

        // Initialize gallery painting groups array if needed
        if (!window.galleryPaintingGroups) {
            window.galleryPaintingGroups = [];
        }

        // Create array of wall indices for batching
        const wallIndices = this.galleryWalls.map((_, i) => i);

        // Load paintings in batches using generic utility
        await processInBatches(
            wallIndices,
            (i) => this.createPaintingForWall(i, group, textureLoader, textureStyle),
            5 // Batch size: 5 images at a time for better responsiveness
        );

        console.log('Gallery painting load complete');
        if (typeof isLoadingImages !== 'undefined') isLoadingImages = false;
    }

    async createPaintingForWall(i, group, textureLoader, textureStyle) {
        const wall = this.galleryWalls[i];

        // Get a Wikipedia image
        const imageData = await getWikipediaImage();
        if (!imageData || !imageData.imageUrl) {
            if (typeof loadedImagesCount !== 'undefined') loadedImagesCount++;
            return;
        }

        // Create painting frame
        const frameWidth = 1.5;
        const frameHeight = 1.2;
        const frameDepth = 0.05;

        // Frame
        const frameGeometry = new THREE.BoxGeometry(frameWidth + 0.1, frameHeight + 0.1, frameDepth);
        const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x4A3728 });
        const frame = new THREE.Mesh(frameGeometry, frameMaterial);

        // Painting canvas
        const canvasGeometry = new THREE.PlaneGeometry(frameWidth, frameHeight);
        const canvasMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const canvas = new THREE.Mesh(canvasGeometry, canvasMaterial);
        canvas.position.z = frameDepth / 2 + 0.001;

        // Load texture (convert callback to promise)
        await new Promise((resolve) => {
            textureLoader.load(imageData.imageUrl, (texture) => {
                canvas.material.map = texture;
                canvas.material.needsUpdate = true;
                resolve();
            });
        });

        // Create title plate
        const plateWidth = frameWidth * 0.8;
        const plateHeight = 0.12;
        const plateGeometry = new THREE.PlaneGeometry(plateWidth, plateHeight);

        // Create canvas for title text (matching maze style)
        const titleCanvas = document.createElement('canvas');
        titleCanvas.width = 256;
        titleCanvas.height = 32;
        const ctx = titleCanvas.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Dark translucent
        ctx.fillRect(0, 0, 256, 32);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Truncate title if too long
        let title = imageData.title || 'Untitled';
        if (title.length > 30) title = title.substring(0, 27) + '...';
        ctx.fillText(title, 128, 16);

        const plateTexture = new THREE.CanvasTexture(titleCanvas);
        const plateMaterial = new THREE.MeshBasicMaterial({
            map: plateTexture,
            transparent: true
        });
        const plate = new THREE.Mesh(plateGeometry, plateMaterial);
        plate.position.y = -frameHeight / 2 - 0.12;
        plate.position.z = frameDepth / 2 + 0.001;

        // Group frame, canvas and plate
        const paintingGroup = new THREE.Group();
        paintingGroup.add(frame);
        paintingGroup.add(canvas);
        paintingGroup.add(plate);

        // Position painting on wall (slightly in front of wall, toward center)
        const wallAngle = wall.userData.angle;
        const paintingDist = this.radius - 0.15; // Slightly in front of wall
        const paintingX = Math.cos(wallAngle) * paintingDist;
        const paintingZ = Math.sin(wallAngle) * paintingDist;
        paintingGroup.position.set(paintingX, 1.2, paintingZ);

        // Use lookAt to face the center
        paintingGroup.lookAt(0, 1.2, 0);

        group.add(paintingGroup);

        // Track painting group for reload functionality
        window.galleryPaintingGroups[i] = paintingGroup;

        // Update progress tracking
        if (typeof loadedImagesCount !== 'undefined') loadedImagesCount++;

        // Add ceiling light above painting (backrooms only)
        if (textureStyle === 'backrooms') {
            const lampSize = 0.5; // Same as maze.js
            const lampHeight = 0.05;
            const lampY = this.wallHeight - 0.52; // Just below ceiling

            // Same material as maze.js
            const lampMaterial = new THREE.MeshBasicMaterial({
                color: 0xFFFAE6, // Warm fluorescent white
                side: THREE.DoubleSide
            });

            // Create lamp fixture (square box like maze.js)
            const lampGeometry = new THREE.BoxGeometry(lampSize, lampHeight, lampSize);
            const lamp = new THREE.Mesh(lampGeometry, lampMaterial);

            // Position above painting (slightly inward toward center)
            const lampDist = this.radius - 0.8;
            const lampX = Math.cos(wallAngle) * lampDist;
            const lampZ = Math.sin(wallAngle) * lampDist;
            lamp.position.set(lampX, lampY, lampZ);

            // Rotate to face center (same as walls)
            lamp.lookAt(0, lampY, 0);

            group.add(lamp);

            // Add point light below lamp (same as maze.js)
            const lampLight = new THREE.PointLight(0xFFF5E0, 0.8, 5, 1.5);
            lampLight.position.set(lampX, lampY - 0.1, lampZ);
            group.add(lampLight);
        }
    }

        console.log('Gallery painting load complete');
        if (typeof isLoadingImages !== 'undefined') isLoadingImages = false;
    }

    getFloorMaterial(textureStyle) {
        const textureLoader = new THREE.TextureLoader();

        if (textureStyle === 'backrooms') {
            // Backrooms carpet texture
            const floorTexture = textureLoader.load('https://i.imgur.com/tSS8RvD.jpeg');
            floorTexture.wrapS = THREE.RepeatWrapping;
            floorTexture.wrapT = THREE.RepeatWrapping;
            floorTexture.repeat.set(10, 10);
            return new THREE.MeshLambertMaterial({ map: floorTexture });
        } else if (textureStyle === 'entirewall') {
            return new THREE.MeshLambertMaterial({ color: 0xE8E8E8 }); // Whiteish
        }
        // W95 style - brown floor
        return new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    }

    getCeilingMaterial(textureStyle) {
        const textureLoader = new THREE.TextureLoader();

        if (textureStyle === 'backrooms') {
            return new THREE.MeshLambertMaterial({ color: 0xF5F5DC }); // Fluorescent off-white
        } else if (textureStyle === 'entirewall') {
            return new THREE.MeshLambertMaterial({ color: 0x505050 }); // Grayish
        }
        // W95 style - ceiling texture
        const ceilingTexture = textureLoader.load('https://i.imgur.com/yd7jpxq.jpeg');
        ceilingTexture.wrapS = THREE.RepeatWrapping;
        ceilingTexture.wrapT = THREE.RepeatWrapping;
        ceilingTexture.repeat.set(10, 10);
        return new THREE.MeshLambertMaterial({ map: ceilingTexture });
    }

    getWallMaterial(textureStyle) {
        const textureLoader = new THREE.TextureLoader();

        if (textureStyle === 'backrooms') {
            // Backrooms wallpaper texture
            const wallTexture = textureLoader.load('https://i.imgur.com/FzvYZWy.png');
            wallTexture.wrapS = THREE.RepeatWrapping;
            wallTexture.wrapT = THREE.RepeatWrapping;
            wallTexture.repeat.set(2, 1);
            return new THREE.MeshLambertMaterial({ map: wallTexture });
        } else if (textureStyle === 'entirewall') {
            return new THREE.MeshLambertMaterial({ color: 0x000000 }); // Black
        }
        // W95 style - brick texture
        const brickTexture = textureLoader.load('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSUg8n8t7AKXzKt5-Sr9O96avECwEZnGShJWQ&s');
        brickTexture.wrapS = THREE.RepeatWrapping;
        brickTexture.wrapT = THREE.RepeatWrapping;
        brickTexture.repeat.set(2, 2);
        return new THREE.MeshLambertMaterial({ map: brickTexture });
    }

    // Dark background, no fog
    getSceneSetup() {
        return {
            background: 0x000000,
            fog: null,
            ambientIntensity: 0.8 // Brighter for gallery
        };
    }

    // Spawn at center
    getStartPosition(size) {
        return { x: 0, z: 0, rotation: 0 };
    }

    // No minimap for gallery
    showMinimap() {
        return false;
    }
}

// Register the gallery scene
registerScene('gallery', new GalleryScene());
