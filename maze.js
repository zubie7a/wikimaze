// Maze dimensions
const MAZE_SIZE = 10;
const CELL_SIZE = 2;
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
let statsDiv = null; // Stats display element
let statsVisible = false; // Stats visibility state
let wikipediaWalls = new Set(); // Track which walls have Wikipedia textures (format: "type-x-y")

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

// Auto mode: random movement and looking
let autoMode = true; // Start with auto mode enabled by default
let isTurning = false; // Whether we're currently turning after collision
let targetRotation = 0; // Target rotation angle when turning
let lastPositionCheck = { x: 0, z: 0 }; // Last position for distance check
let positionCheckTimer = 0; // Timer for checking if player has moved
let lastCellX = -1; // Last cell X coordinate
let lastCellZ = -1; // Last cell Z coordinate
let cellsMoved = 0; // Counter for cells moved
let lastPlayerX = 0; // Last player X position for midline crossing detection
let lastPlayerZ = 0; // Last player Z position for midline crossing detection
const TURN_SPEED = 0.03; // Speed of gradual turning
const POSITION_CHECK_INTERVAL = 60; // Frames between position checks
const MIN_MOVEMENT_DISTANCE = 0.5; // Minimum distance player must move to avoid turning
const CELLS_BEFORE_TURN = 5; // Number of cells to move before random turn

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
    
    return { horizontalWalls, verticalWalls };
}


// Fetch a random Wikipedia image and title
async function fetchRandomWikipediaImage() {
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            // Get a random Wikipedia article with its thumbnail
            const response = await fetch(
                'https://en.wikipedia.org/w/api.php?action=query&generator=random&grnnamespace=0&prop=pageimages&pithumbsize=400&format=json&origin=*'
            );
            const data = await response.json();
            
            const pages = data.query?.pages;
            if (pages) {
                const pageId = Object.keys(pages)[0];
                const page = pages[pageId];
                
                if (page.thumbnail) {
                    return {
                        imageUrl: page.thumbnail.source,
                        title: page.title
                    };
                }
            }
        } catch (error) {
            console.log('Error fetching Wikipedia image, retrying...', error);
        }
    }
    return null; // No image found after max attempts
}

