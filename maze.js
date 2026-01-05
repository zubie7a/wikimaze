// Maze dimensions
const MAZE_SIZE = 10;
let openspaceSize = 7; // Open space size (variable, always odd for center doors)
const OPENSPACE_SIZES = [3, 5, 7]; // Possible room sizes
const CELL_SIZE = 2;

// Get effective maze size based on scene mode
function getEffectiveSize() {
    return sceneMode === 'openspace' ? openspaceSize : MAZE_SIZE;
}

// Get a random odd size for openspace rooms
function getRandomOpenspaceSize() {
    return OPENSPACE_SIZES[Math.floor(Math.random() * OPENSPACE_SIZES.length)];
}
const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.05; // Very thin flat walls
const NUM_WIKIPEDIA_WALLS = 40; // Number of walls to have Wikipedia textures
const FILL_ALL_WALLS_WITH_WIKIPEDIA = true; // If true, fill entire maze with Wikipedia walls; if false, use NUM_WIKIPEDIA_WALLS limit

// Camera settings
let camera, scene, renderer;
let mazeData = null; // Store maze for collision detection
let minimapCanvas = null;
let minimapCtx = null;
let minimapVisible = true; // Minimap visibility state
let collisionsEnabled = true; // Wall collision detection
let statsDiv = null; // Stats display element
let useRandomImages = true; // Whether to use random images or topic-based search
let searchTopic = ''; // Topic to search for Wikipedia images
let textureStyle = 'w95'; // 'w95' (framed with bricks), 'entirewall' (image covers entire wall), or 'backrooms'
let isLoadingImages = false; // Whether images are currently being loaded
let loadedImagesCount = 0; // Number of images loaded so far
let totalImagesToLoad = 0; // Total number of images to load
let cancelLoading = false; // Flag to cancel current loading operation
let statsVisible = false; // Stats visibility state
let sceneMode = 'maze'; // 'maze' or 'openspace'
let wikipediaWalls = new Set(); // Track which walls have Wikipedia textures (format: "type-x-y")
let globalWallMeshMap = null; // Global reference to wall mesh map for loading paintings on demand
let globalCreateFramedPicture = null; // Global reference to createFramedPicture function
let paintingPositions = new Map(); // Store painting world positions (key: "wallKey-side", value: {centerY, plateY})
let frameGroups = new Map(); // Store frame groups per wall (key: "wallKey-side", value: {frameGroup, wall})
let isTransitioningRoom = false; // Prevent concurrent door crossings in openspace mode
let mazeGeneration = 0; // Counter to invalidate stale loading operations


// Player position and rotation
let playerPosition = { x: 0, z: 0 };
let playerRotation = 0;
const MOVE_SPEED = 0.1;
const AUTO_MOVE_SPEED = 0.02; // Slower speed for automatic movement
const ROTATION_SPEED = 0.05;

// Manual controls
let controls = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

// Auto mode: pathfinding-based navigation
let autoMode = true; // Start with auto mode enabled by default
let isTurning = false; // Whether we're currently turning
let targetRotation = 0; // Target rotation angle when turning
let navigationPath = []; // Path to follow (array of {x, z} cell coordinates)
let currentPathIndex = 0; // Current index in the path
let targetCell = null; // Current target cell {x, z}
let visitedCells = new Set(); // Track visited cells for navigation prioritization
let isViewingPainting = false; // Whether currently viewing a painting
let viewingPaintingTimer = 0; // Timer for viewing painting
let viewingPhase = 0; // 0: look at center, 1: look at plate, 2: reset to horizontal
let paintingLookDirection = null; // Direction to look at painting (yaw)
let paintingCenterPitch = 0; // Pitch angle to look at painting center
let platePitch = 0; // Pitch angle to look at plate
let currentPitch = 0; // Current vertical angle (pitch)
let originalDirection = null; // Original direction before looking at painting
const PLAYER_EYE_HEIGHT = 1.2; // Player camera height
const TURN_SPEED = 0.03; // Speed of gradual turning
const PITCH_SPEED = 0.02; // Speed of vertical look
const PHASE_TIME = 90; // 1.5 seconds per phase at 60fps

// Generate maze with walls on boundaries
// Returns: { horizontalWalls, verticalWalls }
// horizontalWalls[y][x] = true means wall between cell (x,y) and (x,y+1)
// verticalWalls[y][x] = true means wall between cell (x,y) and (x+1,y)
function generateMaze(size) {
    // Initialize all walls as present
    const horizontalWalls = Array(size + 1).fill(null).map(() => Array(size).fill(true));
    const verticalWalls = Array(size).fill(null).map(() => Array(size + 1).fill(true));
    
    // Mark outer boundaries
    for (let x = 0; x < size; x++) {
        horizontalWalls[0][x] = true; // Top boundary
        horizontalWalls[size][x] = true; // Bottom boundary
    }
    for (let y = 0; y < size; y++) {
        verticalWalls[y][0] = true; // Left boundary
        verticalWalls[y][size] = true; // Right boundary
    }
    
    // Track visited cells
    const visited = Array(size).fill(null).map(() => Array(size).fill(false));
    
    // Recursive backtracking to carve paths
    function carve(x, y) {
        visited[y][x] = true;
        
        const directions = [
            [0, -1], // North
            [1, 0],  // East
            [0, 1],  // South
            [-1, 0]  // West
        ];
        
        // Shuffle directions
        for (let i = directions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [directions[i], directions[j]] = [directions[j], directions[i]];
        }
        
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < size && ny >= 0 && ny < size && !visited[ny][nx]) {
                // Remove wall between current and next cell
                if (dx === 0) {
                    // Vertical movement - remove horizontal wall
                    const wallY = dy === -1 ? y : y + 1;
                    horizontalWalls[wallY][x] = false;
                } else {
                    // Horizontal movement - remove vertical wall
                    const wallX = dx === -1 ? x : x + 1;
                    verticalWalls[y][wallX] = false;
                }
                
                carve(nx, ny);
            }
        }
    }
    
    // Start carving from (0, 0)
    carve(0, 0);
    
    // Ensure all cells are visited (no isolated sections)
    // If any cells weren't reached, connect them
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!visited[y][x]) {
                // Connect this isolated cell to a visited neighbor
                // Try to connect to any visited neighbor
                if (x > 0 && visited[y][x - 1]) {
                    verticalWalls[y][x] = false; // Connect to left
                    carve(x, y);
                } else if (x < size - 1 && visited[y][x + 1]) {
                    verticalWalls[y][x + 1] = false; // Connect to right
                    carve(x, y);
                } else if (y > 0 && visited[y - 1][x]) {
                    horizontalWalls[y][x] = false; // Connect to top
                    carve(x, y);
                } else if (y < size - 1 && visited[y + 1][x]) {
                    horizontalWalls[y + 1][x] = false; // Connect to bottom
                    carve(x, y);
                }
            }
        }
    }
    
    // Entrance and exit remain walled (no gaps)
    
    // Post-processing: Remove some walls to create more open spaces
    // This makes the maze more spacious while keeping it connected
    const openSpaceChance = 0.3; // 30% chance to remove each internal wall
    for (let y = 1; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // Remove some horizontal walls (except boundaries)
            if (Math.random() < openSpaceChance) {
                horizontalWalls[y][x] = false;
            }
        }
    }
    for (let y = 0; y < size; y++) {
        for (let x = 1; x < size; x++) {
            // Remove some vertical walls (except boundaries)
            if (Math.random() < openSpaceChance) {
                verticalWalls[y][x] = false;
            }
        }
    }
    
    // If in open space mode, remove ALL internal walls
    if (sceneMode === 'openspace') {
        // Remove all internal horizontal walls (keep boundaries at y=0 and y=size)
        for (let y = 1; y < size; y++) {
            for (let x = 0; x < size; x++) {
                horizontalWalls[y][x] = false;
            }
        }
        // Remove all internal vertical walls (keep boundaries at x=0 and x=size)
        for (let y = 0; y < size; y++) {
            for (let x = 1; x < size; x++) {
                verticalWalls[y][x] = false;
            }
        }
        // Note: Door walls are kept for visual but collision is handled separately in isValidPosition
    }
    
    // If in alley mode, create a single-cell wide endless corridor
    if (sceneMode === 'alley') {
        // Reset all walls first
        for (let y = 0; y <= size; y++) {
            for (let x = 0; x < size; x++) {
                horizontalWalls[y][x] = false;
            }
        }
        for (let y = 0; y < size; y++) {
            for (let x = 0; x <= size; x++) {
                verticalWalls[y][x] = false;
            }
        }
        
        // Create a single alley in the middle row (z = size/2)
        const alleyZ = Math.floor(size / 2);
        
        // Add walls on north side of alley (horizontal wall at alleyZ)
        for (let x = 0; x < size; x++) {
            horizontalWalls[alleyZ][x] = true;
        }
        
        // Add walls on south side of alley (horizontal wall at alleyZ + 1)
        for (let x = 0; x < size; x++) {
            horizontalWalls[alleyZ + 1][x] = true;
        }
        
        // Remove walls at the ends to allow wrapping (no east/west boundaries)
        // The vertical walls at x=0 and x=size are already false
    }
    
    return { horizontalWalls, verticalWalls };
}


// Cache for random Wikipedia images
let randomImageResults = [];
let randomImageIndex = 0;

// Fetch a batch of random Wikipedia images
async function fetchRandomImageBatch() {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            // Get 50 random Wikipedia articles with thumbnails
            const response = await fetch(
                'https://en.wikipedia.org/w/api.php?action=query&generator=random&grnnamespace=0&grnlimit=50&prop=pageimages&pithumbsize=400&format=json&origin=*'
            );
            const data = await response.json();
            
            const pages = data.query?.pages;
            if (pages) {
                const results = Object.values(pages)
                    .filter(page => page.thumbnail)
                    .map(page => ({
                        imageUrl: page.thumbnail.source,
                        title: page.title
                    }));
                
                if (results.length > 0) {
                    // Shuffle for variety
                    for (let i = results.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [results[i], results[j]] = [results[j], results[i]];
                    }
                    return results;
                }
            }
        } catch (error) {
            console.log('Error fetching random Wikipedia images batch, retrying...', error);
        }
    }
    return [];
}

// Fetch a random Wikipedia image and title (uses batching for efficiency)
async function fetchRandomWikipediaImage() {
    // If cache is empty or exhausted, fetch a new batch
    if (randomImageIndex >= randomImageResults.length) {
        randomImageResults = await fetchRandomImageBatch();
        randomImageIndex = 0;
        
        if (randomImageResults.length === 0) {
            return null;
        }
    }
    
    const result = randomImageResults[randomImageIndex];
    randomImageIndex++;
    return result;
}

// Fetch Wikipedia images related to a topic
let topicSearchResults = []; // Cache of search results for the current topic
let topicSearchIndex = 0; // Current index in the search results
let topicResultsFetched = false; // Whether we've already fetched results for this topic

async function fetchTopicWikipediaImage(topic) {
    // If we have cached results, use them (cycling through if needed)
    if (topicSearchResults.length > 0 && topicResultsFetched) {
        // Cycle through results if we've used them all
        if (topicSearchIndex >= topicSearchResults.length) {
            topicSearchIndex = 0;
            // Re-shuffle for variety when cycling
            for (let i = topicSearchResults.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [topicSearchResults[i], topicSearchResults[j]] = [topicSearchResults[j], topicSearchResults[i]];
            }
        }
        const result = topicSearchResults[topicSearchIndex];
        topicSearchIndex++;
        return result;
    }
    
    // Fetch new results (only once per topic)
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            // Search for articles related to the topic
            const searchResponse = await fetch(
                `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=200&format=json&origin=*`
            );
            const searchData = await searchResponse.json();
            
            const searchResults = searchData.query?.search;
            if (!searchResults || searchResults.length === 0) {
                console.log('No search results found for topic:', topic);
                return null;
            }
            
            // Get thumbnails for the search results (batch in groups of 50 due to API limits)
            const allPages = [];
            const batchSize = 50;
            for (let i = 0; i < searchResults.length; i += batchSize) {
                const batch = searchResults.slice(i, i + batchSize);
                const pageIds = batch.map(r => r.pageid).join('|');
                const imagesResponse = await fetch(
                    `https://en.wikipedia.org/w/api.php?action=query&pageids=${pageIds}&prop=pageimages&pithumbsize=400&format=json&origin=*`
                );
                const imagesData = await imagesResponse.json();
                
                const pages = imagesData.query?.pages;
                if (pages) {
                    allPages.push(...Object.values(pages));
                }
            }
            
            if (allPages.length > 0) {
                // Filter to only pages with thumbnails and cache them
                topicSearchResults = allPages
                    .filter(page => page.thumbnail)
                    .map(page => ({
                        imageUrl: page.thumbnail.source,
                        title: page.title
                    }));
                
                // Shuffle the results for variety
                for (let i = topicSearchResults.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [topicSearchResults[i], topicSearchResults[j]] = [topicSearchResults[j], topicSearchResults[i]];
                }
                
                topicSearchIndex = 0;
                topicResultsFetched = true;
                
                if (topicSearchResults.length > 0) {
                    const result = topicSearchResults[topicSearchIndex];
                    topicSearchIndex++;
                    return result;
                }
            }
        } catch (error) {
            console.log('Error fetching topic Wikipedia image, retrying...', error);
        }
    }
    return null;
}

// Get a Wikipedia image (either random or topic-based)
async function getWikipediaImage() {
    if (useRandomImages || !searchTopic.trim()) {
        return await fetchRandomWikipediaImage();
    } else {
        return await fetchTopicWikipediaImage(searchTopic);
    }
}

