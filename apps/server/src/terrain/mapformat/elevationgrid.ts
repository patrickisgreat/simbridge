export class ElevationGrid {
    private southwest: { latitude: number, longitude: number } = { latitude: 0, longitude: 0 };

    private northeast: { latitude: number, longitude: number } = { latitude: 0, longitude: 0 };

    public Rows: number = 0;

    public Columns: number = 0;

    public Grid: number[][] | undefined = undefined;

    constructor(southwest: { latitude: number, longitude: number }, northeast: { latitude: number, longitude: number }, rows: number, columns: number, grid: number[][]) {
        this.southwest = southwest;
        this.northeast = northeast;
        this.Rows = rows;
        this.Columns = columns;
        this.Grid = grid;
    }

    public worldToGridIndices(coordinate: { latitude: number, longitude: number }): { row: number, column: number } {
        const latRange = this.northeast.latitude - this.southwest.latitude;
        const latDelta = coordinate.latitude - this.southwest.latitude;
        const row = this.Rows - Math.floor((latDelta / latRange) * this.Rows) - 1;

        const lonRange = this.northeast.longitude - this.southwest.longitude;
        const lonDelta = coordinate.longitude - this.southwest.longitude;
        const column = Math.floor((lonDelta / lonRange) * this.Columns);

        return { row, column };
    }
}
