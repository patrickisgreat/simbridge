import { parentPort, workerData } from 'worker_threads';
import { PositionDto } from '../dto/position.dto';
import { Worldmap } from './worldmap';
import { WGS84 } from '../utils/wgs84';
import { findTileIndices } from './maploader';

function loadTiles(world: Worldmap, position: PositionDto) {
    console.log('WORKER RUNNING');

    const southwest = WGS84.project(position.latitude, position.longitude, world.VisibilityRange * 1852, 225);
    const northeast = WGS84.project(position.latitude, position.longitude, world.VisibilityRange * 1852, 45);

    // wrap around at 180°
    const tileIndices: { row: number, column: number }[] = [];
    if (southwest.longitude > northeast.longitude) {
        for (let lat = southwest.latitude; lat < northeast.latitude; lat += world.Terraindata.AngularSteps.latitude) {
            //   tileIndices = tileIndices.concat(findTileIndices(world, lat, southwest.longitude, 180));
            //  tileIndices = tileIndices.concat(findTileIndices(world, lat, -180, northeast.longitude));
        }
    } else {
        for (let lat = southwest.latitude; lat < northeast.latitude; lat += world.Terraindata.AngularSteps.latitude) {
            //  tileIndices = tileIndices.concat(findTileIndices(world, lat, southwest.longitude, northeast.longitude));
        }
    }

    const start = new Date().getTime();
    // load all missing tiles
    const delta = new Date().getTime() - start;
    console.log(`Processed: ${delta / 1000}`);

    return tileIndices;
}

parentPort.postMessage(
    loadTiles(workerData.world, workerData.position),
);
