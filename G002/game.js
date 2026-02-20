// Cylinder Tetris 3D - Game Logic
(function() {
    'use strict';

    // Game constants - 3x normal tetris (30 width x 60 height)
    const CYLINDER_COLS = 26;
    const CYLINDER_ROWS = 60;
    const BLOCK_SIZE = 0.18;
    const CYLINDER_RADIUS = (CYLINDER_COLS * BLOCK_SIZE) / (2 * Math.PI);
    const BLOCK_DEPTH = 0.25;
    const VISIBLE_ROWS = 20;

    // Tetromino shapes (row 0 is top)
    const TETROMINOES = {
        I: { shape: [[1,1,1,1]], color: 0x00ffff },
        O: { shape: [[1,1],[1,1]], color: 0xffff00 },
        T: { shape: [[0,1,0],[1,1,1]], color: 0xaa00ff },
        S: { shape: [[0,1,1],[1,1,0]], color: 0x00ff00 },
        Z: { shape: [[1,1,0],[0,1,1]], color: 0xff0000 },
        J: { shape: [[1,0,0],[1,1,1]], color: 0x0000ff },
        L: { shape: [[0,0,1],[1,1,1]], color: 0xff8800 }
    };
    const TETROMINO_KEYS = Object.keys(TETROMINOES);

    // Game state
    let scene, camera, renderer, cylinderGroup, blocksGroup;
    let grid = [];
    let blockMeshes = [];
    let currentPiece = null;
    let currentPieceMeshes = [];
    let ghostMeshes = [];
    let nextPieceType = null;
    let cylinderRotation = 0;
    let targetCylinderRotation = 0;
    let score = 0;
    let level = 1;
    let lines = 0;
    let gameOver = false;
    let lastDropTime = 0;
    let dropInterval = 300;
    let softDrop = false;

    // Swipe inertia state (shared between setupInput and animate)
    const colSwipeWidth = 28;            // pixels per column rotation step
    const INERTIA_FRICTION = 0.94;       // per-frame decay
    const INERTIA_MIN = 0.3;            // stop threshold (px/ms)
    const INERTIA_BOOST = 1.8;          // release velocity multiplier
    let inertiaVelocity = 0;
    let inertiaAccumX = 0;
    let inertiaActive = false;

    // Initialize grid (row 0 = bottom, row VISIBLE_ROWS-1 = top)
    function initGrid() {
        grid = [];
        for (let y = 0; y < VISIBLE_ROWS; y++) {
            grid[y] = [];
            for (let x = 0; x < CYLINDER_COLS; x++) {
                grid[y][x] = 0;
            }
        }
    }

    // Initialize Three.js
    function initThreeJS() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a1a);

        const canvasSize = getCanvasSize();
        camera = new THREE.PerspectiveCamera(45, canvasSize.width / canvasSize.height, 0.1, 1000);
        camera.position.set(0, 2, 6);
        camera.lookAt(0, -0.25, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(canvasSize.width, canvasSize.height);
        document.getElementById('canvas-container').appendChild(renderer.domElement);

        // Lighting - enhanced for Phong shading
        const ambientLight = new THREE.AmbientLight(0x404050, 0.6);
        scene.add(ambientLight);

        const frontLight = new THREE.DirectionalLight(0xffffff, 1.0);
        frontLight.position.set(0, 3, 8);
        scene.add(frontLight);

        const topLight = new THREE.DirectionalLight(0xccccff, 0.6);
        topLight.position.set(0, 10, 0);
        scene.add(topLight);

        const leftLight = new THREE.DirectionalLight(0xffffff, 0.5);
        leftLight.position.set(-5, 2, 3);
        scene.add(leftLight);

        const sideLight = new THREE.DirectionalLight(0xffffaa, 0.5);
        sideLight.position.set(5, 2, 3);
        scene.add(sideLight);

        const backLight = new THREE.DirectionalLight(0x4444ff, 0.3);
        backLight.position.set(0, 1, -5);
        scene.add(backLight);

        cylinderGroup = new THREE.Group();
        scene.add(cylinderGroup);

        blocksGroup = new THREE.Group();
        scene.add(blocksGroup);

        createCylinderFrame();
    }

    // Create cylinder wireframe
    function createCylinderFrame() {
        const visibleHeight = VISIBLE_ROWS * BLOCK_SIZE;

        const geometry = new THREE.CylinderGeometry(
            CYLINDER_RADIUS + BLOCK_DEPTH,
            CYLINDER_RADIUS + BLOCK_DEPTH,
            visibleHeight, 48, 1, true
        );
        const material = new THREE.MeshBasicMaterial({
            color: 0x00c8ff,
            transparent: true,
            opacity: 0.06,
            side: THREE.DoubleSide
        });
        const cylinder = new THREE.Mesh(geometry, material);
        cylinderGroup.add(cylinder);

        // Bottom ring
        const bottomRingGeo = new THREE.TorusGeometry(CYLINDER_RADIUS, 0.02, 8, 48);
        const bottomRingMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6 });
        const bottomRing = new THREE.Mesh(bottomRingGeo, bottomRingMat);
        bottomRing.rotation.x = Math.PI / 2;
        bottomRing.position.y = -visibleHeight / 2;
        cylinderGroup.add(bottomRing);

        // Top ring
        const topRing = new THREE.Mesh(bottomRingGeo.clone(), bottomRingMat.clone());
        topRing.rotation.x = Math.PI / 2;
        topRing.position.y = visibleHeight / 2;
        cylinderGroup.add(topRing);

        // Horizontal grid lines
        for (let i = 1; i < VISIBLE_ROWS; i++) {
            const ringGeo = new THREE.TorusGeometry(CYLINDER_RADIUS, 0.005, 4, 48);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x00c8ff, transparent: true, opacity: 0.15 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = -visibleHeight / 2 + i * BLOCK_SIZE;
            cylinderGroup.add(ring);
        }

        // Vertical grid lines
        for (let i = 0; i < CYLINDER_COLS; i++) {
            const angle = (i / CYLINDER_COLS) * Math.PI * 2;
            const x = Math.cos(angle) * CYLINDER_RADIUS;
            const z = Math.sin(angle) * CYLINDER_RADIUS;

            const lineGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(x, -visibleHeight / 2, z),
                new THREE.Vector3(x, visibleHeight / 2, z)
            ]);
            const lineMat = new THREE.LineBasicMaterial({ color: 0x00c8ff, transparent: true, opacity: 0.15 });
            const line = new THREE.Line(lineGeo, lineMat);
            cylinderGroup.add(line);
        }
    }

    // Get 3D position for locked blocks (rotate with cylinder)
    function getBlockPosition(gridX, gridY) {
        const angle = (gridX / CYLINDER_COLS) * Math.PI * 2;
        const visibleHeight = VISIBLE_ROWS * BLOCK_SIZE;
        const posY = -visibleHeight / 2 + (gridY + 0.5) * BLOCK_SIZE;

        return {
            x: 0,
            y: posY,
            z: 0,
            rotationY: angle
        };
    }

    function isRowVisible(gridY) {
        return gridY >= 0 && gridY < VISIBLE_ROWS;
    }

    // Create curved block mesh with different colors per face
    function createBlockMesh(color, isGhost = false) {
        const anglePerCol = (2 * Math.PI) / CYLINDER_COLS;
        const blockAngle = anglePerCol * 0.9;
        const innerRadius = CYLINDER_RADIUS;
        const outerRadius = CYLINDER_RADIUS + BLOCK_DEPTH;
        const blockHeight = BLOCK_SIZE * 0.9;

        // Create color variations - stronger contrast for visibility
        const baseColor = new THREE.Color(color);
        const brightColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.35);  // Front/outer - brighter
        const darkColor = baseColor.clone().lerp(new THREE.Color(0x000000), 0.5);     // Inner/back - much darker
        const topColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.25);     // Top - brighter
        const bottomColor = baseColor.clone().lerp(new THREE.Color(0x000000), 0.4);   // Bottom - darker
        const sideColor = baseColor.clone().lerp(new THREE.Color(0x000000), 0.35);    // Sides - darker
        const edgeColor = baseColor.clone().lerp(new THREE.Color(0x000000), 0.6);     // Edge lines - dark version of block color

        if (isGhost) {
            const geometry = new THREE.BufferGeometry();
            const segments = 8;
            const vertices = [];
            const indices = [];

            for (let i = 0; i <= segments; i++) {
                const a = -blockAngle / 2 + (i / segments) * blockAngle;
                const cosA = Math.cos(a);
                const sinA = Math.sin(a);
                vertices.push(cosA * innerRadius, -blockHeight / 2, sinA * innerRadius);
                vertices.push(cosA * outerRadius, -blockHeight / 2, sinA * outerRadius);
                vertices.push(cosA * innerRadius, blockHeight / 2, sinA * innerRadius);
                vertices.push(cosA * outerRadius, blockHeight / 2, sinA * outerRadius);
            }

            for (let i = 0; i < segments; i++) {
                const base = i * 4;
                const next = (i + 1) * 4;
                indices.push(base + 1, next + 1, next + 3, base + 1, next + 3, base + 3);
                indices.push(base, base + 2, next + 2, base, next + 2, next);
                indices.push(base + 2, base + 3, next + 3, base + 2, next + 3, next + 2);
                indices.push(base, next, next + 1, base, next + 1, base + 1);
            }
            indices.push(0, 1, 3, 0, 3, 2);
            const last = segments * 4;
            indices.push(last + 1, last, last + 2, last + 1, last + 2, last + 3);

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setIndex(indices);

            const material = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.3,
                wireframe: true
            });
            return new THREE.Mesh(geometry, material);
        }

        // Create separate geometries for each face type with different colors
        const group = new THREE.Group();
        const segments = 8;

        // Helper to create vertices for a segment
        function getSegmentVertices(i) {
            const a1 = -blockAngle / 2 + (i / segments) * blockAngle;
            const a2 = -blockAngle / 2 + ((i + 1) / segments) * blockAngle;
            return {
                inner: [
                    [Math.cos(a1) * innerRadius, Math.sin(a1) * innerRadius],
                    [Math.cos(a2) * innerRadius, Math.sin(a2) * innerRadius]
                ],
                outer: [
                    [Math.cos(a1) * outerRadius, Math.sin(a1) * outerRadius],
                    [Math.cos(a2) * outerRadius, Math.sin(a2) * outerRadius]
                ]
            };
        }

        // Outer face (front - bright) - use DoubleSide to ensure visibility
        const outerGeo = new THREE.BufferGeometry();
        const outerVerts = [];
        const outerIndices = [];
        for (let i = 0; i < segments; i++) {
            const v = getSegmentVertices(i);
            const base = i * 4;
            outerVerts.push(v.outer[0][0], -blockHeight/2, v.outer[0][1]);
            outerVerts.push(v.outer[1][0], -blockHeight/2, v.outer[1][1]);
            outerVerts.push(v.outer[0][0], blockHeight/2, v.outer[0][1]);
            outerVerts.push(v.outer[1][0], blockHeight/2, v.outer[1][1]);
            outerIndices.push(base, base+3, base+1, base, base+2, base+3);
        }
        outerGeo.setAttribute('position', new THREE.Float32BufferAttribute(outerVerts, 3));
        outerGeo.setIndex(outerIndices);
        outerGeo.computeVertexNormals();
        group.add(new THREE.Mesh(outerGeo, new THREE.MeshPhongMaterial({ color: brightColor, side: THREE.DoubleSide, shininess: 60, specular: 0x444444 })));

        // Inner face (back - dark)
        const innerGeo = new THREE.BufferGeometry();
        const innerVerts = [];
        const innerIndices = [];
        for (let i = 0; i < segments; i++) {
            const v = getSegmentVertices(i);
            const base = i * 4;
            innerVerts.push(v.inner[0][0], -blockHeight/2, v.inner[0][1]);
            innerVerts.push(v.inner[1][0], -blockHeight/2, v.inner[1][1]);
            innerVerts.push(v.inner[0][0], blockHeight/2, v.inner[0][1]);
            innerVerts.push(v.inner[1][0], blockHeight/2, v.inner[1][1]);
            innerIndices.push(base, base+3, base+1, base, base+2, base+3);
        }
        innerGeo.setAttribute('position', new THREE.Float32BufferAttribute(innerVerts, 3));
        innerGeo.setIndex(innerIndices);
        innerGeo.computeVertexNormals();
        group.add(new THREE.Mesh(innerGeo, new THREE.MeshPhongMaterial({ color: darkColor, side: THREE.DoubleSide, shininess: 20 })));

        // Top face
        const topGeo = new THREE.BufferGeometry();
        const topVerts = [];
        const topIndices = [];
        for (let i = 0; i < segments; i++) {
            const v = getSegmentVertices(i);
            const base = i * 4;
            topVerts.push(v.inner[0][0], blockHeight/2, v.inner[0][1]);
            topVerts.push(v.outer[0][0], blockHeight/2, v.outer[0][1]);
            topVerts.push(v.inner[1][0], blockHeight/2, v.inner[1][1]);
            topVerts.push(v.outer[1][0], blockHeight/2, v.outer[1][1]);
            topIndices.push(base, base+1, base+3, base, base+3, base+2);
        }
        topGeo.setAttribute('position', new THREE.Float32BufferAttribute(topVerts, 3));
        topGeo.setIndex(topIndices);
        topGeo.computeVertexNormals();
        group.add(new THREE.Mesh(topGeo, new THREE.MeshPhongMaterial({ color: topColor, side: THREE.DoubleSide, shininess: 40, specular: 0x222222 })));

        // Bottom face
        const bottomGeo = new THREE.BufferGeometry();
        const bottomVerts = [];
        const bottomIndices = [];
        for (let i = 0; i < segments; i++) {
            const v = getSegmentVertices(i);
            const base = i * 4;
            bottomVerts.push(v.inner[0][0], -blockHeight/2, v.inner[0][1]);
            bottomVerts.push(v.outer[0][0], -blockHeight/2, v.outer[0][1]);
            bottomVerts.push(v.inner[1][0], -blockHeight/2, v.inner[1][1]);
            bottomVerts.push(v.outer[1][0], -blockHeight/2, v.outer[1][1]);
            bottomIndices.push(base, base+3, base+1, base, base+2, base+3);
        }
        bottomGeo.setAttribute('position', new THREE.Float32BufferAttribute(bottomVerts, 3));
        bottomGeo.setIndex(bottomIndices);
        bottomGeo.computeVertexNormals();
        group.add(new THREE.Mesh(bottomGeo, new THREE.MeshPhongMaterial({ color: bottomColor, side: THREE.DoubleSide, shininess: 20 })));

        // Left side face
        const leftGeo = new THREE.BufferGeometry();
        const v0 = getSegmentVertices(0);
        leftGeo.setAttribute('position', new THREE.Float32BufferAttribute([
            v0.inner[0][0], -blockHeight/2, v0.inner[0][1],
            v0.outer[0][0], -blockHeight/2, v0.outer[0][1],
            v0.inner[0][0], blockHeight/2, v0.inner[0][1],
            v0.outer[0][0], blockHeight/2, v0.outer[0][1]
        ], 3));
        leftGeo.setIndex([0, 2, 3, 0, 3, 1]);
        leftGeo.computeVertexNormals();
        group.add(new THREE.Mesh(leftGeo, new THREE.MeshPhongMaterial({ color: sideColor, side: THREE.DoubleSide, shininess: 30 })));

        // Right side face
        const rightGeo = new THREE.BufferGeometry();
        const vLast = getSegmentVertices(segments - 1);
        rightGeo.setAttribute('position', new THREE.Float32BufferAttribute([
            vLast.inner[1][0], -blockHeight/2, vLast.inner[1][1],
            vLast.outer[1][0], -blockHeight/2, vLast.outer[1][1],
            vLast.inner[1][0], blockHeight/2, vLast.inner[1][1],
            vLast.outer[1][0], blockHeight/2, vLast.outer[1][1]
        ], 3));
        rightGeo.setIndex([0, 3, 2, 0, 1, 3]);
        rightGeo.computeVertexNormals();
        group.add(new THREE.Mesh(rightGeo, new THREE.MeshPhongMaterial({ color: sideColor, side: THREE.DoubleSide, shininess: 30 })));

        // Add edges
        const fullGeo = new THREE.BufferGeometry();
        const allVerts = [];
        for (let i = 0; i <= segments; i++) {
            const a = -blockAngle / 2 + (i / segments) * blockAngle;
            const cosA = Math.cos(a);
            const sinA = Math.sin(a);
            allVerts.push(cosA * innerRadius, -blockHeight / 2, sinA * innerRadius);
            allVerts.push(cosA * outerRadius, -blockHeight / 2, sinA * outerRadius);
            allVerts.push(cosA * innerRadius, blockHeight / 2, sinA * innerRadius);
            allVerts.push(cosA * outerRadius, blockHeight / 2, sinA * outerRadius);
        }
        const allIndices = [];
        for (let i = 0; i < segments; i++) {
            const base = i * 4;
            const next = (i + 1) * 4;
            allIndices.push(base + 1, next + 1, next + 3, base + 1, next + 3, base + 3);
            allIndices.push(base, base + 2, next + 2, base, next + 2, next);
            allIndices.push(base + 2, base + 3, next + 3, base + 2, next + 3, next + 2);
            allIndices.push(base, next, next + 1, base, next + 1, base + 1);
        }
        allIndices.push(0, 1, 3, 0, 3, 2);
        const last = segments * 4;
        allIndices.push(last + 1, last, last + 2, last + 1, last + 2, last + 3);
        fullGeo.setAttribute('position', new THREE.Float32BufferAttribute(allVerts, 3));
        fullGeo.setIndex(allIndices);

        const edgeGeo = new THREE.EdgesGeometry(fullGeo, 15);
        const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor });
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        group.add(edges);

        return group;
    }

    // Place locked block at grid position
    function placeBlockMesh(mesh, gridX, gridY) {
        const pos = getBlockPosition(gridX, gridY);
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.rotation.y = pos.rotationY;
    }

    // Place falling block - blocksGroup now rotates with cylinder, so use grid position
    // pieceOffsetX: the piece's offsetX (usually 0)
    // blockOffset: the block's offset within the piece (e.g., -1, 0, 1)
    function placeBlockMeshAtFront(mesh, pieceOffsetX, blockOffset, gridY) {
        const visibleHeight = VISIBLE_ROWS * BLOCK_SIZE;
        const posY = -visibleHeight / 2 + (gridY + 0.5) * BLOCK_SIZE;

        // Since blocksGroup now rotates with cylinderGroup,
        // we place blocks at their actual grid position (same as locked blocks)
        const gridX = getAbsoluteGridX(pieceOffsetX, blockOffset);
        const angle = (gridX / CYLINDER_COLS) * Math.PI * 2;

        mesh.position.set(0, posY, 0);
        mesh.rotation.y = angle;
    }

    // Track which grid column is at the front (updates when cylinder rotates)
    let frontGridColumn = Math.floor(3 * CYLINDER_COLS / 4);  // Initial: angle -PI/2 = column 22

    // Convert piece-relative offset to absolute grid X
    function getAbsoluteGridX(pieceOffsetX, blockOffsetInPiece) {
        return (frontGridColumn + pieceOffsetX + blockOffsetInPiece + CYLINDER_COLS * 10) % CYLINDER_COLS;
    }

    function getGhostY() {
        if (!currentPiece) return 0;
        let ghostY = currentPiece.y;
        while (isValidPosition(currentPiece.offsetX, ghostY - 1, currentPiece.shape)) {
            ghostY--;
        }
        return ghostY;
    }

    // Spawn new piece
    function spawnPiece() {
        const type = nextPieceType || TETROMINO_KEYS[Math.floor(Math.random() * TETROMINO_KEYS.length)];
        nextPieceType = TETROMINO_KEYS[Math.floor(Math.random() * TETROMINO_KEYS.length)];

        const tetromino = TETROMINOES[type];
        const shape = tetromino.shape;

        currentPiece = {
            type: type,
            shape: shape.map(row => [...row]),
            color: tetromino.color,
            offsetX: 0,  // Relative offset from front center
            y: VISIBLE_ROWS - 1
        };

        if (!isValidPosition(currentPiece.offsetX, currentPiece.y, currentPiece.shape)) {
            endGame();
            return;
        }

        updateCurrentPieceMeshes();
        drawNextPiece();
    }

    // Update falling piece meshes
    function updateCurrentPieceMeshes() {
        currentPieceMeshes.forEach(mesh => blocksGroup.remove(mesh));
        currentPieceMeshes = [];
        ghostMeshes.forEach(mesh => blocksGroup.remove(mesh));
        ghostMeshes = [];

        if (!currentPiece) return;

        const ghostY = getGhostY();
        const pieceWidth = currentPiece.shape[0].length;

        for (let py = 0; py < currentPiece.shape.length; py++) {
            for (let px = 0; px < currentPiece.shape[py].length; px++) {
                if (currentPiece.shape[py][px]) {
                    // Use exact same blockOffset calculation as lockPiece
                    const blockOffset = px - Math.floor(pieceWidth / 2);
                    const gridY = currentPiece.y - py;

                    if (isRowVisible(gridY)) {
                        const mesh = createBlockMesh(currentPiece.color);
                        placeBlockMeshAtFront(mesh, currentPiece.offsetX, blockOffset, gridY);
                        blocksGroup.add(mesh);
                        currentPieceMeshes.push(mesh);
                    }

                    const ghostGridY = ghostY - py;
                    if (isRowVisible(ghostGridY) && ghostY !== currentPiece.y) {
                        const ghostMesh = createBlockMesh(currentPiece.color, true);
                        placeBlockMeshAtFront(ghostMesh, currentPiece.offsetX, blockOffset, ghostGridY);
                        blocksGroup.add(ghostMesh);
                        ghostMeshes.push(ghostMesh);
                    }
                }
            }
        }
    }

    // Check if position is valid
    function isValidPosition(offsetX, y, shape) {
        const pieceWidth = shape[0].length;

        for (let py = 0; py < shape.length; py++) {
            for (let px = 0; px < shape[py].length; px++) {
                if (shape[py][px]) {
                    const blockOffset = px - Math.floor(pieceWidth / 2);
                    const gridX = getAbsoluteGridX(offsetX, blockOffset);
                    const gridY = y - py;

                    if (gridY < 0) return false;
                    if (gridY >= VISIBLE_ROWS) continue;
                    if (grid[gridY] && grid[gridY][gridX]) return false;
                }
            }
        }
        return true;
    }

    // Lock piece into grid
    function lockPiece() {
        const pieceWidth = currentPiece.shape[0].length;

        for (let py = 0; py < currentPiece.shape.length; py++) {
            for (let px = 0; px < currentPiece.shape[py].length; px++) {
                if (currentPiece.shape[py][px]) {
                    // px goes from 0 to pieceWidth-1
                    // We want to center: for width 4, offsets are -2,-1,0,1 (or -1.5,-0.5,0.5,1.5)
                    // Use floor to get integer grid positions
                    const blockOffset = px - Math.floor(pieceWidth / 2);
                    const gridX = getAbsoluteGridX(currentPiece.offsetX, blockOffset);
                    const gridY = currentPiece.y - py;

                    if (gridY >= 0 && gridY < VISIBLE_ROWS) {
                        grid[gridY][gridX] = currentPiece.color;
                    }
                }
            }
        }

        currentPieceMeshes.forEach(mesh => blocksGroup.remove(mesh));
        currentPieceMeshes = [];
        ghostMeshes.forEach(mesh => blocksGroup.remove(mesh));
        ghostMeshes = [];

        clearLines();
        updateGridMeshes();
        spawnPiece();
    }

    // Clear completed lines
    function clearLines() {
        let linesCleared = 0;

        for (let y = 0; y < VISIBLE_ROWS; y++) {
            let complete = true;
            for (let x = 0; x < CYLINDER_COLS; x++) {
                if (!grid[y][x]) {
                    complete = false;
                    break;
                }
            }

            if (complete) {
                grid.splice(y, 1);
                grid.push(new Array(CYLINDER_COLS).fill(0));
                linesCleared++;
                y--;
            }
        }

        if (linesCleared > 0) {
            const points = [0, 100, 300, 500, 800][Math.min(linesCleared, 4)] * level;
            score += points;
            lines += linesCleared;
            level = Math.floor(lines / 10) + 1;
            dropInterval = Math.max(30, 300 - (level - 1) * 30);
            updateUI();
        }
    }

    // Update locked block meshes
    function updateGridMeshes() {
        blockMeshes.forEach(mesh => cylinderGroup.remove(mesh));
        blockMeshes = [];

        for (let y = 0; y < VISIBLE_ROWS; y++) {
            for (let x = 0; x < CYLINDER_COLS; x++) {
                if (grid[y][x]) {
                    const mesh = createBlockMesh(grid[y][x]);
                    placeBlockMesh(mesh, x, y);
                    cylinderGroup.add(mesh);
                    blockMeshes.push(mesh);
                }
            }
        }
    }

    // Rotate piece
    function rotatePiece(clockwise = true) {
        if (!currentPiece) return;

        const shape = currentPiece.shape;
        const rows = shape.length;
        const cols = shape[0].length;
        const newShape = [];

        if (clockwise) {
            for (let x = 0; x < cols; x++) {
                newShape[x] = [];
                for (let y = rows - 1; y >= 0; y--) {
                    newShape[x][rows - 1 - y] = shape[y][x];
                }
            }
        } else {
            for (let x = cols - 1; x >= 0; x--) {
                newShape[cols - 1 - x] = [];
                for (let y = 0; y < rows; y++) {
                    newShape[cols - 1 - x][y] = shape[y][x];
                }
            }
        }

        if (isValidPosition(currentPiece.offsetX, currentPiece.y, newShape)) {
            currentPiece.shape = newShape;
            updateCurrentPieceMeshes();
        }
    }

    function movePieceDown() {
        if (!currentPiece || gameOver) return;

        if (isValidPosition(currentPiece.offsetX, currentPiece.y - 1, currentPiece.shape)) {
            currentPiece.y--;
            updateCurrentPieceMeshes();
        } else {
            lockPiece();
        }
    }

    function hardDrop() {
        if (!currentPiece || gameOver) return;

        let dropDistance = 0;
        while (isValidPosition(currentPiece.offsetX, currentPiece.y - 1, currentPiece.shape)) {
            currentPiece.y--;
            dropDistance++;
        }
        score += dropDistance * 2;
        updateUI();
        updateCurrentPieceMeshes();
        lockPiece();
    }

    // Rotate cylinder - falling piece stays at front visually
    function rotateCylinder(direction) {
        if (!currentPiece) return;

        // Calculate new front column after rotation
        const newFrontColumn = (frontGridColumn - direction + CYLINDER_COLS) % CYLINDER_COLS;

        // Check if piece would collide at new position
        // We need to check using the new frontGridColumn
        const oldFrontColumn = frontGridColumn;
        frontGridColumn = newFrontColumn;

        if (!isValidPosition(currentPiece.offsetX, currentPiece.y, currentPiece.shape)) {
            // Collision detected - revert and don't rotate
            frontGridColumn = oldFrontColumn;
            return;
        }

        // No collision - apply rotation
        const rotationStep = (2 * Math.PI) / CYLINDER_COLS;
        targetCylinderRotation += direction * rotationStep;

        updateCurrentPieceMeshes();  // Update ghost position
    }

    function updateUI() {
        document.getElementById('score').textContent = score;
        document.getElementById('level').textContent = level;
        document.getElementById('lines').textContent = lines;
    }

    function drawNextPiece() {
        const canvas = document.getElementById('next-canvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 100, 100);

        if (!nextPieceType) return;

        const tetromino = TETROMINOES[nextPieceType];
        const shape = tetromino.shape;
        const blockSize = 22;
        const offsetX = (100 - shape[0].length * blockSize) / 2;
        const offsetY = (100 - shape.length * blockSize) / 2;

        const colorHex = '#' + tetromino.color.toString(16).padStart(6, '0');

        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    ctx.fillStyle = colorHex;
                    ctx.fillRect(offsetX + x * blockSize + 1, offsetY + y * blockSize + 1, blockSize - 2, blockSize - 2);
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(offsetX + x * blockSize + 1, offsetY + y * blockSize + 1, blockSize - 2, blockSize - 2);
                }
            }
        }
    }

    function endGame() {
        gameOver = true;
        document.getElementById('final-score').textContent = score;
        document.getElementById('game-over').style.display = 'block';
    }

    function restartGame() {
        gameOver = false;
        score = 0;
        level = 1;
        lines = 0;
        dropInterval = 300;
        cylinderRotation = 0;
        targetCylinderRotation = 0;
        frontGridColumn = Math.floor(3 * CYLINDER_COLS / 4);  // Reset front column

        initGrid();
        updateGridMeshes();
        updateUI();

        document.getElementById('game-over').style.display = 'none';

        nextPieceType = TETROMINO_KEYS[Math.floor(Math.random() * TETROMINO_KEYS.length)];
        spawnPiece();
    }

    // Responsive canvas sizing - measure actual available space from flex container
    function getCanvasSize() {
        const container = document.getElementById('game-container');
        if (container) {
            const rect = container.getBoundingClientRect();
            const w = Math.floor(rect.width);
            const h = Math.floor(rect.height);
            if (w > 0 && h > 0) {
                // Desktop: wider aspect ratio (8:7), Mobile: taller (3:4)
                const isMobile = window.innerWidth <= 850 || ('ontouchstart' in window);
                const targetRatio = isMobile ? (3 / 4) : (800 / 700);
                let canvasW, canvasH;
                if (w / h > targetRatio) {
                    canvasH = h;
                    canvasW = Math.floor(h * targetRatio);
                } else {
                    canvasW = w;
                    canvasH = Math.floor(w / targetRatio);
                }
                return { width: canvasW, height: canvasH };
            }
        }
        return { width: 800, height: 700 };
    }

    function onWindowResize() {
        if (!camera || !renderer) return;
        const size = getCanvasSize();
        camera.aspect = size.width / size.height;
        camera.updateProjectionMatrix();
        renderer.setSize(size.width, size.height);
    }

    function setupInput() {
        document.addEventListener('keydown', (e) => {
            if (gameOver) {
                if (e.code === 'Space' || e.code === 'Enter') {
                    restartGame();
                }
                return;
            }

            switch (e.code) {
                case 'ArrowLeft':
                    rotateCylinder(-1);
                    e.preventDefault();
                    break;
                case 'ArrowRight':
                    rotateCylinder(1);
                    e.preventDefault();
                    break;
                case 'ArrowDown':
                    softDrop = true;
                    e.preventDefault();
                    break;
                case 'ArrowUp':
                case 'KeyZ':
                    rotatePiece(true);
                    e.preventDefault();
                    break;
                case 'KeyX':
                    rotatePiece(false);
                    e.preventDefault();
                    break;
                case 'Space':
                    hardDrop();
                    e.preventDefault();
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'ArrowDown') {
                softDrop = false;
            }
        });

        document.getElementById('restart-btn').addEventListener('click', restartGame);

        // Touch button controls
        function addTouchBtn(id, onDown, onUp) {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); }, { passive: false });
            btn.addEventListener('touchend', (e) => { e.preventDefault(); if (onUp) onUp(); }, { passive: false });
            btn.addEventListener('touchcancel', (e) => { e.preventDefault(); if (onUp) onUp(); }, { passive: false });
            // Also support mouse click for desktop testing
            btn.addEventListener('mousedown', (e) => { e.preventDefault(); onDown(); });
            if (onUp) {
                btn.addEventListener('mouseup', (e) => { e.preventDefault(); onUp(); });
                btn.addEventListener('mouseleave', (e) => { onUp(); });
            }
        }

        addTouchBtn('btn-left', () => { if (!gameOver) rotateCylinder(-1); });
        addTouchBtn('btn-right', () => { if (!gameOver) rotateCylinder(1); });
        addTouchBtn('btn-rotate', () => { if (!gameOver) rotatePiece(true); });
        addTouchBtn('btn-down', () => { if (!gameOver) softDrop = true; }, () => { softDrop = false; });
        addTouchBtn('btn-drop', () => {
            if (gameOver) { restartGame(); } else { hardDrop(); }
        });

        // Swipe gesture on canvas - continuous rotation with inertia
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        let touchLastX = 0;
        let touchAccumX = 0;
        let touchDragging = false;

        // Velocity tracking - keep recent samples for accurate flick detection
        let touchVelocitySamples = [];
        const VELOCITY_WINDOW = 80;      // ms - only use recent samples

        const canvasEl = document.getElementById('canvas-container');
        canvasEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            touchStartX = t.clientX;
            touchStartY = t.clientY;
            touchLastX = t.clientX;
            touchStartTime = Date.now();
            touchAccumX = 0;
            touchDragging = false;
            touchVelocitySamples = [];

            // Cancel any ongoing inertia when finger touches
            inertiaActive = false;
            inertiaVelocity = 0;
            inertiaAccumX = 0;
        }, { passive: false });

        canvasEl.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (gameOver) return;
            const t = e.touches[0];
            const now = Date.now();
            const dx = t.clientX - touchStartX;
            const dy = t.clientY - touchStartY;

            // Record velocity sample
            touchVelocitySamples.push({ x: t.clientX, time: now });
            // Trim old samples
            while (touchVelocitySamples.length > 0 &&
                   now - touchVelocitySamples[0].time > VELOCITY_WINDOW) {
                touchVelocitySamples.shift();
            }

            // Enter drag mode once horizontal movement exceeds threshold
            if (!touchDragging && Math.abs(dx) > 15 && Math.abs(dx) > Math.abs(dy)) {
                touchDragging = true;
            }

            if (touchDragging) {
                touchAccumX += t.clientX - touchLastX;

                while (touchAccumX >= colSwipeWidth) {
                    rotateCylinder(1);
                    touchAccumX -= colSwipeWidth;
                }
                while (touchAccumX <= -colSwipeWidth) {
                    rotateCylinder(-1);
                    touchAccumX += colSwipeWidth;
                }
            }

            touchLastX = t.clientX;
        }, { passive: false });

        canvasEl.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (gameOver) {
                restartGame();
                return;
            }

            if (!touchDragging) {
                // Not a drag - check for tap or vertical swipe
                const t = e.changedTouches[0];
                const dx = t.clientX - touchStartX;
                const dy = t.clientY - touchStartY;
                const dt = Date.now() - touchStartTime;
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);

                if (absDx < 20 && absDy < 20 && dt < 300) {
                    rotatePiece(true);
                } else if (absDy > absDx && dy > 60) {
                    hardDrop();
                }
            } else {
                // Was dragging - calculate release velocity for inertia
                const now = Date.now();
                // Filter to very recent samples only
                const recent = touchVelocitySamples.filter(s => now - s.time < VELOCITY_WINDOW);
                if (recent.length >= 2) {
                    const first = recent[0];
                    const last = recent[recent.length - 1];
                    const dt = last.time - first.time;
                    if (dt > 0) {
                        const vel = (last.x - first.x) / dt;  // px/ms
                        if (Math.abs(vel) > 0.3) {
                            // Non-linear boost: gentle swipes stay mild, strong flicks spin hard
                            // absVel ~0.3-0.8 = gentle, ~0.8-2.0 = medium, 2.0+ = strong flick
                            const absVel = Math.abs(vel);
                            const boost = INERTIA_BOOST + Math.pow(Math.max(0, absVel - 0.8), 1.3) * 3.0;
                            inertiaVelocity = vel * boost;
                            inertiaAccumX = touchAccumX;  // carry over sub-step remainder
                            inertiaActive = true;
                        }
                    }
                }
            }

            touchDragging = false;
            touchAccumX = 0;
            touchVelocitySamples = [];
        }, { passive: false });

        // Window resize
        window.addEventListener('resize', onWindowResize);
        window.addEventListener('orientationchange', () => {
            setTimeout(onWindowResize, 200);
        });
    }

    let lastAnimateTime = 0;

    function animate(currentTime) {
        requestAnimationFrame(animate);

        const frameDt = lastAnimateTime ? (currentTime - lastAnimateTime) : 16;
        lastAnimateTime = currentTime;

        // Process inertia - apply virtual px movement and snap to columns
        if (inertiaActive && !gameOver && currentPiece) {
            // Convert velocity (px/ms) to px this frame
            const pxThisFrame = inertiaVelocity * frameDt;
            inertiaAccumX += pxThisFrame;

            // Snap to columns
            while (inertiaAccumX >= colSwipeWidth) {
                rotateCylinder(1);
                inertiaAccumX -= colSwipeWidth;
            }
            while (inertiaAccumX <= -colSwipeWidth) {
                rotateCylinder(-1);
                inertiaAccumX += colSwipeWidth;
            }

            // Decay velocity - faster spins have less friction for longer coast
            const absV = Math.abs(inertiaVelocity);
            const friction = absV > 1.5 ? 0.97 : INERTIA_FRICTION;
            inertiaVelocity *= friction;

            // Stop when slow enough
            if (Math.abs(inertiaVelocity) < INERTIA_MIN / 16) {
                inertiaActive = false;
                inertiaVelocity = 0;
                inertiaAccumX = 0;
            }
        }

        const rotationDiff = targetCylinderRotation - cylinderRotation;
        cylinderRotation += rotationDiff * 0.25;
        cylinderGroup.rotation.y = cylinderRotation;

        // blocksGroup rotates opposite to cylinderGroup to keep falling blocks at screen front
        blocksGroup.rotation.y = cylinderRotation;

        if (!gameOver && currentPiece) {
            const effectiveInterval = softDrop ? dropInterval / 10 : dropInterval;
            if (currentTime - lastDropTime > effectiveInterval) {
                movePieceDown();
                lastDropTime = currentTime;
            }
        }

        renderer.render(scene, camera);
    }

    function init() {
        initGrid();
        initThreeJS();
        setupInput();

        nextPieceType = TETROMINO_KEYS[Math.floor(Math.random() * TETROMINO_KEYS.length)];
        spawnPiece();

        animate(0);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
