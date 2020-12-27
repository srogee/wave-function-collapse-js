// Get parameters from the URL and set reasonable defaults if needed
function getParameters() {
    var params = {};
    const urlParams = new URLSearchParams(window.location.search);

    params.seed = parseInt(urlParams.get('seed'));
    if (WFC.Utils.isNumber(params.seed)) {
        console.log(`Using parsed seed ${params.seed}`);
    } else {
        params.seed = Math.floor(Math.random() * 100000000);
        console.log(`Using random seed ${params.seed}`);
    }

    params.lagTime = parseFloat(urlParams.get('lagTime'));
    if (WFC.Utils.isNumber(params.lagTime)) {
        console.log(`Using parsed lag time ${params.lagTime}ms`);
    } else {
        params.lagTime = 0;
        console.log(`Using default lag time ${params.lagTime}ms`);
    }

    params.enableDebugLines = WFC.Utils.parseBoolean(urlParams.get('enableDebugLines'));
    if (params.enableDebugLines != null) {
        console.log(`Using parsed enable debug lines ${params.enableDebugLines}`);
    } else {
        params.enableDebugLines = false;
        console.log(`Using default enable debug lines ${params.enableDebugLines}`);
    }

    return params;
}

const params = getParameters();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setClearColor("#4f372d");
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

// Adjust the renderer size as necessary when the window is resized
window.addEventListener( 'resize', onWindowResize, false );
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );
}

const pivot = new THREE.Object3D();
const randomStream = new Math.seedrandom(params.seed);
scene.add( pivot );

camera.position.z = 5;

function createWireframeBox(center, size, color) {
    const geometry = new THREE.BoxGeometry(size?.x, size?.y, size?.z);
    const edges = new THREE.EdgesGeometry( geometry );
    const line = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color: color } ) );
    line.position.set(center.x, center.y, center.z);
    pivot.add(line);
}

function createLine(start, end, color) {
    const material = new THREE.LineBasicMaterial({
        color: color
    });
    
    const points = [];
    points.push( new THREE.Vector3( start.x, start.y, start.z ) );
    points.push( new THREE.Vector3( end.x, end.y, end.z ) );
    
    const geometry = new THREE.BufferGeometry().setFromPoints( points );
    
    const line = new THREE.Line( geometry, material );
    pivot.add(line);
}

function animate() {
    requestAnimationFrame( animate );
    // pivot.rotation.x += 0.01;
    // pivot.rotation.y += 0.01;
    renderer.render( scene, camera );
}
animate();

async function loadJSON(pieces) {
    var data = {};

    for (var piece of pieces) {
        try {
            var pieceData = await fetch(`${piece}.json`);
            data[piece] = await pieceData.json();
        } catch (e) {};
    }

    return data;
}

var generator = null;

async function findBadSeed() {
    var data = await loadJSON([ 'modules', 'edgeTypes' ]);
    var seed;
    while (!generator || generator.state !== WFC.GeneratorState.Conflicted) {
        seed = Math.floor(Math.random() * 100000000);
        stream = new Math.seedrandom(seed);
        generator = new WFC.TiledModel(data.modules, data.edgeTypes, new WFC.Vector3(5, 5, 1), null, stream);
        
        while (generator.state === WFC.GeneratorState.Running) {
            generator.observe();
            generator.propagate();
        }

        if (generator.state === WFC.GeneratorState.Conflicted) {
            console.log(`Conflicted. Seed = ${seed}`);
        } else {
            console.log(`OK. Seed = ${seed}`);
        }
    }
}

async function initialize() {
    var data = await loadJSON([ 'modules', 'edgeTypes' ]);
    generator = new WFC.TiledModel(data.modules, data.edgeTypes, new WFC.Vector3(5, 5, 1), drawCell, randomStream);
    oneIteration();
}

function oneIteration() {
    if (generator.state === WFC.GeneratorState.Running) {
        generator.observe();
        generator.propagate();
        setTimeout(oneIteration, params.lagTime);
    } else {
        console.log(generator.state);
    }
}

function drawCell(cell) {
    var center = cell.getAdjustedLocation();
    var flat = generator.dimensions.z === 1;
    if (params.enableDebugLines) {
        createWireframeBox(center, new THREE.Vector3(1, 1, flat ? 0 : 1), "#69554c");
    }

    var config = cell.domain[0];
    var texture = config.definition.texture;
    if (texture) {
        var planeGeo = new THREE.PlaneGeometry();
        var mesh = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: new THREE.TextureLoader().load( texture ) }));
        mesh.position.set(center.x, center.y, center.z - 0.01);
        mesh.rotation.copy(WFC.ModuleRotation.getLocalRotation(config.rotation, config.definition.rotationOffset));
        pivot.add(mesh);
    }

    if (params.enableDebugLines) {
        for (var dir of WFC.EdgeDirection.values) {
            var edgeType = config.getEdgeType(dir);
            if (edgeType) {
                var vector = WFC.EdgeDirection.toDirectionVector(dir);
                createLine(center, WFC.Vector3.add(center, WFC.Vector3.multiply(vector, 0.45)), edgeType.color);
            }
        }
    }
}

//findBadSeed();
initialize();