// Create the 3D maze from boundary walls
async function createMaze(wallData) {
    const group = new THREE.Group();
    const { horizontalWalls, verticalWalls } = wallData;
    const SIZE = getEffectiveSize(); // Use effective size for this scene
    
    // Create floor - color/texture depends on texture style
    const floorGeometry = new THREE.PlaneGeometry(
        SIZE * CELL_SIZE,
        SIZE * CELL_SIZE
    );
    let floorMaterial;
    if (textureStyle === 'entirewall') {
        floorMaterial = new THREE.MeshLambertMaterial({ color: 0xE8E8E8 }); // Whiteish
    } else if (textureStyle === 'backrooms') {
        // Backrooms carpet texture
        const floorTextureLoader = new THREE.TextureLoader();
        const floorTexture = floorTextureLoader.load(
            'https://i.imgur.com/tSS8RvD.jpeg',
            function(texture) {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(SIZE * 2, SIZE * 2); // Tile the carpet
            }
        );
        floorMaterial = new THREE.MeshLambertMaterial({ map: floorTexture });
    } else {
        floorMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown (W95)
    }
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    group.add(floor);
    
    // Create ceiling - texture/color depends on texture style
    const ceilingGeometry = new THREE.PlaneGeometry(
        SIZE * CELL_SIZE,
        SIZE * CELL_SIZE
    );
    let ceilingMaterial;
    if (textureStyle === 'entirewall') {
        ceilingMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x505050 // Grayish
        });
    } else if (textureStyle === 'backrooms') {
        ceilingMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xF5F5DC // Fluorescent off-white/beige
        });
    } else {
        // W95 style - use ceiling texture
        const ceilingTextureLoader = new THREE.TextureLoader();
        const ceilingTexture = ceilingTextureLoader.load(
            'https://i.imgur.com/yd7jpxq.jpeg',
            function(texture) {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(SIZE, SIZE); // Tile based on maze size
            }
        );
        ceilingMaterial = new THREE.MeshLambertMaterial({ 
            map: ceilingTexture
        });
    }
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_HEIGHT - 0.5;
    group.add(ceiling);
    
    // In alley mode, create end darkening planes (not moving fog)
    if (sceneMode === 'alley') {
        const alleyZ = Math.floor(MAZE_SIZE / 2);
        const alleyWorldZ = (alleyZ - MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
        const halfAlleyLength = (MAZE_SIZE / 2) * CELL_SIZE;
        
        window.alleyFogPlanes = null; // Not using moving planes
        window.alleyWorldZ = alleyWorldZ;
        
        // Create gradient darkness at each end of the alley (fixed position)
        // Spread out layers for the outer zone
        const numOuterLayers = 15;
        const outerZoneLength = CELL_SIZE * 3; // 3 cells of gradual darkening
        
        for (let i = 0; i < numOuterLayers; i++) {
            const t = i / (numOuterLayers - 1); // 0 to 1
            const distFromEnd = CELL_SIZE * 1.5 + t * outerZoneLength; // Start 1.5 cells from end
            const opacity = 0.03 + (1 - t) * 0.08;
            
            const fogMaterial = new THREE.MeshBasicMaterial({
                color: 0x000000,
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
            westDark.position.set(-halfAlleyLength + distFromEnd, WALL_HEIGHT / 2 - 0.5, alleyWorldZ);
            group.add(westDark);
            
            // East end
            const eastDark = new THREE.Mesh(
                new THREE.PlaneGeometry(CELL_SIZE * 2, WALL_HEIGHT + 2),
                fogMaterial.clone()
            );
            eastDark.rotation.y = Math.PI / 2;
            eastDark.position.set(halfAlleyLength - distFromEnd, WALL_HEIGHT / 2 - 0.5, alleyWorldZ);
            group.add(eastDark);
        }
        
        // Dense layers very close to the end (last 1.5 cells) - tightly packed
        const numDenseLayers = 30;
        const denseZoneLength = CELL_SIZE * 1.5;
        
        for (let i = 0; i < numDenseLayers; i++) {
            const t = i / (numDenseLayers - 1); // 0 to 1
            const distFromEnd = t * denseZoneLength;
            const opacity = 0.08 + (1 - t) * 0.15; // Higher opacity near the very end
            
            const fogMaterial = new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: opacity,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            
            // West end dense fog
            const westDense = new THREE.Mesh(
                new THREE.PlaneGeometry(CELL_SIZE * 2, WALL_HEIGHT + 2),
                fogMaterial.clone()
            );
            westDense.rotation.y = Math.PI / 2;
            westDense.position.set(-halfAlleyLength + distFromEnd, WALL_HEIGHT / 2 - 0.5, alleyWorldZ);
            group.add(westDense);
            
            // East end dense fog
            const eastDense = new THREE.Mesh(
                new THREE.PlaneGeometry(CELL_SIZE * 2, WALL_HEIGHT + 2),
                fogMaterial.clone()
            );
            eastDense.rotation.y = Math.PI / 2;
            eastDense.position.set(halfAlleyLength - distFromEnd, WALL_HEIGHT / 2 - 0.5, alleyWorldZ);
            group.add(eastDense);
        }
    }
    
    // In openspace mode, create doors on each boundary wall
    if (sceneMode === 'openspace') {
        const halfSize = (SIZE * CELL_SIZE) / 2;
        const doorWidth = CELL_SIZE * 0.6;
        const doorHeight = WALL_HEIGHT * 0.85;
        const doorY = doorHeight / 2 - 0.5;
        
        const doorMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x000000,
            side: THREE.DoubleSide
        });
        
        // Store door positions globally for crossing detection
        window.openspaceDoors = {
            north: { z: -halfSize, minX: -doorWidth/2, maxX: doorWidth/2 },
            south: { z: halfSize, minX: -doorWidth/2, maxX: doorWidth/2 },
            west: { x: -halfSize, minZ: -doorWidth/2, maxZ: doorWidth/2 },
            east: { x: halfSize, minZ: -doorWidth/2, maxZ: doorWidth/2 }
        };
        
        // North door (z = -halfSize, horizontal wall at y=0)
        const northDoor = new THREE.Mesh(
            new THREE.PlaneGeometry(doorWidth, doorHeight),
            doorMaterial.clone()
        );
        northDoor.position.set(0, doorY, -halfSize + WALL_THICKNESS/2 + 0.01);
        group.add(northDoor);
        
        // South door (z = halfSize, horizontal wall at y=MAZE_SIZE)
        const southDoor = new THREE.Mesh(
            new THREE.PlaneGeometry(doorWidth, doorHeight),
            doorMaterial.clone()
        );
        southDoor.position.set(0, doorY, halfSize - WALL_THICKNESS/2 - 0.01);
        southDoor.rotation.y = Math.PI;
        group.add(southDoor);
        
        // West door (x = -halfSize, vertical wall at x=0)
        const westDoor = new THREE.Mesh(
            new THREE.PlaneGeometry(doorWidth, doorHeight),
            doorMaterial.clone()
        );
        westDoor.rotation.y = Math.PI / 2;
        westDoor.position.set(-halfSize + WALL_THICKNESS/2 + 0.01, doorY, 0);
        group.add(westDoor);
        
        // East door (x = halfSize, vertical wall at x=MAZE_SIZE)
        const eastDoor = new THREE.Mesh(
            new THREE.PlaneGeometry(doorWidth, doorHeight),
            doorMaterial.clone()
        );
        eastDoor.rotation.y = -Math.PI / 2;
        eastDoor.position.set(halfSize - WALL_THICKNESS/2 - 0.01, doorY, 0);
        group.add(eastDoor);
    }
    
    // Texture loader for Wikipedia images
    const textureLoader = new THREE.TextureLoader();
    
    // Default wall material - depends on texture style
    let defaultWallMaterial;
    if (textureStyle === 'entirewall') {
        // Black walls for entire wall style
        defaultWallMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x000000
        });
    } else if (textureStyle === 'backrooms') {
        // Backrooms wallpaper texture - stretched, not tiled
        const backroomsTexture = textureLoader.load(
            'https://i.imgur.com/FzvYZWy.png',
            function(texture) {
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                // No repeat - stretch to fit each wall segment
            }
        );
        defaultWallMaterial = new THREE.MeshLambertMaterial({ 
            map: backroomsTexture
        });
    } else {
        // Load brick texture for W95 style
        const defaultWallTexture = textureLoader.load(
            'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSUg8n8t7AKXzKt5-Sr9O96avECwEZnGShJWQ&s',
            function(texture) {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(2, 2);
            }
        );
        defaultWallMaterial = new THREE.MeshLambertMaterial({ 
            map: defaultWallTexture
        });
    }
    
    // Collect all wall positions (only walls that exist after pruning)
    // This ensures we don't try to assign Wikipedia images to pruned walls
    const wallPositions = [];
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (horizontalWalls[y] && horizontalWalls[y][x]) {
                wallPositions.push({ type: 'horizontal', x, y });
            }
        }
    }
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            if (verticalWalls[y] && verticalWalls[y][x]) {
                wallPositions.push({ type: 'vertical', x, y });
            }
        }
    }
    
    // Select walls for Wikipedia images
    const wikipediaWallKeys = new Set();
    
    // Helper to check if a wall has a door (openspace mode only)
    const isDoorWall = (type, x, y) => {
        if (sceneMode !== 'openspace') return false;
        const center = Math.floor(SIZE / 2);
        // North door: horizontal at y=0, x=center
        if (type === 'horizontal' && y === 0 && x === center) return true;
        // South door: horizontal at y=SIZE, x=center
        if (type === 'horizontal' && y === SIZE && x === center) return true;
        // West door: vertical at x=0, y=center
        if (type === 'vertical' && x === 0 && y === center) return true;
        // East door: vertical at x=SIZE, y=center
        if (type === 'vertical' && x === SIZE && y === center) return true;
        return false;
    };
    
    if (FILL_ALL_WALLS_WITH_WIKIPEDIA) {
        // Fill entire maze with Wikipedia walls (except door walls)
        for (const wallPos of wallPositions) {
            if (!isDoorWall(wallPos.type, wallPos.x, wallPos.y)) {
                const wallKey = `${wallPos.type}-${wallPos.x}-${wallPos.y}`;
                wikipediaWallKeys.add(wallKey);
            }
        }
    } else {
        // Randomly select walls up to NUM_WIKIPEDIA_WALLS limit
        const numWikipediaWalls = Math.min(NUM_WIKIPEDIA_WALLS, wallPositions.length);
        const wikipediaWallIndices = new Set();
        while (wikipediaWallIndices.size < numWikipediaWalls) {
            wikipediaWallIndices.add(Math.floor(Math.random() * wallPositions.length));
        }
        
        for (const idx of wikipediaWallIndices) {
            const wallPos = wallPositions[idx];
            // Skip door walls
            if (!isDoorWall(wallPos.type, wallPos.x, wallPos.y)) {
                const wallKey = `${wallPos.type}-${wallPos.x}-${wallPos.y}`;
                wikipediaWallKeys.add(wallKey);
            }
        }
    }
    
    // Create a map to track which walls should get Wikipedia images
    const wallMeshMap = new Map(); // Maps wall key to mesh object
    globalWallMeshMap = wallMeshMap; // Store globally for on-demand loading
    
    // Create all horizontal walls with brick texture first
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (horizontalWalls[y] && horizontalWalls[y][x]) {
                const wallGeometry = new THREE.BoxGeometry(
                    CELL_SIZE,
                    WALL_HEIGHT,
                    WALL_THICKNESS
                );
                
                const wall = new THREE.Mesh(wallGeometry, defaultWallMaterial);
                wall.position.set(
                    (x - SIZE / 2) * CELL_SIZE + CELL_SIZE / 2,
                    WALL_HEIGHT / 2 - 0.5,
                    (y - SIZE / 2) * CELL_SIZE
                );
                group.add(wall);
                
                // Store reference if this wall should get Wikipedia texture
                const wallKey = `horizontal-${x}-${y}`;
                if (wikipediaWallKeys.has(wallKey)) {
                    wallMeshMap.set(wallKey, wall);
                }
            }
        }
    }
    
    // Create all vertical walls with brick texture first
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            if (verticalWalls[y] && verticalWalls[y][x]) {
                const wallGeometry = new THREE.BoxGeometry(
                    WALL_THICKNESS,
                    WALL_HEIGHT,
                    CELL_SIZE
                );
                
                const wall = new THREE.Mesh(wallGeometry, defaultWallMaterial);
                wall.position.set(
                    (x - SIZE / 2) * CELL_SIZE,
                    WALL_HEIGHT / 2 - 0.5,
                    (y - SIZE / 2) * CELL_SIZE + CELL_SIZE / 2
                );
                group.add(wall);
                
                // Store reference if this wall should get Wikipedia texture
                const wallKey = `vertical-${x}-${y}`;
                if (wikipediaWallKeys.has(wallKey)) {
                    wallMeshMap.set(wallKey, wall);
                }
            }
        }
    }
    
    // Helper function to get image dimensions from texture
    function getImageDimensionsFromTexture(texture) {
        return new Promise((resolve) => {
            if (texture.image && texture.image.width && texture.image.height) {
                resolve({ width: texture.image.width, height: texture.image.height });
            } else {
                // Wait for texture to load
                texture.onUpdate = function() {
                    if (texture.image && texture.image.width && texture.image.height) {
                        resolve({ width: texture.image.width, height: texture.image.height });
                    }
                };
            }
        });
    }

    // Helper function to create a text texture from a string
    // Returns { texture, width, height } where width and height are in world units
    function createTextTexture(text) {
        const context = document.createElement('canvas').getContext('2d');
        context.font = 'bold 12px Arial';
        
        // Calculate text dimensions first
        const padding = 2;
        const lineHeight = 20;
        const maxWidth = 200; // Maximum width before wrapping
        const words = text.split(' ');
        
        let lines = [];
        let line = '';
        let maxLineWidth = 0;
        
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = context.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && n > 0) {
                const lineMetrics = context.measureText(line);
                maxLineWidth = Math.max(maxLineWidth, lineMetrics.width);
                lines.push(line);
                line = words[n] + ' ';
            } else {
                line = testLine;
            }
        }
        if (line) {
            const lineMetrics = context.measureText(line);
            maxLineWidth = Math.max(maxLineWidth, lineMetrics.width);
            lines.push(line);
        }
        
        // Calculate canvas dimensions based on actual text
        const textWidth = maxLineWidth + padding * 2;
        const textHeight = lines.length * lineHeight + padding * 2;
        
        // Create canvas with exact dimensions
        const canvas = document.createElement('canvas');
        canvas.width = textWidth;
        canvas.height = textHeight;
        const ctx = canvas.getContext('2d');
        
        // Clear canvas with semi-transparent background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Set text properties
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12pxW Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw text lines (positioned with minimal padding)
        let y = padding + lineHeight / 2;
        for (const textLine of lines) {
            ctx.fillText(textLine, canvas.width / 2, y);
            y += lineHeight;
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        // Return texture and dimensions (scale to world units)
        // Using a scale factor: 1 canvas pixel = 0.005 world units
        // This makes text plates reasonably sized (400px = 2 world units)
        const scale = 0.005;
        return {
            texture: texture,
            width: textWidth * scale,
            height: textHeight * scale
        };
    }

    // Helper function to create a framed picture on a wall
    // side: 'positive' or 'negative' - which side of the wall to place the frame on
    // For horizontal walls: 'positive' = positive Z (south), 'negative' = negative Z (north)
    // For vertical walls: 'positive' = positive X (east), 'negative' = negative X (west)
    // wallKey: unique identifier for the wall (e.g., "horizontal-5-3")
    function createFramedPicture(imageUrl, wall, wallType, side, title, wallKey) {
        return new Promise((resolve) => {
            // Load texture first, then get dimensions from it (only loads once)
            const pictureTexture = textureLoader.load(
                imageUrl,
                function(texture) {
                    texture.wrapS = THREE.ClampToEdgeWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    
                    // Wall dimensions
                    const wallWidth = CELL_SIZE;
                    const wallHeight = WALL_HEIGHT;
                    
                    // Check for and remove any existing frame on this wall/side
                    const frameKey = `${wallKey}-${side}`;
                    if (frameGroups.has(frameKey)) {
                        const existing = frameGroups.get(frameKey);
                        if (existing.wall && existing.frameGroup) {
                            existing.wall.remove(existing.frameGroup);
                            // Dispose of existing frame's resources
                            existing.frameGroup.traverse((child) => {
                                if (child.geometry) child.geometry.dispose();
                                if (child.material) {
                                    if (Array.isArray(child.material)) {
                                        child.material.forEach(m => m.dispose());
                                    } else {
                                        child.material.dispose();
                                    }
                                }
                            });
                        }
                        frameGroups.delete(frameKey);
                    }
                    
                    // Create frame group (used for both styles)
                    const frameGroup = new THREE.Group();
                    
                    if (textureStyle === 'entirewall') {
                        // ENTIRE WALL STYLE: Image covers entire wall face, no frame, no aspect ratio preservation
                        const pictureGeometry = new THREE.PlaneGeometry(wallWidth, wallHeight);
                        const pictureMaterial = new THREE.MeshLambertMaterial({ 
                            map: pictureTexture,
                            side: THREE.DoubleSide
                        });
                        const picture = new THREE.Mesh(pictureGeometry, pictureMaterial);
                        frameGroup.add(picture);
                        
                        // Position the plane on the wall surface
                        const offset = WALL_THICKNESS / 2 + 0.001; // Slightly in front of wall
                        if (wallType === 'horizontal') {
                            const zOffset = side === 'positive' ? offset : -offset;
                            frameGroup.position.set(0, 0, zOffset);
                            if (side === 'negative') {
                                frameGroup.rotation.y = Math.PI;
                            }
                        } else {
                            const xOffset = side === 'positive' ? offset : -offset;
                            frameGroup.position.set(xOffset, 0, 0);
                            if (side === 'positive') {
                                frameGroup.rotation.y = Math.PI / 2;
                            } else {
                                frameGroup.rotation.y = -Math.PI / 2;
                            }
                        }
                        
                        // Store painting positions for viewing (centered on wall)
                        if (wallKey) {
                            const wallWorldY = wall.position.y;
                            paintingPositions.set(`${wallKey}-${side}`, {
                                centerY: wallWorldY,
                                plateY: wallWorldY
                            });
                        }
                    } else {
                        // W95 STYLE: Framed picture with aspect ratio preserved
                        // Get dimensions from loaded texture
                        const dimensions = {
                            width: texture.image.width,
                            height: texture.image.height
                        };
                        const aspectRatio = dimensions.width / dimensions.height;
                        
                        // Frame should be 40-70% of wall size, maintaining image aspect ratio
                        const sizeMultiplier = 0.4 + Math.random() * 0.3; // Random between 0.4 and 0.7
                        const maxFrameWidth = wallWidth * sizeMultiplier;
                        const maxFrameHeight = wallHeight * sizeMultiplier;
                        
                        // Calculate frame dimensions maintaining aspect ratio
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
                        
                        // Frame thickness
                        const frameThickness = 0.1;
                        const frameDepth = 0.05;
                        
                        // Create frame (using a box with a hole, or multiple boxes)
                        // We'll create a frame using 4 boxes (top, bottom, left, right)
                        const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown frame
                        
                        // Top frame piece
                        const topFrame = new THREE.Mesh(
                            new THREE.BoxGeometry(frameWidth + frameThickness * 2, frameThickness, frameDepth),
                            frameMaterial
                        );
                        topFrame.position.y = frameHeight / 2 + frameThickness / 2;
                        frameGroup.add(topFrame);
                        
                        // Bottom frame piece
                        const bottomFrame = new THREE.Mesh(
                            new THREE.BoxGeometry(frameWidth + frameThickness * 2, frameThickness, frameDepth),
                            frameMaterial
                        );
                        bottomFrame.position.y = -frameHeight / 2 - frameThickness / 2;
                        frameGroup.add(bottomFrame);
                        
                        // Left frame piece
                        const leftFrame = new THREE.Mesh(
                            new THREE.BoxGeometry(frameThickness, frameHeight, frameDepth),
                            frameMaterial
                        );
                        leftFrame.position.x = -frameWidth / 2 - frameThickness / 2;
                        frameGroup.add(leftFrame);
                        
                        // Right frame piece
                        const rightFrame = new THREE.Mesh(
                            new THREE.BoxGeometry(frameThickness, frameHeight, frameDepth),
                            frameMaterial
                        );
                        rightFrame.position.x = frameWidth / 2 + frameThickness / 2;
                        frameGroup.add(rightFrame);
                        
                        // Create picture plane with image texture (using the already loaded texture)
                        const pictureGeometry = new THREE.PlaneGeometry(frameWidth, frameHeight);
                        const pictureMaterial = new THREE.MeshLambertMaterial({ 
                            map: pictureTexture,
                            side: THREE.DoubleSide
                        });
                        const picture = new THREE.Mesh(pictureGeometry, pictureMaterial);
                        picture.position.z = frameDepth / 2 + 0.001; // Slightly in front of frame
                        frameGroup.add(picture);
                        
                        // Calculate random offsets for frame position with 30% margin on all sides
                        // Wall center is at (0, 0), wall extends from -wallWidth/2 to +wallWidth/2
                        // Frame edges must be at least 30% of wall size away from wall edges
                        const margin = 0.3;
                        const frameTotalWidth = frameWidth + frameThickness * 2;
                        const frameTotalHeight = frameHeight + frameThickness * 2;
                        
                        // Calculate allowed range for frame center X position
                        const minX = -wallWidth/2 + margin * wallWidth + frameTotalWidth/2;
                        const maxX = wallWidth/2 - margin * wallWidth - frameTotalWidth/2;
                        const randomX = maxX > minX ? minX + Math.random() * (maxX - minX) : 0;
                        
                        // Calculate allowed range for frame center Y position
                        const minY = -wallHeight/2 + margin * wallHeight + frameTotalHeight/2;
                        const maxY = wallHeight/2 - margin * wallHeight - frameTotalHeight/2;
                        const randomY = maxY > minY ? minY + Math.random() * (maxY - minY) : 0;
                        
                        // Position frame group on the wall based on wall type and side
                        let zOffset, xOffset;
                        if (wallType === 'horizontal') {
                            // Horizontal wall: frame should face along Z axis
                            // 'positive' side = positive Z (south), 'negative' side = negative Z (north)
                            zOffset = side === 'positive' 
                                ? WALL_THICKNESS / 2 + frameDepth / 2 
                                : -(WALL_THICKNESS / 2 + frameDepth / 2);
                            frameGroup.position.set(randomX, randomY, zOffset);
                            // Flip the frame 180 degrees on Y axis if on negative side so it faces the right direction
                            if (side === 'negative') {
                                frameGroup.rotation.y = Math.PI;
                            }
                        } else {
                            // Vertical wall: frame should face along X axis
                            // 'positive' side = positive X (east), 'negative' side = negative X (west)
                            xOffset = side === 'positive'
                                ? WALL_THICKNESS / 2 + frameDepth / 2
                                : -(WALL_THICKNESS / 2 + frameDepth / 2);
                            frameGroup.position.set(xOffset, randomY, randomX);
                            // Rotate to face the correct direction
                            if (side === 'positive') {
                                // Face positive X (east)
                                frameGroup.rotation.y = Math.PI / 2;
                            } else {
                                // Face negative X (west) - rotate 180 degrees more than positive side
                                frameGroup.rotation.y = -Math.PI / 2;
                            }
                        }
                        
                        // Create title plate below the frame
                        if (title) {
                            // Get text texture and dimensions
                            const textData = createTextTexture(title);
                            const plateWidth = textData.width;
                            const plateHeight = textData.height;
                            
                            // Create plate geometry with exact text dimensions
                            const plateGeometry = new THREE.PlaneGeometry(plateWidth, plateHeight);
                            const plateMaterial = new THREE.MeshLambertMaterial({ 
                                map: textData.texture,
                                transparent: true,
                                side: THREE.DoubleSide
                            });
                            const plate = new THREE.Mesh(plateGeometry, plateMaterial);
                            
                            // Position plate below the frame (in local coordinates relative to frameGroup)
                            // Position it at the same depth as the frame so it's flush with the wall
                            plate.position.set(0, -frameHeight / 2 - frameThickness - plateHeight / 2, 0);
                            
                            frameGroup.add(plate);
                        }
                        
                        // Store painting positions for viewing
                        if (wallKey) {
                            const wallWorldY = wall.position.y;
                            const paintingCenterY = wallWorldY + randomY;
                            // Plate is positioned at -frameHeight/2 - frameThickness - plateHeight/2 relative to frame center
                            // Use approximate plate height if title exists
                            const plateOffsetY = title ? (-frameHeight / 2 - frameThickness - 0.05) : 0;
                            const plateY = wallWorldY + randomY + plateOffsetY;
                            
                            paintingPositions.set(`${wallKey}-${side}`, {
                                centerY: paintingCenterY,
                                plateY: plateY
                            });
                        }
                    }
                    
                    // Add frame group to wall
                    wall.add(frameGroup);
                    
                    // Store frame group reference for potential replacement later
                    frameGroups.set(frameKey, { frameGroup, wall });
                    
                    resolve();
                },
                undefined,
                function(error) {
                    // If image loading fails, just resolve without creating frame
                    console.error('Error loading image:', error);
                    resolve();
                }
            );
        });
    }
    
    // Store global reference for on-demand loading
    globalCreateFramedPicture = createFramedPicture;

    // Asynchronously load Wikipedia images and create framed pictures
    // Use BFS from initial position to order wall loading
    (async () => {
        // Capture current generation to detect if we've been invalidated
        const myGeneration = mazeGeneration;
        
        // BFS to get cells in exploration order
        // Start position depends on scene mode
        let startCell;
        if (sceneMode === 'alley') {
            const alleyZ = Math.floor(MAZE_SIZE / 2);
            startCell = { x: 0, z: alleyZ };
        } else {
            startCell = { x: 0, z: 0 };
        }
        const visitedBFS = new Set();
        const queue = [startCell];
        const cellOrder = [];
        
        visitedBFS.add(`${startCell.x},${startCell.z}`);
        
        while (queue.length > 0) {
            const cell = queue.shift();
            cellOrder.push(cell);
            
            // Get neighbors (cells connected without walls)
            const neighbors = [
                { x: cell.x + 1, z: cell.z }, // East
                { x: cell.x - 1, z: cell.z }, // West
                { x: cell.x, z: cell.z + 1 }, // South
                { x: cell.x, z: cell.z - 1 }  // North
            ];
            
            for (const neighbor of neighbors) {
                if (neighbor.x < 0 || neighbor.x >= SIZE || 
                    neighbor.z < 0 || neighbor.z >= SIZE) continue;
                
                const key = `${neighbor.x},${neighbor.z}`;
                if (visitedBFS.has(key)) continue;
                
                // Check if connected (no wall between)
                let connected = false;
                if (neighbor.x === cell.x + 1) {
                    // Moving east - check vertical wall at x+1
                    connected = !verticalWalls[cell.z][cell.x + 1];
                } else if (neighbor.x === cell.x - 1) {
                    // Moving west - check vertical wall at x
                    connected = !verticalWalls[cell.z][cell.x];
                } else if (neighbor.z === cell.z + 1) {
                    // Moving south - check horizontal wall at z+1
                    connected = !horizontalWalls[cell.z + 1][cell.x];
                } else if (neighbor.z === cell.z - 1) {
                    // Moving north - check horizontal wall at z
                    connected = !horizontalWalls[cell.z][cell.x];
                }
                
                if (connected) {
                    visitedBFS.add(key);
                    queue.push(neighbor);
                }
            }
        }
        
        // Build ordered wall list based on BFS cell order
        // For each cell, add walls that face into that cell
        const processedWalls = new Set();
        const wallsInOrder = [];
        
        for (const cell of cellOrder) {
            // Get walls surrounding this cell
            const cellWalls = [
                { key: `horizontal-${cell.x}-${cell.z}`, type: 'horizontal' },     // Top wall
                { key: `horizontal-${cell.x}-${cell.z + 1}`, type: 'horizontal' }, // Bottom wall
                { key: `vertical-${cell.x}-${cell.z}`, type: 'vertical' },         // Left wall
                { key: `vertical-${cell.x + 1}-${cell.z}`, type: 'vertical' }      // Right wall
            ];
            
            for (const wall of cellWalls) {
                // Only add if wall exists in wallMeshMap and hasn't been processed
                if (wallMeshMap.has(wall.key) && !processedWalls.has(wall.key)) {
                    processedWalls.add(wall.key);
                    wallsInOrder.push({ wallKey: wall.key, type: wall.type });
                }
            }
        }
        
        // For alley mode, ensure all walls are included (BFS might miss some due to cell ordering)
        // Add any walls from wallMeshMap that weren't found through BFS
        if (sceneMode === 'alley') {
            for (const [wallKey, wall] of wallMeshMap) {
                if (!processedWalls.has(wallKey)) {
                    const [type] = wallKey.split('-');
                    processedWalls.add(wallKey);
                    wallsInOrder.push({ wallKey, type });
                }
            }
        }
        
        // Calculate total images to load and set loading state
        isLoadingImages = true;
        loadedImagesCount = 0;
        totalImagesToLoad = 0;
        const alleyZForCount = Math.floor(MAZE_SIZE / 2);
        for (const { wallKey } of wallsInOrder) {
            const [wallType, xStr, yStr] = wallKey.split('-');
            const x = parseInt(xStr);
            const y = parseInt(yStr);
            let isEdgeWall = 
                (wallType === 'horizontal' && (y === 0 || y === SIZE)) ||
                (wallType === 'vertical' && (x === 0 || x === SIZE));
            // In alley mode, alley walls are also edge walls (only one side)
            if (sceneMode === 'alley' && wallType === 'horizontal' && (y === alleyZForCount || y === alleyZForCount + 1)) {
                isEdgeWall = true;
            }
            totalImagesToLoad += isEdgeWall ? 1 : 2;
        }
        
        // Load Wikipedia images in BFS order from player start
        for (const { wallKey, type } of wallsInOrder) {
            // Check for cancellation or generation change (new maze was created)
            if (cancelLoading || mazeGeneration !== myGeneration) {
                console.log('Initial loading cancelled or generation changed');
                isLoadingImages = false;
                return;
            }
            
            // Skip if already loaded (by on-demand loader)
            if (wikipediaWalls.has(wallKey)) continue;
            
            const wall = wallMeshMap.get(wallKey);
            if (!wall) continue;
            
            // Reserve this wall to prevent race conditions
            wikipediaWalls.add(wallKey);
            
            // Parse wall key to get position
            const [wallType, xStr, yStr] = wallKey.split('-');
            const x = parseInt(xStr);
            const y = parseInt(yStr);
            
            // Determine if this is an edge wall (only render on one side)
            const alleyZ = Math.floor(MAZE_SIZE / 2);
            let isEdgeWall = 
                (wallType === 'horizontal' && (y === 0 || y === SIZE)) ||
                (wallType === 'vertical' && (x === 0 || x === SIZE));
            
            // In alley mode, the alley walls are also edge walls (only face inward)
            let isAlleyWall = false;
            if (sceneMode === 'alley' && wallType === 'horizontal') {
                if (y === alleyZ || y === alleyZ + 1) {
                    isAlleyWall = true;
                }
            }
            
            if (isEdgeWall || isAlleyWall) {
                // Edge wall: only place image on the side facing the maze/alley
                let side;
                if (isAlleyWall) {
                    // Alley walls: y=alleyZ faces south (into alley), y=alleyZ+1 faces north (into alley)
                    side = y === alleyZ ? 'positive' : 'negative';
                } else if (wallType === 'horizontal') {
                    // Horizontal wall: y=0 is top boundary (faces south/positive Z), y=MAZE_SIZE is bottom boundary (faces north/negative Z)
                    side = y === 0 ? 'positive' : 'negative';
                } else {
                    // Vertical wall: x=0 is left boundary (faces east/positive X), x=MAZE_SIZE is right boundary (faces west/negative X)
                    side = x === 0 ? 'positive' : 'negative';
                }
                
                const result = await getWikipediaImage();
                if (cancelLoading || mazeGeneration !== myGeneration) { isLoadingImages = false; return; }
                if (result && result.imageUrl) {
                    await createFramedPicture(result.imageUrl, wall, type, side, result.title, wallKey);
                } else {
                    // Failed - unreserve
                    wikipediaWalls.delete(wallKey);
                }
                loadedImagesCount++;
            } else {
                // Internal wall: place images on both sides
                const result1 = await getWikipediaImage();
                if (cancelLoading || mazeGeneration !== myGeneration) { isLoadingImages = false; return; }
                if (result1 && result1.imageUrl) {
                    await createFramedPicture(result1.imageUrl, wall, type, 'positive', result1.title, wallKey);
                }
                loadedImagesCount++;
                
                const result2 = await getWikipediaImage();
                if (cancelLoading || mazeGeneration !== myGeneration) { isLoadingImages = false; return; }
                if (result2 && result2.imageUrl) {
                    await createFramedPicture(result2.imageUrl, wall, type, 'negative', result2.title, wallKey);
                }
                loadedImagesCount++;
                
                if (!(result1 && result1.imageUrl) && !(result2 && result2.imageUrl)) {
                    // Both failed - unreserve
                    wikipediaWalls.delete(wallKey);
                }
            }
        }
        
        isLoadingImages = false;
    })();
    
    return group;
}