// Create the 3D maze from boundary walls
async function createMaze(wallData) {
    const group = new THREE.Group();
    const { horizontalWalls, verticalWalls } = wallData;
    
    // Create floor (brown)
    const floorGeometry = new THREE.PlaneGeometry(
        MAZE_SIZE * CELL_SIZE,
        MAZE_SIZE * CELL_SIZE
    );
    const floorMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x8B4513 // Brown
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    group.add(floor);
    
    // Create ceiling (gray/rock)
    const ceilingGeometry = new THREE.PlaneGeometry(
        MAZE_SIZE * CELL_SIZE,
        MAZE_SIZE * CELL_SIZE
    );
    const ceilingMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x708090 // Slate gray
    });
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_HEIGHT - 0.5;
    group.add(ceiling);
    
    // Texture loader for Wikipedia images
    const textureLoader = new THREE.TextureLoader();
    
    // Load default wall texture (brick texture)
    const defaultWallTexture = textureLoader.load(
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSUg8n8t7AKXzKt5-Sr9O96avECwEZnGShJWQ&s',
        function(texture) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(2, 2);
        }
    );
    
    // Default wall material with brick texture
    const defaultWallMaterial = new THREE.MeshLambertMaterial({ 
        map: defaultWallTexture
    });
    
    // Collect all wall positions (only walls that exist after pruning)
    // This ensures we don't try to assign Wikipedia images to pruned walls
    const wallPositions = [];
    for (let y = 0; y <= MAZE_SIZE; y++) {
        for (let x = 0; x < MAZE_SIZE; x++) {
            if (horizontalWalls[y][x]) {
                wallPositions.push({ type: 'horizontal', x, y });
            }
        }
    }
    for (let y = 0; y < MAZE_SIZE; y++) {
        for (let x = 0; x <= MAZE_SIZE; x++) {
            if (verticalWalls[y][x]) {
                wallPositions.push({ type: 'vertical', x, y });
            }
        }
    }
    
    // Select walls for Wikipedia images
    const wikipediaWallKeys = new Set();
    
    if (FILL_ALL_WALLS_WITH_WIKIPEDIA) {
        // Fill entire maze with Wikipedia walls
        for (const wallPos of wallPositions) {
            const wallKey = `${wallPos.type}-${wallPos.x}-${wallPos.y}`;
            wikipediaWallKeys.add(wallKey);
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
            const wallKey = `${wallPos.type}-${wallPos.x}-${wallPos.y}`;
            wikipediaWallKeys.add(wallKey);
        }
    }
    
    // Create a map to track which walls should get Wikipedia images
    const wallMeshMap = new Map(); // Maps wall key to mesh object
    
    // Create all horizontal walls with brick texture first
    for (let y = 0; y <= MAZE_SIZE; y++) {
        for (let x = 0; x < MAZE_SIZE; x++) {
            if (horizontalWalls[y][x]) {
                const wallGeometry = new THREE.BoxGeometry(
                    CELL_SIZE,
                    WALL_HEIGHT,
                    WALL_THICKNESS
                );
                
                const wall = new THREE.Mesh(wallGeometry, defaultWallMaterial);
                wall.position.set(
                    (x - MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2,
                    WALL_HEIGHT / 2 - 0.5,
                    (y - MAZE_SIZE / 2) * CELL_SIZE
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
    for (let y = 0; y < MAZE_SIZE; y++) {
        for (let x = 0; x <= MAZE_SIZE; x++) {
            if (verticalWalls[y][x]) {
                const wallGeometry = new THREE.BoxGeometry(
                    WALL_THICKNESS,
                    WALL_HEIGHT,
                    CELL_SIZE
                );
                
                const wall = new THREE.Mesh(wallGeometry, defaultWallMaterial);
                wall.position.set(
                    (x - MAZE_SIZE / 2) * CELL_SIZE,
                    WALL_HEIGHT / 2 - 0.5,
                    (y - MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2
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
    function createFramedPicture(imageUrl, wall, wallType, side, title) {
        return new Promise((resolve) => {
            // Load texture first, then get dimensions from it (only loads once)
            const pictureTexture = textureLoader.load(
                imageUrl,
                function(texture) {
                    texture.wrapS = THREE.ClampToEdgeWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    
                    // Get dimensions from loaded texture
                    const dimensions = {
                        width: texture.image.width,
                        height: texture.image.height
                    };
                    const aspectRatio = dimensions.width / dimensions.height;
                    
                    // Wall dimensions
                    const wallWidth = CELL_SIZE;
                    const wallHeight = WALL_HEIGHT;
                    
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
                    
                    // Create frame group
                    const frameGroup = new THREE.Group();
                    
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
                    
                    // Add frame group to wall
                    wall.add(frameGroup);
                    
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

    // Asynchronously load Wikipedia images and create framed pictures
    // Sort walls by distance from player starting position
    (async () => {
        const playerStartX = (-MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
        const playerStartZ = (-MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
        
        // Calculate distance for each wall and sort
        // Only process walls that actually exist (were created and are in wallMeshMap)
        // This ensures we don't try to fetch images for pruned walls
        const wallsWithDistance = Array.from(wallMeshMap.keys()).map(wallKey => {
            let wallX, wallZ;
            
            // Parse wall key to get position
            const [type, xStr, yStr] = wallKey.split('-');
            const x = parseInt(xStr);
            const y = parseInt(yStr);
            
            if (type === 'horizontal') {
                wallX = (x - MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
                wallZ = (y - MAZE_SIZE / 2) * CELL_SIZE;
            } else { // vertical
                wallX = (x - MAZE_SIZE / 2) * CELL_SIZE;
                wallZ = (y - MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
            }
            
            const dx = wallX - playerStartX;
            const dz = wallZ - playerStartZ;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            return { wallKey, distance, type };
        });
        
        // Sort by distance (closest first)
        wallsWithDistance.sort((a, b) => a.distance - b.distance);
        
        // Load Wikipedia images in order of distance from player
        for (const { wallKey, type } of wallsWithDistance) {
            const wall = wallMeshMap.get(wallKey);
            if (!wall) continue;
            
            // Parse wall key to get position
            const [wallType, xStr, yStr] = wallKey.split('-');
            const x = parseInt(xStr);
            const y = parseInt(yStr);
            
            // Determine if this is an edge wall
            const isEdgeWall = 
                (wallType === 'horizontal' && (y === 0 || y === MAZE_SIZE)) ||
                (wallType === 'vertical' && (x === 0 || x === MAZE_SIZE));
            
            if (isEdgeWall) {
                // Edge wall: only place image on the side facing the maze
                let side;
                if (wallType === 'horizontal') {
                    // Horizontal wall: y=0 is top boundary (faces south/positive Z), y=MAZE_SIZE is bottom boundary (faces north/negative Z)
                    side = y === 0 ? 'positive' : 'negative';
                } else {
                    // Vertical wall: x=0 is left boundary (faces east/positive X), x=MAZE_SIZE is right boundary (faces west/negative X)
                    side = x === 0 ? 'positive' : 'negative';
                }
                
                const result = await fetchRandomWikipediaImage();
                if (result && result.imageUrl) {
                    await createFramedPicture(result.imageUrl, wall, type, side, result.title);
                    // Mark this wall as having Wikipedia texture
                    wikipediaWalls.add(wallKey);
                }
            } else {
                // Internal wall: place images on both sides
                const result1 = await fetchRandomWikipediaImage();
                const result2 = await fetchRandomWikipediaImage();
                
                if (result1 && result1.imageUrl) {
                    await createFramedPicture(result1.imageUrl, wall, type, 'positive', result1.title);
                }
                if (result2 && result2.imageUrl) {
                    await createFramedPicture(result2.imageUrl, wall, type, 'negative', result2.title);
                }
                
                if ((result1 && result1.imageUrl) || (result2 && result2.imageUrl)) {
                    // Mark this wall as having Wikipedia texture
                    wikipediaWalls.add(wallKey);
                }
            }
        }
    })();
    
    return group;
}

// Initialize the scene
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    
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
    mazeData = generateMaze(MAZE_SIZE);
    createMaze(mazeData).then(maze3D => {
        scene.add(maze3D);
    });
    
    // Set initial player position (at entrance - top-left corner)
    playerPosition.x = (-MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
    playerPosition.z = (-MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
    camera.position.set(playerPosition.x, 1.2, playerPosition.z);
    
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
    statsDiv.style.right = '10px';
    statsDiv.style.color = '#fff';
    statsDiv.style.fontSize = '14px';
    statsDiv.style.zIndex = '100';
    statsDiv.style.background = 'rgba(0, 0, 0, 0.7)';
    statsDiv.style.padding = '10px';
    statsDiv.style.border = '2px solid #fff';
    statsDiv.style.fontFamily = 'monospace';
    statsDiv.style.display = 'none';
    document.body.appendChild(statsDiv);
    
    // Event listeners
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);
    
    // Initialize auto mode tracking variables (since auto mode starts enabled)
    if (autoMode) {
        lastPositionCheck.x = playerPosition.x;
        lastPositionCheck.z = playerPosition.z;
        positionCheckTimer = 0;
        cellsMoved = 0;
        const startCell = worldToGrid(playerPosition.x, playerPosition.z);
        lastCellX = startCell.x;
        lastCellZ = startCell.z;
        lastPlayerX = playerPosition.x;
        lastPlayerZ = playerPosition.z;
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
            // Toggle auto mode: automatic movement with collision-based turning
            autoMode = true;
            isTurning = false; // Reset turning state
            // Initialize position check and cell tracking
            lastPositionCheck.x = playerPosition.x;
            lastPositionCheck.z = playerPosition.z;
            positionCheckTimer = 0;
            cellsMoved = 0;
            const startCell = worldToGrid(playerPosition.x, playerPosition.z);
            lastCellX = startCell.x;
            lastCellZ = startCell.z;
            lastPlayerX = playerPosition.x;
            lastPlayerZ = playerPosition.z;
            break;
        case 't':
        case 'T':
            // Toggle stats display
            statsVisible = !statsVisible;
            if (statsDiv) {
                statsDiv.style.display = statsVisible ? 'block' : 'none';
                if (statsVisible) {
                    updateStatsDisplay();
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
    const gridX = Math.floor((worldX + (MAZE_SIZE * CELL_SIZE) / 2) / CELL_SIZE);
    const gridZ = Math.floor((worldZ + (MAZE_SIZE * CELL_SIZE) / 2) / CELL_SIZE);
    return { x: gridX, z: gridZ };
}

// Check if position is valid (not colliding with boundary walls)
function isValidPosition(x, z) {
    const playerRadius = 0.4;
    const checkDist = playerRadius + WALL_THICKNESS / 2;
    
    // Check boundaries
    const halfSize = (MAZE_SIZE * CELL_SIZE) / 2;
    if (x < -halfSize + checkDist || x > halfSize - checkDist || 
        z < -halfSize + checkDist || z > halfSize - checkDist) {
        return false;
    }
    
    if (!mazeData) return true;
    const { horizontalWalls, verticalWalls } = mazeData;
    
    // Convert to grid coordinates
    const gridX = (x + halfSize) / CELL_SIZE;
    const gridZ = (z + halfSize) / CELL_SIZE;
    
    // Check horizontal walls (between rows)
    const rowBelow = Math.floor(gridZ);
    const rowAbove = Math.ceil(gridZ);
    
    if (rowBelow >= 0 && rowBelow < horizontalWalls.length) {
        const col = Math.floor(gridX);
        if (col >= 0 && col < MAZE_SIZE) {
            // Check wall below
            if (horizontalWalls[rowBelow][col] && Math.abs(gridZ - rowBelow) < checkDist / CELL_SIZE) {
                return false;
            }
        }
    }
    
    if (rowAbove >= 0 && rowAbove < horizontalWalls.length) {
        const col = Math.floor(gridX);
        if (col >= 0 && col < MAZE_SIZE) {
            // Check wall above
            if (horizontalWalls[rowAbove][col] && Math.abs(gridZ - rowAbove) < checkDist / CELL_SIZE) {
                return false;
            }
        }
    }
    
    // Check vertical walls (between columns)
    const colLeft = Math.floor(gridX);
    const colRight = Math.ceil(gridX);
    
    if (colLeft >= 0 && colLeft < verticalWalls[0].length) {
        const row = Math.floor(gridZ);
        if (row >= 0 && row < MAZE_SIZE) {
            // Check wall to left
            if (verticalWalls[row][colLeft] && Math.abs(gridX - colLeft) < checkDist / CELL_SIZE) {
                return false;
            }
        }
    }
    
    if (colRight >= 0 && colRight < verticalWalls[0].length) {
        const row = Math.floor(gridZ);
        if (row >= 0 && row < MAZE_SIZE) {
            // Check wall to right
            if (verticalWalls[row][colRight] && Math.abs(gridX - colRight) < checkDist / CELL_SIZE) {
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
    const halfSize = (MAZE_SIZE * CELL_SIZE) / 2;
    
    // Convert to grid coordinates
    const gridX = (playerPosition.x + halfSize) / CELL_SIZE;
    const gridZ = (playerPosition.z + halfSize) / CELL_SIZE;
    
    // Check horizontal walls (between rows)
    const rowBelow = Math.floor(gridZ);
    const rowAbove = Math.ceil(gridZ);
    
    if (rowBelow >= 0 && rowBelow < horizontalWalls.length) {
        const col = Math.floor(gridX);
        if (col >= 0 && col < MAZE_SIZE) {
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
        if (col >= 0 && col < MAZE_SIZE) {
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
        if (row >= 0 && row < MAZE_SIZE) {
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
        if (row >= 0 && row < MAZE_SIZE) {
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
    // Auto mode: random movement and looking
    if (autoMode) {
        // If we're currently turning, handle the gradual rotation
        if (isTurning) {
            // Calculate the angle difference
            let angleDiff = targetRotation - playerRotation;
            
            // Normalize angle difference to [-PI, PI]
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
            // Gradually rotate towards target
            if (Math.abs(angleDiff) > TURN_SPEED) {
                // Still turning - rotate towards target
                playerRotation += Math.sign(angleDiff) * TURN_SPEED;
            } else {
                // Turn complete - snap to target and resume movement
                playerRotation = targetRotation;
                isTurning = false;
                // Reset position check after turning (but keep cell tracking for collision-based turns)
                lastPositionCheck.x = playerPosition.x;
                lastPositionCheck.z = playerPosition.z;
                positionCheckTimer = 0;
                // Note: cellsMoved is NOT reset here - only reset after planned turns (every 5 cells)
            }
        } else {
            // Not turning - normal movement behavior (no random turning, only collision-based)
            // Check if player has moved enough distance
            positionCheckTimer++;
            if (positionCheckTimer >= POSITION_CHECK_INTERVAL) {
                const distanceMoved = Math.sqrt(
                    Math.pow(playerPosition.x - lastPositionCheck.x, 2) +
                    Math.pow(playerPosition.z - lastPositionCheck.z, 2)
                );
                
                if (distanceMoved < MIN_MOVEMENT_DISTANCE) {
                    // Player hasn't moved enough - stuck or moving very slowly, start turning
                    // Randomly turn left or right (50/50)
                    const turnDirection = Math.random() < 0.5 ? 1 : -1;
                    targetRotation = playerRotation + turnDirection * Math.PI / 2; // 90 degrees
                    isTurning = true;
                    // Reset position check (but keep cell tracking)
                    lastPositionCheck.x = playerPosition.x;
                    lastPositionCheck.z = playerPosition.z;
                    positionCheckTimer = 0;
                } else {
                    // Player has moved enough - reset check
                    lastPositionCheck.x = playerPosition.x;
                    lastPositionCheck.z = playerPosition.z;
                    positionCheckTimer = 0;
                }
            }
            
            // Check if player has entered a new cell
            const currentCell = worldToGrid(playerPosition.x, playerPosition.z);
            if (currentCell.x !== lastCellX || currentCell.z !== lastCellZ) {
                // Entered a new cell
                lastCellX = currentCell.x;
                lastCellZ = currentCell.z;
                // Only increment if we haven't reached the threshold yet (cap at CELLS_BEFORE_TURN)
                if (cellsMoved < CELLS_BEFORE_TURN) {
                    cellsMoved++;
                }
                // Reset midline crossing tracking when entering a new cell
                lastPlayerX = playerPosition.x;
                lastPlayerZ = playerPosition.z;
            }
            
            // Check if player has crossed the middle of the current cell (on either axis) and it's time to turn
            if (cellsMoved >= CELLS_BEFORE_TURN && !isTurning) {
                const cellCenterX = (currentCell.x - MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
                const cellCenterZ = (currentCell.z - MAZE_SIZE / 2) * CELL_SIZE + CELL_SIZE / 2;
                
                // Check if player has crossed the vertical midline (X axis)
                const crossedVerticalMidline = 
                    (lastPlayerX < cellCenterX && playerPosition.x >= cellCenterX) ||
                    (lastPlayerX > cellCenterX && playerPosition.x <= cellCenterX);
                
                // Check if player has crossed the horizontal midline (Z axis)
                const crossedHorizontalMidline = 
                    (lastPlayerZ < cellCenterZ && playerPosition.z >= cellCenterZ) ||
                    (lastPlayerZ > cellCenterZ && playerPosition.z <= cellCenterZ);
                
                // If crossed either midline, trigger turn
                if (crossedVerticalMidline || crossedHorizontalMidline) {
                    // Make a random turn
                    const turnDirection = Math.random() < 0.5 ? 1 : -1;
                    targetRotation = playerRotation + turnDirection * Math.PI / 2; // 90 degrees
                    isTurning = true;
                    cellsMoved = 0; // Reset counter after turning
                    // Reset tracking
                    lastPlayerX = playerPosition.x;
                    lastPlayerZ = playerPosition.z;
                } else {
                    // Update last position for next frame
                    lastPlayerX = playerPosition.x;
                    lastPlayerZ = playerPosition.z;
                }
            }
            
            // Move forward slowly
            const moveX = -Math.sin(playerRotation) * AUTO_MOVE_SPEED;
            const moveZ = -Math.cos(playerRotation) * AUTO_MOVE_SPEED;
            
            const newX = playerPosition.x + moveX;
            const newZ = playerPosition.z + moveZ;
            
            // Check if the new position is valid
            if (isValidPosition(newX, newZ)) {
                // Safe to move
                playerPosition.x = newX;
                playerPosition.z = newZ;
            } else {
                // Can't move to new position - start turning
                if (!isTurning) {
                    // Randomly turn left or right (50/50)
                    const turnDirection = Math.random() < 0.5 ? 1 : -1;
                    targetRotation = playerRotation + turnDirection * Math.PI / 2; // 90 degrees
                    isTurning = true;
                    // Reset position check (but keep cell tracking)
                    lastPositionCheck.x = playerPosition.x;
                    lastPositionCheck.z = playerPosition.z;
                    positionCheckTimer = 0;
                }
            }
        }
        
        // Update camera
        camera.position.set(playerPosition.x, 1.2, playerPosition.z);
        camera.rotation.y = playerRotation;
        return; // Skip manual controls in auto mode
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
    
    if (controls.forward) {
        moveX -= Math.sin(playerRotation) * MOVE_SPEED;
        moveZ -= Math.cos(playerRotation) * MOVE_SPEED;
    }
    if (controls.backward) {
        moveX += Math.sin(playerRotation) * MOVE_SPEED;
        moveZ += Math.cos(playerRotation) * MOVE_SPEED;
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
    
    // Update camera
    camera.position.set(playerPosition.x, 1.2, playerPosition.z);
    camera.rotation.y = playerRotation;
}

// Draw minimap
function drawMinimap() {
    if (!minimapCtx || !mazeData || !minimapVisible) return;
    
    const size = minimapCanvas.width;
    const cellSize = size / MAZE_SIZE;
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
    for (let y = 0; y <= MAZE_SIZE; y++) {
        for (let x = 0; x < MAZE_SIZE; x++) {
            if (horizontalWalls[y][x]) {
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
    for (let y = 0; y < MAZE_SIZE; y++) {
        for (let x = 0; x <= MAZE_SIZE; x++) {
            if (verticalWalls[y][x]) {
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
    drawMinimap();
    if (statsVisible && statsDiv) {
        updateStatsDisplay();
    }
    renderer.render(scene, camera);
}

// Update stats display
function updateStatsDisplay() {
    if (!statsDiv) return;
    
    const currentCell = worldToGrid(playerPosition.x, playerPosition.z);
    statsDiv.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">=== Stats ===</div>
        <div>World Position: (${playerPosition.x.toFixed(2)}, ${playerPosition.z.toFixed(2)})</div>
        <div>Cell Position: (${currentCell.x}, ${currentCell.z})</div>
        <div>Cells Moved: ${cellsMoved}</div>
        <div>Auto Mode: ${autoMode ? 'ON' : 'OFF'}</div>
        <div>Is Turning: ${isTurning ? 'YES' : 'NO'}</div>
    `;
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start the application
init();

