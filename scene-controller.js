// Scene Controller - Base class for all scene types
// Each scene extends this class with its own implementations

class SceneController {
    constructor(name) {
        this.name = name;
    }

    // Generate wall layout for the scene
    // Returns: { horizontalWalls, verticalWalls }
    generateLayout(size) {
        throw new Error('generateLayout must be implemented by subclass');
    }

    // Add scene-specific 3D objects to the group (doors, eyes, fog planes, etc.)
    // Called during createMaze after floor/ceiling are created
    createContent(group, textureStyle, size) {
        // Base implementation does nothing - scenes override as needed
    }

    // Return scene setup configuration
    // { background: hex color, fog: null or {color, near, far}, ambientIntensity: number }
    getSceneSetup() {
        return {
            background: 0x87CEEB, // Sky blue (default)
            fog: null,
            ambientIntensity: 0.6
        };
    }

    // Return initial player position and rotation
    // { x: number, z: number, rotation: number }
    getStartPosition(size) {
        return { x: 0, z: 0, rotation: 0 };
    }

    // Called when entering/regenerating the scene - reset scene-specific state
    onEnterScene() {
        // Override for scene-specific state reset
    }

    // Return movement speed for this scene (default: slower speed like alley)
    getMoveSpeed(baseSpeed) {
        return baseSpeed / 4;
    }

    // Handle position wrapping/transitions (e.g., alley wrapping, door transitions)
    // Returns the (potentially modified) position
    handleWrapping(position, size) {
        return position;
    }

    // Per-frame update for scene-specific animations
    // deltaTime is time since last frame
    update(deltaTime) {
        // Override for scene-specific updates
    }

    // Whether to show the minimap for this scene
    showMinimap() {
        return true;
    }

    // Check if a wall segment has a door (for painting placement logic)
    isDoorWall(type, x, y, size) {
        return false;
    }

    // Get walls that should count for paintings (scene can filter)
    shouldCountWall(wallType, x, y, size) {
        return true;
    }

    // Get walls that should have paintings on both sides
    hasPaintingsOnBothSides(wallType, x, y, size) {
        return true;
    }

    // Get the effective size for this scene (used for maze generation, collision, etc.)
    // Default implementation returns MAZE_SIZE, scenes can override
    getEffectiveSize() {
        return 10; // Default MAZE_SIZE - scenes should override if they need different sizes
    }
}

// Scene registry - populated by individual scene files
const scenes = {};

// Helper to register a scene
function registerScene(name, sceneController) {
    scenes[name] = sceneController;
}

// Get the active scene controller
function getActiveScene() {
    return scenes[sceneMode] || scenes['maze'];
}