// Global reference to the current maze group for scene regeneration
let currentMazeGroup = null;

// Regenerate the scene (maze or open space)
async function regenerateScene() {
    console.log('Regenerating scene with mode:', sceneMode);
    
    // Cancel any ongoing loading
    cancelLoading = true;
    
    // Clear alley fog planes reference
    window.alleyFogPlanes = null;
    window.alleyWorldZ = null;
    
    // Wait a moment for current loading to stop
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Remove old maze from scene
    if (currentMazeGroup && scene) {
        scene.remove(currentMazeGroup);
        // Dispose of old geometries and materials
        currentMazeGroup.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
    
    // Clear painting tracking
    wikipediaWalls.clear();
    paintingPositions.clear();
    frameGroups.clear();
    
    // Reset image caches
    topicSearchResults = [];
    topicSearchIndex = 0;
    topicResultsFetched = false;
    randomImageResults = [];
    randomImageIndex = 0;
    
    // Reset cancel flag before generating new maze
    cancelLoading = false;
    
    // Increment generation to invalidate any stale loading operations
    mazeGeneration++;
    
    // Generate and add new maze
    mazeData = generateMaze(getEffectiveSize());
    currentMazeGroup = await createMaze(mazeData);
    scene.add(currentMazeGroup);
    
    // Update scene background based on mode
    if (sceneMode === 'alley' || sceneMode === 'openspace') {
        scene.background = new THREE.Color(0x000000); // Dark for alley and openspace
        if (sceneMode === 'alley') {
            scene.fog = new THREE.Fog(0x000000, CELL_SIZE * 0.5, CELL_SIZE * 4); // Fog from 0.5 to 4 cells
        } else {
            scene.fog = null;
        }
    } else {
        scene.background = new THREE.Color(0x87CEEB); // Sky blue for maze
        scene.fog = null;
    }
    
    // Reset player position
    if (sceneMode === 'alley') {
        // Start in the middle of the alley
        const alleyZ = Math.floor(MAZE_SIZE / 2);
        playerPosition.x = 0; // Center of the alley (x = 0 in world coords)
        playerPosition.z = (alleyZ - MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
        playerRotation = Math.PI / 2; // Face east (along the alley)
    } else if (sceneMode === 'openspace') {
        // Start in the center of the room
        playerPosition.x = 0;
        playerPosition.z = 0;
        playerRotation = 0;
    } else {
        // Maze mode - start in corner
        const SIZE = getEffectiveSize();
        playerPosition.x = (-SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
        playerPosition.z = (-SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
        playerRotation = 0;
    }
    camera.position.set(playerPosition.x, 1.2, playerPosition.z);
    camera.rotation.y = playerRotation;
    
    // Reset auto mode state
    targetCell = null;
    navigationPath = [];
    currentPathIndex = 0;
    visitedCells.clear();
    isViewingPainting = false;
    viewingPaintingTimer = 0;
    viewingPhase = 0;
    paintingLookDirection = null;
    originalDirection = null;
    currentPitch = 0;
    
    console.log('Scene regenerated');
}

// Initialize the scene
function init() {
    // Scene
    scene = new THREE.Scene();
    
    // Set up scene background based on mode
    if (sceneMode === 'alley' || sceneMode === 'openspace') {
        scene.background = new THREE.Color(0x000000); // Dark for alley and openspace
        if (sceneMode === 'alley') {
            scene.fog = new THREE.Fog(0x000000, CELL_SIZE * 0.5, CELL_SIZE * 4); // Fog from 0.5 to 4 cells
        } else {
            scene.fog = null;
        }
    } else {
        scene.background = new THREE.Color(0x87CEEB); // Sky blue for maze
        scene.fog = null;
    }
    
    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 1.2, 0); // Lower eye level
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);
    
    // Generate and add maze
    mazeData = generateMaze(getEffectiveSize());
    createMaze(mazeData).then(maze3D => {
        currentMazeGroup = maze3D;
        scene.add(maze3D);
    });
    
    // Set initial player position
    if (sceneMode === 'alley') {
        // Start in the middle of the alley
        const alleyZ = Math.floor(MAZE_SIZE / 2);
        playerPosition.x = 0;
        playerPosition.z = (alleyZ - MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
        playerRotation = Math.PI / 2; // Face east
    } else if (sceneMode === 'openspace') {
        // Start in the center of the room
        playerPosition.x = 0;
        playerPosition.z = 0;
        playerRotation = 0;
    } else {
        // Maze mode: top-left corner
        const SIZE = getEffectiveSize();
        playerPosition.x = (-SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
        playerPosition.z = (-SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
        playerRotation = 0;
    }
    camera.position.set(playerPosition.x, 1.2, playerPosition.z);
    camera.rotation.y = playerRotation;
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    
    // Initialize minimap
    minimapCanvas = document.getElementById('minimap');
    minimapCtx = minimapCanvas.getContext('2d');
    minimapCanvas.width = 200;
    minimapCanvas.height = 200;
    
    // Create stats display
    statsDiv = document.createElement('div');
    statsDiv.id = 'stats';
    statsDiv.style.position = 'absolute';
    statsDiv.style.top = '10px';
    statsDiv.style.left = '10px';
    statsDiv.style.color = '#fff';
    statsDiv.style.fontSize = '14px';
    statsDiv.style.zIndex = '100';
    statsDiv.style.background = 'rgba(0, 0, 0, 0.7)';
    statsDiv.style.padding = '10px';
    statsDiv.style.border = '2px solid #fff';
    statsDiv.style.fontFamily = 'monospace';
    statsDiv.style.display = 'none';
    document.body.appendChild(statsDiv);
    
    // Create menu toggle icon (shown when stats are hidden)
    const menuToggle = document.createElement('div');
    menuToggle.id = 'menu-toggle';
    menuToggle.style.position = 'absolute';
    menuToggle.style.top = '10px';
    menuToggle.style.left = '10px';
    menuToggle.style.width = '32px';
    menuToggle.style.height = '32px';
    menuToggle.style.background = 'rgba(0, 0, 0, 0.7)';
    menuToggle.style.border = '2px solid #fff';
    menuToggle.style.cursor = 'pointer';
    menuToggle.style.zIndex = '100';
    menuToggle.style.display = 'block';
    menuToggle.style.textAlign = 'center';
    menuToggle.style.lineHeight = '28px';
    menuToggle.style.fontSize = '18px';
    menuToggle.style.color = '#fff';
    menuToggle.innerHTML = '☰';
    menuToggle.title = 'Show menu (T)';
    menuToggle.addEventListener('click', () => {
        statsVisible = true;
        statsDiv.style.display = 'block';
        menuToggle.style.display = 'none';
        statsDiv.innerHTML = '';
        updateStatsDisplay();
    });
    document.body.appendChild(menuToggle);
    
    // Event listeners
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);
    
    // Initialize auto mode (pathfinding will start automatically)
    if (autoMode) {
        targetCell = null;
        navigationPath = [];
        currentPathIndex = 0;
        isViewingPainting = false;
        viewingPaintingTimer = 0;
        viewingPhase = 0;
        paintingLookDirection = null;
        originalDirection = null;
        currentPitch = 0;
    }
    
    // Start animation loop
    animate();
}

// Handle key presses
function onKeyDown(event) {
    // If any key is pressed (except Z and T), stop auto mode
    if (autoMode && event.key.toLowerCase() !== 'z' && event.key.toLowerCase() !== 't') {
        autoMode = false;
    }
    
    switch(event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            controls.forward = true;
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            controls.backward = true;
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            controls.left = true;
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            controls.right = true;
            break;
        case 'z':
        case 'Z':
            // Toggle auto mode: pathfinding-based navigation
            autoMode = true;
            isTurning = false;
            targetCell = null;
            navigationPath = [];
            currentPathIndex = 0;
            visitedCells.clear();
            isViewingPainting = false;
            viewingPaintingTimer = 0;
            viewingPhase = 0;
            paintingLookDirection = null;
            originalDirection = null;
            currentPitch = 0;
            break;
        case 't':
        case 'T':
            // Toggle stats display
            statsVisible = !statsVisible;
            const menuToggle = document.getElementById('menu-toggle');
            if (statsDiv) {
                if (statsVisible) {
                    statsDiv.style.display = 'block';
                    if (menuToggle) menuToggle.style.display = 'none';
                    statsDiv.innerHTML = ''; // Clear to force rebuild with fresh controls
                    updateStatsDisplay();
                } else {
                    statsDiv.style.display = 'none';
                    if (menuToggle) menuToggle.style.display = 'block';
                }
            }
            break;
        case 'm':
        case 'M':
            // Toggle minimap visibility
            minimapVisible = !minimapVisible;
            if (minimapCanvas) {
                minimapCanvas.style.display = minimapVisible ? 'block' : 'none';
            }
            break;
    }
}

function onKeyUp(event) {
    switch(event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            controls.forward = false;
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            controls.backward = false;
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            controls.left = false;
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            controls.right = false;
            break;
    }
}

// Convert world position to maze grid coordinates
function worldToGrid(worldX, worldZ) {
    const SIZE = getEffectiveSize();
    const gridX = Math.floor((worldX + (SIZE * CELL_SIZE) / 2) / CELL_SIZE);
    const gridZ = Math.floor((worldZ + (SIZE * CELL_SIZE) / 2) / CELL_SIZE);
    return { x: gridX, z: gridZ };
}

// Convert grid coordinates to world position (center of cell)
function gridToWorld(gridX, gridZ) {
    const SIZE = getEffectiveSize();
    const worldX = (gridX - SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
    const worldZ = (gridZ - SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
    return { x: worldX, z: worldZ };
}

// BFS pathfinding algorithm
// Based on user's clarification:
// - horizontalWalls[y][x] = wall at TOP of cell (x,y), separating (x,y-1) and (x,y)
// - verticalWalls[y][x] = wall at LEFT of cell (x,y), separating (x-1,y) and (x,y)
function findPath(start, goal) {
    if (!mazeData) return [];
    
    const { horizontalWalls, verticalWalls } = mazeData;
    const SIZE = getEffectiveSize();
    
    // Validate inputs
    if (start.x < 0 || start.x >= SIZE || start.z < 0 || start.z >= SIZE) return [];
    if (goal.x < 0 || goal.x >= SIZE || goal.z < 0 || goal.z >= SIZE) return [];
    
    // Check if two adjacent cells are connected (no wall between them)
    function areConnected(cell1, cell2) {
        const dx = cell2.x - cell1.x;
        const dz = cell2.z - cell1.z;
        
        // Must be adjacent
        if (Math.abs(dx) + Math.abs(dz) !== 1) return false;
        
        // Based on user's clarification:
        // - horizontalWalls[y][x] = wall at TOP of cell (x,y), separating (x,y-1) and (x,y)
        // - verticalWalls[y][x] = wall at LEFT of cell (x,y), separating (x-1,y) and (x,y)
        
        if (dx === 1) {
            // Moving right (east): from (x,z) to (x+1,z)
            // Check verticalWalls at the LEFT of the destination cell (x+1,z)
            // verticalWalls[z][x+1] = wall separating (x,z) and (x+1,z)
            if (cell2.z < 0 || cell2.z >= verticalWalls.length) return false;
            if (cell2.x < 0 || cell2.x >= verticalWalls[cell2.z].length) return false;
            return !verticalWalls[cell2.z][cell2.x];
        } else if (dx === -1) {
            // Moving left (west): from (x,z) to (x-1,z)
            // Check verticalWalls at the LEFT of the current cell (x,z)
            // verticalWalls[z][x] = wall separating (x-1,z) and (x,z)
            if (cell1.z < 0 || cell1.z >= verticalWalls.length) return false;
            if (cell1.x < 0 || cell1.x >= verticalWalls[cell1.z].length) return false;
            return !verticalWalls[cell1.z][cell1.x];
        } else if (dz === 1) {
            // Moving down (south): from (x,z) to (x,z+1)
            // Check horizontalWalls at the TOP of the destination cell (x,z+1)
            // horizontalWalls[z+1][x] = wall separating (x,z) and (x,z+1)
            if (cell2.z < 0 || cell2.z >= horizontalWalls.length) return false;
            if (cell2.x < 0 || cell2.x >= horizontalWalls[cell2.z].length) return false;
            return !horizontalWalls[cell2.z][cell2.x];
        } else if (dz === -1) {
            // Moving up (north): from (x,z) to (x,z-1)
            // Check horizontalWalls at the TOP of the current cell (x,z)
            // horizontalWalls[z][x] = wall separating (x,z-1) and (x,z)
            if (cell1.z < 0 || cell1.z >= horizontalWalls.length) return false;
            if (cell1.x < 0 || cell1.x >= horizontalWalls[cell1.z].length) return false;
            return !horizontalWalls[cell1.z][cell1.x];
        }
        
        return false;
    }
    
    // BFS
    const queue = [{ x: start.x, z: start.z }];
    const visited = new Set();
    const parent = new Map();
    
    visited.add(`${start.x},${start.z}`);
    
    while (queue.length > 0) {
        const current = queue.shift();
        
        // Found goal
        if (current.x === goal.x && current.z === goal.z) {
            // Reconstruct path
            const path = [];
            let node = goal;
            while (node) {
                path.unshift(node);
                const nodeKey = `${node.x},${node.z}`;
                node = parent.get(nodeKey);
            }
            return path;
        }
        
        // Check all 4 neighbors
        const neighbors = [
            { x: current.x + 1, z: current.z },
            { x: current.x - 1, z: current.z },
            { x: current.x, z: current.z + 1 },
            { x: current.x, z: current.z - 1 }
        ];
        
        for (const neighbor of neighbors) {
            if (neighbor.x < 0 || neighbor.x >= SIZE || 
                neighbor.z < 0 || neighbor.z >= SIZE) {
                continue;
            }
            
            const neighborKey = `${neighbor.x},${neighbor.z}`;
            if (visited.has(neighborKey)) continue;
            
            if (!areConnected(current, neighbor)) continue;
            
            visited.add(neighborKey);
            parent.set(neighborKey, current);
            queue.push(neighbor);
        }
    }
    
    return []; // No path found
}

// Get walls around a cell (returns array of wall info)
function getWallsAroundCell(cellX, cellZ) {
    const walls = [];
    
    // Top wall (horizontal wall at y = cellZ)
    // This wall is at the TOP of the cell, separating (cellX, cellZ-1) and (cellX, cellZ)
    if (cellZ >= 0 && cellZ <= getEffectiveSize()) {
        walls.push({
            key: `horizontal-${cellX}-${cellZ}`,
            type: 'horizontal',
            x: cellX,
            y: cellZ,
            worldX: (cellX - getEffectiveSize() / 2) * CELL_SIZE + CELL_SIZE / 2,
            worldZ: (cellZ - getEffectiveSize() / 2) * CELL_SIZE,
            facingSide: 'positive' // Face towards positive Z (into the cell)
        });
    }
    
    // Bottom wall (horizontal wall at y = cellZ + 1)
    if (cellZ + 1 >= 0 && cellZ + 1 <= getEffectiveSize()) {
        walls.push({
            key: `horizontal-${cellX}-${cellZ + 1}`,
            type: 'horizontal',
            x: cellX,
            y: cellZ + 1,
            worldX: (cellX - getEffectiveSize() / 2) * CELL_SIZE + CELL_SIZE / 2,
            worldZ: (cellZ + 1 - getEffectiveSize() / 2) * CELL_SIZE,
            facingSide: 'negative' // Face towards negative Z (into the cell)
        });
    }
    
    // Left wall (vertical wall at x = cellX)
    if (cellX >= 0 && cellX <= getEffectiveSize()) {
        walls.push({
            key: `vertical-${cellX}-${cellZ}`,
            type: 'vertical',
            x: cellX,
            y: cellZ,
            worldX: (cellX - getEffectiveSize() / 2) * CELL_SIZE,
            worldZ: (cellZ - getEffectiveSize() / 2) * CELL_SIZE + CELL_SIZE / 2,
            facingSide: 'positive' // Face towards positive X (into the cell)
        });
    }
    
    // Right wall (vertical wall at x = cellX + 1)
    if (cellX + 1 >= 0 && cellX + 1 <= getEffectiveSize()) {
        walls.push({
            key: `vertical-${cellX + 1}-${cellZ}`,
            type: 'vertical',
            x: cellX + 1,
            y: cellZ,
            worldX: (cellX + 1 - getEffectiveSize() / 2) * CELL_SIZE,
            worldZ: (cellZ - getEffectiveSize() / 2) * CELL_SIZE + CELL_SIZE / 2,
            facingSide: 'negative' // Face towards negative X (into the cell)
        });
    }
    
    return walls;
}

// Get paintings (walls with Wikipedia images) around a cell
function getPaintingsAroundCell(cellX, cellZ) {
    const walls = getWallsAroundCell(cellX, cellZ);
    return walls.filter(wall => wikipediaWalls.has(wall.key));
}

// Load a painting on a wall in a cell (returns promise)
async function loadPaintingInCell(cellX, cellZ) {
    if (!globalWallMeshMap || !globalCreateFramedPicture) return null;
    
    const walls = getWallsAroundCell(cellX, cellZ);
    
    // Find a wall that exists but doesn't have a painting yet
    for (const wall of walls) {
        // Check if this wall exists in the mesh map
        const wallMesh = globalWallMeshMap.get(wall.key);
        if (!wallMesh) continue;
        
        // Check if this wall already has a painting (or is being loaded)
        if (wikipediaWalls.has(wall.key)) continue;
        
        // Reserve this wall immediately to prevent race conditions
        wikipediaWalls.add(wall.key);
        
        // Load a painting on this wall
        const result = await getWikipediaImage();
        if (result && result.imageUrl) {
            await globalCreateFramedPicture(result.imageUrl, wallMesh, wall.type, wall.facingSide, result.title, wall.key);
            return wall;
        } else {
            // Failed to load - unreserve the wall
            wikipediaWalls.delete(wall.key);
        }
    }
    
    return null; // No wall available or failed to load
}

// Check if position is valid (not colliding with boundary walls)
function isValidPosition(x, z) {
    // If collisions are disabled, all positions are valid
    if (!collisionsEnabled) return true;
    
    const playerRadius = 0.4;
    const checkDist = playerRadius + WALL_THICKNESS / 2;
    const SIZE = getEffectiveSize();
    
    // Check boundaries
    const halfSize = (SIZE * CELL_SIZE) / 2;
    
    // In alley mode, allow crossing X boundaries (for wrapping)
    if (sceneMode === 'alley') {
        // Only check Z boundaries
        if (z < -halfSize + checkDist || z > halfSize - checkDist) {
            return false;
        }
    } else if (sceneMode === 'openspace') {
        // In openspace mode, allow crossing through doors
        const doors = window.openspaceDoors;
        if (doors) {
            const inNorthDoor = z < -halfSize + checkDist && x >= doors.north.minX && x <= doors.north.maxX;
            const inSouthDoor = z > halfSize - checkDist && x >= doors.south.minX && x <= doors.south.maxX;
            const inWestDoor = x < -halfSize + checkDist && z >= doors.west.minZ && z <= doors.west.maxZ;
            const inEastDoor = x > halfSize - checkDist && z >= doors.east.minZ && z <= doors.east.maxZ;
            
            // Block if at boundary but NOT in a door
            if (x < -halfSize + checkDist && !inWestDoor) return false;
            if (x > halfSize - checkDist && !inEastDoor) return false;
            if (z < -halfSize + checkDist && !inNorthDoor) return false;
            if (z > halfSize - checkDist && !inSouthDoor) return false;
        } else {
            // Fallback if doors not initialized
            if (x < -halfSize + checkDist || x > halfSize - checkDist || 
                z < -halfSize + checkDist || z > halfSize - checkDist) {
                return false;
            }
        }
    } else {
        if (x < -halfSize + checkDist || x > halfSize - checkDist || 
            z < -halfSize + checkDist || z > halfSize - checkDist) {
            return false;
        }
    }
    
    if (!mazeData) return true;
    const { horizontalWalls, verticalWalls } = mazeData;
    
    // Helper to check if a wall is a door wall (no collision in openspace mode)
    const center = Math.floor(SIZE / 2);
    const isDoorWall = (type, wallX, wallY) => {
        if (sceneMode !== 'openspace') return false;
        // North door: horizontal at y=0, x=center
        if (type === 'horizontal' && wallY === 0 && wallX === center) return true;
        // South door: horizontal at y=SIZE, x=center
        if (type === 'horizontal' && wallY === SIZE && wallX === center) return true;
        // West door: vertical at x=0, y=center
        if (type === 'vertical' && wallX === 0 && wallY === center) return true;
        // East door: vertical at x=SIZE, y=center
        if (type === 'vertical' && wallX === SIZE && wallY === center) return true;
        return false;
    };
    
    // Convert to grid coordinates
    const gridX = (x + halfSize) / CELL_SIZE;
    const gridZ = (z + halfSize) / CELL_SIZE;
    
    // Check horizontal walls (between rows)
    const rowBelow = Math.floor(gridZ);
    const rowAbove = Math.ceil(gridZ);
    
    if (rowBelow >= 0 && rowBelow < horizontalWalls.length) {
        const col = Math.floor(gridX);
        if (col >= 0 && col < SIZE && horizontalWalls[rowBelow]) {
            // Check wall below (skip if it's a door wall)
            if (horizontalWalls[rowBelow][col] && !isDoorWall('horizontal', col, rowBelow) && Math.abs(gridZ - rowBelow) < checkDist / CELL_SIZE) {
                return false;
            }
        }
    }
    
    if (rowAbove >= 0 && rowAbove < horizontalWalls.length) {
        const col = Math.floor(gridX);
        if (col >= 0 && col < SIZE && horizontalWalls[rowAbove]) {
            // Check wall above (skip if it's a door wall)
            if (horizontalWalls[rowAbove][col] && !isDoorWall('horizontal', col, rowAbove) && Math.abs(gridZ - rowAbove) < checkDist / CELL_SIZE) {
                return false;
            }
        }
    }
    
    // Check vertical walls (between columns)
    const colLeft = Math.floor(gridX);
    const colRight = Math.ceil(gridX);
    
    if (colLeft >= 0 && colLeft < verticalWalls[0].length) {
        const row = Math.floor(gridZ);
        if (row >= 0 && row < SIZE && verticalWalls[row]) {
            // Check wall to left (skip if it's a door wall)
            if (verticalWalls[row][colLeft] && !isDoorWall('vertical', colLeft, row) && Math.abs(gridX - colLeft) < checkDist / CELL_SIZE) {
                return false;
            }
        }
    }
    
    if (colRight >= 0 && colRight < verticalWalls[0].length) {
        const row = Math.floor(gridZ);
        if (row >= 0 && row < SIZE && verticalWalls[row]) {
            // Check wall to right (skip if it's a door wall)
            if (verticalWalls[row][colRight] && !isDoorWall('vertical', colRight, row) && Math.abs(gridX - colRight) < checkDist / CELL_SIZE) {
                return false;
            }
        }
    }
    
    return true;
}

// Check if there's a wall ahead
function checkWallAhead(distance) {
    const checkX = playerPosition.x + Math.sin(playerRotation) * distance;
    const checkZ = playerPosition.z + Math.cos(playerRotation) * distance;
    return !isValidPosition(checkX, checkZ);
}

// Check if there's a wall to the right
function checkWallRight(distance) {
    const rightAngle = playerRotation - Math.PI / 2;
    const checkX = playerPosition.x + Math.sin(rightAngle) * distance;
    const checkZ = playerPosition.z + Math.cos(rightAngle) * distance;
    return !isValidPosition(checkX, checkZ);
}

// Check if player is currently touching/near a wall
function isTouchingWall() {
    const playerRadius = 0.4;
    const touchDistance = playerRadius + WALL_THICKNESS / 2 + 0.05; // Slightly larger to detect proximity
    
    if (!mazeData) return false;
    const { horizontalWalls, verticalWalls } = mazeData;
    const SIZE = getEffectiveSize();
    const halfSize = (SIZE * CELL_SIZE) / 2;
    
    // Convert to grid coordinates
    const gridX = (playerPosition.x + halfSize) / CELL_SIZE;
    const gridZ = (playerPosition.z + halfSize) / CELL_SIZE;
    
    // Check horizontal walls (between rows)
    const rowBelow = Math.floor(gridZ);
    const rowAbove = Math.ceil(gridZ);
    
    if (rowBelow >= 0 && rowBelow < horizontalWalls.length) {
        const col = Math.floor(gridX);
        if (col >= 0 && col < SIZE && horizontalWalls[rowBelow]) {
            if (horizontalWalls[rowBelow][col]) {
                const wallZ = rowBelow * CELL_SIZE - halfSize;
                const distToWall = Math.abs(playerPosition.z - wallZ);
                if (distToWall < touchDistance) {
                    return true;
                }
            }
        }
    }
    
    if (rowAbove >= 0 && rowAbove < horizontalWalls.length) {
        const col = Math.floor(gridX);
        if (col >= 0 && col < SIZE && horizontalWalls[rowAbove]) {
            if (horizontalWalls[rowAbove][col]) {
                const wallZ = rowAbove * CELL_SIZE - halfSize;
                const distToWall = Math.abs(playerPosition.z - wallZ);
                if (distToWall < touchDistance) {
                    return true;
                }
            }
        }
    }
    
    // Check vertical walls (between columns)
    const colLeft = Math.floor(gridX);
    const colRight = Math.ceil(gridX);
    
    if (colLeft >= 0 && colLeft < verticalWalls[0].length) {
        const row = Math.floor(gridZ);
        if (row >= 0 && row < SIZE && verticalWalls[row]) {
            if (verticalWalls[row][colLeft]) {
                const wallX = colLeft * CELL_SIZE - halfSize;
                const distToWall = Math.abs(playerPosition.x - wallX);
                if (distToWall < touchDistance) {
                    return true;
                }
            }
        }
    }
    
    if (colRight >= 0 && colRight < verticalWalls[0].length) {
        const row = Math.floor(gridZ);
        if (row >= 0 && row < SIZE && verticalWalls[row]) {
            if (verticalWalls[row][colRight]) {
                const wallX = colRight * CELL_SIZE - halfSize;
                const distToWall = Math.abs(playerPosition.x - wallX);
                if (distToWall < touchDistance) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

// Update player movement (manual)
function updateMovement() {
    // Auto mode: pathfinding-based navigation
    if (autoMode) {
        // If viewing a painting, handle the viewing state
        if (isViewingPainting) {
            viewingPaintingTimer++;
            
            // Determine target pitch based on phase
            // Phase 0: Look at center of painting
            // Phase 1: Look at plate below
            // Phase 2: Reset to horizontal
            let targetPitch;
            if (viewingPhase === 0) {
                targetPitch = paintingCenterPitch;
            } else if (viewingPhase === 1) {
                targetPitch = platePitch;
            } else {
                targetPitch = 0; // Reset to horizontal
            }
            
            // Smoothly adjust horizontal rotation (yaw)
            if (paintingLookDirection !== null) {
                let angleDiff = paintingLookDirection - playerRotation;
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                
                if (Math.abs(angleDiff) > TURN_SPEED) {
                    playerRotation += Math.sign(angleDiff) * TURN_SPEED;
                } else {
                    playerRotation = paintingLookDirection;
                }
            }
            
            // Smoothly adjust vertical rotation (pitch)
            let pitchDiff = targetPitch - currentPitch;
            if (Math.abs(pitchDiff) > PITCH_SPEED) {
                currentPitch += Math.sign(pitchDiff) * PITCH_SPEED;
            } else {
                currentPitch = targetPitch;
            }
            
            // Advance to next phase after time
            if (viewingPaintingTimer >= PHASE_TIME) {
                viewingPaintingTimer = 0;
                viewingPhase++;
                
                // After phase 2, done viewing
                if (viewingPhase > 2) {
                    isViewingPainting = false;
                    viewingPhase = 0;
                    paintingLookDirection = null;
                    originalDirection = null;
                    currentPitch = 0;
                    targetCell = null;
                    navigationPath = [];
                    currentPathIndex = 0;
                }
            }
            
            camera.position.set(playerPosition.x, 1.2, playerPosition.z);
            camera.rotation.order = 'YXZ'; // Ensure proper rotation order
            camera.rotation.y = playerRotation;
            camera.rotation.x = currentPitch;
            return;
        }
        
        // If we're currently turning, handle the gradual rotation
        if (isTurning) {
            let angleDiff = targetRotation - playerRotation;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
            if (Math.abs(angleDiff) > TURN_SPEED) {
                playerRotation += Math.sign(angleDiff) * TURN_SPEED;
            } else {
                playerRotation = targetRotation;
                isTurning = false;
            }
        } else {
            // Not turning - follow path or pick new target
            const currentCell = worldToGrid(playerPosition.x, playerPosition.z);
            
            // If we don't have a target, pick a random one prioritizing unvisited cells
            if (!targetCell) {
                // Mark current cell as visited
                visitedCells.add(`${currentCell.x},${currentCell.z}`);
                
                let maxPathLength = 6;
                let bestTarget = null;
                let bestPath = [];
                
                // In open space mode, only target cells adjacent to boundary walls (edge cells)
                const isEdgeCell = (x, z) => {
                    const S = getEffectiveSize();
                    return x === 0 || x === S - 1 || z === 0 || z === S - 1;
                };
                
                // Helper to generate a random candidate cell
                const generateCandidate = () => {
                    if (sceneMode === 'openspace') {
                        const S = getEffectiveSize();
                        const edge = Math.floor(Math.random() * 4);
                        switch (edge) {
                            case 0: return { x: Math.floor(Math.random() * S), z: 0 };
                            case 1: return { x: Math.floor(Math.random() * S), z: S - 1 };
                            case 2: return { x: 0, z: Math.floor(Math.random() * S) };
                            case 3: return { x: S - 1, z: Math.floor(Math.random() * S) };
                        }
                    } else if (sceneMode === 'alley') {
                        // Only cells in the alley row
                        const alleyZ = Math.floor(MAZE_SIZE / 2);
                        return {
                            x: Math.floor(Math.random() * MAZE_SIZE),
                            z: alleyZ
                        };
                    } else {
                        return {
                            x: Math.floor(Math.random() * MAZE_SIZE),
                            z: Math.floor(Math.random() * MAZE_SIZE)
                        };
                    }
                };
                
                // Calculate total valid cells for this scene mode
                let totalValidCells;
                const S = getEffectiveSize();
                if (sceneMode === 'openspace') {
                    totalValidCells = S * 4 - 4; // Edge cells (perimeter minus corners counted twice)
                } else if (sceneMode === 'alley') {
                    totalValidCells = MAZE_SIZE; // Only cells in the alley row
                } else {
                    totalValidCells = MAZE_SIZE * MAZE_SIZE;
                }
                
                // Check if all valid cells have been visited
                const allVisited = visitedCells.size >= totalValidCells;
                
                // Try to find an unvisited cell first, then fall back to visited cells
                const requireUnvisited = !allVisited;
                
                // Keep increasing max path length until we find a target
                while (!bestTarget && maxPathLength <= S * 2) {
                    let attempts = 0;
                    
                    while (attempts < 50 && !bestTarget) {
                        const candidateTarget = generateCandidate();
                        
                        // Skip if same as current cell
                        if (candidateTarget.x === currentCell.x && candidateTarget.z === currentCell.z) {
                            attempts++;
                            continue;
                        }
                        
                        // Skip visited cells if we're prioritizing unvisited ones
                        const cellKey = `${candidateTarget.x},${candidateTarget.z}`;
                        if (requireUnvisited && visitedCells.has(cellKey)) {
                            attempts++;
                            continue;
                        }
                        
                        const start = { x: currentCell.x, z: currentCell.z };
                        const path = findPath(start, candidateTarget);
                        
                        // Accept if path exists and length <= current maxPathLength
                        if (path.length > 0 && path.length <= maxPathLength + 1) {
                            bestTarget = candidateTarget;
                            bestPath = path;
                        }
                        
                        attempts++;
                    }
                    
                    // If no unvisited cell found within this distance, increase limit
                    if (!bestTarget) {
                        maxPathLength++;
                    }
                }
                
                // If still no target found (all unvisited exhausted), try visited cells
                if (!bestTarget && requireUnvisited) {
                    maxPathLength = 6;
                    while (!bestTarget && maxPathLength <= S * 2) {
                        let attempts = 0;
                        while (attempts < 50 && !bestTarget) {
                            const candidateTarget = generateCandidate();
                            
                            if (candidateTarget.x === currentCell.x && candidateTarget.z === currentCell.z) {
                                attempts++;
                                continue;
                            }
                            
                            const start = { x: currentCell.x, z: currentCell.z };
                            const path = findPath(start, candidateTarget);
                            
                            if (path.length > 0 && path.length <= maxPathLength + 1) {
                                bestTarget = candidateTarget;
                                bestPath = path;
                            }
                            
                            attempts++;
                        }
                        if (!bestTarget) maxPathLength++;
                    }
                }
                
                if (bestTarget) {
                    targetCell = bestTarget;
                    navigationPath = bestPath;
                    currentPathIndex = navigationPath.length > 1 ? 1 : 0;
                    const isUnvisited = !visitedCells.has(`${bestTarget.x},${bestTarget.z}`);
                    console.log(`Target: (${targetCell.x}, ${targetCell.z}), path: ${navigationPath.length - 1} cells${isUnvisited ? ' (unvisited)' : ' (revisit)'}`);
                }
            }
            
            // If we have a path, follow it
            if (navigationPath.length > 0 && currentPathIndex < navigationPath.length) {
                const targetPathCell = navigationPath[currentPathIndex];
                const targetWorld = gridToWorld(targetPathCell.x, targetPathCell.z);
                
                const distToTarget = Math.sqrt(
                    Math.pow(playerPosition.x - targetWorld.x, 2) +
                    Math.pow(playerPosition.z - targetWorld.z, 2)
                );
                
                if (distToTarget < 0.3) {
                    // Reached this cell, move to next
                    currentPathIndex++;
                    
                    if (currentPathIndex >= navigationPath.length) {
                        // Reached final target - mark as visited and look for paintings
                        visitedCells.add(`${targetCell.x},${targetCell.z}`);
                        console.log(`Reached target (${targetCell.x}, ${targetCell.z}), visited: ${visitedCells.size} cells`);
                        
                        const paintings = getPaintingsAroundCell(targetCell.x, targetCell.z);
                        
                        if (paintings.length > 0) {
                            // Found a painting - look at it
                            const painting = paintings[0];
                            const dx = painting.worldX - playerPosition.x;
                            const dz = painting.worldZ - playerPosition.z;
                            paintingLookDirection = Math.atan2(-dx, -dz);
                            originalDirection = playerRotation;
                            
                            // Calculate pitch angles based on stored painting positions
                            const horizontalDist = Math.sqrt(dx * dx + dz * dz);
                            const posKey = `${painting.key}-${painting.facingSide}`;
                            const positions = paintingPositions.get(posKey);
                            if (positions) {
                                paintingCenterPitch = Math.atan2(positions.centerY - PLAYER_EYE_HEIGHT, horizontalDist);
                                platePitch = Math.atan2(positions.plateY - PLAYER_EYE_HEIGHT, horizontalDist);
                            } else {
                                // Fallback to approximate values
                                paintingCenterPitch = Math.atan2(1.0 - PLAYER_EYE_HEIGHT, horizontalDist);
                                platePitch = Math.atan2(0.5 - PLAYER_EYE_HEIGHT, horizontalDist);
                            }
                            
                            isViewingPainting = true;
                            viewingPaintingTimer = 0;
                            viewingPhase = 0;
                            currentPitch = 0;
                            console.log(`Looking at painting on wall ${painting.key}`);
                        } else {
                            // No paintings - try to load one
                            console.log(`No painting found, loading one...`);
                            loadPaintingInCell(targetCell.x, targetCell.z).then(wall => {
                                if (wall) {
                                    const dx = wall.worldX - playerPosition.x;
                                    const dz = wall.worldZ - playerPosition.z;
                                    paintingLookDirection = Math.atan2(-dx, -dz);
                                    originalDirection = playerRotation;
                                    
                                    // Calculate pitch angles based on stored painting positions
                                    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
                                    const posKey = `${wall.key}-${wall.facingSide}`;
                                    const positions = paintingPositions.get(posKey);
                                    if (positions) {
                                        paintingCenterPitch = Math.atan2(positions.centerY - PLAYER_EYE_HEIGHT, horizontalDist);
                                        platePitch = Math.atan2(positions.plateY - PLAYER_EYE_HEIGHT, horizontalDist);
                                    } else {
                                        // Fallback to approximate values
                                        paintingCenterPitch = Math.atan2(1.0 - PLAYER_EYE_HEIGHT, horizontalDist);
                                        platePitch = Math.atan2(0.5 - PLAYER_EYE_HEIGHT, horizontalDist);
                                    }
                                    
                                    isViewingPainting = true;
                                    viewingPaintingTimer = 0;
                                    viewingPhase = 0;
                                    currentPitch = 0;
                                    console.log(`Loaded painting on wall ${wall.key}`);
                                } else {
                                    // No wall available - pick new target
                                    console.log(`No wall available for painting`);
                                    targetCell = null;
                                    navigationPath = [];
                                    currentPathIndex = 0;
                                }
                            });
                        }
                    }
                } else {
                    // Move towards current path cell
                    const dx = targetWorld.x - playerPosition.x;
                    const dz = targetWorld.z - playerPosition.z;
                    const targetAngle = Math.atan2(-dx, -dz);
                    
                    let angleDiff = targetAngle - playerRotation;
                    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                    
                    if (Math.abs(angleDiff) > 0.1) {
                        // Need to turn
                        isTurning = true;
                        targetRotation = targetAngle;
                    } else {
                        // Move forward
                        const moveX = -Math.sin(playerRotation) * AUTO_MOVE_SPEED;
                        const moveZ = -Math.cos(playerRotation) * AUTO_MOVE_SPEED;
                        
                        const newX = playerPosition.x + moveX;
                        const newZ = playerPosition.z + moveZ;
                        
                        if (isValidPosition(newX, newZ)) {
                            playerPosition.x = newX;
                            playerPosition.z = newZ;
                        }
                        
                        // Wrap around for endless alley mode
                        if (sceneMode === 'alley') {
                            const minX = (-MAZE_SIZE / 2) * CELL_SIZE;
                            const maxX = (MAZE_SIZE / 2) * CELL_SIZE;
                            const alleyWidth = maxX - minX;
                            
                            if (playerPosition.x < minX) {
                                playerPosition.x += alleyWidth;
                                handleAlleyCrossing();
                            } else if (playerPosition.x > maxX) {
                                playerPosition.x -= alleyWidth;
                                handleAlleyCrossing();
                            }
                        }
                        
                        // Door crossing for openspace mode (auto)
                        if (sceneMode === 'openspace') {
                            const halfSize = (getEffectiveSize() * CELL_SIZE) / 2;
                            
                            // Detect which door was crossed and pass to handler
                            let exitDirection = null;
                            if (playerPosition.x < -halfSize) exitDirection = 'west';
                            else if (playerPosition.x > halfSize) exitDirection = 'east';
                            else if (playerPosition.z < -halfSize) exitDirection = 'north';
                            else if (playerPosition.z > halfSize) exitDirection = 'south';
                            
                            if (exitDirection) {
                                handleOpenspaceDoorCrossing(exitDirection);
                            }
                        }
                    }
                }
            }
        }
        
        // Update camera
        camera.position.set(playerPosition.x, 1.2, playerPosition.z);
        camera.rotation.order = 'YXZ';
        camera.rotation.y = playerRotation;
        camera.rotation.x = 0; // Keep horizontal when not viewing paintings
        return;
    }
    
    // Manual controls (only when not in auto mode)
    // Rotation
    if (controls.left) {
        playerRotation += ROTATION_SPEED;
    }
    if (controls.right) {
        playerRotation -= ROTATION_SPEED;
    }
    
    // Movement
    let moveX = 0;
    let moveZ = 0;
    
    // Use quarter speed in alley mode
    const currentMoveSpeed = sceneMode === 'alley' ? MOVE_SPEED / 4 : MOVE_SPEED;
    
    if (controls.forward) {
        moveX -= Math.sin(playerRotation) * currentMoveSpeed;
        moveZ -= Math.cos(playerRotation) * currentMoveSpeed;
    }
    if (controls.backward) {
        moveX += Math.sin(playerRotation) * currentMoveSpeed;
        moveZ += Math.cos(playerRotation) * currentMoveSpeed;
    }
    
    // Update position with collision detection
    const newX = playerPosition.x + moveX;
    const newZ = playerPosition.z + moveZ;
    
    if (isValidPosition(newX, playerPosition.z)) {
        playerPosition.x = newX;
    }
    if (isValidPosition(playerPosition.x, newZ)) {
        playerPosition.z = newZ;
    }
    
    // Wrap around for endless alley mode
    if (sceneMode === 'alley') {
        const minX = (-MAZE_SIZE / 2) * CELL_SIZE;
        const maxX = (MAZE_SIZE / 2) * CELL_SIZE;
        const alleyWidth = maxX - minX;
        
        if (playerPosition.x < minX) {
            playerPosition.x += alleyWidth;
            handleAlleyCrossing();
        } else if (playerPosition.x > maxX) {
            playerPosition.x -= alleyWidth;
            handleAlleyCrossing();
        }
    }
    
    // Door crossing for openspace mode
    if (sceneMode === 'openspace') {
        const halfSize = (getEffectiveSize() * CELL_SIZE) / 2;
        
        // Detect which door was crossed and pass to handler
        let exitDirection = null;
        if (playerPosition.x < -halfSize) exitDirection = 'west';
        else if (playerPosition.x > halfSize) exitDirection = 'east';
        else if (playerPosition.z < -halfSize) exitDirection = 'north';
        else if (playerPosition.z > halfSize) exitDirection = 'south';
        
        if (exitDirection) {
            handleOpenspaceDoorCrossing(exitDirection);
        }
    }
    
    // Update camera
    camera.position.set(playerPosition.x, 1.2, playerPosition.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = playerRotation;
    camera.rotation.x = 0; // Keep horizontal in manual mode
}

// Draw minimap
function drawMinimap() {
    if (!minimapCtx || !mazeData || !minimapVisible) return;
    
    const SIZE = getEffectiveSize();
    const size = minimapCanvas.width;
    const cellSize = size / SIZE;
    const { horizontalWalls, verticalWalls } = mazeData;
    
    // Clear canvas
    minimapCtx.fillStyle = '#000';
    minimapCtx.fillRect(0, 0, size, size);
    
    // Draw maze background (all cells are paths)
    minimapCtx.fillStyle = '#333';
    minimapCtx.fillRect(0, 0, size, size);
    
    // Draw walls as thin lines
    const wallThickness = Math.max(2, cellSize * 0.1);
    
    // Draw horizontal walls (between rows)
    for (let y = 0; y <= SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (horizontalWalls[y] && horizontalWalls[y][x]) {
                const wallKey = `horizontal-${x}-${y}`;
                // Use orange for Wikipedia walls, gray for regular walls
                minimapCtx.fillStyle = wikipediaWalls.has(wallKey) ? '#FF8C00' : '#666';
                minimapCtx.fillRect(
                    x * cellSize,
                    y * cellSize - wallThickness / 2,
                    cellSize,
                    wallThickness
                );
            }
        }
    }
    
    // Draw vertical walls (between columns)
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x <= SIZE; x++) {
            if (verticalWalls[y] && verticalWalls[y][x]) {
                const wallKey = `vertical-${x}-${y}`;
                // Use orange for Wikipedia walls, gray for regular walls
                minimapCtx.fillStyle = wikipediaWalls.has(wallKey) ? '#FF8C00' : '#666';
                minimapCtx.fillRect(
                    x * cellSize - wallThickness / 2,
                    y * cellSize,
                    wallThickness,
                    cellSize
                );
            }
        }
    }
    
    // Draw target cell if in auto mode
    if (autoMode && targetCell) {
        minimapCtx.fillStyle = '#8B0000'; // Dark red
        minimapCtx.fillRect(
            targetCell.x * cellSize,
            targetCell.z * cellSize,
            cellSize,
            cellSize
        );
    }
    
    // Draw player position
    const gridPos = worldToGrid(playerPosition.x, playerPosition.z);
    const playerX = gridPos.x * cellSize + cellSize / 2;
    const playerY = gridPos.z * cellSize + cellSize / 2;
    
    // Draw player as a circle
    minimapCtx.fillStyle = '#0f0';
    minimapCtx.beginPath();
    minimapCtx.arc(playerX, playerY, cellSize * 0.3, 0, Math.PI * 2);
    minimapCtx.fill();
    
    // Draw viewing direction as an arrow
    // Movement uses: moveX -= sin(rotation), moveZ -= cos(rotation) for forward
    // So forward direction is: (-sin(rotation), -cos(rotation)) in world (X, Z)
    // In minimap: world X -> canvas X, world Z -> canvas Y (but canvas Y increases downward)
    const arrowLength = cellSize * 0.8;
    
    // Calculate forward direction in world space (matching movement code)
    const worldDirX = -Math.sin(playerRotation);
    const worldDirZ = -Math.cos(playerRotation);
    
    // Convert to canvas coordinates (Z -> Y, and invert Y because canvas Y increases downward)
    const canvasDirX = worldDirX;
    const canvasDirY = worldDirZ; // Don't invert - canvas Y direction matches world Z direction
    
    const arrowTipX = playerX + canvasDirX * arrowLength;
    const arrowTipY = playerY + canvasDirY * arrowLength;
    
    // Draw arrow shaft
    minimapCtx.strokeStyle = '#0f0';
    minimapCtx.fillStyle = '#0f0';
    minimapCtx.lineWidth = 2;
    minimapCtx.beginPath();
    minimapCtx.moveTo(playerX, playerY);
    minimapCtx.lineTo(arrowTipX, arrowTipY);
    minimapCtx.stroke();
    
    // Draw arrowhead as a triangle
    const arrowHeadSize = cellSize * 0.3;
    const arrowAngle = Math.atan2(canvasDirY, canvasDirX); // Angle of the arrow direction
    
    // Calculate arrowhead points (triangle pointing forward)
    const headBaseX1 = arrowTipX - arrowHeadSize * Math.cos(arrowAngle) + arrowHeadSize * 0.5 * Math.cos(arrowAngle + Math.PI / 2);
    const headBaseY1 = arrowTipY - arrowHeadSize * Math.sin(arrowAngle) + arrowHeadSize * 0.5 * Math.sin(arrowAngle + Math.PI / 2);
    
    const headBaseX2 = arrowTipX - arrowHeadSize * Math.cos(arrowAngle) - arrowHeadSize * 0.5 * Math.cos(arrowAngle + Math.PI / 2);
    const headBaseY2 = arrowTipY - arrowHeadSize * Math.sin(arrowAngle) - arrowHeadSize * 0.5 * Math.sin(arrowAngle + Math.PI / 2);
    
    // Draw filled arrowhead triangle
    minimapCtx.beginPath();
    minimapCtx.moveTo(arrowTipX, arrowTipY);
    minimapCtx.lineTo(headBaseX1, headBaseY1);
    minimapCtx.lineTo(headBaseX2, headBaseY2);
    minimapCtx.closePath();
    minimapCtx.fill();
    
    // Draw arrowhead outline for better visibility
    minimapCtx.strokeStyle = '#0f0';
    minimapCtx.lineWidth = 1;
    minimapCtx.stroke();
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    updateMovement();
    updateAlleyFog();
    drawMinimap();
    if (statsVisible && statsDiv) {
        updateStatsDisplay();
    }
    renderer.render(scene, camera);
}

// Update alley fog (placeholder - fog is now handled by Three.js fog + fixed end planes)
function updateAlleyFog() {
    // Three.js fog handles the consistent distance-based fog
    // Fixed planes at the ends handle the extra darkness near entrances/exits
}

// Clear all paintings from walls
function clearAllPaintings() {
    if (!globalWallMeshMap) return;
    
    // Remove all frame groups from walls
    globalWallMeshMap.forEach((wallMesh, wallKey) => {
        // Find and remove all frame groups (children that are Groups)
        const childrenToRemove = [];
        wallMesh.children.forEach(child => {
            if (child.isGroup) {
                childrenToRemove.push(child);
            }
        });
        childrenToRemove.forEach(child => {
            wallMesh.remove(child);
            // Dispose of geometries and materials
            child.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (obj.material.map) obj.material.map.dispose();
                    obj.material.dispose();
                }
            });
        });
    });
    
    // Clear tracking data
    wikipediaWalls.clear();
    paintingPositions.clear();
    frameGroups.clear();
}

// Reload all paintings with current settings
async function reloadAllPaintings() {
    console.log('reloadAllPaintings called, isLoadingImages:', isLoadingImages);
    
    // If already loading, signal cancellation and wait a bit
    if (isLoadingImages) {
        console.log('Cancelling current loading...');
        cancelLoading = true;
        // Wait for current operation to notice the cancellation
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Capture current generation to detect if we've been invalidated
    const myGeneration = mazeGeneration;
    
    console.log('Starting new load...');
    isLoadingImages = true;
    cancelLoading = false;
    
    // Reset image caches
    topicSearchResults = [];
    topicSearchIndex = 0;
    topicResultsFetched = false;
    randomImageResults = [];
    randomImageIndex = 0;
    
    // Clear existing paintings
    clearAllPaintings();
    
    // Get player position for distance sorting
    const playerStartX = playerPosition.x;
    const playerStartZ = playerPosition.z;
    
    // Calculate distance for each wall and sort
    const wallsWithDistance = Array.from(globalWallMeshMap.keys()).map(wallKey => {
        let wallX, wallZ;
        
        const [type, xStr, yStr] = wallKey.split('-');
        const x = parseInt(xStr);
        const y = parseInt(yStr);
        
        const SIZE = getEffectiveSize();
        if (type === 'horizontal') {
            wallX = (x - SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
            wallZ = (y - SIZE / 2) * CELL_SIZE;
        } else {
            wallX = (x - SIZE / 2) * CELL_SIZE;
            wallZ = (y - SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
        }
        
        const dx = wallX - playerStartX;
        const dz = wallZ - playerStartZ;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        return { wallKey, distance, type };
    });
    
    wallsWithDistance.sort((a, b) => a.distance - b.distance);
    
    // Calculate total images to load (edge walls = 1 image, internal walls = 2 images)
    loadedImagesCount = 0;
    totalImagesToLoad = 0;
    const SIZE = getEffectiveSize();
    const alleyZ = Math.floor(MAZE_SIZE / 2);
    for (const { wallKey } of wallsWithDistance) {
        const [wallType, xStr, yStr] = wallKey.split('-');
        const x = parseInt(xStr);
        const y = parseInt(yStr);
        let isEdgeWall = 
            (wallType === 'horizontal' && (y === 0 || y === SIZE)) ||
            (wallType === 'vertical' && (x === 0 || x === SIZE));
        // In alley mode, alley walls are also edge walls
        if (sceneMode === 'alley' && wallType === 'horizontal' && (y === alleyZ || y === alleyZ + 1)) {
            isEdgeWall = true;
        }
        totalImagesToLoad += isEdgeWall ? 1 : 2;
    }
    
    // Load images
    for (const { wallKey, type } of wallsWithDistance) {
        // Check for cancellation or generation change
        if (cancelLoading || mazeGeneration !== myGeneration) {
            console.log('Loading cancelled or generation changed');
            isLoadingImages = false;
            return;
        }
        
        if (wikipediaWalls.has(wallKey)) continue;
        
        const wall = globalWallMeshMap.get(wallKey);
        if (!wall) continue;
        
        wikipediaWalls.add(wallKey);
        
        const [wallType, xStr, yStr] = wallKey.split('-');
        const x = parseInt(xStr);
        const y = parseInt(yStr);
        
        let isEdgeWall = 
            (wallType === 'horizontal' && (y === 0 || y === SIZE)) ||
            (wallType === 'vertical' && (x === 0 || x === SIZE));
        
        // In alley mode, alley walls are also edge walls
        let isAlleyWall = false;
        if (sceneMode === 'alley' && wallType === 'horizontal' && (y === alleyZ || y === alleyZ + 1)) {
            isAlleyWall = true;
        }
        
        if (isEdgeWall || isAlleyWall) {
            let side;
            if (isAlleyWall) {
                // Alley walls: y=alleyZ faces south (into alley), y=alleyZ+1 faces north (into alley)
                side = y === alleyZ ? 'positive' : 'negative';
            } else if (wallType === 'horizontal') {
                side = y === 0 ? 'positive' : 'negative';
            } else {
                side = x === 0 ? 'positive' : 'negative';
            }
            
            const result = await getWikipediaImage();
            if (cancelLoading || mazeGeneration !== myGeneration) { isLoadingImages = false; return; }
            if (result && result.imageUrl) {
                await globalCreateFramedPicture(result.imageUrl, wall, type, side, result.title, wallKey);
            } else {
                wikipediaWalls.delete(wallKey);
            }
            loadedImagesCount++;
        } else {
            const result1 = await getWikipediaImage();
            if (cancelLoading || mazeGeneration !== myGeneration) { isLoadingImages = false; return; }
            if (result1 && result1.imageUrl) {
                await globalCreateFramedPicture(result1.imageUrl, wall, type, 'positive', result1.title, wallKey);
            }
            loadedImagesCount++;
            
            const result2 = await getWikipediaImage();
            if (cancelLoading || mazeGeneration !== myGeneration) { isLoadingImages = false; return; }
            if (result2 && result2.imageUrl) {
                await globalCreateFramedPicture(result2.imageUrl, wall, type, 'negative', result2.title, wallKey);
            }
            loadedImagesCount++;
            
            if (!(result1 && result1.imageUrl) && !(result2 && result2.imageUrl)) {
                wikipediaWalls.delete(wallKey);
            }
        }
    }
    
    isLoadingImages = false;
    console.log('Finished loading images');
}

// Handle crossing alley boundary - load fresh paintings
async function handleAlleyCrossing() {
    if (sceneMode !== 'alley') return;
    
    console.log('Crossed alley boundary, loading fresh paintings...');
    
    // Clear current paintings
    clearAllPaintings();
    
    // Load new paintings
    await reloadAllPaintings();
}

// Handle crossing openspace door - generate new room with random size
// exitDirection: 'north', 'south', 'east', 'west' - which door the player exited through
async function handleOpenspaceDoorCrossing(exitDirection) {
    if (sceneMode !== 'openspace') return;
    
    // Prevent concurrent door crossings (function is called from animation loop without await)
    if (isTransitioningRoom) {
        console.log('Already transitioning room, ignoring duplicate call');
        return;
    }
    isTransitioningRoom = true;
    
    try {
        // Pick a new random room size
        const newSize = getRandomOpenspaceSize();
        console.log(`Crossed ${exitDirection} door, generating new ${newSize}x${newSize} room...`);
        openspaceSize = newSize;
        
        // Regenerate the entire scene with new size
        // Note: createMaze already starts loading paintings via its async IIFE
        // Do NOT call reloadAllPaintings here as it would race with createMaze's loading
        await regenerateScene();
        
        // Position player at the opposite door of the new room
        const newHalfSize = (newSize * CELL_SIZE) / 2;
        const doorOffset = 0.5; // How far inside the door to spawn
        
        switch (exitDirection) {
            case 'east':
                // Exited east, spawn at west door, face center (east)
                playerPosition.x = -newHalfSize + doorOffset;
                playerPosition.z = 0;
                playerRotation = -Math.PI / 2; // Face east (toward center)
                break;
            case 'west':
                // Exited west, spawn at east door, face center (west)
                playerPosition.x = newHalfSize - doorOffset;
                playerPosition.z = 0;
                playerRotation = Math.PI / 2; // Face west (toward center)
                break;
            case 'south':
                // Exited south, spawn at north door, face center (south)
                playerPosition.x = 0;
                playerPosition.z = -newHalfSize + doorOffset;
                playerRotation = Math.PI; // Face south (toward center)
                break;
            case 'north':
                // Exited north, spawn at south door, face center (north)
                playerPosition.x = 0;
                playerPosition.z = newHalfSize - doorOffset;
                playerRotation = 0; // Face north (toward center)
                break;
            default:
                // Fallback to center
                playerPosition.x = 0;
                playerPosition.z = 0;
        }
        
        camera.position.set(playerPosition.x, 1.2, playerPosition.z);
        camera.rotation.y = playerRotation;
    } finally {
        isTransitioningRoom = false;
    }
}

// Update stats display
function updateStatsDisplay() {
    if (!statsDiv) return;
    
    const currentCell = worldToGrid(playerPosition.x, playerPosition.z);
    
    // Check if controls section exists, if not create the full structure
    let statsContent = statsDiv.querySelector('#stats-content');
    if (!statsContent) {
        statsDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <span style="font-weight: bold;">=== Menu ===</span>
                <span id="close-menu-btn" style="cursor: pointer; font-size: 16px;" title="Close menu">✕</span>
            </div>
            <div id="stats-content"></div>
            <hr style="border-color: #666; margin: 10px 0;">
            <div style="font-weight: bold; margin-bottom: 5px;">=== Scene ===</div>
            <div style="margin-bottom: 8px;">
                <select id="scene-mode-select" style="width: 100%; padding: 3px; background: #333; color: #fff; border: 1px solid #666;">
                    <option value="maze" ${sceneMode === 'maze' ? 'selected' : ''}>Maze</option>
                    <option value="openspace" ${sceneMode === 'openspace' ? 'selected' : ''}>Open Space</option>
                    <option value="alley" ${sceneMode === 'alley' ? 'selected' : ''}>Endless Alley</option>
                </select>
            </div>
            <div style="margin-bottom: 8px; margin-top: 8px;">
                <div style="margin-bottom: 3px;">Textures:</div>
                <select id="texture-style-select" style="width: 100%; padding: 3px; background: #333; color: #fff; border: 1px solid #666;">
                    <option value="w95" ${textureStyle === 'w95' ? 'selected' : ''}>W95</option>
                    <option value="entirewall" ${textureStyle === 'entirewall' ? 'selected' : ''}>Entire Wall</option>
                    <option value="backrooms" ${textureStyle === 'backrooms' ? 'selected' : ''}>Backrooms</option>
                </select>
            </div>
            <hr style="border-color: #666; margin: 10px 0;">
            <div style="font-weight: bold; margin-bottom: 5px;">=== Options ===</div>
            <div style="margin-bottom: 8px;">
                <label style="cursor: pointer; display: block; margin-bottom: 5px;">
                    <input type="checkbox" id="auto-mode-checkbox" ${autoMode ? 'checked' : ''}>
                    Auto movement
                </label>
                <label style="cursor: pointer; display: block; margin-bottom: 5px;">
                    <input type="checkbox" id="minimap-checkbox" ${minimapVisible ? 'checked' : ''}>
                    Show minimap
                </label>
                <label style="cursor: pointer; display: block;">
                    <input type="checkbox" id="collisions-checkbox" ${collisionsEnabled ? 'checked' : ''}>
                    Wall collisions
                </label>
            </div>
            <hr style="border-color: #666; margin: 10px 0;">
            <div style="font-weight: bold; margin-bottom: 5px;">=== Images ===</div>
            <div id="loading-status" style="margin-bottom: 8px; display: none;"></div>
            <div style="margin-bottom: 8px;">
                <button id="reload-images-btn" style="padding: 5px 10px; background: #555; color: #fff; border: 1px solid #888; cursor: pointer; font-size: 12px; width: 100%;">Reload images</button>
            </div>
            <div style="margin-bottom: 8px;">
                <label style="cursor: pointer;">
                    <input type="checkbox" id="random-images-checkbox" ${useRandomImages ? 'checked' : ''}>
                    Random images
                </label>
            </div>
            <div id="topic-controls" style="display: ${useRandomImages ? 'none' : 'block'};">
                <div style="margin-bottom: 5px;">Topic:</div>
                <div style="display: flex; gap: 5px;">
                    <input type="text" id="topic-input" value="${searchTopic}" 
                           style="flex: 1; padding: 3px; background: #333; color: #fff; border: 1px solid #666;">
                    <button id="load-topic-btn" 
                            style="padding: 3px 8px; background: #4a4; color: #fff; border: none; cursor: pointer;">
                        Load
                    </button>
                </div>
            </div>
        `;
        
        // Attach event handlers
        const closeBtn = statsDiv.querySelector('#close-menu-btn');
        const sceneModeSelect = statsDiv.querySelector('#scene-mode-select');
        const textureStyleSelect = statsDiv.querySelector('#texture-style-select');
        const autoModeCheckbox = statsDiv.querySelector('#auto-mode-checkbox');
        const minimapCheckbox = statsDiv.querySelector('#minimap-checkbox');
        const collisionsCheckbox = statsDiv.querySelector('#collisions-checkbox');
        const randomCheckbox = statsDiv.querySelector('#random-images-checkbox');
        const topicControls = statsDiv.querySelector('#topic-controls');
        const topicInput = statsDiv.querySelector('#topic-input');
        const loadBtn = statsDiv.querySelector('#load-topic-btn');
        
        closeBtn.addEventListener('click', () => {
            statsVisible = false;
            statsDiv.style.display = 'none';
            const menuToggle = document.getElementById('menu-toggle');
            if (menuToggle) menuToggle.style.display = 'block';
        });
        
        sceneModeSelect.addEventListener('change', (e) => {
            sceneMode = e.target.value;
            regenerateScene();
        });
        
        textureStyleSelect.addEventListener('change', (e) => {
            textureStyle = e.target.value;
            // Regenerate scene since floor, ceiling, and wall materials change
            regenerateScene();
        });
        
        autoModeCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                // Enable auto mode (same as Z key)
                autoMode = true;
                isTurning = false;
                targetCell = null;
                navigationPath = [];
                currentPathIndex = 0;
                visitedCells.clear();
                isViewingPainting = false;
                viewingPaintingTimer = 0;
                viewingPhase = 0;
                paintingLookDirection = null;
                originalDirection = null;
                currentPitch = 0;
            } else {
                autoMode = false;
            }
        });
        
        minimapCheckbox.addEventListener('change', (e) => {
            minimapVisible = e.target.checked;
            if (minimapCanvas) {
                minimapCanvas.style.display = minimapVisible ? 'block' : 'none';
            }
        });
        
        collisionsCheckbox.addEventListener('change', (e) => {
            collisionsEnabled = e.target.checked;
        });
        
        randomCheckbox.addEventListener('change', (e) => {
            useRandomImages = e.target.checked;
            topicControls.style.display = useRandomImages ? 'none' : 'block';
            if (useRandomImages) {
                // Reload images when switching back to random mode
                reloadAllPaintings();
            } else {
                // Switching to topic mode - clear current images
                cancelLoading = true;
                clearAllPaintings();
                // If there's already a topic, start loading it
                if (searchTopic && searchTopic.trim() !== '') {
                    reloadAllPaintings();
                }
                // Otherwise wait for user to enter a topic and press Load
            }
        });
        
        topicInput.addEventListener('input', (e) => {
            searchTopic = e.target.value;
        });
        
        topicInput.addEventListener('keydown', (e) => {
            e.stopPropagation(); // Prevent game controls from triggering
        });
        
        topicInput.addEventListener('keyup', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !isLoadingImages) {
                reloadAllPaintings();
            }
        });
        
        // Reload images button handler
        const reloadImagesBtn = statsDiv.querySelector('#reload-images-btn');
        reloadImagesBtn.addEventListener('click', () => {
            console.log('Reload images button clicked');
            reloadAllPaintings();
        });
        
        loadBtn.addEventListener('click', () => {
            console.log('Load topic button clicked');
            reloadAllPaintings();
        });
        
        statsContent = statsDiv.querySelector('#stats-content');
    }
    
    // Update only the dynamic stats content
    statsContent.innerHTML = `
        <div>Position: (${playerPosition.x.toFixed(1)}, ${playerPosition.z.toFixed(1)})</div>
        <div>Cell: (${currentCell.x}, ${currentCell.z})</div>
        <div>Target: ${targetCell ? `(${targetCell.x}, ${targetCell.z})` : '-'}</div>
    `;
    
    // Update loading status display
    const loadingStatus = statsDiv.querySelector('#loading-status');
    if (loadingStatus) {
        if (isLoadingImages) {
            loadingStatus.style.display = 'block';
            loadingStatus.textContent = `Loading: ${loadedImagesCount}/${totalImagesToLoad}`;
        } else {
            loadingStatus.style.display = 'none';
        }
    }
    
    // Update reload button appearance
    const reloadImagesBtn = statsDiv.querySelector('#reload-images-btn');
    if (reloadImagesBtn) {
        reloadImagesBtn.style.background = isLoadingImages ? '#833' : '#555';
        reloadImagesBtn.textContent = isLoadingImages ? 'Cancel & Reload' : 'Reload images';
    }
    
    // Update checkbox states
    const autoModeCheckbox = statsDiv.querySelector('#auto-mode-checkbox');
    if (autoModeCheckbox && autoModeCheckbox.checked !== autoMode) {
        autoModeCheckbox.checked = autoMode;
    }
    
    const minimapCheckbox = statsDiv.querySelector('#minimap-checkbox');
    if (minimapCheckbox && minimapCheckbox.checked !== minimapVisible) {
        minimapCheckbox.checked = minimapVisible;
    }
    
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start the application
init();

