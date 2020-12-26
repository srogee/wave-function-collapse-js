const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setClearColor("#4f372d");
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

window.addEventListener( 'resize', onWindowResize, false );

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );
}

const pivot = new THREE.Object3D();
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
var lagTime = 50;

async function initialize() {
    var data = await loadJSON([ 'modules', 'edgeTypes' ]);
    generator = new WFC.TiledModel(data.modules, data.edgeTypes, new WFC.Vector3(5, 5, 1), drawCell);
    oneIteration();
}

function oneIteration() {
    if (generator.state === WFC.GeneratorState.Running) {
        generator.observe();
        generator.propagate();

        setTimeout(oneIteration, lagTime);
    } else {
        console.log(generator.state);
    }
}

function drawCell(cell) {
    var center = cell.getAdjustedLocation();
    var flat = generator.dimensions.z === 1;
    createWireframeBox(center, new THREE.Vector3(1, 1, flat ? 0 : 1), "#69554c");

    var config = _.sample(cell.domain);

    for (var dir of WFC.EdgeDirection.values) {
        var edgeType = config.getEdgeType(dir);
        if (edgeType) {
            var vector = WFC.EdgeDirection.toDirectionVector(dir);
            createLine(center, WFC.Vector3.add(center, WFC.Vector3.multiply(vector, 0.45)), edgeType.color);
        }
    }
}

initialize();