import * as AWS from 'aws-sdk';
import * as pg from 'pg';

export interface TrainArrivalMap {
  arrivalTime: string; // ISO 8601 format for simplicity in sorting
  tripId: string;
  routeId: string; // line
  destination: string;
}

function isValidTableName(name: string) {
  const validTableNames = ['arrivals', 'arrivals_secondary'];
  return validTableNames.includes(name);
}

export class StationTrainSchedule {
  private stationMap: {
    [stationId: string]: {
      northbound: {
        name: string;
        trains: TrainArrivalMap[];
      };
      southbound: {
        name: string;
        trains: TrainArrivalMap[];
      };
    };
  };

  private pgPool: pg.Pool;

  constructor() {
    this.stationMap = {};
    this.pgPool = new pg.Pool({
      connectionString: process.env.POSTGRES_CONNECTION_STRING,
    });
  }

  keys(): string[] {
    return Object.keys(this.stationMap);
  }

  insert(fullStationId: string, newTrain: TrainArrivalMap): void {
    const direction = fullStationId.slice(-1); // 'N' or 'S'
    const stationId = fullStationId.slice(0, -1);

    if (!this.stationMap[stationId]) {
      this.stationMap[stationId] = {
        northbound: { trains: [], name: '' },
        southbound: { trains: [], name: '' },
      };
    }

    const directionKey = direction === 'N' ? 'northbound' : 'southbound';

    const newTrainArrivalDate = new Date(newTrain.arrivalTime);
    const currentDate = new Date();

    if (newTrainArrivalDate > currentDate) {
      const pos = this.binarySearch(
        this.stationMap[stationId][directionKey].trains,
        newTrain.arrivalTime,
      );

      this.stationMap[stationId][directionKey].trains.splice(pos, 0, newTrain);

      if (this.stationMap[stationId][directionKey].trains.length > 5) {
        this.stationMap[stationId][directionKey].trains.length = 5;
      }
    }
  }

  private binarySearch(trains: TrainArrivalMap[], targetTime: string): number {
    let low = 0;
    let high = trains.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (trains[mid].arrivalTime < targetTime) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  getSchedule(stationId: string, direction?: 'northbound' | 'southbound'): any {
    return direction
      ? this.stationMap[stationId]
        ? this.stationMap[stationId][direction]
        : []
      : this.stationMap[stationId]
        ? this.stationMap[stationId]
        : {};
  }

  async writeToPostgres(tableName: string) {
    if (!this.stationMap || !isValidTableName(tableName)) return;

    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN'); // Start transaction

      // Step 1: Clear the table
      await client.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY`);

      // Step 2: Insert records in batches
      for (const stationId in this.stationMap) {
        if (this.stationMap.hasOwnProperty(stationId)) {
          const station = this.stationMap[stationId];
          const trains = station.northbound.trains.concat(
            station.southbound.trains,
          );

          for (let i = 0; i < trains.length; i += 500) {
            // Process in batches of 500
            const batch = trains.slice(i, i + 500);
            const queryText = `
                        INSERT INTO ${tableName} (stop_id, arrival_time, destination, route_id, trip_id)
                        VALUES ${batch.map((_, index) => `($${index * 5 + 1}, $${index * 5 + 2}::timestamp, $${index * 5 + 3}, $${index * 5 + 4}, $${index * 5 + 5})`).join(', ')};
                    `;
            const queryValues = batch.flatMap((train) => [
              stationId,
              train.arrivalTime,
              train.destination,
              train.routeId,
              train.tripId,
            ]);
            await client.query(queryText, queryValues);
          }
        }
      }

      await client.query('COMMIT'); // Commit the transaction after all batches are processed
      console.log('All data successfully updated in Postgres');
    } catch (err) {
      await client.query('ROLLBACK'); // Rollback transaction on error
      console.error(`Error during transaction execution:`, err);
    } finally {
      client.release(); // Always release the client
    }
  }

  private estimateItemSize(item: any): number {
    const jsonItem = JSON.stringify(item);
    return Buffer.byteLength(jsonItem, 'utf8');
  }

  private async handleUnprocessedItems(
    data: any,
    tableName: string,
    client: AWS.DynamoDB.DocumentClient,
  ): Promise<void> {
    if (
      data.UnprocessedItems &&
      data.UnprocessedItems[tableName] &&
      data.UnprocessedItems[tableName].length > 0
    ) {
      const retryParams = {
        RequestItems: {
          [tableName]: data.UnprocessedItems[tableName],
        },
      };
      await client.batchWrite(retryParams).promise();
    }
  }

  writeScheduleToFile(fileName: string): void {
    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(
      path.join(__dirname, `${fileName}.json`),
      JSON.stringify(this.stationMap, null, 2),
    );
  }

  logSchedule(stationId: string): void {
    this.getSchedule(stationId, 'northbound')?.forEach((train: any) => {
      const arrivalTime = new Date(train.arrivalTime);
      console.log(
        `Train ${train.tripId} on route ${train.routeId} arrives at ${arrivalTime.toLocaleTimeString()}`,
      );
    }),
      console.log('---'),
      this.getSchedule(stationId, 'southbound')?.forEach((train: any) => {
        const arrivalTime = new Date(train.arrivalTime);
        console.log(
          `Train ${train.tripId} on route ${train.routeId} arrives at ${arrivalTime.toLocaleTimeString()}`,
        );
      });
  }
}
