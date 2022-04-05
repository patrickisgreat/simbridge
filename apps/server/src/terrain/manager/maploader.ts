import { Worldmap } from './worldmap';
import { PositionDto } from '../dto/position.dto';
import { WGS84 } from '../utils/wgs84';

export function findTileIndices(world: Worldmap, latitude: number, longitude0: number, longitude1: number): { row: number, column: number }[] {
    const indices: { row: number, column: number }[] = [];

    for (let lon = longitude0; lon < longitude1; lon += world.Terraindata.AngularSteps.longitude) {
        const index = world.worldMapIndices(latitude, lon);
        if (index !== undefined && world.validTile(index) === true) {
            indices.push(index);
        }
    }

    return indices;
}
