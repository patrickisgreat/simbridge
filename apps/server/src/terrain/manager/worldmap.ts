import { Worker } from 'worker_threads';
import * as path from 'path';
import { ElevationGrid } from '../mapformat/elevationgrid';
import { TerrainMap } from '../mapformat/terrainmap';
import { Tile } from '../mapformat/tile';
import { PositionDto } from '../dto/position.dto';
import { NavigationDisplayViewDto } from '../dto/navigationdisplayview.dto';
import { NavigationDisplayData } from './navigationdisplaydata';

require('sharp');

export interface WorldMapData {
    terrainData: TerrainMap | undefined;

    grid: { southwest: { latitude: number, longitude: number }, tileIndex: number, elevationmap: undefined | ElevationGrid }[][];
}

export class Worldmap {
    public data: WorldMapData = {
        terrainData: undefined,
        grid: [],
    };

    private tileLoaderWorker: Worker;

    private tileLoadingInProgress: boolean = false;

    private ndRenderingLeftInProgress: boolean = false;

    private ndRendererWorkerLeft: Worker;

    private ndRenderingRightInProgress: boolean = false;

    private ndRendererWorkerRight: Worker;

    private displays: { [id: string]: { viewConfig: NavigationDisplayViewDto, data: NavigationDisplayData } } = {};

    private presentPosition: PositionDto | undefined = undefined;

    private visibilityRange: number = 400;

    private static findTileIndex(tiles: Tile[], latitude: number, longitude: number): number {
        for (let i = 0; i < tiles.length; ++i) {
            if (tiles[i].Southwest.latitude === latitude && tiles[i].Southwest.longitude === longitude) {
                return i;
            }
        }

        return -1;
    }

    constructor(mapfile: TerrainMap) {
        this.data.terrainData = mapfile;

        for (let lat = -90; lat < 90; lat += mapfile.AngularSteps.latitude) {
            this.data.grid.push([]);

            for (let lon = -180; lon < 180; lon += mapfile.AngularSteps.longitude) {
                this.data.grid[this.data.grid.length - 1].push({
                    southwest: { latitude: lat, longitude: lon },
                    tileIndex: Worldmap.findTileIndex(mapfile.Tiles, lat, lon),
                    elevationmap: undefined,
                });
            }
        }

        this.tileLoaderWorker = new Worker(path.resolve(__dirname, './maploader.js'));
        this.tileLoaderWorker.on('message', (result) => {
            const loadedTiles: { row: number, column: number }[] = [];

            result.forEach((tile) => {
                loadedTiles.push({ row: tile.row, column: tile.column });
                if (tile.grid !== null) {
                    this.setElevationMap(loadedTiles[loadedTiles.length - 1], tile.grid);
                }
            });

            this.cleanupElevationCache(loadedTiles);
            this.tileLoadingInProgress = false;
        });

        this.ndRendererWorkerLeft = new Worker(path.resolve(__dirname, '../utils/ndrenderer.js'));
        this.ndRendererWorkerLeft.on('message', (result: NavigationDisplayData) => {
            this.displays.L.data = result;
            this.ndRenderingLeftInProgress = false;
        });

        this.ndRendererWorkerRight = new Worker(path.resolve(__dirname, '../utils/ndrenderer.js'));
        this.ndRendererWorkerRight.on('message', (result: NavigationDisplayData) => {
            this.displays.R.data = result;
            this.ndRenderingRightInProgress = false;
        });
    }

    public renderNdMap(id: string): number {
        if (id in this.displays) {
            const timestamp = new Date().getTime();
            const workerContent = {
                viewConfig: this.displays[id].viewConfig,
                data: this.data,
                position: this.presentPosition,
                timestamp,
            };

            if (this.displays[id].viewConfig !== undefined && this.displays[id].viewConfig.active === true) {
                if (id === 'L') {
                    if (this.ndRenderingLeftInProgress === false) {
                        this.ndRendererWorkerLeft.postMessage(workerContent);
                        return timestamp;
                    }
                } else if (this.ndRenderingRightInProgress === false) {
                    this.ndRendererWorkerRight.postMessage(workerContent);
                    return timestamp;
                }

                if (this.displays[id].data !== null) {
                    return this.displays[id].data.Timestamp;
                }
                return -1;
            }

            this.displays[id].data = null;
        }

        return -1;
    }

    public configureNd(display: string, config: NavigationDisplayViewDto) {
        if (!(display in this.displays)) {
            this.displays[display] = {
                viewConfig: config,
                data: null,
            };
        } else {
            this.displays[display].viewConfig = config;
        }
    }

    public async updatePosition(position: PositionDto): Promise<void> {
        if (this.tileLoadingInProgress) {
            return;
        }

        this.tileLoadingInProgress = true;
        this.presentPosition = position;

        this.tileLoaderWorker.postMessage({ data: this.data, position: this.presentPosition, visibilityRange: this.visibilityRange });
    }

    public static worldMapIndices(data: WorldMapData, latitude: number, longitude: number): { row: number, column: number } | undefined {
        const row = Math.floor((latitude + 90) / data.terrainData.AngularSteps.latitude);
        const column = Math.floor((longitude + 180) / data.terrainData.AngularSteps.longitude);

        if (row < 0 || row >= data.grid.length || column < 0 || column >= data.grid[row].length) {
            return undefined;
        }

        return { row, column };
    }

    public static validTile(data: WorldMapData, index: { row: number, column: number }): boolean {
        if (data.grid.length <= index.row || index.row < 0 || data.grid[index.row].length <= index.column || index.column < 0) {
            return false;
        }

        return data.grid[index.row][index.column].tileIndex >= 0 && data.grid[index.row][index.column].tileIndex < data.terrainData.Tiles.length;
    }

    public setElevationMap(index: { row: number, column: number }, map: ElevationGrid): void {
        if (Worldmap.validTile(this.data, index) === true && this.data.grid[index.row][index.column].elevationmap === undefined) {
            this.data.grid[index.row][index.column].elevationmap = map;
            this.data.grid[index.row][index.column].elevationmap.ElevationMap = new Int16Array(this.data.grid[index.row][index.column].elevationmap.Grid);
        }
    }

    public cleanupElevationCache(whitelist: { row: number, column: number }[]): void {
        for (let row = 0; row < this.data.grid.length; ++row) {
            for (let col = 0; col < this.data.grid[row].length; ++col) {
                const idx = whitelist.findIndex((element) => element.column === col && element.row === row);
                if (idx === -1) {
                    this.data.grid[row][col].elevationmap = undefined;
                } else {
                    whitelist.splice(idx, 1);
                }
            }
        }
    }

    public getTile(latitude: number, longitude: number): Tile | undefined {
        const index = Worldmap.worldMapIndices(this.data, latitude, longitude);
        if (index === undefined) {
            return undefined;
        }

        if (this.data.grid[index.row][index.column].tileIndex < 0 || this.data.grid[index.row][index.column].tileIndex >= this.data.terrainData.Tiles.length) {
            return undefined;
        }

        return this.data.terrainData.Tiles[this.data.grid[index.row][index.column].tileIndex];
    }

    public ndMap(id: string, timestamp: number): NavigationDisplayData {
        if (!(id in this.displays) || this.displays[id].viewConfig.active === false) {
            return null;
        }

        if (this.displays[id].data && this.displays[id].data.Timestamp === timestamp) {
            return this.displays[id].data;
        }

        return null;
    }
}
