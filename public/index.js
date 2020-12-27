function updateCamera() {
    var size = Math.max(params.getParameterValue('dimensions').x, params.getParameterValue('dimensions').y);
    var width = window.innerWidth / window.innerHeight * (size + 1);
    var height = (size + 1);
    camera.left = width / - 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = height / - 2;
    camera.updateProjectionMatrix();
}

function loadTexture(url) {
    if (!textureCache.has(url)) {
        textureCache.set(url, new THREE.TextureLoader().load( url ));
    }

    return textureCache.get(url);
}

let params = new ParamLoader();
params.loadParameter("lagTime", ParamType.Float, 0, 0);
params.loadParameter("enableDebugLines", ParamType.Boolean, false);
params.loadParameter("seed", ParamType.Integer, Math.floor(Math.random() * 100000000), 0);
params.loadParameter("xSize", ParamType.Float, 25, 0);
params.loadParameter("ySize", ParamType.Float, 25, 0);
params.aliasParameter("dimensions", new WFC.Vector3(params.getParameterValue("xSize"), params.getParameterValue("ySize"), 1))
params.loadParameter("pruneSmallerRegions", ParamType.Boolean, true);

let textureCache = new Map();
const scene = new THREE.Scene();

const camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0, 100); //new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
updateCamera();

const renderer = new THREE.WebGLRenderer();
renderer.setClearColor("#4f372d");
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

// Adjust the renderer size as necessary when the window is resized
window.addEventListener( 'resize', onWindowResize, false );
function onWindowResize() {
    updateCamera();

    renderer.setSize( window.innerWidth, window.innerHeight );
}

const pivot = new THREE.Object3D();
const randomStream = new Math.seedrandom(params.getParameterValue("seed"));
scene.add( pivot );

function createWireframeBox(center, size, color) {
    const geometry = new THREE.BoxGeometry(size?.x, size?.y, size?.z);
    const edges = new THREE.EdgesGeometry( geometry );
    const line = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color: color } ) );
    line.position.set(center.x, center.y, center.z);
    return line;
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
    return line;
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
        generator = new WFC.TiledModel(data.modules, data.edgeTypes, params.getParameterValue('dimensions'), null, stream);
        
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
    generator = new WFC.TiledModel(data.modules, data.edgeTypes, params.getParameterValue('dimensions'), drawCell, randomStream);
    oneIteration();
}

function oneIteration() {
    if (generator.state === WFC.GeneratorState.Running) {
        generator.observe();
        generator.propagate();
        setTimeout(oneIteration, params.getParameterValue("lagTime"));
    } else {
        console.log(generator.state);
        if (generator.state === WFC.GeneratorState.Done && params.getParameterValue("pruneSmallerRegions")) {
            var ext = new WFC.GeneratorExtensions(generator);
            var regionId;
            var regions = [];
            for (var key of generator.grid.keys()) {
                var location = WFC.Utils.convertKeyToVector(key);
                var cell = generator.getCellAt(location);
                if (cell.domain[0].hasNoEdges()) {
                    continue;
                }
                regionId = regions.length;
                var region = ext.performFloodFillForRegionPruning(location, regionId);
                if (region) {
                    regions.push(region);
                }
            }
            
            var largestRegion = WFC.Utils.getMaximumByPredicate(regions, region => region.length);
            if (largestRegion) {
                var smallerRegions = regions.filter(region => region !== largestRegion);
                console.log(`Deleting ${smallerRegions.length} regions`);
                var emptyTile = generator.defaultDomain[0];
                for (var region of smallerRegions) {
                    for (var location of region) {
                        generator.getCellAt(location).resolveToSpecificConfig(emptyTile);
                    }
                }
            }
        }
    }
}

function drawCell(cell) {
    if (cell.threeJsData) {
        for (var obj of cell.threeJsData) {
            pivot.remove(obj);
        }
    }

    cell.threeJsData = [];

    var center = cell.getAdjustedLocation();
    var flat = generator.dimensions.z === 1;
    if (params.getParameterValue("enableDebugLines")) {
        cell.threeJsData.push(createWireframeBox(center, new THREE.Vector3(1, 1, flat ? 0 : 1), "#69554c"));
    }

    var config = cell.domain[0];
    var texture = config.definition.texture;
    if (texture) {
        var planeGeo = new THREE.PlaneGeometry();
        var mesh = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: loadTexture(texture) }));
        mesh.position.set(center.x, center.y, center.z - 0.01);
        mesh.rotation.copy(WFC.ModuleRotation.getLocalRotation(config.rotation, config.definition.rotationOffset));
        cell.threeJsData.push(mesh);
    }

    if (params.getParameterValue("enableDebugLines")) {
        for (var dir of WFC.EdgeDirection.values) {
            var edgeType = config.getEdgeType(dir);
            if (edgeType) {
                var vector = WFC.EdgeDirection.toDirectionVector(dir);
                cell.threeJsData.push(createLine(center, WFC.Vector3.add(center, WFC.Vector3.multiply(vector, 0.45)), edgeType.color));
            }
        }
    }

    for (var obj of cell.threeJsData) {
        pivot.add(obj);
    }
}

//findBadSeed();
initialize();